# Instructor Notes

Teach one problem in two stages: turn a builder's project into a clear, credible pitch, then into a playable audio introduction. Keep documentation, UI, examples, and default model interaction in English.

## Prepare

Use Node.js 24 and a StepFun key with access to Step 5 Preview, StepAudio 3 TTS and Gen Preview. Add Tavily credentials only if teaching web research. Install and run checks/tests in each stage, then generate and listen to a real sample before presenting. No microphone input, FFmpeg installation or separate music-service account is required for the default path.

Use the [workshop guide](README.md) for manual clone/ZIP instructions or a coding-assistant prompt. The repository root is `LA-Hacks/`; the workshop root is `LA-Hacks/voice-agent/`. Configure `voice-agent/.env` or the stage's own `.env`. The original Python examples' `LA-Hacks/.env` is a separate configuration location.

If a browser server is already running, keep it for the demo or stop it before launching another on port 3210. A restart clears Stage 2's in-memory conversation; generated files remain on disk. Stage 1's saved drafts survive a restart.

## Stage 1 — A small agent that delivers a checked pitch

1. Open Stage 1 at <http://localhost:3200>. Explain its three panels: task contract, actual tool activity and saved deliverable.
2. Click **Try CampusMate**. The model calls `set_goal`, chooses a candidate, checks it and saves an approved version. Inspect the goal and acceptance criteria before the result.
3. Click **Repair a rough draft**. It checks the supplied overlong original, receives a real length failure, revises and checks again before saving. Compare the two candidates in the activity details. Do not describe every normal run as requiring a revision.
4. Show the saved pitch, word budget, version selector and Markdown/JSON downloads. Code enforces the goal duration and exact passing-check ID; participants still assess factual fidelity.
5. Click **Make it 15 seconds** or **Make it warmer**. Show `read_draft` before the new check/save sequence, and revisit an older version.
6. Reload to restore this browser workspace. Restarting the server preserves its draft files via the browser cookie, while chat and activity reset. **Clear conversation** retains saved files.
7. Open the model badge to show configured and API-reported IDs. Optional CLI: `npm run chat`, then `/demo`, `/draft` and `/model`.

Checkpoint: the learner can explain goal → tool → feedback → revision → saved artifact and inspect what really happened.

## Stage 2 — Produce the same kind of pitch

1. Open the browser and choose **Produce CampusMate**. The sample supplies project facts; the agent chooses voice, music, and effects without a questionnaire or recording.
2. Follow **Agent activity** from its goal to the actual tool results. Inspect the checked draft, production direction, **Why this music** rationale and mixed WAV. During production, narration → music → mixing progress comes from the real production function. Failed actions remain visible; no animation invents a completed step. Explain how the agent ties a sparse musical palette to the story and voice, with no opening effect by default.
3. Play the mixed WAV and use **Listen to individual tracks** to compare voice and music. Explain the two default audio models: TTS makes narration, while Gen Preview makes instrumental music and an optional effect in separate requests. Show `src/audio.ts`, `src/music.ts` and the actual overlap in `src/mix.ts`. Music is summed underneath narration by code, with silent-tail trimming, longer crossfades, gentle filtering, speech-aware ducking, fades and peak protection. The main player already contains all components; starting several players is unnecessary.
4. Ask for a shorter, warmer version with quieter music (`musicLevel=soft`). Compare versions and revisit earlier takes.
5. Show **Voice only** as the simpler TTS option. Both current modes export WAV: voice-only calls TTS once, while production separately generates accompaniment and overlays it in code. Two audio-model IDs can mean three generation calls when an effect is included, in addition to Step 5 Preview calls. Revising production currently regenerates the source tracks; it does not just change a local volume slider.
6. Optionally use the included poster or a product screenshot to add visual context.
7. If Tavily is configured, request a sourced draft and inspect the excerpts and attached source IDs.

Checkpoint: the learner can distinguish Step 5 Preview's decisions from TypeScript tool execution and StepAudio's actual audio output.

You can also carry a Stage 1 result forward: paste its spoken paragraph, state its narration target, and ask Stage 2 to keep the words unchanged while producing audio. There is no automatic cross-stage file import.

For audio acceptance, listen for music during the spoken segment, inspect the separate music stem and check the output timing. Judge whether its mood and density fit the words and whether loop transitions distract. The score plan includes measured narration duration and a requested musical pulse, but generation is text-directed, not audio-conditioned or beat-synchronized. If it clashes, ask for a warmer acoustic palette, simpler harmony or less percussion rather than only changing volume. The mixer tests prove simultaneous signals and bounded peaks; they do not judge musical quality, exact instrument identity or unwanted generated vocals. A successful file response alone is insufficient.

Keep `stepaudio-3-gen-preview` as the default music source. The dedicated `stepaudio-3-music-preview` adapter is optional and has mock coverage; its live task stayed queued for over five minutes during validation. Do not present it as a completed live integration. Tavily live retrieval also needs a configured key and its own check.

## Review and extend

Follow [ACCEPTANCE.md](ACCEPTANCE.md). Good small extensions are a different project role or pronunciation controls. Voice rehearsal with ASR, video narration, persistence, and MCP services are larger follow-ons. Keep exactly two stage folders.

Generated audio uses account access and credits. Preview permissions can vary. Missing search credentials or failed audio generation should be presented honestly, with the saved pitch still usable. Do not show real secrets on screen or describe test fixtures as live provider results.

Publish source only after local review as a separate action. Follow the [publication guide](../PUBLISHING.md) to preserve the existing repository and exclude local credentials, outputs and slide-working assets. GitHub Actions checks both stages without provider keys after upload; its hosted status is separate from local validation.
