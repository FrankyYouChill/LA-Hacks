import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
// Use this stage's .env, or share voice-agent/.env in the workshop root.
loadEnv({ path: resolve(ROOT, '.env'), quiet: true });
loadEnv({ path: resolve(ROOT, '../.env'), quiet: true });

export const settings = {
  apiKey: process.env.STEP_API_KEY?.trim() ?? '',
  baseURL: (process.env.STEP_BASE_URL ?? 'https://api.stepfun.ai/v1').replace(/\/$/, ''),
  model: process.env.STEP_MODEL ?? 'step-5-preview',
  audioModel: process.env.STEP_AUDIO_MODEL ?? 'stepaudio-3-tts',
  musicModel: process.env.STEP_AUDIO_MUSIC_MODEL ?? 'stepaudio-3-gen-preview',
  productionModel: process.env.STEP_AUDIO_GEN_MODEL ?? 'stepaudio-3-gen-preview',
  tavilyApiKey: process.env.TAVILY_API_KEY?.trim() ?? '',
  outputDir: resolve(ROOT, 'outputs'),
  port: Number(process.env.PORT ?? 3210),
};

export class UserError extends Error {}

export function searchConfigured() {
  return Boolean(settings.tavilyApiKey && settings.tavilyApiKey !== 'YOUR_TAVILY_API_KEY');
}

export function runtimeInfo() {
  return {
    provider: 'StepFun', model: settings.model, audioModel: settings.audioModel, musicModel: settings.musicModel, productionModel: settings.productionModel, mixer: 'Node.js PCM overlay',
    sdk: 'Vercel AI SDK', runtime: 'Node.js',
    search: { provider: 'Tavily', configured: searchConfigured() },
  };
}

export function requireKey() {
  if (!settings.apiKey || settings.apiKey === 'YOUR_STEPFUN_API_KEY') {
    throw new UserError('Set STEP_API_KEY in this stage’s .env or the workshop root (voice-agent/.env), then restart.');
  }
}

// Never send raw provider errors or request objects (which can contain credentials) to the UI.
export function publicError(error: unknown): string {
  if (error instanceof UserError) return error.message;
  if (error instanceof Error && /abort|timeout/i.test(error.name)) {
    return 'Request stopped or timed out. Your saved scripts and completed audio are still available.';
  }
  const status = (error as { statusCode?: number })?.statusCode;
  if (status === 200) return 'The StepFun response stream was interrupted. Your saved scripts and completed audio are still available.';
  if (status) return `StepFun API returned HTTP ${status}. Check model access, API key, credits, and request limits.`;
  return 'The request failed. Check your connection and model access, then try again.';
}
