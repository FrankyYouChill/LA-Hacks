#!/usr/bin/env bash
# Make one streaming request with curl and display answer text as it arrives.
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v jq >/dev/null 2>&1; then
  printf '需要 jq 来提取回答正文。\n' >&2
  exit 1
fi

# This is the local configuration file supplied by the user; never print it.
source "$ROOT/.env"
: "${STEP_API_KEY:?请在 .env 中配置 STEP_API_KEY}"

if [[ $# -eq 0 ]]; then
  read -r -p '你：' prompt
else
  prompt="$*"
fi
if [[ -z "${prompt//[[:space:]]/}" ]]; then
  printf '请输入问题。\n' >&2
  exit 1
fi

# jq escapes quotes and newlines so arbitrary questions remain valid JSON.
payload="$(jq -nc --arg prompt "$prompt" '{
  model: "step-5-preview",
  messages: [{role: "user", content: $prompt}],
  stream: true,
  reasoning_effort: "low",
  max_tokens: 4096
}')"

printf 'StepFun：\n'
curl --no-buffer --silent --show-error --fail-with-body \
  --connect-timeout 15 --max-time 120 \
  https://api.stepfun.ai/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${STEP_API_KEY}" \
  --data-binary "$payload" \
  --write-out '%{stderr}\n[HTTP %{http_code} | 耗时 %{time_total} 秒]\n' \
  | jq --unbuffered -Rrj '
      select(startswith("data:"))
      | sub("^data: *"; "")
      | select(. != "[DONE]")
      | fromjson
      | if .error then error(.error.message // "API stream error")
        elif any(.choices[]?; .finish_reason == "length") then
          error("输出达到 token 上限，回答可能不完整。")
        else .choices[]?.delta.content // empty end
    '
printf '\n'
