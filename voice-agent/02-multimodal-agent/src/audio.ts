import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { settings, UserError, requireKey } from './config.js';
import { productionSchema, type AudioTake, type Script } from './state.js';
import { decodePcm16, decodeWav, mixTracks } from './mix.js';
import { generateInstrumental, instrumentalRequest, planScore } from './music.js';

export const defaultProduction = {
  music: 'Gentle, warm piano chords and softly plucked guitar supporting a clear, friendly explanation.',
  musicStyle: 'warm-acoustic' as const,
  soundEffects: 'none',
  musicLevel: 'balanced' as const,
};

export function effectRequest(description: string) {
  return {
    model: settings.productionModel, task: 'text_to_audio',
    scripts: [{ text: `[${description}]` }],
    instruction: 'Generate only a short isolated opening sound effect, about one second. No speech, narration, singing or background music. Do not read the cue.',
    response_format: 'pcm', sample_rate: 24000, stream_format: 'audio', return_url: false,
  };
}

async function speechBytes(script: Script, signal: AbortSignal, fetcher: typeof fetch) {
  const response = await fetcher(`${settings.baseURL}/audio/speech`, {
    method: 'POST', headers: { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: settings.audioModel, input: script.text, voice: script.voice, language: script.language, instruction: script.direction, speed: script.speed, response_format: 'wav', sample_rate: 24000 }),
    signal,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new UserError(`StepAudio TTS returned HTTP ${response.status}. Check voice model access, credits, and voice settings. No finished audio was saved.`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  decodeWav(bytes);
  return bytes;
}

// One render can make two model generations (TTS + instrumental), plus an optional Gen SFX call.
// Alignment and summation happen in code; models never decide when tracks overlap.
export async function produceAudio(script: Script, sessionId: string, signal?: AbortSignal, fetcher: typeof fetch = fetch, progress: (message: string, stage?: 'voice' | 'music' | 'effects' | 'mix') => void = () => {}): Promise<AudioTake> {
  requireKey();
  const production = productionSchema.parse(script.production ?? defaultProduction);
  const abort = AbortSignal.any([AbortSignal.timeout(540_000), ...(signal ? [signal] : [])]);
  progress('Generating the narration track…', 'voice');
  const voiceBytes = await speechBytes(script, abort, fetcher);
  const voice = decodeWav(voiceBytes);
  const score = production.music.toLowerCase() === 'none' ? undefined : planScore({ ...script, production }, voice.samples.length / voice.channels / voice.sampleRate);
  const id = randomUUID();
  const directory = resolve(settings.outputDir, sessionId);
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, `${id}-voice-source.wav`), voiceBytes);
  let music;
  let effects;
  if (production.music.toLowerCase() !== 'none') {
    await writeFile(resolve(directory, `${id}-music-brief.json`), JSON.stringify({ score, context: { title: script.title, direction: script.direction }, request: instrumentalRequest(score!.direction, score, script) }, null, 2));
    progress(settings.musicModel === 'stepaudio-3-music-preview' ? 'Generating instrumental music… This may take a few minutes.' : 'Scoring the voice: generating matching instrumental music…', 'music');
    const result = await generateInstrumental(score!.direction, AbortSignal.any([abort, AbortSignal.timeout(settings.musicModel === 'stepaudio-3-music-preview' ? 360_000 : 120_000)]), fetcher, async taskId => {
      await writeFile(resolve(directory, `${id}-music-task.json`), JSON.stringify({ taskId, model: settings.musicModel, createdAt: new Date().toISOString() }, null, 2));
    }, score, script);
    await writeFile(resolve(directory, `${id}-music-source.pcm`), result.bytes);
    music = result.audio;
  }
  if (production.soundEffects.toLowerCase() !== 'none') {
    progress('Generating a separate opening sound effect…', 'effects');
    const response = await fetcher(`${settings.baseURL}/audio/generate`, {
      method: 'POST', headers: { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(effectRequest(production.soundEffects)), signal: abort,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new UserError(`StepAudio Gen returned HTTP ${response.status} for the effect track. No finished mix was saved.`);
    }
    if (response.headers.get('content-type')?.includes('json')) {
      await response.body?.cancel();
      throw new UserError('StepAudio returned JSON instead of a PCM effect track. No finished mix was saved.');
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(resolve(directory, `${id}-effects-source.pcm`), bytes);
    effects = decodePcm16(bytes, 24000, 1);
  }
  abort.throwIfAborted();
  progress('Mixing simultaneous tracks, setting levels and fades…', 'mix');
  const mixed = mixTracks(voice, music, effects, production.musicLevel ?? 'balanced');
  const stems: NonNullable<AudioTake['stems']> = [];
  for (const [kind, bytes] of Object.entries(mixed.stems)) {
    await writeFile(resolve(directory, `${id}-${kind}.wav`), bytes);
    stems.push({ kind: kind as 'voice' | 'music' | 'effects', url: `/audio/${sessionId}/${id}-${kind}.wav`, model: kind === 'voice' ? settings.audioModel : kind === 'music' ? settings.musicModel : settings.productionModel });
  }
  await writeFile(resolve(directory, `${id}.wav`), mixed.audio);
  const take: AudioTake = {
    ...script, production, ...(score ? { score } : {}), id, kind: 'production', format: 'wav', model: 'local-pcm-mixer',
    url: `/audio/${sessionId}/${id}.wav`, bytes: mixed.audio.length, createdAt: new Date().toISOString(), stems, mix: mixed.info,
  };
  await writeFile(resolve(directory, `${id}.json`), JSON.stringify(take, null, 2));
  return take;
}

export async function synthesizeSpeech(script: Script, sessionId: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<AudioTake> {
  requireKey();
  const bytes = await speechBytes(script, AbortSignal.any([AbortSignal.timeout(120_000), ...(signal ? [signal] : [])]), fetcher);
  const id = randomUUID();
  const directory = resolve(settings.outputDir, sessionId);
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, `${id}.wav`), bytes);
  const take: AudioTake = { ...script, id, kind: 'voiceover', format: 'wav', url: `/audio/${sessionId}/${id}.wav`, bytes: bytes.length, createdAt: new Date().toISOString(), model: settings.audioModel };
  await writeFile(resolve(directory, `${id}.json`), JSON.stringify(take, null, 2));
  return take;
}
