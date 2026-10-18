import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ModelMessage } from 'ai';
import { createAgent } from '../src/agent.js';
import { ROOT, settings } from '../src/config.js';
import { createDraftStore, checkPitch } from '../src/workspace.js';

// Opt-in real-model check. Keeps its drafts separate from the participant's workspace.
await mkdir(settings.outputDir, { recursive: true });
const directory = await mkdtemp(resolve(settings.outputDir, 'live-check-'));
const store = createDraftStore(directory);
let messages: ModelMessage[] = [];
try {
  const brief = await readFile(resolve(ROOT, 'examples/project-brief.json'), 'utf8');
  let modelId: string | undefined;
  for (const prompt of [
    `Create a clear 30-second English pitch from this included project brief. Check and save it with your tools; do not ask questions. ${brief}`,
    'Read the latest saved draft. Make it shorter and warmer for a 15-second pitch. Check the revision and save a new version.',
  ]) {
    const agent = createAgent(event => {
      if (event.phase === 'end') console.log(`[tool] ${event.tool} ${JSON.stringify(event.result)}`);
    }, { store });
    const result = await agent.generate({ messages: [...messages, { role: 'user', content: prompt }], abortSignal: AbortSignal.timeout(180_000) });
    messages.push({ role: 'user', content: prompt }, ...result.responseMessages);
    await writeFile(resolve(directory, `turn-${messages.filter(message => message.role === 'user').length}.json`), JSON.stringify({ text: result.text, finishReason: result.finishReason, steps: result.steps.map(step => ({ finishReason: step.finishReason, tools: step.toolCalls.map(call => ({ name: call.toolName, input: call.input })) })) }, null, 2));
    modelId = result.response.modelId;
  }
  const first = await store.read(1);
  const latest = await store.read();
  assert.ok(first && latest && latest.version >= 2);
  assert.equal(latest.targetSeconds, 15);
  assert.ok(checkPitch(first).passed && checkPitch(latest).passed);
  assert.equal(modelId, settings.model);
  await writeFile(resolve(directory, 'result.json'), JSON.stringify({ passed: true, modelId, first, latest }, null, 2));
  console.log(`PASS: checked, revised, and saved ${latest.version} versions with ${modelId}.\n${directory}`);
} catch (error) {
  console.error(error instanceof assert.AssertionError ? error.message : 'Live pitch check failed. Check model access, connection, and API credits.');
  process.exitCode = 1;
}
