#!/usr/bin/env bash
# Raw SSE output, deliberately without a response-processing jq pipeline.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$ROOT/.env"
: "${STEP_API_KEY:?请在 .env 中配置 STEP_API_KEY}"

curl -N --silent --show-error --fail-with-body \
  --connect-timeout 15 --max-time 120 \
  https://api.stepfun.ai/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${STEP_API_KEY}" \
  -d '{
    "model": "step-5-preview",
    "messages": [{"role": "user", "content": "请用一句简短中文解释流式输出。"}],
    "stream": true,
    "reasoning_effort": "low",
    "max_tokens": 4096
  }'
