"""Run a small StepFun API request with the API key stored in the local .env."""

import argparse
import json
import os
from pathlib import Path
import sys
import time

from dotenv import load_dotenv
from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI


ROOT = Path(__file__).resolve().parent
BASE_URL = "https://api.stepfun.ai/v1"
MODEL = "step-5-preview"


def main():
    parser = argparse.ArgumentParser(description="Make one Step 5 Preview API call.")
    parser.add_argument("prompt", nargs="?", default="Say hello in one sentence.")
    parser.add_argument("--max-tokens", type=int, default=4096, help="Maximum generated tokens (default: 4096).")
    args = parser.parse_args()
    if args.max_tokens <= 0:
        parser.error("--max-tokens must be a positive integer")

    load_dotenv(ROOT / ".env", override=True)
    api_key = os.environ.get("STEP_API_KEY", "").strip()
    if not api_key or api_key == "YOUR_STEPFUN_API_KEY":
        print("请在本地 .env 文件中填写 STEP_API_KEY。", file=sys.stderr)
        return 1
    if api_key.startswith(("sk-proj-", "sk-svcacct-")):
        print("这个 key 看起来属于 OpenAI。请换成 StepFun 平台的 key 后再调用 StepFun。", file=sys.stderr)
        return 1

    def safe(value):
        return str(value).replace(api_key, "[REDACTED]")

    # Do not enable SDK HTTP logging: authentication headers must stay private.
    os.environ.pop("OPENAI_LOG", None)
    print(f"接口：{BASE_URL}/chat/completions")
    print(f"模型：{MODEL}")
    print(f"输入：{safe(args.prompt)}", flush=True)

    started = time.perf_counter()
    try:
        with OpenAI(api_key=api_key, base_url=BASE_URL, timeout=90.0, max_retries=0) as client:
            response = client.chat.completions.create(
                model=MODEL,
                messages=[{"role": "user", "content": args.prompt}],
                reasoning_effort="low",
                max_tokens=args.max_tokens,
            )
    except APITimeoutError:
        print("请求超时，未自动重试。可稍后再试，并在平台检查用量。", file=sys.stderr)
        return 1
    except APIConnectionError:
        print("连接失败：检查网络是否能访问 api.stepfun.ai。", file=sys.stderr)
        return 1
    except APIStatusError as error:
        print(f"请求失败，HTTP {error.status_code}。", file=sys.stderr)
        print(safe(error.message), file=sys.stderr)
        if error.request_id:
            print(f"Request ID: {safe(error.request_id)}", file=sys.stderr)
        hints = {
            401: "请确认使用的是 StepFun 平台生成的有效 key。",
            402: "请在 StepFun 平台检查账号余额或额度。",
            403: "请检查账号权限、余额以及模型访问权限。",
            404: "请检查模型是否已向你的账号开放。",
            429: "可能达到请求频率或额度限制，请查看返回信息后再试。",
        }
        if error.status_code in hints:
            print(hints[error.status_code], file=sys.stderr)
        return 1

    elapsed = round(time.perf_counter() - started, 2)
    if not response.choices:
        print("接口返回成功，但没有 choices；请检查响应格式。", file=sys.stderr)
        return 1
    choice = response.choices[0]
    content = choice.message.content or ""
    usage = response.usage.model_dump(exclude_none=True) if response.usage else {}
    result = {
        "endpoint": f"{BASE_URL}/chat/completions",
        "requested_model": MODEL,
        "returned_model": response.model,
        "response_id": response.id,
        "prompt": args.prompt,
        "max_tokens": args.max_tokens,
        "content": content,
        "finish_reason": choice.finish_reason,
        "elapsed_seconds": elapsed,
        "usage": usage,
    }
    output = ROOT / "outputs" / "last_response.json"
    output.parent.mkdir(exist_ok=True)
    output.write_text(safe(json.dumps(result, ensure_ascii=False, indent=2)) + "\n", encoding="utf-8")

    print(f"\n模型回答：\n{safe(content) if content else '(未返回正文)'}")
    print(f"\n耗时：{elapsed} 秒")
    print(f"结束原因：{safe(choice.finish_reason)}")
    print(f"Token 用量：{safe(json.dumps(usage, ensure_ascii=False))}")
    print(f"结果已保存：{output}")
    if choice.finish_reason == "length":
        print("提示：输出达到了 token 上限，结果可能被截断。")
    return 0 if content else 1


if __name__ == "__main__":
    raise SystemExit(main())
