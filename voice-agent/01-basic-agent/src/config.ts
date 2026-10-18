import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
// Use this stage's .env, or share voice-agent/.env in the workshop root.
loadEnv({ path: resolve(ROOT, '.env'), quiet: true });
loadEnv({ path: resolve(ROOT, '../.env'), quiet: true });

export const settings = {
  apiKey: process.env.STEP_API_KEY?.trim() ?? '',
  baseURL: process.env.STEP_BASE_URL ?? 'https://api.stepfun.ai/v1',
  model: process.env.STEP_MODEL ?? 'step-5-preview',
  outputDir: resolve(ROOT, 'outputs'),
  port: Number(process.env.STAGE1_PORT ?? 3200),
};

export function runtimeInfo() {
  return { provider: 'StepFun', model: settings.model, sdk: 'Vercel AI SDK', runtime: 'Node.js', configured: Boolean(settings.apiKey && settings.apiKey !== 'YOUR_STEPFUN_API_KEY') };
}

export function publicError(error: unknown) {
  if ((error as { statusCode?: number })?.statusCode === 200) return 'The StepFun response stream was interrupted. Inspect saved work before trying again.';
  return error instanceof DemoError ? error.message : (error as Error)?.name === 'AbortError' || (error as Error)?.name === 'TimeoutError' ? 'Stopped or timed out. Saved drafts are still available.' : 'Could not finish. Check StepFun model access, connection and API credits.';
}
export class DemoError extends Error {}
