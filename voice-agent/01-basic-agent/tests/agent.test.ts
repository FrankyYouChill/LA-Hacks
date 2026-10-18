import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockLanguageModelV4 } from 'ai/test';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { createAgent, type ToolEvent } from '../src/agent.js';
import { createDraftStore, type Pitch } from '../src/workspace.js';

const good: Pitch = { title: 'CampusMate', audience: 'Hackathon students', problem: 'Scattered event information', benefit: 'A clear spoken invitation', targetSeconds: 20,
  text: 'Meet CampusMate, a workshop prototype for students arriving at a hackathon. It turns an event poster into a concise explanation and a spoken invitation, helping you find the important details and share them clearly with your team.' };

function result(parts: LanguageModelV4StreamPart[], tools = true) {
  return { stream: new ReadableStream<LanguageModelV4StreamPart>({ start(controller) {
    for (const chunk of [{ type: 'stream-start', warnings: [] } as LanguageModelV4StreamPart, ...parts,
      { type: 'finish', finishReason: { unified: tools ? 'tool-calls' : 'stop', raw: undefined }, usage: { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 10, text: 10, reasoning: undefined } } } as LanguageModelV4StreamPart]) controller.enqueue(chunk);
    controller.close();
  } }) };
}
function call(toolName: string, input: unknown, id: number) { return result([{ type: 'tool-call', toolCallId: String(id), toolName, input: JSON.stringify(input) }]); }
const done = () => result([{ type: 'text-start', id: 'a' }, { type: 'text-delta', id: 'a', delta: 'The checked pitch is saved.' }, { type: 'text-end', id: 'a' }], false);
function withGoal(next: () => ReturnType<typeof call>) {
  let first = true;
  return async () => {
    if (first) { first = false; return call('set_goal', { objective: 'Deliver a clear CampusMate pitch', targetSeconds: 20, criteria: ['Use supplied facts', 'Pass the word budget', 'Save a new version'] }, 0); }
    return next();
  };
}

test('a failed length check leads to a revised, checked, persisted pitch', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pitch-agent-'));
  const store = createDraftStore(directory);
  const events: ToolEvent[] = [];
  let step = 0;
  const model = new MockLanguageModelV4({ doStream: withGoal(() => {
    step++;
    if (step === 1) return call('check_pitch', { ...good, text: 'word '.repeat(80) }, step);
    if (step === 2) return call('check_pitch', good, step);
    if (step === 3) return call('save_pitch', { checkId: 'C1' }, step);
    return done();
  }) });
  const agent = createAgent(event => events.push(event), { model, store });
  const stream = await agent.stream({ prompt: 'Create a pitch from my brief, check it, and save it.' });
  for await (const part of stream.stream) if (part.type === 'error') throw part.error;
  const checks = events.filter(event => event.tool === 'check_pitch' && event.phase === 'end').map(event => event.result as { passed: boolean });
  assert.deepEqual(checks.map(check => check.passed), [false, true]);
  const draft = await createDraftStore(directory).read();
  assert.equal(draft?.version, 1);
  assert.equal(draft?.text, good.text);
  assert.match(await readFile(join(directory, 'draft-0001.md'), 'utf8'), /CampusMate/);
  assert.match(JSON.stringify(model.doStreamCalls.at(-1)?.prompt), /Too long/);
});

test('unchecked or unknown validation IDs cannot save a pitch', async () => {
  const store = createDraftStore(await mkdtemp(join(tmpdir(), 'pitch-gate-')));
  let step = 0;
  const model = new MockLanguageModelV4({ doStream: withGoal(() => {
    step++;
    if (step === 1) return call('save_pitch', { checkId: 'C1' }, step);
    if (step === 2) return call('check_pitch', good, step);
    if (step === 3) return call('save_pitch', { checkId: 'C2' }, step);
    return done();
  }) });
  const stream = await createAgent(undefined, { model, store }).stream({ prompt: 'Save a pitch.' });
  for await (const part of stream.stream) if (part.type === 'error') throw part.error;
  assert.equal(await store.read(), null);
});

test('an overclaim is returned as feedback and only its corrected candidate is saved', async () => {
  const store = createDraftStore(await mkdtemp(join(tmpdir(), 'pitch-wording-')));
  const checks: { passed?: boolean; issues?: string[] }[] = [];
  let step = 0;
  const model = new MockLanguageModelV4({ doStream: withGoal(() => {
    step++;
    if (step === 1) return call('check_pitch', { ...good, text: good.text.replace('find the important details', 'find every detail in seconds') }, step);
    if (step === 2) return call('check_pitch', good, step);
    if (step === 3) return call('save_pitch', { checkId: 'C1' }, step);
    return done();
  }) });
  const stream = await createAgent(event => { if (event.tool === 'check_pitch' && event.phase === 'end') checks.push(event.result as typeof checks[number]); }, { model, store }).stream({ prompt: 'Make a credible pitch, check it and save it.' });
  for await (const part of stream.stream) if (part.type === 'error') throw part.error;
  assert.deepEqual(checks.map(check => check.passed), [false, true]);
  assert.ok(checks[0].issues?.some(issue => /speed\/completeness/.test(issue)));
  assert.equal((await store.read())?.text, good.text);
  assert.equal((await store.read())?.version, 1);
});

test('a restarted workspace preserves earlier versions and rejects overlong saves', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pitch-versions-'));
  const first = await createDraftStore(directory).save(good);
  const second = await createDraftStore(directory).save({ ...good, title: 'A warmer revision' });
  assert.equal(second.version, first.version + 1);
  assert.equal((await createDraftStore(directory).read(1))?.title, 'CampusMate');
  await assert.rejects(createDraftStore(directory).save({ ...good, text: 'word '.repeat(80) }), /pass check_pitch/);
  assert.equal((await createDraftStore(directory).read())?.version, 2);
});

test('a candidate cannot pass without a goal or with a different duration', async () => {
  const store = createDraftStore(await mkdtemp(join(tmpdir(), 'goal-gate-')));
  const events: ToolEvent[] = []; let step = 0;
  const model = new MockLanguageModelV4({ doStream: async () => {
    step++;
    if (step === 1) return call('check_pitch', good, step);
    if (step === 2) return call('set_goal', { objective: 'Deliver a 30-second pitch', targetSeconds: 30, criteria: ['Fit 30 seconds'] }, step);
    if (step === 3) return call('check_pitch', good, step);
    if (step === 4) return call('save_pitch', { checkId: 'C1' }, step);
    return done();
  } });
  const response = await createAgent(event => events.push(event), { model, store }).stream({ prompt: 'Deliver a pitch.' });
  for await (const part of response.stream) if (part.type === 'error') throw part.error;
  const checks = events.filter(event => event.tool === 'check_pitch' && event.phase === 'end').map(event => event.result as { passed: boolean; issues: string[] });
  assert.deepEqual(checks.map(c => c.passed), [false, false]);
  assert.match(checks[0].issues.join(' '), /set_goal/); assert.match(checks[1].issues.join(' '), /30-second/);
  assert.equal(await store.read(), null); assert.ok((await response.steps).length > 1);
});
