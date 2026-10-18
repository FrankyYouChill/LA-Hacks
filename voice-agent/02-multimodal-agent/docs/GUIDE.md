For startup and a first demo, use the [short README](../README.md). This is the optional implementation reference.

# Stage 2 — Frame & Voice: Produce Your Project Pitch

Stage 1 turns project notes into a clear, credible, checked pitch and saves it. Stage 2 turns that explanation into something you can play: narration with background music underneath, plus an optional opening effect. Images and optional research can add context before writing.

Step 5 Preview remains the model that understands the project, writes, and selects tools. StepAudio 3 TTS generates the narration; Gen Preview generates a separate instrumental track and, optionally, an isolated opening effect. Node.js overlays them into a stereo WAV. No user recording is required, and the agent chooses the production settings.

## Run locally

Use Node.js 24 (22+ supported), a StepFun key with access to Step 5 Preview, StepAudio 3 TTS and Gen Preview, and a browser. No microphone, audio-editing software or FFmpeg installation is needed. Tavily is optional.

Run commands inside `LA-Hacks/voice-agent/02-multimodal-agent/`. Keep the workshop-root `voice-agent/.env` if already configured. Otherwise copy this stage's example and edit it before starting:

```bash
cp .env.example .env
```

On Windows PowerShell use `Copy-Item .env.example .env`.

```dotenv
STEP_API_KEY=YOUR_STEPFUN_API_KEY
STEP_BASE_URL=https://api.stepfun.ai/v1
STEP_MODEL=step-5-preview
STEP_AUDIO_MODEL=stepaudio-3-tts
STEP_AUDIO_MUSIC_MODEL=stepaudio-3-gen-preview
STEP_AUDIO_GEN_MODEL=stepaudio-3-gen-preview
TAVILY_API_KEY=
PORT=3210
```

Then:

```bash
npm ci
npm run check
npm test
npm start
```

Open <http://localhost:3210>. `npm run dev` restarts the backend while editing. Restart after configuration changes, then refresh the browser. Real provider calls use your account access and credits.

## Start with one click

Select **Produce CampusMate** or **Produce LaunchLens**. Each button supplies a complete, explicitly labeled sample-project brief and requests a finished English pitch. You do not have to type notes, record yourself, choose a voice, or describe music.

The agent should:

1. Call `set_goal` with the intended deliverable and acceptance criteria, then explain the project's audience, problem and benefit without invented proof.
2. Choose a voice and a sparse musical palette that suit the actual story. Explain the choice; omit effects by default.
3. Call `save_script`, which checks the English word budget and flags broad promise phrases such as "in seconds" or "every detail", then returns a numbered version and estimated narration duration. This is a wording check, not independent factual verification.
4. Call `create_production` with that version.
5. Generate separate tracks, mix them simultaneously, and show a real WAV in the workspace.

Play or download the **mixed WAV**. It already contains the simultaneous sum of the voice and background music; playback does not depend on synchronizing separate browser players. Open **Listen to individual tracks** to hear the aligned narration, music, and optional effect separately. The music stem includes the same looping, fades, and volume applied in the final mix.

When music is enabled, it starts 0.6 seconds before the narration, stays underneath it, and ends one second after the narration. Short generated music is looped with crossfades up to 0.65 seconds, after removing silent tails. A long enough bed plays once. The agent selects `musicLevel` (`soft`, `balanced`, or `present`); code targets music RMS 22, 16, or 10 dB below narration before speech-aware ducking and peak protection. Ducking gently lowers music by up to another 2.9 dB while speech is active and recovers slowly in pauses. Balanced is the default; present is reserved for explicit louder-music requests. Gentle filtering reduces rumble and excessive brightness, with 0.4-second fade-in and 0.8-second fade-out. Exact instruments, musical coherence and pleasantness still require listening.

### How the music relates to the voice

Step 5 Preview reads the pitch and chooses `musicStyle`, a specific `music` direction, and a short `musicReason` linking the choice to the audience, story and delivery. The starting palettes are **warm-acoustic** (felt piano and soft guitar), **light-electronic** (warm keys and a muted pulse), and **cinematic-soft** (intimate piano and soft strings). They favor simple consonant harmony and sparse accompaniment, without a competing lead, busy drums or trailer effects. User style preferences remain part of the direction. Opening effects default to `none`.

TTS runs first. Code measures the actual narration duration and word rate, then sends a requested duration, a restrained 76–104 BPM pulse for English, project title, vocal direction and the agent's musical rationale with the music request. The full spoken paragraph is kept out of the music script to reduce accidental narration. The studio shows **Why this music** and the requested score direction; each take saves its score plan and request for inspection.

This is text-directed scoring and local mixing. Gen Preview is not listening to the voice waveform, guaranteeing a requested duration, synchronizing beats to words or evaluating musical taste. A short cue can still repeat noticeably. Listen to the mix and music stem before presenting; ask for a different palette or simpler harmony if it clashes. A quieter mix alone cannot repair an unsuitable composition.

Then ask:

> Make it shorter and warmer. Save a new version and produce a new mix with quieter music.

The earlier draft and take remain available. **Earlier takes** holds previous audio; the draft selector revisits saved scripts. On mobile, use **View workspace**.

## Use your own project

Paste a few project facts, upload a screenshot, or paste your Stage 1 pitch. For example:

> This prototype helps student teams turn event posters into clear invitations. Create a 20-second audio pitch with music and subtle effects. Use only the supplied facts and choose the production settings yourself.

To reuse a Stage 1 result, copy only its spoken paragraph, keep its narration target, and ask for audio without rewriting the words. Stage 2 does not automatically load Stage 1 files. For example, replace the last line here with your saved paragraph and adjust the duration to match that draft:

```text
Use the following words unchanged for narration. Use a 30-second narration target.
Save the script and produce a mix with background music. Choose the voice and music yourself.
Narration: <paste the spoken paragraph from your saved Stage 1 draft>
```

**Try the LA Hacks poster** prepares an image and a draft-only prompt. Press Send, inspect the draft, then select **Produce audio**. You can also ask for text only; audio is not generated for draft-only requests or ordinary questions.

PNG, JPEG, and WebP uploads up to 5 MB are supported. The current UI does not accept microphone recordings or video files.

## Two audio models, then a real mix

The default production uses two audio models, with separate calls:

```text
Step 5 Preview writes and selects tools
    → TTS: narration ──────────────────────┐
    → Gen: instrumental music ─────────────┼→ Node.js mixes simultaneous samples → stereo WAV
    → Gen: optional isolated opening effect┘
```

| Track | Model | Endpoint | Role |
| --- | --- | --- | --- |
| Narration | `stepaudio-3-tts` | `POST /v1/audio/speech` | Speak the saved words as a WAV |
| Instrumental | `stepaudio-3-gen-preview` | `POST /v1/audio/generate` | Music only, without the narration |
| Optional opening effect | `stepaudio-3-gen-preview` | `POST /v1/audio/generate` | A separate short effect, cropped to 1.5 seconds |
| Final mix | Node.js code | Local PCM mixer | Overlay aligned tracks and export a stereo WAV |

The [Audio Generation API](https://platform.stepfun.ai/docs/en/api-reference/audio/generate) supports bracketed music/effect script cues. The music-only and effect-only requests contain no narrator role or spoken pitch. Its direct output is decoded as 24 kHz, 16-bit mono PCM. The TTS WAV is decoded independently. The mixer resamples tracks, normalizes levels, trims silent tails, loops short music with crossfades, gently filters the bed, applies fades and speech-aware ducking, sums simultaneous samples, and prevents clipping. The export is 24 kHz, 16-bit stereo WAV. All of this runs in Node.js without FFmpeg or a native audio package.

Overlap is controlled by code rather than by asking a single generation to arrange all sounds. Tests detect both independent source frequencies in the same time window, and each take records actual voice/music timing and RMS measurements. Listening remains the check for musical quality, unwanted vocals, effect content and pleasant balance.

Use **Voice only** for plain speech. It makes one TTS request and returns a WAV. Full mixes and voice-only takes are cached separately for each saved version. A new production with music makes two generation calls, or three with an effect; the one-render-per-turn budget covers the full pipeline. If a required track fails, the draft and intermediate local files remain available; speech alone is never returned as a successful finished mix.

Ask for quieter or louder background music in ordinary language. The agent saves a new version with a different `musicLevel` and runs a new production. This currently regenerates the source tracks; it is not a free remix of the previous files. Set music or effects to `none` by asking to omit them. **Voice only** skips both accompaniment requests.

### Inspect generated files

Files are stored in this stage's ignored `outputs/<session-id>/` folder. For a production take:

| File | Contents |
| --- | --- |
| `<take-id>.wav` | Downloadable final mix; voice and music already overlap |
| `<take-id>.json` | Script, chosen directions, track models, mix timing and measured levels |
| `<take-id>-voice.wav` | Aligned narration with the gain and padding used in the mix |
| `<take-id>-music.wav` | Aligned, looped music with the fades and gain used in the mix |
| `<take-id>-effects.wav` | Optional aligned opening-effect stem |
| `<take-id>-voice-source.wav` | Original TTS response |
| `<take-id>-music-source.pcm` | Original generated music before mixing |
| `<take-id>-music-brief.json` | Story/voice context, score plan and music request (no credentials) |
| `<take-id>-effects-source.pcm` | Optional original generated effect |
| `<take-id>-music-task.json` | Task-ID checkpoint for the optional dedicated Music service only |

The WAV stems are the files to play when comparing components. Raw `.pcm` sources have no container header. A take's `model` value is `local-pcm-mixer`; its `stems[].model` fields identify the audio models. The reasoning model is still Step 5 Preview. Saved `production` text and `score` record requested sound directions, rationale, tempo and timing; they are not an independent review of the generated content. New mixes use `pcm-overlay-v2`; earlier saved takes remain unchanged.

### Optional: the dedicated Music model

Set `STEP_AUDIO_MUSIC_MODEL=stepaudio-3-music-preview` to use the [dedicated Music API](https://platform.stepfun.ai/docs/en/api-reference/audio/music). The adapter submits one `text_to_music` task with `instrumental=true` and no lyrics, polls the same task every five seconds, then decodes its documented 48 kHz, 16-bit stereo PCM. A local task-ID checkpoint is saved. It generates a longer track; the same mixer trims/loops it to the narration timeline.

This is optional because a live task remained queued for over five minutes during validation. The default Gen music-only request completed much faster. Dedicated Music availability and completion have not been established by a successful live task in this environment. Waiting is bounded at six minutes; Stop cancels local waiting, but cannot cancel an already-submitted remote task. It does not silently switch music providers on failure.

## Optional: research a claim

Add your own key locally, restart, and refresh:

```dotenv
TAVILY_API_KEY=YOUR_TAVILY_API_KEY
```

Try:

> Research Griffith Observatory using reliable sources. Save a short sourced audio-guide draft, but do not generate audio yet.

Source cards show retrieved links, excerpts, and timestamps. Sources are snapshotted onto saved drafts and their takes. Citation IDs are validated; factual support still requires judgment. Search snippets are not full-page reading.

Step 5 Preview supports function calling; the [StepFun tool documentation](https://platform.stepfun.ai/docs/en/api-reference/tool-call) says it does not support Chat Completions' native `web_search`. Our function calls Tavily and returns evidence to Step 5 Preview. Without a Tavily key, requested search reports unavailable while the other features remain usable.

### Why keep direct API search?

Tavily has an [official MCP server](https://docs.tavily.com/documentation/mcp), and the [AI SDK supports MCP](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools). This workshop keeps one explicit HTTP search function for clarity. MCP adds connection and tool-discovery lifecycle; it is a useful [extension exercise](../EXTENSIONS.md#7-connect-a-remote-mcp-tool-service) for connecting several services. MCP is not enabled in this app.

## Follow the agent loop

```text
Project facts, optional image, and conversation history
    → Step 5 Preview chooses the next action
    → search_web, only if external research is needed
    → save_script checks the word budget and saves a version
    → create_production generates separate tracks and returns a mixed WAV
      OR create_voiceover returns a speech-only TTS WAV
    → Step 5 Preview confirms the actual result
```

Failed constraints go back to the model so it can revise. Tool activity is visible under the assistant's response. A successful tool result, not a sentence claiming success, establishes that an artifact exists.

The model badge shows backend-supplied configured and API-reported reasoning-model IDs, the track model configurations and local mixer, and search availability. Codex may write this application; runtime reasoning still uses StepFun.

### Configuration reference

| Variable | Default / purpose |
| --- | --- |
| `STEP_API_KEY` | Required StepFun credential |
| `STEP_BASE_URL` | `https://api.stepfun.ai/v1` |
| `STEP_MODEL` | `step-5-preview`: conversation, image understanding and tool selection |
| `STEP_AUDIO_MODEL` | `stepaudio-3-tts`: narration |
| `STEP_AUDIO_MUSIC_MODEL` | `stepaudio-3-gen-preview`: separate instrumental; dedicated Music is optional |
| `STEP_AUDIO_GEN_MODEL` | `stepaudio-3-gen-preview`: optional separate opening effect |
| `TAVILY_API_KEY` | Optional; empty disables web search |
| `PORT` | `3210` |

Shell variables take priority over this stage's `.env`, which takes priority over the workshop-root `voice-agent/.env`. `LA-Hacks/.env` is used by the original Python examples and is not automatically loaded here. Restart and refresh after configuration changes.

## Code tour

| File | Purpose |
| --- | --- |
| `src/prompt.ts` | Complete instructions, factual boundaries, production defaults, and workspace state. |
| `src/agent.ts` | Search, checked saving, audio tools, mode-specific reuse, and shared render budget. |
| `src/audio.ts` | TTS, music and optional effect orchestration; saves the mix and aligned stems. |
| `src/music.ts` | Direct Gen instrumental requests and the optional asynchronous Music adapter. |
| `src/mix.ts` | PCM/WAV decoding, resampling, looping, levels, fades, simultaneous summation and WAV export. |
| `src/model.ts` | StepFun connection and image input configuration. |
| `src/search.ts` | Tavily HTTP adapter and bounded source excerpts. |
| `src/runner.ts` | Streaming and full model/tool history for each turn. |
| `src/state.ts` | Typed scripts, source records, production choices, sessions, and takes. |
| `src/server.ts` | Local sessions, streamed events, MP3/WAV playback, downloads, and range requests. |
| `src/cli.ts` | The same agent in a terminal (`npm run chat`). |
| `public/` | Minimal browser UI and one-click sample briefs. |

The stage is self-contained and does not import code or dependencies from Stage 1.

## Validation and practical limits

`npm run check` and `npm test` make no paid requests. Tests cover tool history, source validation, failed checks, track requests, simultaneous source frequencies, volume controls, malformed audio, task polling, failures, shared render budgets, and mode-specific reuse.

Optional integration checks use real APIs:

```bash
npm run smoke
npm run smoke:production
npm run smoke:search
```

The first checks vision, memory, model identity, and voice-only TTS. The second checks a full brief-to-mixed-WAV task, checks nonzero music during narration, and saves the result and stems for listening. The third requires a Tavily key and checks actual retrieval. Generated artifacts and summaries are ignored by Git.

Tavily live retrieval remains pending until its key is configured. The default TTS + Gen + local-mixer path has completed real generation and browser playback checks. The optional dedicated Music adapter has mock coverage but no completed live task in this environment. These are separate verification states.

- Conversations are held in memory. Refresh restores saved work while the backend still runs. Opening another tab during an active reply waits for it to finish and restores the result. Reloading or closing the tab that is streaming a reply can cancel that request; completed drafts/takes remain. A backend restart clears sessions. Generated files remain on disk but are not imported into a new session.
- Each conversation allows 40 turns, 8 images, and 40 drafts. A turn allows eight model steps, two distinct searches, and one new render across both audio modes (two or three model generations for a mix). Existing results can be reused.
- Narration timing is estimated. The mixed file uses the actual voice duration plus fixed padding, so it does not accumulate a model-generated intro. The player shows actual duration. Generated music or effect content can still vary; inspect the independent tracks when needed.
- The local server binds to `127.0.0.1` and accepts local origins. Remote hosting needs deliberate host/origin configuration.
- If the port is occupied, stop the earlier server or change `PORT`.
- If a track request fails, inspect the tool error, model access and credits. Keep the draft; an incomplete production is not a finished mix. Stop preserves already completed drafts/takes but does not guarantee cancellation of work already accepted by the provider.
- ASR, microphone input, full-duplex conversation, video export, and durable project storage remain extensions, not implemented controls.

See [EXTENSIONS.md](../EXTENSIONS.md) for follow-on ideas and [the acceptance walkthrough](../../ACCEPTANCE.md) for a review sequence.

## Reading the execution view

The **Agent activity** panel shows the latest task contract and actual tool events. A generation step appears only when that operation starts. Narration, music and mixing progress comes from the production function; the final delivered status requires a successful tool result. Errors remain visible, and saved drafts/takes survive later errors in the same running server. Refresh restores this activity while the process remains running. It does not display private model reasoning.
