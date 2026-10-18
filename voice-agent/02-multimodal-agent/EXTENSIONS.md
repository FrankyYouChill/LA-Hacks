# Take Stage 2 Further

These are follow-on exercises within Stage 2, not extra stage folders. The current implementation includes checked project pitches, text/image conversation, optional Tavily search, sourced drafts, separate TTS/Gen tracks, a simultaneous Node.js mix, aligned WAV stems and voice-only TTS. The dedicated Music adapter is optional and has no completed live task in this environment. The features below are proposed extensions.

## 1. Give it a specific job

**Idea:** specialize the project-pitch producer for a different audience, such as a product launch narrator or museum guide.

Start in `src/prompt.ts`. Change the task, intended audience, preferred questions, and output criteria while keeping truthful identity, evidence, and tool rules. Keep useful defaults so the user does not have to fill in voice and music parameters.

**Done when:** your example conversation produces a useful result for the intended audience, and follow-up edits preserve the facts and previous versions. No extra provider is required.

## 2. Speak your directions with StepAudio 3 ASR

**Idea:** record “make it shorter and more energetic,” then send the recognized text through the existing agent loop.

Add a record button and bounded microphone capture in `public/`. Add a backend route that calls StepFun's [speech recognition endpoint](https://platform.stepfun.ai/docs/en/api-reference/audio/asr-sse) using `stepaudio-3-asr-max`. The current endpoint accepts supported audio formats and returns transcript events. Convert browser recordings into a supported format when needed; do not simply relabel an unsupported recording.

Keep the transcript visible and editable before sending it to `runTurn`. This is turn-based voice input, not an implementation of a full-duplex Realtime session.

**Done when:** a short recording yields an editable transcript, submitting it revises the saved draft, and microphone denial or transcription failure leaves text input usable. Requires microphone permission and access to the ASR model.

## 3. Explain a short product video

**Idea:** a short screen recording becomes a narrated walkthrough.

Step 5 Preview [supports video input](https://platform.stepfun.ai/docs/en/guides/models/step-5-preview), but this UI currently accepts images only. Add supported video input to the upload validation, model-message conversion, and browser controls. Apply size and duration limits appropriate to your demo and test the provider request format.

Have the agent identify the visible sequence, then write a corresponding narration and generate speech. Producing a voice track is separate from muxing audio into a downloadable video.

**Done when:** the narration follows the clip's actual steps without inventing features, and the interface clearly states whether it outputs a voice track or an assembled video.

## 4. Make research more useful

**Idea:** product facts or landmark history should point to relevant, trustworthy sources.

Extend `src/search.ts` with domain filters or date constraints from the [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search). Let a user choose an official source domain for a specific project. For deeper research, add a separately bounded page-extraction function rather than claiming search snippets are full pages.

Keep the application-assigned source IDs and script snapshots. Test empty results, conflicting facts, and sources that do not support a proposed statement.

**Done when:** a saved script cites retrieved sources that actually support its factual claims, and an unsupported question produces an honest gap rather than a fabricated citation.

## 5. Keep projects between sessions

**Idea:** return to a project tomorrow and continue refining it.

Replace in-memory sessions with a small local database, such as SQLite, and store project/draft/source metadata. Keep audio storage separate. If you later build a shared hosted product, design access controls and storage ownership as part of that project rather than exposing this local demo unchanged.

**Done when:** restarting preserves the selected project and its source/audio versions, and deleting a project handles both metadata and its owned files.

## 6. Teach it your project's pronunciation

**Idea:** a product name should sound right in a demo voiceover.

Add a pronunciation field to the script schema, validate it, and map it to the documented speech API's `pronunciation_map` request field in `src/audio.ts`. Keep pronunciation instructions out of spoken text.

**Done when:** you can compare two takes of the same text, hear the intended pronunciation change, and inspect the actual speech configuration for each version.

## 7. Connect a remote MCP tool service

**Idea:** learn a common interface for adding external tools, beginning with Tavily and later another compatible service. This is an optional architecture exercise; the current application uses Tavily's HTTP API directly.

Tavily's [official remote MCP server](https://docs.tavily.com/documentation/mcp) is available at `https://mcp.tavily.com/mcp/`. It supports API-key authentication and OAuth. For an initial backend exercise, reuse the local `TAVILY_API_KEY` through the Authorization header. An OAuth version would also need a browser authorization flow and credential storage.

Use the [AI SDK MCP client](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools) from `@ai-sdk/mcp` in the Node backend. Verify package compatibility with the pinned AI SDK version before installing it. Connect over HTTP, discover the offered tools, and select only the search tool needed for the exercise. Keep the client open until tool execution finishes, then close it according to the application's lifecycle.

Keep `search_web` as the agent-facing interface in `src/agent.ts`. Replace the HTTP request behind it with an MCP tool call, normalize the result into the existing source records, and preserve query limits, timeouts, error handling, and source IDs. Passing every discovered tool directly to the model would change the workshop's capabilities and budgets.

In this architecture, Step 5 Preview requests a function; your Node backend calls the MCP server and sends the result back to the model. Configuring MCP in a coding assistant alone does not connect this application's runtime. The reasoning model stays Step 5 Preview.

**Done when:** an explicit research request executes through the MCP client, the UI receives valid source cards, cited drafts still work, and connection/authentication failures leave ordinary chat usable. Verify the adapter with a local mock server, then verify the actual Tavily connection after credentials are configured. Do not describe mock results as a successful live search.

## 8. Add a mix editor

**Idea:** adjust the soundtrack after generation without paying to generate the same source tracks again.

The current implementation already generates voice/music separately and overlays them in `src/mix.ts`. It supports three agent-selected background levels, aligned WAV stems, crossfaded music loops, fades and peak protection. Conversational revisions currently regenerate tracks. Add a small timeline/level editor that remixes the saved original source tracks while retaining the earlier mix. Decode the raw PCM using the source model's sample rate/channel format; the aligned WAV stems already have gain, looping and fades applied and should not receive those treatments a second time.

If you choose the optional dedicated Music service, use its saved task ID to implement task resumption instead of submitting duplicate asynchronous jobs. The default direct Gen music path has no Music task ID.

**Done when:** moving a volume control changes the existing music bed without another model generation, the downloaded mix matches playback, previous takes remain available, and both stems stay inspectable.

## Choose a small extension

For a first workshop exercise, choose role customization or pronunciation control. Choose MCP when the learning goal is connecting external tool services. Voice input and video make good follow-on projects because they add browser/media handling. Keep the existing draft-only workflow, model metadata, source integrity, and explicit speech action as you expand.
