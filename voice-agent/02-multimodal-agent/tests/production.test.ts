import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { produceAudio } from '../src/audio.js';
import { decodeWav, encodeWav } from '../src/mix.js';
import { settings } from '../src/config.js';
import type { Script } from '../src/state.js';

const script: Script = { version: 1, title: 'A clear project pitch', text: 'Meet our workshop prototype.', language: 'en', voice: 'soft-spoken-gentleman', direction: 'Warm and clear.', speed: 1 };
function tone(hz: number, rate: number, channels: 1 | 2, seconds = 2) {
  const values = new Float32Array(rate * channels * seconds);
  for (let i = 0; i < values.length; i++) values[i] = 0.2 * Math.sin(2 * Math.PI * hz * Math.floor(i / channels) / rate);
  return encodeWav(values, rate, channels);
}
const voice = tone(440, 24000, 1);
const music = tone(880, 48000, 2).subarray(44);
const effects = tone(1760, 24000, 1, 1).subarray(44);

test('separate voice, instrumental and effect generations become an overlaid WAV with inspectable stems', async () => {
  const original = { apiKey: settings.apiKey, outputDir: settings.outputDir, musicModel: settings.musicModel };
  settings.musicModel = 'stepaudio-3-music-preview';
  settings.apiKey = 'test-key'; settings.outputDir = await mkdtemp(join(tmpdir(), 'mix-production-'));
  const calls: string[] = [];
  try {
    const take = await produceAudio({ ...script, production: { music: 'Gentle piano.', soundEffects: 'One soft opening chime.' } }, 'test-session', undefined, async (url, init) => {
      const path = String(url).replace(settings.baseURL, ''); calls.push(path);
      const body = JSON.parse(String(init?.body));
      if (path === '/audio/speech') { assert.equal(body.input, script.text); assert.equal(body.model, settings.audioModel); return new Response(new Uint8Array(voice)); }
      if (path === '/audio/music/submit') {
        assert.equal(body.model_id, settings.musicModel); assert.equal(body.instrumental, true); assert.equal(body.lyrics, undefined);
        assert.equal(body.response_format, 'pcm'); return Response.json({ task_id: 'music-task' });
      }
      if (path === '/audio/music/query') { assert.equal(body.task_id, 'music-task'); return Response.json({ status: 'SUCCESS', response_format: 'pcm', audio: music.toString('base64') }); }
      assert.equal(path, '/audio/generate'); assert.equal(body.model, settings.productionModel);
      assert.equal(body.roles, undefined); assert.ok(body.scripts.every((line: { speaker?: string }) => !line.speaker));
      assert.doesNotMatch(JSON.stringify(body.scripts), /workshop prototype/);
      return new Response(new Uint8Array(effects));
    });
    assert.deepEqual(calls, ['/audio/speech', '/audio/music/submit', '/audio/music/query', '/audio/generate']);
    assert.equal(take.model, 'local-pcm-mixer'); assert.equal(take.format, 'wav'); assert.equal(take.kind, 'production');
    assert.ok(take.mix!.musicRmsDuringVoice > 0.01); assert.equal(take.mix!.voiceStartSeconds, 0.6);
    assert.equal(take.mix!.durationSeconds, 3.6); assert.deepEqual(take.stems?.map(s => s.kind), ['voice', 'music', 'effects']);
    const mixed = decodeWav(await readFile(join(settings.outputDir, 'test-session', `${take.id}.wav`)));
    const stems = await Promise.all(take.stems!.map(async s => decodeWav(await readFile(join(settings.outputDir, 'test-session', `${take.id}-${s.kind}.wav`)))));
    // The downloaded mix must contain the simultaneous sum, not concatenated tracks.
    for (let i = 0; i < mixed.samples.length; i += 71) assert.ok(Math.abs(mixed.samples[i] - stems.reduce((n, s) => n + s.samples[i], 0)) < 0.0001);
  } finally { Object.assign(settings, original); }
});

test('invalid or failed TTS is rejected before starting a music generation', async () => {
  const original = { apiKey: settings.apiKey, outputDir: settings.outputDir };
  settings.apiKey = 'test-key'; settings.outputDir = await mkdtemp(join(tmpdir(), 'mix-failure-'));
  try {
    await assert.rejects(produceAudio(script, 'failed', undefined, async () => new Response('secret-body', { status: 403 })), error => {
      assert.ok(error instanceof Error); assert.match(error.message, /HTTP 403/); assert.doesNotMatch(error.message, /secret-body|test-key/); return true;
    });
    let calls = 0;
    await assert.rejects(produceAudio(script, 'invalid', undefined, async () => { calls++; return Response.json({ error: 'not audio' }); }), /valid WAV/);
    assert.equal(calls, 1); assert.deepEqual(await readdir(settings.outputDir), []);
  } finally { Object.assign(settings, original); }
});

test('a failed music task preserves intermediates without a completed mix or a speech-only fallback', async () => {
  const original = { apiKey: settings.apiKey, outputDir: settings.outputDir, musicModel: settings.musicModel };
  settings.musicModel = 'stepaudio-3-music-preview';
  settings.apiKey = 'test-key'; settings.outputDir = await mkdtemp(join(tmpdir(), 'music-failed-'));
  try {
    const calls: string[] = [];
    await assert.rejects(produceAudio(script, 'failed-music', undefined, async url => {
      const path = String(url); calls.push(path);
      if (path.endsWith('/speech')) return new Response(new Uint8Array(voice));
      if (path.endsWith('/submit')) return Response.json({ task_id: 'failed-task' });
      return Response.json({ status: 'FAILED', error: { message: 'secret-provider-error' } });
    }), /instrumental generation task failed/);
    assert.equal(calls.length, 3);
    const files = await readdir(join(settings.outputDir, 'failed-music'));
    assert.ok(files.some(name => name.endsWith('-voice-source.wav')));
    assert.ok(files.some(name => name.endsWith('-music-task.json')));
    assert.ok(!files.some(name => /^[a-f0-9-]{36}\.(wav|json)$/.test(name)));
  } finally { Object.assign(settings, original); }
});

test('default production uses TTS and a separate music-only Gen request, then mixes locally', async () => {
  const original = { apiKey: settings.apiKey, outputDir: settings.outputDir, musicModel: settings.musicModel };
  settings.apiKey = 'test-key'; settings.musicModel = 'stepaudio-3-gen-preview'; settings.outputDir = await mkdtemp(join(tmpdir(), 'gen-bed-'));
  try {
    const calls: string[] = [];
    const take = await produceAudio({ ...script, production: { music: 'An upbeat synth instrumental.', soundEffects: 'none' } }, 'gen-mix', undefined, async (url, init) => {
      calls.push(String(url));
      if (String(url).endsWith('/speech')) return new Response(new Uint8Array(voice));
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, 'stepaudio-3-gen-preview'); assert.equal(body.roles, undefined); assert.equal(body.response_format, 'pcm');
      assert.match(body.instruction, /A clear project pitch/); assert.match(body.scripts[0].text, /BPM/);
      assert.ok(body.scripts.every((line: { speaker?: string; text: string }) => !line.speaker && /^\[.*\]$/.test(line.text)));
      assert.doesNotMatch(JSON.stringify(body.scripts), /workshop prototype/);
      return new Response(new Uint8Array(effects));
    });
    assert.equal(calls.length, 2); assert.equal(take.format, 'wav');
    assert.ok(take.score?.targetSeconds); assert.equal(take.mix?.method, 'pcm-overlay-v2');
    const brief = JSON.parse(await readFile(join(settings.outputDir, 'gen-mix', `${take.id}-music-brief.json`), 'utf8'));
    assert.deepEqual(brief.score, take.score);
    assert.ok(take.mix!.musicRmsDuringVoice > 0); assert.deepEqual(take.stems?.map(s => s.model), ['stepaudio-3-tts', 'stepaudio-3-gen-preview']);
  } finally { Object.assign(settings, original); }
});

test('fallback production is restrained and makes no unrequested effect call', async () => {
  const original = { apiKey: settings.apiKey, outputDir: settings.outputDir, musicModel: settings.musicModel };
  settings.apiKey = 'test-key'; settings.musicModel = 'stepaudio-3-gen-preview'; settings.outputDir = await mkdtemp(join(tmpdir(), 'music-default-'));
  try {
    let calls = 0;
    const take = await produceAudio(script, 'default', undefined, async url => {
      calls++; return new Response(new Uint8Array(String(url).endsWith('/speech') ? voice : effects));
    });
    assert.equal(calls, 2); assert.equal(take.production?.soundEffects, 'none');
    assert.equal(take.score?.style, 'warm-acoustic'); assert.equal(take.production?.musicLevel, 'balanced');
  } finally { Object.assign(settings, original); }
});

test('explicitly omitted accompaniment does not make music or effect API calls', async () => {
  const original = { apiKey: settings.apiKey, outputDir: settings.outputDir };
  settings.apiKey = 'test-key'; settings.outputDir = await mkdtemp(join(tmpdir(), 'no-music-'));
  try {
    let calls = 0;
    const take = await produceAudio({ ...script, production: { music: 'none', soundEffects: 'none' } }, 'voice-only', undefined, async url => {
      calls++; assert.match(String(url), /\/audio\/speech$/); return new Response(new Uint8Array(voice));
    });
    assert.equal(calls, 1); assert.equal(take.stems?.length, 1); assert.equal(take.mix?.musicRmsDuringVoice, 0);
  } finally { Object.assign(settings, original); }
});
