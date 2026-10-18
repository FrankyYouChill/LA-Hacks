"""Interactive streaming chat: the local list below is the conversation memory."""

import argparse
import time

from demo_common import client, run, safe, save, stream_answer

SYSTEM = {"role": "system", "content": "请用中文简洁回答，每次最多两句话。"}
DEMO = [
    "我叫 Frank，正在准备 LA Hacks 的 StepFun workshop。请记住这两点，只回复一句确认。",
    "我叫什么？我正在准备什么？",
]


def main():
    parser = argparse.ArgumentParser(description="多轮流式聊天；/reset 清空，/exit 退出。")
    parser.add_argument("--demo", action="store_true", help="自动演示两轮对话")
    args = parser.parse_args()
    messages = [SYSTEM.copy()]
    turns = []
    print("历史保存在本次 Python 进程的 messages 列表中；每次启动从新对话开始。")
    if not args.demo:
        print("输入 /reset 开始新对话，/exit 退出。")
    with client() as api:
        index = 0
        while True:
            if args.demo:
                if index == len(DEMO):
                    break
                question = DEMO[index]
                index += 1
                print(f"\n你：{question}")
            else:
                try:
                    question = input("\n你：").strip()
                except EOFError:
                    break
                if question == "/exit":
                    break
                if question == "/reset":
                    messages = [SYSTEM.copy()]
                    turns = []
                    print("历史已清空。")
                    continue
                if not question:
                    continue

            request_messages = messages + [{"role": "user", "content": question}]
            print(f"[本轮发送 {len(request_messages)} 条 messages，包含系统提示、历史和当前问题。]")
            print("StepFun：", end="", flush=True)
            started = time.perf_counter()
            answer, usage = stream_answer(api, request_messages)
            # Both sides of the conversation are sent again on the next turn.
            messages = request_messages + [{"role": "assistant", "content": answer}]
            turns.append({
                "question": question, "answer": answer,
                "sent_messages": request_messages,
                "elapsed_seconds": round(time.perf_counter() - started, 2),
                "usage": usage,
            })
            path = save("multi_turn_transcript.json", {"messages": messages, "turns": turns})
            print(f"[本轮 {turns[-1]['elapsed_seconds']} 秒；对话已保存：{safe(path)}]")


if __name__ == "__main__":
    raise SystemExit(run(main))
