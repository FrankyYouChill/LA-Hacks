import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMusic, generateInstrumental, planScore, instrumentalRequest } from '../src/music.js';
import { settings } from '../src/config.js';

test('scoring uses story, vocal delivery and measured pace within Gen input limits', () => {
  const script = { version: 1, title: 'A welcoming campus guide', text: 'One image helps arriving students understand the event and feel welcome.', language: 'en' as const, voice: 'soft-spoken-gentleman' as const, speed: 1, direction: 'Warm and unhurried.', production: { music: 'Soft piano for a welcoming introduction.', musicStyle: 'warm-acoustic' as const, musicReason: 'Warm, simple harmony supports a friendly welcome for arriving students.', soundEffects: 'none' } };
  const slower = planScore(script, 8); const faster = planScore(script, 4);
  assert.ok(faster.tempoBpm > slower.tempoBpm);
  assert.equal(slower.targetSeconds, 10); assert.match(slower.direction, /felt-piano/);
  const request = instrumentalRequest(slower.direction, slower, script);
  assert.match(request.instruction, /welcoming campus/); assert.match(request.instruction, /unhurried/);
  assert.match(request.scripts[0].text, /76 BPM/);
  assert.ok(request.instruction.length <= 500 && request.scripts[0].text.length <= 1000);
  assert.doesNotMatch(request.scripts[0].text, /One image helps/); assert.match(request.instruction, /No voices/);
  const oversized = instrumentalRequest('Piano '.repeat(500), slower, { title: 'x'.repeat(1000), direction: 'y'.repeat(1000) });
  assert.ok(oversized.instruction.length <= 500 && oversized.scripts[0].text.length <= 1000);
});

test('instrumental task submits once and polls the same ID until completion', async () => {
  const bodies: { url: string; body: Record<string, unknown> }[] = [];
  let query = 0;
  const bytes = Buffer.alloc(48000 * 4);
  const result = await generateMusic('Upbeat electronic music.', AbortSignal.timeout(1000), async (url, init) => {
    const body = JSON.parse(String(init?.body)); bodies.push({ url: String(url), body });
    if (String(url).endsWith('/submit')) return Response.json({ task_id: 'one-task' });
    query++;
    return Response.json(query === 1 ? { status: 'PENDING' } : query === 2 ? { status: 'RUNNING' } : { status: 'SUCCESS', response_format: 'pcm', audio: bytes.toString('base64') });
  }, async id => { assert.equal(id, 'one-task'); }, 0);
  assert.deepEqual(result, bytes);
  assert.equal(bodies.filter(item => item.url.endsWith('/submit')).length, 1);
  assert.equal(bodies[0].body.model_id, 'stepaudio-3-music-preview');
  assert.equal(bodies[0].body.instrumental, true); assert.equal(bodies[0].body.lyrics, undefined);
  assert.ok(bodies.slice(1).every(item => item.body.task_id === 'one-task'));
});

test('a JSON success body cannot be decoded as a raw PCM instrumental', async () => {
  const previous = settings.musicModel; settings.musicModel = 'stepaudio-3-gen-preview';
  try {
    await assert.rejects(generateInstrumental('A music bed', AbortSignal.timeout(1000), async () => Response.json({ error: 'secret-provider-body' })), /JSON instead of a PCM music track/);
  } finally { settings.musicModel = previous; }
});

test('aborted and malformed music tasks do not become successful audio', async () => {
  await assert.rejects(generateMusic('Music', AbortSignal.abort(), async () => { throw new Error('Must not fetch'); }), /abort/i);
  let n = 0;
  await assert.rejects(generateMusic('Music', AbortSignal.timeout(1000), async () => Response.json(++n === 1 ? { task_id: 'task' } : { status: 'SUCCESS', audio: 'not base64!' }), undefined, 0), /invalid audio/);
});
