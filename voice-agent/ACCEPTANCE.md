# Try the Two-Stage Workshop

Both stages solve one problem: help a builder explain their project clearly and credibly. Stage 1 delivers a checked pitch. Stage 2 delivers a produced audio introduction.

Start in the folder with this file and the two numbered stage folders: `LA-Hacks/voice-agent/`. Use Node.js 24 and a StepFun key in `voice-agent/.env` or a stage-local `.env`. Keep an existing configuration in place. No GitHub push is needed for review.

## 1. Stage 1: a task-solving agent

```bash
cd 01-basic-agent
npm ci
npm run check
npm test
npm start
```

Open <http://localhost:3200>.

1. Click **Try CampusMate**. It should use the included facts without asking you to prepare a brief.
2. Inspect the task contract, actual tool activity and the saved pitch. A goal and passing candidate check are required before a save.
3. Click **Repair a rough draft**. Confirm the original words fail the 15-second budget, then a revised candidate passes before saving. Inspect both candidates in the activity details.
4. Download the Markdown and JSON. Verify the text and version match what is shown.
5. Click **Make it warmer** or **Make it 15 seconds**. Confirm it reads saved work and creates a new version. Select the earlier version to revisit it.
6. Open the model badge. It should show configured and API-reported `step-5-preview` after a successful reply.
7. Refresh: saved drafts, chat and activity return while the server runs. **Clear conversation** clears the latter two but retains saved versions.
8. Restart the server and reload in the same browser: saved drafts return; chat and activity start fresh. The cookie identifies the browser's local file workspace.

The UI's constraint check does not independently verify factual accuracy, and duration is an estimate. Ordinary questions should work without a forced pitch or simulated tool steps. Stop an active task and check that already-saved drafts remain.

For the optional terminal, run `npm run chat`, then `/demo`, `/draft`, `/model` and `/exit`. Terminal files use a separate workspace in `outputs/`.

## 2. Stage 2: a produced audio pitch

```bash
cd ../02-multimodal-agent
npm ci
npm run check
npm test
npm start
```

Open <http://localhost:3210>. If a server is already running, use that page or stop it with Ctrl+C before starting the final version. Refresh after a backend restart; in-memory conversations start fresh.

1. Select **Produce CampusMate**. Do not type a brief or record audio.
2. Check the saved pitch for a clear audience, problem, and benefit without fabricated proof.
3. Follow the task contract and actual generation steps in **Agent activity**. Inspect the agent-chosen voice/music/effect direction, **Why this music** rationale and actual tool activity. The music should suit this story and voice, with no generic opening effect by default.
4. Play and download the mixed WAV. Confirm that music is audible underneath narration. Open **Listen to individual tracks** and compare narration and music separately. With music enabled, the mix has a 0.6-second musical lead-in and 1-second ending. Listen for a sparse bed that supports the narration, smooth loop joins, and gentle volume recovery in speech pauses. Compare a warm acoustic request with a light electronic request if the first style feels unsuitable. Check any optional opening effect. A valid file, musical directions or an automated audio-model description do not replace listening.
5. Ask **Make it shorter and warmer. Save a new version and produce a new mix with quieter music.** Compare versions and earlier takes.
6. Select an older draft and **Open production**. It should open existing audio without another generation.
7. Try **Voice only**. That produces a separate TTS WAV without claiming to include music or effects.
8. Refresh. Completed work should return while the server still runs.

The model badge should distinguish the reasoning model, TTS model, music model, optional effect model, and local PCM mixer. On mobile, **View workspace** jumps to the output.

Inspect this stage's `outputs/<session-id>/` folder. The final `<take-id>.wav`, its metadata JSON and the aligned `-voice.wav` / `-music.wav` stems should exist; `-effects.wav` appears when requested. The stems have the same timeline and gains as the final mix. Metadata should identify `local-pcm-mixer`, `pcm-overlay-v2`, the individual track models, a `score` plan and nonzero music RMS during the voice window. The `-music-brief.json` stores the requested story/voice context, duration and tempo. These requests do not certify actual duration, tempo, instruments or subjective quality. This checks overlap, while listening checks actual sound quality.

You can bring your Stage 1 pitch into Stage 2 by pasting its spoken paragraph and asking it to keep the words and narration target. There is no automatic file import.

## 3. Add context and test boundaries

- Try **Produce LaunchLens** as another complete sample, or use your own project facts/screenshot.
- **Try the LA Hacks poster** prepares a draft-only request. No audio should appear until you request production or voice-only output.
- Ask an ordinary question: it should not automatically render audio.
- Empty submissions should do nothing; unsupported or oversized image files should produce clear messages.
- Stop an active browser request: completed drafts/audio should remain.
- Open another tab during a reply: it should wait for completion, then restore the result.
- Reloading the tab that is streaming a reply can cancel that request; inspect saved drafts/takes before generating again.
- New conversation clears the current view. Generated files remain on disk.

## 4. Search when the key is ready

Without `TAVILY_API_KEY`, requested search should explain that it is unavailable and should not invent retrieved sources. The other features remain usable.

After adding the key locally, restart and refresh. Ask for a sourced draft, inspect clickable sources/excerpts, then request audio. `npm run smoke:search` checks real retrieval and uses provider credits.

## Optional live checks

- Stage 1: `npm run smoke` checks real drafting, inspection, revision, and saved versions.
- Stage 2: `npm run smoke:production` checks a complete sample-brief-to-mixed-WAV task, including nonzero music during narration.
- Stage 2: `npm run smoke` checks image understanding, conversation history, model identity, and voice-only TTS.

All live checks use provider access and credits. A new production makes two audio-generation calls, or three with an effect, plus the agent's Step 5 Preview calls. Voice-only makes one TTS call. Gen returns PCM source tracks and TTS returns a WAV; Node.js exports the final mix and aligned stems as WAVs. Narration timing is estimated before generation; the player and mix metadata give the actual duration.

The default TTS + Gen + local-mixer path has completed live generation and browser checks. Tavily live search remains pending its key. The optional dedicated Music adapter has mock tests but no completed live task in this environment. MCP, microphone/ASR, video export, a live mix editor and durable Stage 2 project storage remain extensions.
