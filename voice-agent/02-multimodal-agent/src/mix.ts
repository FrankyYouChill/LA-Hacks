import { UserError } from './config.js';

export type PcmAudio = { samples: Float32Array; sampleRate: number; channels: 1 | 2 };
export const MIX_RATE = 24000;

// Music's documented raw output is 48 kHz / 16-bit / stereo. Gen SFX uses 24 kHz mono.
export function decodePcm16(bytes: Buffer, sampleRate: number, channels: 1 | 2): PcmAudio {
  if (!bytes.length || bytes.length % (2 * channels) || bytes.length > 60_000_000) throw new UserError('The audio track has invalid or oversized PCM data.');
  const samples = new Float32Array(bytes.length / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = bytes.readInt16LE(i * 2) / 32768;
  return { samples, sampleRate, channels };
}

export function decodeWav(bytes: Buffer): PcmAudio {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') throw new UserError('StepAudio did not return a valid WAV track.');
  let format: { codec: number; channels: number; sampleRate: number; bits: number } | undefined;
  let data: Buffer | undefined;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const tag = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (tag === 'fmt ' && size >= 16 && start + 16 <= bytes.length) format = { codec: bytes.readUInt16LE(start), channels: bytes.readUInt16LE(start + 2), sampleRate: bytes.readUInt32LE(start + 4), bits: bytes.readUInt16LE(start + 14) };
    if (tag === 'data') { data = bytes.subarray(start, Math.min(start + size, bytes.length)); break; }
    offset = start + size + (size % 2);
  }
  if (!format || !data || format.codec !== 1 || format.bits !== 16 || ![1, 2].includes(format.channels) || format.sampleRate < 8000 || format.sampleRate > 96000) throw new UserError('The mixer requires a 16-bit PCM WAV voice track.');
  return decodePcm16(data, format.sampleRate, format.channels as 1 | 2);
}

export function encodeWav(samples: Float32Array, sampleRate = MIX_RATE, channels: 1 | 2 = 2): Buffer {
  const bytes = Buffer.alloc(44 + samples.length * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVE', 8);
  bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(channels, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * channels * 2, 28); bytes.writeUInt16LE(channels * 2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return bytes;
}

function rms(samples: Float32Array, start = 0, end = samples.length) {
  let sum = 0;
  for (let i = start; i < end; i++) sum += samples[i] ** 2;
  return Math.sqrt(sum / Math.max(1, end - start));
}

function peak(samples: Float32Array) {
  let max = 0;
  for (const value of samples) max = Math.max(max, Math.abs(value));
  return max;
}

function stereoAt(track: PcmAudio, frame: number, channel: number) {
  const frames = track.samples.length / track.channels;
  const left = Math.max(0, Math.min(frames - 1, Math.floor(frame)));
  const right = Math.min(frames - 1, left + 1);
  const c = track.channels === 1 ? 0 : channel;
  const alpha = frame - Math.floor(frame);
  return track.samples[left * track.channels + c] * (1 - alpha) + track.samples[right * track.channels + c] * alpha;
}

function firstSound(track: PcmAudio) {
  const block = Math.max(1, Math.round(track.sampleRate * 0.02)) * track.channels;
  for (let i = 0; i < track.samples.length; i += block) {
    if (rms(track.samples, i, Math.min(i + block, track.samples.length)) > 0.003) return Math.max(0, i / track.channels - track.sampleRate * 0.04);
  }
  throw new UserError('The generated accompaniment is silent. No finished mix was saved.');
}

// Remove silent tails before looping. A long generated bed is played once.
function lastSound(track: PcmAudio) {
  const block = Math.max(1, Math.round(track.sampleRate * 0.02)) * track.channels;
  for (let end = track.samples.length; end > 0; end -= block) {
    if (rms(track.samples, Math.max(0, end - block), end) > 0.003) return Math.min(track.samples.length / track.channels, end / track.channels + track.sampleRate * 0.04);
  }
  return 0;
}

function softenMusic(samples: Float32Array) {
  // Gentle 70 Hz high-pass / 4.5 kHz low-pass: less rumble and bright competition.
  const high = Math.exp(-2 * Math.PI * 70 / MIX_RATE);
  const low = 1 - Math.exp(-2 * Math.PI * 4500 / MIX_RATE);
  for (let c = 0; c < 2; c++) {
    let previous = 0; let hp = 0; let lp = 0;
    for (let i = c; i < samples.length; i += 2) {
      const input = samples[i]; hp = high * (hp + input - previous); previous = input;
      lp += low * (hp - lp); samples[i] = lp;
    }
  }
}

export function mixTracks(voice: PcmAudio, music?: PcmAudio, effects?: PcmAudio, level: 'soft' | 'balanced' | 'present' = 'balanced') {
  const voiceSeconds = voice.samples.length / voice.channels / voice.sampleRate;
  if (voiceSeconds < 0.1 || voiceSeconds > 100 || rms(voice.samples) < 0.001) throw new UserError('The narration is silent or too long for this short-pitch mixer.');
  const leadIn = music ? 0.6 : 0.15;
  const tail = music ? 1 : 0.15;
  const voiceStart = Math.round(leadIn * MIX_RATE);
  const voiceFrames = Math.round(voiceSeconds * MIX_RATE);
  const voiceEnd = voiceStart + voiceFrames;
  const frames = voiceEnd + Math.round(tail * MIX_RATE);
  const voiceStem = new Float32Array(frames * 2);
  const musicStem = new Float32Array(frames * 2);
  const effectStem = new Float32Array(frames * 2);
  const voiceGain = Math.min(0.16 / rms(voice.samples), 0.75 / peak(voice.samples));
  let musicLooped = false; let crossfadeSeconds = 0;
  for (let f = 0; f < voiceFrames; f++) for (let c = 0; c < 2; c++) voiceStem[(voiceStart + f) * 2 + c] = stereoAt(voice, f * voice.sampleRate / MIX_RATE, c) * voiceGain;

  if (music) {
    let offset = firstSound(music);
    let available = lastSound(music) - offset;
    if (available < music.sampleRate * 0.2) throw new UserError('The music track is too short to make a background bed.');
    musicLooped = available / music.sampleRate < frames / MIX_RATE;
    // Avoid repeatedly replaying the attack and final decay of a short cue.
    const trim = musicLooped && available > music.sampleRate * 2 ? music.sampleRate * 0.15 : 0;
    offset += trim; available -= trim * 2;
    const crossfade = musicLooped ? Math.min(music.sampleRate * 0.65, available / 4) : 0;
    crossfadeSeconds = crossfade / music.sampleRate;
    const loopLength = available - crossfade;
    for (let f = 0; f < frames; f++) {
      const elapsed = f * music.sampleRate / MIX_RATE;
      const position = musicLooped ? elapsed % loopLength : elapsed;
      for (let c = 0; c < 2; c++) {
        const outgoing = stereoAt(music, offset + position, c);
        const blend = elapsed >= loopLength && position < crossfade ? position / crossfade : 1;
        musicStem[f * 2 + c] = blend === 1 ? outgoing : stereoAt(music, offset + loopLength + position, c) * (1 - blend) + outgoing * blend;
      }
    }
    softenMusic(musicStem);
    const voiceRms = rms(voiceStem, voiceStart * 2, voiceEnd * 2);
    const musicRms = rms(musicStem, voiceStart * 2, voiceEnd * 2);
    if (musicRms < 0.0001) throw new UserError('The music is silent during narration. No finished mix was saved.');
    // The agent chooses a level; code applies it to simultaneous tracks.
    const ratio = { soft: 10 ** (-22 / 20), balanced: 10 ** (-16 / 20), present: 10 ** (-10 / 20) }[level];
    const gain = Math.min(voiceRms * ratio / musicRms, 0.20 / peak(musicStem));
    const block = Math.round(MIX_RATE * 0.02);
    const speech = Array.from({ length: Math.ceil(frames / block) }, (_, b) => rms(voiceStem, b * block * 2, Math.min((b + 1) * block * 2, voiceStem.length)));
    const speakingBlocks = speech.map((value, i) => Math.max(value, speech[i + 1] ?? 0, speech[i + 2] ?? 0) > Math.max(0.006, voiceRms * 0.2));
    let duck = 1;
    for (let f = 0; f < frames; f++) {
      const t = f / MIX_RATE;
      const fade = Math.sin(Math.min(1, t / 0.4, (frames / MIX_RATE - t) / 0.8) * Math.PI / 2);
      // Look ahead 40 ms; reduce gently through speech, recover slowly in pauses.
      const speaking = speakingBlocks[Math.floor(f / block)];
      const target = speaking ? 0.72 : 1;
      duck += (target - duck) * (1 - Math.exp(-1 / (MIX_RATE * (target < duck ? 0.045 : 0.35))));
      musicStem[f * 2] *= gain * fade * duck; musicStem[f * 2 + 1] *= gain * fade * duck;
    }
  }
  if (effects) {
    const offset = firstSound(effects);
    const effectFrames = Math.min(Math.round(1.5 * MIX_RATE), Math.round((effects.samples.length / effects.channels - offset) * MIX_RATE / effects.sampleRate), frames);
    const gain = Math.min(0.06 / rms(effects.samples), 0.22 / peak(effects.samples));
    for (let f = 0; f < effectFrames; f++) for (let c = 0; c < 2; c++) {
      const fade = Math.min(1, f / (MIX_RATE * 0.02), (effectFrames - f) / (MIX_RATE * 0.12));
      effectStem[f * 2 + c] = stereoAt(effects, offset + f * effects.sampleRate / MIX_RATE, c) * gain * fade;
    }
  }
  const mixed = new Float32Array(frames * 2);
  for (let i = 0; i < mixed.length; i++) mixed[i] = voiceStem[i] + musicStem[i] + effectStem[i];
  const masterGain = Math.min(1, 0.95 / peak(mixed));
  for (let i = 0; i < mixed.length; i++) {
    mixed[i] *= masterGain; voiceStem[i] *= masterGain; musicStem[i] *= masterGain; effectStem[i] *= masterGain;
  }
  return {
    audio: encodeWav(mixed),
    stems: { voice: encodeWav(voiceStem), ...(music ? { music: encodeWav(musicStem) } : {}), ...(effects ? { effects: encodeWav(effectStem) } : {}) },
    info: {
      method: 'pcm-overlay-v2' as const, sampleRate: MIX_RATE, channels: 2,
      durationSeconds: frames / MIX_RATE, voiceStartSeconds: voiceStart / MIX_RATE, voiceEndSeconds: voiceEnd / MIX_RATE,
      voiceRms: rms(voiceStem, voiceStart * 2, voiceEnd * 2), musicRmsDuringVoice: rms(musicStem, voiceStart * 2, voiceEnd * 2), masterGain,
      musicLooped, musicCrossfadeSeconds: crossfadeSeconds, speechDucking: Boolean(music),
    },
  };
}
