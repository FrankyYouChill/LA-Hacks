import test from 'node:test';
import assert from 'node:assert/strict';
import { MockLanguageModelV4 } from 'ai/test';
import type { LanguageModelV4StreamPart, LanguageModelV4StreamResult } from '@ai-sdk/provider';
import { runTurn } from '../src/runner.js';
import { newSession, type AgentEvent, type AudioTake, type Script } from '../src/state.js';
import { UserError } from '../src/config.js';

const draft = {
  title: 'A small idea, a big voice', text: 'Your next big idea starts here.', language: 'en',
  voice: 'lively-girl', direction: 'Warm, curious, and upbeat.', speed: 1,
};

test('a task goal and real tool activity survive refresh; failed audio stays incomplete', async () => {
  const session = newSession(); let step = 0;
  const goal = { objective: 'Deliver a warm audio pitch', deliverable: 'production', criteria: ['Use the supplied facts', 'Deliver a mixed WAV'] };
  const model = new MockLanguageModelV4({ doStream: async () => {
    if (++step === 1) return call('set_goal', goal, 'goal');
    if (step === 2) return call('save_script', draft, 'save');
    if (step === 3) return call('create_production', { version: 1 }, 'produce');
    return say('The draft is saved, but audio generation failed.');
  } });
  await runTurn(session, { text: 'Produce my pitch.' }, undefined, undefined, { model, produce: async () => { throw new Error('private-provider-body'); } });
  assert.deepEqual(session.goal, goal);
  assert.equal(session.activity[0].type, 'run-start');
  assert.equal(session.activity.filter(e => e.type === 'tool-start').length, 3);
  assert.ok(session.activity.some(e => e.type === 'tool-end' && e.tool === 'create_production' && e.ok === false));
  assert.equal(session.activity.at(-1)?.outcome, 'incomplete');
  assert.equal(session.scripts.length, 1); assert.equal(session.takes.length, 0);
  assert.doesNotMatch(JSON.stringify(session.activity), /private-provider-body/);
});

test('a claimed completion without the goal artifact is not marked delivered', async () => {
  const session = newSession(); let step = 0;
  const model = new MockLanguageModelV4({ doStream: async () => ++step === 1 ? call('set_goal', { objective: 'Produce an audio pitch', deliverable: 'production', criteria: ['Return a mixed WAV'] }, 'goal') : say('Your audio is ready.') });
  await runTurn(session, { text: 'Produce an audio pitch.' }, undefined, undefined, { model });
  assert.equal(session.takes.length, 0); assert.equal(session.activity.at(-1)?.outcome, 'incomplete');
});

function response(parts: LanguageModelV4StreamPart[], tools = false): LanguageModelV4StreamResult {
  const chunks: LanguageModelV4StreamPart[] = [
    { type: 'stream-start', warnings: [] }, ...parts,
    { type: 'finish', finishReason: { unified: tools ? 'tool-calls' : 'stop', raw: undefined },
      usage: { inputTokens: { total: 20, noCache: 20, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 10, text: 10, reasoning: undefined } } },
  ];
  return { stream: new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); } }) };
}

function call(name: string, input: unknown, id: string) {
  return response([{ type: 'tool-call', toolCallId: id, toolName: name, input: JSON.stringify(input) }], true);
}

function say(text: string) {
  return response([{ type: 'text-start', id: 'answer' }, { type: 'text-delta', id: 'answer', delta: text }, { type: 'text-end', id: 'answer' }]);
}

test('image + two dependent tools + follow-up retain all tool exchanges', async () => {
  const session = newSession();
  const events: AgentEvent[] = [];
  let requests = 0;
  let audioCalls = 0;
  const model = new MockLanguageModelV4({ doStream: async () => {
    requests++;
    if (requests === 1) return call('save_script', draft, 'save-1');
    if (requests === 2) return call('create_voiceover', { version: 1 }, 'audio-1');
    return say(requests === 3 ? 'Your first take is ready, Frank.' : 'Yes, Frank, I still have your image and script.');
  } });
  const dependencies = { model, synthesize: async (script: Script, _id: string) => {
    audioCalls++;
    return { ...script, id: 'test-take', url: '/test.wav', bytes: 1024, createdAt: '2026-10-17T00:00:00Z', model: 'stepaudio-3-tts' } as AudioTake;
  } };
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  await runTurn(session, { text: 'I am Frank. Give this image a voice.', image }, event => events.push(event), undefined, dependencies);
  assert.equal(audioCalls, 1);
  assert.equal(session.takes.length, 1);
  assert.equal(session.messages.filter(message => message.role === 'tool').length, 2);
  assert.ok(events.some(event => event.type === 'audio'));
  await runTurn(session, { text: 'What is my name? Do you still have the image?' }, undefined, undefined, dependencies);
  const followupPrompt = JSON.stringify(model.doStreamCalls.at(-1)?.prompt);
  assert.match(followupPrompt, /Frank/);
  assert.match(followupPrompt, /save-1/);
  assert.match(followupPrompt, /audio-1/);
  assert.match(followupPrompt, /image\/png/);
  assert.equal(session.turns, 2);
  assert.equal(session.busy, false);
});

test('a failed audio request preserves the draft and cannot charge a second attempt in the same turn', async () => {
  const session = newSession();
  let stage = 0;
  let audioCalls = 0;
  const model = new MockLanguageModelV4({ doStream: async () => {
    stage++;
    if (stage === 1) return call('save_script', draft, 'save');
    if (stage === 2 || stage === 3) return call('create_voiceover', { version: 1 }, `audio-${stage}`);
    return say('The script is saved, but audio is unavailable.');
  } });
  const result = await runTurn(session, { text: 'Make a voiceover.' }, undefined, undefined, {
    model, synthesize: async () => { audioCalls++; throw new UserError('StepAudio 3 returned HTTP 403.'); },
  });
  assert.equal(audioCalls, 1);
  assert.equal(session.scripts.length, 1);
  assert.equal(session.takes.length, 0);
  assert.match(result.text, /unavailable/);
  assert.equal(session.busy, false);
});

test('rendering an already generated version reuses the existing take', async () => {
  const session = newSession();
  session.scripts.push({ ...draft, language: 'en', voice: 'lively-girl', version: 1 });
  session.takes.push({ ...session.scripts[0], id: 'existing', url: '/existing.wav', bytes: 100, createdAt: '', model: 'stepaudio-3-tts' });
  let stage = 0;
  const model = new MockLanguageModelV4({ doStream: async () => ++stage === 1 ? call('create_voiceover', { version: 1 }, 'reuse') : say('Here is the existing take.') });
  await runTurn(session, { text: 'Play the same take.' }, undefined, undefined, {
    model, synthesize: async () => { throw new Error('Must not call the API again.'); },
  });
  assert.equal(session.takes.length, 1);
});

test('invalid images and simultaneous turns are rejected before calling the model', async () => {
  const session = newSession();
  const model = new MockLanguageModelV4();
  await assert.rejects(runTurn(session, { text: 'Read this.', image: 'https://example.com/image.png' }, undefined, undefined, { model }), /PNG/);
  session.busy = true;
  await assert.rejects(runTurn(session, { text: 'Second turn.' }, undefined, undefined, { model }), /already running/);
  assert.equal(model.doStreamCalls.length, 0);
});


test('research sources are carried into saved scripts and generated audio', async () => {
  const session = newSession();
  let stage = 0;
  let queries = 0;
  const model = new MockLanguageModelV4({ doStream: async () => {
    stage++;
    if (stage === 1) return call('search_web', { query: 'Griffith Observatory official history' }, 'search');
    if (stage === 2) return call('save_script', { ...draft, sourceIds: ['S1'] }, 'save');
    if (stage === 3) return call('create_voiceover', { version: 1 }, 'audio');
    return say('The researched take is ready.');
  } });
  const result = await runTurn(session, { text: 'Research this place and make a voiceover.' }, undefined, undefined, {
    model,
    search: async () => { queries++; return [{ title: 'Official history', url: 'https://griffithobservatory.org/about/', content: 'The observatory opened in 1935.', retrievedAt: '2026-10-17T00:00:00Z' }]; },
    synthesize: async script => ({ ...script, id: 'research-take', url: '/research.wav', bytes: 100, createdAt: '', model: 'stepaudio-3-tts' }),
  });
  assert.equal(queries, 1);
  assert.equal(session.research.length, 1);
  assert.equal(session.scripts[0].sources?.[0].id, 'S1');
  assert.equal(session.takes[0].sources?.[0].url, 'https://griffithobservatory.org/about/');
  assert.equal(session.messages.filter(message => message.role === 'tool').length, 3);
  assert.ok(result.model);
  session.sources[0].content = 'A later search updated this excerpt.';
  assert.equal(session.scripts[0].sources?.[0].content, 'The observatory opened in 1935.');
});

test('a failed search is not recorded as successful research', async () => {
  const session = newSession();
  let stage = 0;
  let attempts = 0;
  const events: AgentEvent[] = [];
  const model = new MockLanguageModelV4({ doStream: async () => ++stage <= 2 ? call('search_web', { query: 'current event details' }, `search-fail-${stage}`) : say('Search is unavailable. I cannot verify this information.') });
  await runTurn(session, { text: 'Search for current details.' }, event => events.push(event), undefined, {
    model, search: async () => { attempts++; throw new UserError('Tavily is not configured.'); },
  });
  assert.equal(attempts, 1);
  assert.equal(session.research.length, 0);
  assert.equal(session.sources.length, 0);
  assert.ok(events.some(event => event.type === 'tool-end' && event.ok === false));
  assert.match(JSON.stringify(session.messages), /"searched":false/);
});

test('fabricated source IDs cannot be attached to a draft', async () => {
  const session = newSession();
  const events: AgentEvent[] = [];
  let stage = 0;
  const model = new MockLanguageModelV4({ doStream: async () => ++stage === 1 ? call('save_script', { ...draft, sourceIds: ['S99'] }, 'fake-source') : say('I need a real supporting source first.') });
  await runTurn(session, { text: 'Save a researched draft.' }, event => events.push(event), undefined, { model });
  assert.equal(session.scripts.length, 0);
  assert.equal(session.takes.length, 0);
  assert.ok(events.some(event => event.type === 'tool-end' && event.tool === 'save_script' && event.ok === false));
  assert.match(JSON.stringify(session.messages), /"saved":false/);
});

test('a speed/completeness overclaim must be revised before it becomes a saved script', async () => {
  const session = newSession();
  const events: AgentEvent[] = [];
  let step = 0;
  const model = new MockLanguageModelV4({ doStream: async () => {
    step++;
    if (step === 1) return call('save_script', { ...draft, text: 'CampusMate explains every detail in seconds.' }, 'overclaim');
    if (step === 2) return call('save_script', draft, 'corrected');
    return say('Your revised draft is saved.');
  } });
  await runTurn(session, { text: 'Save a credible project pitch, without audio.' }, event => events.push(event), undefined, { model });
  assert.equal(session.scripts.length, 1);
  assert.equal(session.scripts[0].text, draft.text);
  assert.equal(session.scripts[0].version, 1);
  assert.equal(session.takes.length, 0);
  assert.ok(events.some(event => event.type === 'tool-end' && event.tool === 'save_script' && event.ok === false));
  assert.match(JSON.stringify(model.doStreamCalls.at(-1)?.prompt), /speed\/completeness/);
});

test('repeated searches reuse results and only two distinct queries execute per turn', async () => {
  const session = newSession();
  let stage = 0;
  const queries: string[] = [];
  const calls = ['history of the observatory', 'history of the observatory', 'official observatory facts', 'third query'];
  const model = new MockLanguageModelV4({ doStream: async () => stage < calls.length ? call('search_web', { query: calls[stage++] }, `search-${stage}`) : say('Research complete.') });
  await runTurn(session, { text: 'Research the observatory.' }, undefined, undefined, {
    model, search: async query => { queries.push(query); return [{ title: query, url: `https://example.com/${queries.length}`, content: 'Source excerpt', retrievedAt: '' }]; },
  });
  assert.deepEqual(queries, calls.slice(1, 3));
  assert.equal(session.research.length, 2);
});

test('the agent saves production choices and shares one new render budget across audio tools', async () => {
  const session = newSession();
  let step = 0;
  let productions = 0;
  let voices = 0;
  const model = new MockLanguageModelV4({ doStream: async () => {
    step++;
    if (step === 1) return call('save_script', { ...draft, production: { music: 'Quiet electronic pulse.', soundEffects: 'One gentle opening chime.' } }, 'save-production');
    if (step === 2) return call('create_production', { version: 1 }, 'production');
    if (step === 3) return call('create_voiceover', { version: 1 }, 'extra-voice');
    return say('The produced mix is ready.');
  } });
  await runTurn(session, { text: 'Produce a pitch with music and effects.' }, undefined, undefined, {
    model,
    produce: async script => { productions++; return { ...script, id: 'produced', kind: 'production', format: 'mp3', url: '/production.mp3', bytes: 100, createdAt: '', model: 'stepaudio-3-gen-preview' }; },
    synthesize: async () => { voices++; throw new Error('Must not create a second new render.'); },
  });
  assert.equal(productions, 1);
  assert.equal(voices, 0);
  assert.equal(session.takes.length, 1);
  assert.equal(session.takes[0].production?.music, 'Quiet electronic pulse.');
  assert.equal(session.scripts[0].check?.wordCount, 6);
});

test('an existing voiceover is not mistaken for a produced mix, and produced mixes are reused', async () => {
  const session = newSession();
  session.scripts.push({ ...draft, language: 'en', voice: 'lively-girl', version: 1 });
  session.takes.push({ ...session.scripts[0], id: 'voice', url: '/voice.wav', bytes: 100, createdAt: '', model: 'stepaudio-3-tts' });
  let step = 0;
  let productions = 0;
  const model = new MockLanguageModelV4({ doStream: async () => ++step <= 2 ? call('create_production', { version: 1 }, `produce-${step}`) : say('Your mix is ready.') });
  await runTurn(session, { text: 'Produce this saved pitch.' }, undefined, undefined, {
    model, produce: async script => { productions++; return { ...script, id: 'mix', kind: 'production', format: 'mp3', url: '/mix.mp3', bytes: 100, createdAt: '', model: 'stepaudio-3-gen-preview' }; },
  });
  assert.equal(productions, 1);
  assert.equal(session.takes.length, 2);
});
