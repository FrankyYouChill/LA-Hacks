import { setTimeout as delay } from 'node:timers/promises';
import { settings, UserError } from './config.js';
import { decodePcm16, type PcmAudio } from './mix.js';
import type { Script, AudioTake } from './state.js';

const styles = {
  'warm-acoustic': 'Warm felt-piano chords and softly plucked acoustic guitar. A simple consonant major-key progression, rounded tone and gentle pulse; no drums or solo melody.',
  'light-electronic': 'Warm electric-piano chords, soft rounded synth pads and a restrained muted pulse. Simple consonant harmony, no bright arpeggios, lead synth or heavy drums.',
  'cinematic-soft': 'Intimate piano and soft sustained strings. Gentle consonant harmony and restrained hopeful motion; no epic hits, risers, dramatic swells or percussion.',
} as const;
export type ScorePlan = NonNullable<AudioTake['score']>;

// Step 5 chooses the story/style; measured TTS pacing supplies a loose musical pulse.
// This is an accompaniment brief, not beat alignment or audio-conditioned generation.
export function planScore(script: Script, voiceSeconds: number): ScorePlan {
  const style = script.production?.musicStyle ?? 'warm-acoustic';
  const words = script.language === 'en' ? script.text.trim().split(/\s+/).length : (script.text.match(/[\p{L}\p{N}]/gu) ?? []).length;
  const wpm = Math.round(words * 60 / voiceSeconds);
  const tempoBpm = script.language === 'en' ? Math.round(Math.max(76, Math.min(104, wpm * 0.6)) / 2) * 2 : 88;
  return {
    style, rationale: script.production?.musicReason ?? `A restrained, warm accompaniment keeps the explanation of ${script.title} in focus.`,
    tempoBpm, targetSeconds: Math.ceil(voiceSeconds + 1.6), narrationWordsPerMinute: wpm,
    direction: `${styles[style]} ${script.production?.music ?? ''}`.trim(),
  };
}

export function instrumentalRequest(description: string, score?: ScorePlan, context?: { title: string; direction: string }) {
  const timing = score ? `About ${score.targetSeconds} seconds at approximately ${score.tempoBpm} BPM, relaxed half-time feel. ` : '';
  const cue = `${timing}${description} Sparse, smooth, harmonious instrumental underscore. One stable repeating chord pattern; no intro, outro, drops or abrupt changes. Leave space for a spoken voice.`;
  const story = context && score ? ` Context only, never spoken: ${context.title.slice(0, 80)}. Voice: ${context.direction.slice(0, 80)}. Purpose: ${score.rationale.slice(0, 120)}.` : '';
  return {
    model: settings.musicModel, task: 'text_to_audio',
    scripts: [{ text: `[${cue.slice(0, 990).replace(/[\[\]]/g, '')}]` }],
    instruction: `Generate music only, supporting narration recorded separately. No voices, speech, singing, humming or sound effects. Do not read any text. Start with music immediately; keep an even, quiet arrangement.${story}`.slice(0, 500),
    response_format: 'pcm', sample_rate: 24000, stream_format: 'audio', return_url: false,
  };
}

export async function generateInstrumental(description: string, signal: AbortSignal, fetcher: typeof fetch = fetch, checkpoint?: (taskId: string) => Promise<void>, score?: ScorePlan, context?: { title: string; direction: string }): Promise<{ bytes: Buffer; audio: PcmAudio }> {
  const request = instrumentalRequest(description, score, context);
  if (settings.musicModel === 'stepaudio-3-music-preview') {
    const bytes = await generateMusic(`${request.scripts[0].text} ${request.instruction}`, signal, fetcher, checkpoint);
    return { bytes, audio: decodePcm16(bytes, 48000, 2) };
  }
  const response = await fetcher(`${settings.baseURL}/audio/generate`, {
    method: 'POST', headers: { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(request), signal,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new UserError(`StepAudio Gen returned HTTP ${response.status} for the music track. No finished mix was saved.`);
  }
  if (response.headers.get('content-type')?.includes('json')) {
    await response.body?.cancel();
    throw new UserError('StepAudio returned JSON instead of a PCM music track. No finished mix was saved.');
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return { bytes, audio: decodePcm16(bytes, 24000, 1) };
}

export function musicRequest(description: string) {
  return { model_id: 'stepaudio-3-music-preview', task: 'text_to_music', instrumental: true, caption: `${description} Instrumental background music only, no speech or vocals.`, response_format: 'pcm', sample_rate: 48000 };
}

export async function generateMusic(description: string, signal: AbortSignal, fetcher: typeof fetch = fetch, checkpoint: (taskId: string) => Promise<void> = async () => {}, pollMs = 5000): Promise<Buffer> {
  const request = async (path: string, body: unknown) => {
    signal.throwIfAborted();
    const response = await fetcher(`${settings.baseURL}/audio/music/${path}`, {
      method: 'POST', headers: { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new UserError(`StepAudio Music returned HTTP ${response.status}. Check music model access, credits, or task limits. No finished mix was saved.`);
    }
    return response.json();
  };
  const submitted = await request('submit', musicRequest(description));
  if (typeof submitted.task_id !== 'string' || !submitted.task_id) throw new UserError('Music generation did not return a task ID. No finished mix was saved.');
  await checkpoint(submitted.task_id);
  while (true) {
    // Polling an existing task does not create another generation.
    await delay(pollMs, undefined, { signal });
    const result = await request('query', { task_id: submitted.task_id });
    if (result.status === 'FAILED') throw new UserError('The instrumental generation task failed. No finished mix was saved. The draft and local task ID remain available.');
    if (result.status === 'PENDING' || result.status === 'RUNNING') continue;
    if (result.status !== 'SUCCESS' || typeof result.audio !== 'string' || !result.audio.length || result.audio.length > 80_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(result.audio)) throw new UserError('Music generation returned an invalid audio result. No finished mix was saved.');
    if (result.response_format && result.response_format !== 'pcm') throw new UserError('Music generation returned an unexpected format. No finished mix was saved.');
    return Buffer.from(result.audio, 'base64');
  }
}
