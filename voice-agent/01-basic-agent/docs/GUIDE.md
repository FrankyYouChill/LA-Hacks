# Inside Demo Coach

For startup and the first demo, use the [short README](../README.md).

## Why this is an agent

The task is to deliver a pitch that meets a time budget. Step 5 Preview sets a concrete goal, chooses tools, reads their results, revises when needed, and delivers a saved artifact. The UI displays those real actions rather than simulated progress.

| Tool | What actually happens |
| --- | --- |
| `set_goal` | Records the objective, duration and acceptance criteria for this turn |
| `read_draft` | Reads an immutable saved version from this workspace |
| `check_pitch` | Checks word count, formatting, narrow promise phrases and agreement with the goal's duration |
| `save_pitch` | Saves the exact candidate associated with a passing check ID as Markdown and JSON |

The save gate is enforced in code. A candidate cannot pass without a goal, and an unchecked candidate cannot be saved through the tool. Acceptance criteria also describe qualitative goals; the checker does not independently verify factual accuracy or every criterion. Duration is estimated at 150 words/minute, not measured from a recording.

**Repair a rough draft** supplies an intentionally overlong original. The model must check those exact words before editing, then use the actual failure to revise. The normal sample may pass immediately; no failure is fabricated.

## Why Vercel AI SDK and Node.js?

The [Vercel AI SDK](https://ai-sdk.dev/docs/introduction) provides typed tools, streamed responses and the loop that lets the model continue after a tool result. The [OpenAI-compatible provider](https://ai-sdk.dev/providers/openai-compatible-providers) connects directly to StepFun. No Vercel deployment or AI Gateway is required.

It is a JavaScript/TypeScript library distributed through npm. **Node.js runs the application**, `tsx` runs its TypeScript source, and npm installs the locked dependencies. Step 5 Preview supplies inference. Codex can help write or run the source; it is not the runtime model. Python can call the same StepFun API through a different implementation.

## Code tour

| File | Responsibility |
| --- | --- |
| [model.ts](../src/model.ts) | StepFun provider and configured model |
| [agent.ts](../src/agent.ts) | Goal, instructions, four tools and check-before-save enforcement |
| [workspace.ts](../src/workspace.ts) | Constraint checker and versioned files |
| [runner.ts](../src/runner.ts) | Conversation history, streamed events and outcome |
| [server.ts](../src/server.ts) | Local browser API and scoped downloads |
| [public/app.js](../public/app.js) | Task, tool feedback, deliverable and version UI |
| [project-brief.json](../examples/project-brief.json) | Included CampusMate demo facts |

## Configuration and storage

Both interfaces read this stage's `.env` and then `voice-agent/.env`. Shell values take priority. The original Python examples' `LA-Hacks/.env` is a separate location. Keep existing configured files; do not overwrite them with an example.

`STEP_API_KEY` is required for model calls. `STEP_MODEL` defaults to `step-5-preview`; `STEP_BASE_URL` defaults to `https://api.stepfun.ai/v1`. `STAGE1_PORT` defaults to `3200` and is independent of Stage 2's `PORT`.

The browser saves drafts in `outputs/browser/<workspace-id>/`. Its cookie reconnects to that file workspace after a server restart. Chat and activity are in memory; those reset on restart. **Clear conversation** clears the chat and current task log while retaining saved versions. Do not use this local starter as a public multiuser service.

Terminal drafts live directly in `outputs/`. The browser and terminal use the same agent and storage implementation, with separate file workspaces. Stage 2 does not automatically import these files; paste a pitch into it to continue.

## Terminal option

```bash
npm run chat
```

At `You >`, enter `/demo`, then ask for a shorter checked revision. `/draft` reads the latest file, `/model` shows configured/API-reported model IDs, `/reset` clears conversation and `/exit` quits. Restart the terminal to inspect a saved draft again with the agent.

## Checks and limits

`npm run check` and `npm test` make no provider requests. Tests cover the goal/check gate, failed-check revision, file versions and the local HTTP interface. `npm run smoke` is an optional real-model draft/revision check; it uses account credits and saves under a separate ignored live-check folder.

There are at most eight model steps per turn, one tool at a time, a three-minute request timeout, no automatic provider retries and 40 turns per browser conversation. Ordinary questions do not need pitch tools. No search, images or audio generation are implemented in Stage 1.

| Problem | What to check |
| --- | --- |
| `node` or `npm` missing, engine warnings | Use Node.js 24; reopen the terminal |
| Missing `package.json` | Run npm commands inside `01-basic-agent` |
| Missing key | Set `STEP_API_KEY` locally and restart |
| Port already in use | Use the existing server or set `STAGE1_PORT` |
| A model request fails | Check connection, StepFun permissions and credits; saved files remain |
| The UI reloads during work | Reload can stop that tab's request; inspect saved work before retrying |
| The agent forgot the conversation | Chat resets on restart; use `read_draft` to inspect persisted work |
