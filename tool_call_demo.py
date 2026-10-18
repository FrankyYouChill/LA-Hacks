"""Show each boundary: model requests a function; Python executes that function."""

import argparse
from decimal import Decimal, InvalidOperation
import json

from demo_common import assistant_message, client, complete, run, safe, save

TOOLS = [{
    "type": "function",
    "function": {
        "name": "calculate_budget",
        "description": "计算礼包预算：份数乘以每份美元价格，返回精确到美分的总金额。",
        "parameters": {
            "type": "object",
            "properties": {
                "quantity": {"type": "integer", "description": "礼包份数"},
                "unit_price": {"type": "number", "description": "每份价格，美元"},
            },
            "required": ["quantity", "unit_price"],
            "additionalProperties": False,
        },
    },
}]


def calculate_budget(quantity, unit_price):
    # This arithmetic runs locally. The model never receives this function body.
    if type(quantity) is not int or not 0 <= quantity <= 10000:
        raise ValueError("quantity 必须是 0 至 10000 的整数。")
    try:
        price = Decimal(str(unit_price))
    except InvalidOperation:
        raise ValueError("unit_price 必须是有效金额。") from None
    if not price.is_finite() or not 0 <= price <= 1000000:
        raise ValueError("unit_price 超出此示例允许的范围。")
    return {
        "quantity": quantity,
        "unit_price_usd": format(price.quantize(Decimal("0.01")), ".2f"),
        "total_usd": format((price * quantity).quantize(Decimal("0.01")), ".2f"),
    }


def main():
    parser = argparse.ArgumentParser(description="展示完整的 Tool Call 往返过程。")
    parser.add_argument("--step", action="store_true", help="每一步按回车继续")
    args = parser.parse_args()
    events = []

    def stage(number, text):
        print(f"\n[{number}] {text}", flush=True)
        if args.step:
            input("按回车继续…")

    stage(1, "告诉模型工具名称、用途和参数；函数本体留在本地。")
    print(json.dumps(TOOLS, ensure_ascii=False, indent=2))
    question = "workshop 要准备 37 份礼包，每份 19.9 美元。请调用 calculate_budget 工具计算总预算，然后用一句话告诉我结果。"
    messages = [{"role": "user", "content": question}]
    print(f"\n用户问题：{question}")

    with client() as api:
        stage(2, "第一次调用模型：让模型决定是否请求使用工具。")
        response = complete(api, messages, tools=TOOLS, tool_choice="auto")
        message = response.choices[0].message
        if not message.tool_calls:
            raise ValueError("本次模型没有请求工具调用；此示例未完成工具演示。")
        proposal = assistant_message(message)
        messages.append(proposal)
        events.append({"stage": "model_requested_tools", "message": proposal})

        stage(3, "读取模型提出的函数名和参数，再由 Python 执行本地函数。")
        for tool in message.tool_calls:
            name = tool.function.name
            arguments = json.loads(tool.function.arguments)
            print(safe(f"模型请求：{name}({json.dumps(arguments, ensure_ascii=False)})"))
            if name != "calculate_budget":
                raise ValueError("模型请求了此示例没有提供的工具。")
            if set(arguments) != {"quantity", "unit_price"}:
                raise ValueError("工具参数不符合定义。")
            result = calculate_budget(**arguments)
            print(f"本地函数结果：{json.dumps(result, ensure_ascii=False)}")
            tool_message = {
                "role": "tool", "tool_call_id": tool.id,
                "content": json.dumps(result, ensure_ascii=False),
            }
            messages.append(tool_message)
            events.append({"stage": "python_executed_tool", "name": name, "arguments": arguments, "result": result})

        stage(4, "第二次调用模型：把工具结果与原对话一起发回去。")
        final = complete(api, messages)
        if final.choices[0].finish_reason == "length":
            raise ValueError("最终回答达到生成上限。")
        answer = final.choices[0].message.content
        if not answer:
            raise ValueError("模型未返回最终回答。")
        events.append({"stage": "model_final_answer", "content": answer})
        messages.append({"role": "assistant", "content": answer})
        print(f"\nStepFun 最终回答：{safe(answer)}")
        path = save("tool_call_trace.json", {
            "question": question, "tools": TOOLS, "events": events, "messages": messages,
            "usage": {
                "first_call": response.usage.model_dump() if response.usage else None,
                "second_call": final.usage.model_dump() if final.usage else None,
            },
        })
        print(f"\n完整过程：{path}")


if __name__ == "__main__":
    raise SystemExit(run(main))
