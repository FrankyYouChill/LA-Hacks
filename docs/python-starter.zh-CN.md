> Original Chinese reference for the Python and shell examples. Run its commands from the repository root (`LA-Hacks/`), not this `docs/` folder. Recorded test outputs below are historical examples. For the English agent workshop, start with the [workshop guide](../voice-agent/README.md).

# StepFun 第一次 API 调用

脚本在你的电脑上运行，向 StepFun 的云端模型发送请求。

## 本地配置

在项目的 `.env` 文件里填写 `STEP_API_KEY`。真实 key 不应发到聊天、写入源码或上传到 Git。`.gitignore` 已排除 `.env`、虚拟环境和调用结果。

```dotenv
STEP_API_KEY=这里填写你在StepFun平台生成的key
```

这里使用名为 `openai` 的 Python SDK 作为兼容客户端；因为 `base_url` 指向 StepFun，请求发送到 StepFun，使用 StepFun 的 key 和账号额度。

## 安装与运行

在这个项目目录打开终端，依次运行：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python first_call.py
```

默认发送 starter pack 中的 `Say hello in one sentence.`。自定义输入：

```bash
.venv/bin/python first_call.py "把这段笔记整理成三项待办：明早检查投影，准备API示例，下午确认workshop场地。"
```

## 请求和结果

- 接口：`https://api.stepfun.ai/v1/chat/completions`
- 模型：`step-5-preview`
- `messages`：发给模型的问题。
- `reasoning_effort="low"`：第一次试跑使用较低的推理强度。
- `max_tokens=4096`：限制单次生成长度；可通过 `--max-tokens` 调整。
- `response.choices[0].message.content`：模型返回的正文。
- `response.usage`：服务端返回的 token 用量。

脚本只发起一次请求，不自动重试；真实调用会使用账号额度。成功后显示回答、总耗时和 token 用量，并覆盖保存 `outputs/last_response.json`。这个文件不含 key，但包含你的输入和模型回答。

## 排错

先看 HTTP 状态码和错误消息。401 通常需要检查 key；余额或额度错误需要在平台检查账号；429 需要检查限流或额度。运行环境也必须能联网访问 StepFun。

如果结束原因是 `length`，表示已达到生成上限，正文可能为空或不完整。可以提高 `--max-tokens` 后重试；重试会发起新的 API 请求。

官方文档：https://platform.stepfun.ai/docs/en/api-reference/chat/chat-completion-create

## 在终端体验流式回答

```bash
bash stream.sh "用三句话解释什么是大模型的流式输出。"
```

也可以只运行 `bash stream.sh`，在出现 `你：` 后输入一个问题。本脚本用 curl 发请求，用本机已有的 jq 提取正文；不经过 Python SDK。

- 请求体的 `stream: true` 开启服务端流式输出。
- curl 的 `--no-buffer`（即 `-N`）及时输出收到的数据。
- jq 的 `--unbuffered` 及时显示提取出来的文字，`-j` 将各个片段连起来。
- SSE 返回的正文增量在 `choices[].delta.content`，流结束标记是 `data: [DONE]`。
- 首段回答仍可能需要等待；后续内容按服务端返回的片段显示。

每次运行都是独立的一轮对话，不携带上次的问答；按 Ctrl+C 可中断本地等待。要实现连续聊天，需要保存并发送历史 messages。

## 官方教程与体验顺序

| 顺序 | 教程 | 可以动手做的实验 |
| --- | --- | --- |
| 1 | [流式输出](https://platform.stepfun.ai/docs/en/guides/developer/stream) | 问一个需要几段回答的问题，观察文字逐段出现。 |
| 2 | [多轮对话](https://platform.stepfun.ai/docs/en/guides/developer/multiple-round) | 先告诉它你的名字，再追问“我叫什么”；比较是否带上历史 messages。 |
| 3 | [图片理解](https://platform.stepfun.ai/docs/en/guides/developer/image-chat) | 给一张活动海报，让模型提取日期、地点和议程。 |
| 4 | [JSON / JSON Schema](https://platform.stepfun.ai/docs/en/guides/developer/json-mode) | 将活动笔记提取为 title、date、tasks 等字段，观察结构化结果。 |
| 5 | [Tool Call](https://platform.stepfun.ai/docs/en/guides/developer/tool-call) | 定义一个本地计算函数，让模型请求调用，由程序执行后将结果交回模型。 |
| 6 | [推理强度](https://platform.stepfun.ai/docs/en/guides/developer/reasoning) | 同一道逻辑题分别设 low、medium、high，记录答案、耗时和用量。 |
| 7 | [视频理解](https://platform.stepfun.ai/docs/en/guides/developer/video-chat) | 给一个可直接访问的视频 URL，让模型总结关键事件。 |

官方教程中的环境变量有 STEP_API_KEY、STEPFUN_API_KEY 等不同命名；本项目统一使用 STEP_API_KEY，复制示例时保持一致。

## 实操 1：理解 Python 和 C++ 怎样运行

Codex 通过终端工具发出命令。电脑里的 Python 解释器执行 `.py`；C++ 编译器先把 `.cpp` 转换成可执行程序，再由操作系统运行。能否执行某种语言取决于本地是否有对应工具，不是仅凭模型生成了代码。

在此目录运行 Python：

```bash
.venv/bin/python first_call.py "你好"
```

这里的 `.venv/bin/python` 是项目虚拟环境内的 Python 解释器。脚本不是必须条件：也可以在 REPL 或用 `python -c` 执行短代码；保存脚本更方便反复运行和查看。

本项目的 C++ 小程序只演示本地计算，不调用模型 API：

```bash
mkdir -p outputs
clang++ -std=c++17 hello.cpp -o outputs/hello_cpp
./outputs/hello_cpp
```

已验证输出：

```text
Hello from C++!
37 gift packs x $19.90 = $736.30
```

## 实操 2：真正的多轮对话

```bash
.venv/bin/python multi_turn_chat.py
```

依次输入：

1. `我叫 Frank，正在准备 LA Hacks 的 StepFun workshop。请记住这两点。`
2. `我叫什么？我正在准备什么？`
3. `请按我的活动背景，推荐一个演示项目。`

脚本用 `messages` 列表保存双方发言。第一轮发送系统提示和当前问题；第二轮再加上之前的一问一答，共发送四条消息。模型收到的完整上下文能在 `outputs/multi_turn_transcript.json` 的 `sent_messages` 中看到。

`/reset` 清空本次历史；`/exit` 退出。脚本会保存记录，但重新启动时不自动加载旧记录。自动运行两轮演示：

```bash
.venv/bin/python multi_turn_chat.py --demo
```

已验证第二轮实际回答：`你叫 Frank，正在准备 LA Hacks 的 StepFun workshop。`

## 实操 3：逐步看懂 Tool Call

```bash
.venv/bin/python tool_call_demo.py --step
```

每一步会等待你按回车。去掉 `--step` 可以一次跑完整个流程。

1. **登记工具**：给模型的是 `calculate_budget` 的名称、描述、参数结构。Python 函数本体留在电脑上。
2. **第一次模型请求**：用户问 37 份礼包、每份 19.9 美元的总预算。模型返回 `tool_calls`，其中是工具名、参数和调用 ID；这时工具尚未执行。
3. **本地执行**：Python 检查工具名和参数，再调用 `calculate_budget(quantity=37, unit_price=19.9)`。精确金额计算由本地 Decimal 完成，返回 `736.30`。
4. **第二次模型请求**：把模型的工具调用消息、`role: tool` 的计算结果一起送回模型；工具结果用 `tool_call_id` 与原调用匹配。模型据此生成最终回答。

已验证模型最终回答：`37 份礼包 × 每份 $19.90 = 总预算 **$736.30**。`

完整过程在 `outputs/tool_call_trace.json`。本地函数执行不产生一次模型 API 调用；本示例总共发起两次模型请求。

## 实操 4：不经过 jq 的原始流式输出

```bash
bash stream_raw.sh
```

要将原始数据一边显示、一边保存：

```bash
bash stream_raw.sh | tee outputs/stream_raw.sse
```

这是 `curl -N` 的原始 SSE 输出，每条事件通常以 `data:` 开头，后面是一段 JSON，包含请求 ID、模型、增量内容和用量等字段。正文增量是 `choices[].delta.content`；也可能出现其他字段和空正文事件。最后的 `data: [DONE]` 表示流结束。

因此，它仍然是分段实时返回的，只是显示协议数据。此前的 jq 过滤器把这些事件解析出来，只连接正文，不负责调用模型，也没有让模型换一种方式回答。

本次实测：89 个 JSON 事件，原始文件 40,730 字节，正文分为 9 段。完整正文是：

> 流式输出是指内容被分块连续地生成并即时发送，让接收方可以边接收边处理，而无需等待全部完成。

同一次请求的原始记录为 `outputs/stream_raw.sse`，提取后的正文为 `outputs/stream_plain.txt`。若分别重跑 `stream_raw.sh` 和 `stream.sh`，会产生两次独立请求，回答内容可能不同。

## 实操 5：3 分 51 秒的视频理解

示例是 Blender 官方的 **Agent 327: Operation Barbershop**，时长 231 秒。所选 480p MP4 为 26,262,359 字节（约 26.3 MB），低于 StepFun 文档列出的 128 MB 限制。

- [视频 MP4 直链](https://video.blender.org/object-storage/web_videos/264ff760-803e-430e-8d81-15648e904183-480.mp4)
- [Blender 官方播放页](https://video.blender.org/w/264ff760-803e-430e-8d81-15648e904183)
- [官方视频元数据](https://video.blender.org/api/v1/videos/264ff760-803e-430e-8d81-15648e904183)
- [StepFun 视频理解文档](https://platform.stepfun.ai/docs/en/guides/developer/video-chat)

```bash
bash video_demo.sh
```

脚本用 curl 向 StepFun 发送视频 URL，并提问主角目标、事件顺序和结尾。它不会把整个视频下载到本地；StepFun 服务器从链接读取视频。请求体先保存至 `outputs/video_request.json`，响应保存至 `outputs/video_response.json`，回答正文保存至 `outputs/video_answer.txt`。

可自定义视频 URL 和问题：

```bash
bash video_demo.sh \
  'https://video.blender.org/object-storage/web_videos/264ff760-803e-430e-8d81-15648e904183-480.mp4' \
  '请描述理发店中出现了哪些与普通理发店不同的细节。'
```

每次运行都会再次发送视频理解请求。时间点和画面解释是模型输出，应与视频对照检查。这里需要的是 MP4 文件直链；通常不能把一个视频网页地址直接当成 `video_url`。

本次已实测成功：HTTP 200，耗时约 159.13 秒，结束原因为 `stop`。完整模型回答在 `outputs/video_answer.txt`，测试摘要在 `outputs/video_test_summary.json`。链接能访问和接口调用成功，并不等于对画面和时间点的解释已经逐帧核验。
