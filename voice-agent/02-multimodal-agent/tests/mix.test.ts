import test from 'node:test';
import assert from 'node:assert/strict';
import { decodePcm16, decodeWav, encodeWav, mixTracks, type PcmAudio } from '../src/mix.js';

function tone(hz: number, sampleRate: number, seconds: number, channels: 1 | 2 = 1): PcmAudio {
  const samples = new Float32Array(sampleRate * channels * seconds);
  for (let i = 0; i < samples.length; i++) samples[i] = 0.2 * Math.sin(2 * Math.PI * hz * Math.floor(i / channels) / sampleRate);
  return { samples, sampleRate, channels };
}
function magnitude(audio: PcmAudio, hz: number, from: number, seconds: number) {
  let real = 0; let imaginary = 0;
  const frames = Math.round(seconds * audio.sampleRate);
  for (let f = 0; f < frames; f++) {
    const sample = audio.samples[(Math.round(from * audio.sampleRate) + f) * audio.channels];
    real += sample * Math.cos(2 * Math.PI * hz * f / audio.sampleRate); imaginary += sample * Math.sin(2 * Math.PI * hz * f / audio.sampleRate);
  }
  return 2 * Math.hypot(real, imaginary) / frames;
}

test('both source frequencies are present simultaneously during narration after resampling', () => {
  const result = mixTracks(tone(440, 24000, 2), tone(880, 48000, 4, 2));
  const mixed = decodeWav(result.audio);
  assert.ok(magnitude(mixed, 440, 0.8, 1) > 0.1);
  assert.ok(magnitude(mixed, 880, 0.8, 1) > 0.02);
  assert.ok(magnitude(mixed, 440, 0.2, 0.2) < 0.001);
  assert.ok(magnitude(mixed, 880, 0.2, 0.2) > 0.02);
  assert.equal(result.info.durationSeconds, 3.6);
  assert.ok(mixed.samples.every(n => Number.isFinite(n) && Math.abs(n) <= 0.951));
  assert.equal(mixed.samples[0], 0);
  assert.ok(Math.abs(mixed.samples.at(-1)!) < 0.001);
});

test('quieter music settings change music level without changing narration or duration', () => {
  const v = tone(440, 24000, 2); const m = tone(880, 48000, 4, 2);
  const soft = mixTracks(v, m, undefined, 'soft'); const present = mixTracks(v, m, undefined, 'present');
  assert.ok(present.info.musicRmsDuringVoice > soft.info.musicRmsDuringVoice * 2.5);
  assert.equal(soft.info.voiceRms, present.info.voiceRms);
  assert.equal(soft.info.durationSeconds, present.info.durationSeconds);
});

test('short music loops under narration, silent music fails rather than becoming a finished mix', () => {
  const result = mixTracks(tone(440, 24000, 3), tone(880, 48000, 0.5, 2));
  assert.ok(magnitude(decodeWav(result.audio), 880, 2, 0.5) > 0.01);
  assert.throws(() => mixTracks(tone(440, 24000, 1), { samples: new Float32Array(48000), channels: 1, sampleRate: 48000 }), /silent/);
});

test('speech ducking lowers music during words and recovers smoothly in a pause', () => {
  const voice = tone(440, 24000, 4);
  voice.samples.fill(0, 24000, 48000);
  const result = mixTracks(voice, tone(880, 24000, 7));
  const bed = decodeWav(result.stems.music!);
  const underWords = magnitude(bed, 880, 0.9, 0.3);
  const inPause = magnitude(bed, 880, 2.2, 0.3);
  assert.ok(inPause > underWords * 1.2);
  assert.equal(result.info.speechDucking, true); assert.equal(result.info.musicLooped, false);
});

test('short cues trim a silent tail and crossfade without recurring silent gaps', () => {
  const music = tone(220, 24000, 3);
  music.samples.fill(0, Math.round(2.5 * 24000));
  const result = mixTracks(tone(440, 24000, 8), music);
  assert.equal(result.info.musicLooped, true); assert.ok(result.info.musicCrossfadeSeconds > 0.4);
  const bed = decodeWav(result.stems.music!);
  for (let t = 1; t < 8; t += 0.1) assert.ok(magnitude(bed, 220, t, 0.1) > 0.005);
});

test('PCM and WAV round-trip and malformed formats fail cleanly', () => {
  const input = tone(440, 24000, 1); const wav = encodeWav(input.samples, input.sampleRate, 1);
  const output = decodeWav(wav);
  assert.equal(output.sampleRate, 24000); assert.equal(output.channels, 1); assert.equal(output.samples.length, input.samples.length);
  assert.ok(Math.abs(output.samples[100] - input.samples[100]) < 0.0001);
  assert.throws(() => decodePcm16(Buffer.alloc(3), 48000, 2), /invalid/);
  assert.throws(() => decodeWav(Buffer.from('not WAV')), /valid WAV/);
});
