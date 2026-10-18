# Build an Agent with StepFun and the Vercel AI SDK

A two-stage, English-first LA Hacks workshop. Start with **Demo Coach**, an agent that checks and saves a clear, credible project pitch. Upgrade it into **Frame & Voice**, which adds visual context, optional research, and a mixed audio pitch with narration, background music and an optional opening effect.

## Start here

| Stage | What you build | Interface | Start guide |
| --- | --- | --- | --- |
| 01 — Basic Agent | Goal → check → revise → saved pitch, using Step 5 Preview | Browser or terminal | [Start Stage 1](01-basic-agent/README.md) |
| 02 — Multimodal Agent | Images, optional research, separate TTS/Gen tracks, a mixed WAV and versioned takes | Browser or terminal | [Start Stage 2](02-multimodal-agent/README.md) |

Both folders are self-contained. Each has its own dependencies, lockfile, source code, environment example, and instructions. Stage 2 is a complete reference application and does not import from stage 1. There are exactly two stages.

**For your first pass, follow Stage 1 in order.** You can type commands yourself or ask a coding assistant to help. You do not have to use a coding assistant to run the workshop.

The **repository root** is `LA-Hacks/`. The **workshop root** is `LA-Hacks/voice-agent/`, containing this README and both numbered stage folders. All commands in this guide start from the workshop root unless stated otherwise.

## Who does what?

```text
A person or coding assistant writes the TypeScript
    → Node.js runs the application
    → Vercel AI SDK manages model calls and tools
    → Step 5 Preview understands, writes, and chooses actions
        → Tavily retrieves web source excerpts, when configured
        → StepAudio 3 TTS generates narration
        → Gen Preview separately generates instrumental music and an optional effect
        → Node.js overlays the tracks into one stereo WAV
        → StepAudio 3 TTS remains available for voice-only takes
```

Codex can help build the code; it is not the application's inference model. This repository connects directly to StepFun. No Vercel account, deployment, or AI Gateway key is required.

The [Stage 1 implementation guide](01-basic-agent/docs/GUIDE.md#why-vercel-ai-sdk-and-nodejs) explains why we use this SDK and Node.js. In brief: the SDK is a TypeScript/npm library, and Node runs the code. You can call StepFun from Python too, using a different implementation.

## Two ways to work

### Route A: download and run it yourself

If the source is already on your computer, open its root folder and skip cloning. Otherwise:

```bash
git clone https://github.com/FrankyYouChill/LA-Hacks.git
cd LA-Hacks
cd voice-agent
```

You are now at the workshop root. The stages are `01-basic-agent/` and `02-multimodal-agent/` inside this folder.

Alternatively, use GitHub's **Code → Download ZIP**, extract it, and open the extracted folder. You still need Node.js and npm, but Git is not needed for the ZIP route.

Then configure your key, enter `01-basic-agent`, and follow that folder's README. Each stage's `npm` commands must run inside that stage, not the repository root.

### Route B: use Codex or another coding assistant

Open the local repository as a project, or start your coding assistant in a parent folder where it may clone the repository. Give it the repository URL and this prompt:

```text
Help me work through this StepFun workshop locally, starting with 01-basic-agent.
If the repository is not already present, clone https://github.com/FrankyYouChill/LA-Hacks.git into this workspace.
The workshop root is LA-Hacks/voice-agent, containing 01-basic-agent and 02-multimodal-agent. Read its README and the Stage 1 README first. Explain the model, framework, and runtime in plain English.
Check Node.js and npm, install the locked Stage 1 dependencies with npm ci, and run npm run check.
Help me configure STEP_API_KEY in a local .env without printing or copying credentials into the chat.
Start npm start and show me the Stage 1 browser at http://localhost:3200. Explain the goal, activity and deliverable panels.
Help me click Try CampusMate and Repair a rough draft, inspect the real goal/check/save feedback and saved files, revise the pitch, and open the model details. Explain how Clear conversation retains saved drafts. The optional terminal interface is npm run chat. Keep the configured StepFun model and do not add features or move on to Stage 2 until I ask.
Do not commit, push, or deploy anything.
```

The assistant can help with cloning, dependency installation, explanation, and debugging. It needs access to the intended local folder and whatever permissions its environment requires. You still supply your own provider credentials and use the running agent yourself.

For this browser demo, use a local app/CLI/IDE workflow. A cloud coding environment is a different machine: its `localhost` is not your laptop. This starter binds to loopback and accepts local origins only; a remote preview would also need deliberate host/origin configuration, which is outside the tested workshop path.

See [OpenAI's local project quickstart](https://learn.chatgpt.com/docs/quickstart) for Codex setup. Other coding assistants can follow the same repository instructions; their interfaces and permissions vary.

## Requirements and configuration

- Node.js 22+ and npm; Node.js 24 is recommended and specified by `.nvmrc`.
- A StepFun API key with access to `step-5-preview`.
- Stage 2 mixes `stepaudio-3-tts` narration with a separately generated `stepaudio-3-gen-preview` instrumental and optional opening effect. Node.js exports the overlapping tracks as one WAV. Voice-only mode calls TTS alone.
- Optional: your own Tavily key for live web research in stage 2.

From the workshop root (`LA-Hacks/voice-agent/`), copy the example only if `.env` does not already exist. Keep an existing configured file:

```bash
cp .env.example .env
```

On Windows PowerShell use `Copy-Item .env.example .env`. Edit the file in your editor:

```dotenv
STEP_API_KEY=YOUR_STEPFUN_API_KEY
STEP_BASE_URL=https://api.stepfun.ai/v1
STEP_MODEL=step-5-preview
# Stage 2 audio tracks. Gen generates music and effects separately from TTS.
STEP_AUDIO_MODEL=stepaudio-3-tts
STEP_AUDIO_MUSIC_MODEL=stepaudio-3-gen-preview
STEP_AUDIO_GEN_MODEL=stepaudio-3-gen-preview
TAVILY_API_KEY=
```

Leave `TAVILY_API_KEY` empty until you have a key from [Tavily](https://app.tavily.com). Chat, images, drafting, and speech do not require a Tavily account. Search does not silently fall back to invented results when no key is configured.

Both stages read the workshop-root `voice-agent/.env`. You can instead configure a stage's own `.env`. Shell variables take priority, followed by the stage `.env`, then the workshop `.env`. The separate `LA-Hacks/.env` used by the original Python examples is not automatically loaded by the workshop. Environment files, installed dependencies and generated outputs are ignored by Git.

## Work through both stages

```bash
cd 01-basic-agent
npm ci
npm run check
npm test
npm start
```

Open <http://localhost:3200> and select **Try CampusMate**. Try **Repair a rough draft** to see a genuine failed check lead to revision and saving. Keep that server running if you want both stages open; in a second terminal, enter the workshop root and run:

```bash
cd 02-multimodal-agent
npm ci
npm run check
npm test
npm start
```

Open <http://localhost:3210>. Select **Produce CampusMate** to make a complete sample pitch without writing a brief or recording yourself. The agent chooses narration, music, its background level and an optional effect. Play the mixed WAV, then open **Listen to individual tracks** to compare the narration and music separately. The full mix already contains their simultaneous sum; you do not need to start multiple players together. For your own project, supply notes or a screenshot. Tavily research is optional.

Both stages have a model badge that opens deployment details. The Stage 2 badge distinguishes configured and API-reported reasoning-model IDs, speech/music/effect models, the local mixer and search availability.

Stage 1 files are a useful starting point for Stage 2: copy a saved Markdown pitch into the browser and ask it to produce audio without changing the words. The stages run independently; Stage 2 does not automatically import Stage 1 files or conversation history.

## Learn and extend

- [Stage 1 quick start](01-basic-agent/README.md): run the UI and both demos. [Implementation guide](01-basic-agent/docs/GUIDE.md): SDK/Node concepts, tools, storage and troubleshooting.
- [Stage 2 quick start](02-multimodal-agent/README.md): run a produced-audio demo. [Implementation guide](02-multimodal-agent/docs/GUIDE.md): configuration, research, audio models, mixing and storage.
- [Extensions](02-multimodal-agent/EXTENSIONS.md): concrete follow-on ideas with starting files and completion criteria.
- [Instructor notes](INSTRUCTOR.md): a suggested live teaching sequence and checkpoints.
- [Acceptance walkthrough](ACCEPTANCE.md): a short checklist for reviewing both stages yourself.

Default documentation, comments, prompts, and interaction are in English. Output switches language only when explicitly requested. Stage 2 currently supports English and Chinese speech.

## Validation and API usage

`npm run check` checks TypeScript and `npm test` uses mocks in both stages without paid requests. Stage 1 adds temporary-folder checks for actual saved artifacts.

`npm start` makes real requests when you send messages. Both stages have an optional `npm run smoke`: stage 1 checks the real pitch/revision loop; stage 2 checks vision, history, and speech. Stage 2 also has `npm run smoke:production` for a real multi-track WAV production and a check that music overlaps narration. `npm run smoke:search` additionally tests real Tavily retrieval and a sourced draft; it requires `TAVILY_API_KEY`. These integration checks use account credits and write summaries to ignored `outputs/` folders.

A new Stage 2 mix with music makes two audio-generation calls, or three with an opening effect, in addition to the agent's Step 5 Preview calls. One render means the whole pipeline. **Voice only** makes one TTS call. Existing takes are reused by saved version and mode. Model output and musical quality still need listening; successful requests and overlap measurements do not certify the content.

The dedicated `stepaudio-3-music-preview` service is an optional music source, documented in the Stage 2 implementation guide. It is not the default and has not completed a successful live task in this environment. Tavily live search also remains unverified until its key is supplied.

## Official resources

- [Vercel AI SDK overview](https://ai-sdk.dev/docs/introduction)
- [AI SDK Node.js guide](https://ai-sdk.dev/docs/getting-started/nodejs)
- [ToolLoopAgent](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent)
- [OpenAI-compatible provider](https://ai-sdk.dev/providers/openai-compatible-providers)
- [Step 5 Preview](https://platform.stepfun.ai/docs/en/guides/models/step-5-preview)
- [StepFun tool support and search limitation](https://platform.stepfun.ai/docs/en/api-reference/tool-call)
- [StepAudio 3 TTS](https://platform.stepfun.ai/docs/en/guides/models/stepaudio-3-tts)
- [StepAudio 3 Gen](https://platform.stepfun.ai/docs/en/guides/models/stepaudio-3-gen)
- [Audio Generation API](https://platform.stepfun.ai/docs/en/api-reference/audio/generate)
- [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search)
