# LA Hacks — Build an Agent with StepFun

An English-first, two-stage workshop using the **Vercel AI SDK** and **Step 5 Preview**. Help a builder turn project notes into a clear, credible pitch, then turn that pitch into an audio introduction with overlapping narration and background music.

| Stage | What you build | Guide |
| --- | --- | --- |
| 01 — Demo Coach | A browser agent that sets a goal, checks, revises and saves a project pitch | [Stage 1](voice-agent/01-basic-agent/README.md) |
| 02 — Frame & Voice | A browser agent with images, optional web research, separate audio generation and a real voice/music mix | [Stage 2](voice-agent/02-multimodal-agent/README.md) |

**[Start with the workshop guide](voice-agent/README.md)** for setup, manual and coding-assistant routes, and the complete learning sequence.

GitHub hosts the source. Participants clone or download it and run the agent locally with their own StepFun key.

## Local quick start

Use Node.js 24 and your own StepFun API key. Clone this repository or use GitHub's **Code → Download ZIP**. If you already have this folder locally, start there.

```bash
git clone https://github.com/FrankyYouChill/LA-Hacks.git
cd LA-Hacks
```

From the repository root, enter the workshop folder. Skip the copy command if `voice-agent/.env` already exists; keep its configured key.

```bash
cd voice-agent
cp .env.example .env
```

Edit `voice-agent/.env` and set `STEP_API_KEY`. On Windows PowerShell, replace `cp` with `Copy-Item`. Existing environment files can be kept in place.

```bash
cd 01-basic-agent
npm ci
npm run check
npm test
npm start
```

Open <http://localhost:3200> and click **Try CampusMate** or **Repair a rough draft**. Follow the [Stage 1 guide](voice-agent/01-basic-agent/README.md), then move to Stage 2.

## What runs the agent?

- **Step 5 Preview** understands the project, writes and selects tools in both stages.
- **Vercel AI SDK** manages model calls, streaming and the tool loop; **Node.js** executes the tools.
- Stage 2 uses **StepAudio 3 TTS** for narration and separate **Gen Preview** requests for instrumental music and an optional opening effect. Node.js overlays the tracks into one stereo WAV. The page also offers each track separately for comparison.
- **Tavily** is optional web research. You can add its key later; ordinary chat, images, drafting and audio work without it.

Codex or another coding assistant can help write and run the source. Runtime inference uses StepFun. No Vercel deployment, microphone recording or FFmpeg installation is required for the workshop.

## Workshop materials

- [Participant start guide](voice-agent/README.md)
- [Instructor notes](voice-agent/INSTRUCTOR.md)
- [Local acceptance walkthrough](voice-agent/ACCEPTANCE.md)
- [Stage 2 extensions](voice-agent/02-multimodal-agent/EXTENSIONS.md)
- [Source publication and presentation guide](PUBLISHING.md)

Keep real credentials in local `.env` files. Generated outputs, installed dependencies and environment files are ignored by Git. Review locally before publishing source; publication is a separate step.

## Original API examples

The repository also retains standalone Python, shell and C++ learning examples. Their [original Chinese reference](docs/python-starter.zh-CN.md) is preserved separately. Those examples use the repository-root `.env`; the agent workshop uses `voice-agent/.env` or a stage-local `.env`.
