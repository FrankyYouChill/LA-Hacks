#!/usr/bin/env bash
# Send the video URL to StepFun; the API server fetches the video itself.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$ROOT/.env"
: "${STEP_API_KEY:?请在 .env 中配置 STEP_API_KEY}"

VIDEO_URL="${1:-https://video.blender.org/object-storage/web_videos/264ff760-803e-430e-8d81-15648e904183-480.mp4}"
QUESTION="${2:-请用中文根据视频画面回答，控制在350字以内：1. 主角是谁，想做什么？2. 按顺序列出五个关键事件，并给出大致时间点。3. 结尾有什么反转？只描述画面能支持的内容，不确定时注明，时间点允许近似。}"
mkdir -p "$ROOT/outputs"

jq -n --arg url "$VIDEO_URL" --arg question "$QUESTION" '{
  model: "step-5-preview",
  messages: [{role: "user", content: [
    {type: "video_url", video_url: {url: $url}},
    {type: "text", text: $question}
  ]}],
  stream: false,
  reasoning_effort: "low",
  max_tokens: 4096
}' > "$ROOT/outputs/video_request.json"

printf '视频 URL：%s\n问题：%s\n正在请求，视频抓取与分析可能需要一些时间…\n' "$VIDEO_URL" "$QUESTION"
if ! curl --silent --show-error --fail-with-body \
  --connect-timeout 15 --max-time 300 \
  https://api.stepfun.ai/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${STEP_API_KEY}" \
  --data-binary "@$ROOT/outputs/video_request.json" \
  --output "$ROOT/outputs/video_response.json" \
  --write-out '%{stderr}\n[HTTP %{http_code} | 耗时 %{time_total} 秒]\n'; then
  printf '调用失败，请检查 outputs/video_response.json 中的错误信息。\n' >&2
  exit 1
fi

printf '\nStepFun 的视频分析：\n'
jq -r '.choices[0].message.content // "未返回正文"' "$ROOT/outputs/video_response.json" \
  | tee "$ROOT/outputs/video_answer.txt"
if ! jq -e '.choices[0].finish_reason == "stop" and ((.choices[0].message.content // "") | length > 0)' "$ROOT/outputs/video_response.json" >/dev/null; then
  printf '本次未正常返回完整回答，请查看响应中的 finish_reason。\n' >&2
  exit 1
fi
