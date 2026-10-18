"""Small shared helpers for the learning examples; never print API credentials."""

import json
import os
from pathlib import Path
import sys

from dotenv import load_dotenv
from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI

ROOT = Path(__file__).resolve().parent
MODEL = "step-5-preview"
BASE_URL = "https://api.stepfun.ai/v1"


def client(timeout=120):
    load_dotenv(ROOT / ".env", override=True)
    key = os.environ.get("STEP_API_KEY", "").strip()
    if not key:
        raise ValueError("请先在 .env 中填写 STEP_API_KEY。")
    os.environ.pop("OPENAI_LOG", None)
    return OpenAI(api_key=key, base_url=BASE_URL, timeout=timeout, max_retries=0)


def safe(text):
    key = os.environ.get("STEP_API_KEY", "")
    return str(text).replace(key, "[REDACTED]") if key else str(text)


def save(name, data):
    output = ROOT / "outputs" / name
    output.parent.mkdir(exist_ok=True)
    output.write_text(safe(json.dumps(data, ensure_ascii=False, indent=2)) + "\n", encoding="utf-8")
    return output


def assistant_message(message):
    # Keep the answer/tool requests needed for history, without logging reasoning.
    return message.model_dump(include={"role", "content", "tool_calls"}, exclude_none=True)


def complete(api, messages, **kwargs):
    return api.chat.completions.create(
        model=MODEL, messages=messages,
        reasoning_effort="low", max_tokens=4096, **kwargs,
    )


def stream_answer(api, messages):
    parts = []
    finish_reason = None
    usage = None
    with complete(api, messages, stream=True) as stream:
        for chunk in stream:
            if chunk.usage:
                usage = chunk.usage.model_dump(exclude_none=True)
            if not chunk.choices:
                continue
            choice = chunk.choices[0]
            if choice.delta.content:
                text = choice.delta.content
                print(safe(text), end="", flush=True)
                parts.append(text)
            if choice.finish_reason:
                finish_reason = choice.finish_reason
    print()
    content = "".join(parts)
    if finish_reason == "length":
        raise ValueError("达到生成上限，回答不完整；本轮未加入完整历史。")
    if not content:
        raise ValueError("没有收到回答正文。")
    return content, usage


def run(main):
    try:
        return main() or 0
    except APITimeoutError:
        print("请求超时，未自动重试；请在平台检查用量。", file=sys.stderr)
    except APIConnectionError:
        print("连接失败，请检查到 api.stepfun.ai 的网络。", file=sys.stderr)
    except APIStatusError as error:
        print(safe(f"HTTP {error.status_code}: {error.message}"), file=sys.stderr)
    except (ValueError, OSError) as error:
        print(safe(error), file=sys.stderr)
    except KeyboardInterrupt:
        print("\n已中断。", file=sys.stderr)
        return 130
    return 1
