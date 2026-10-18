import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { settings } from './config.js';

export function createStepModel() {
  if (!settings.apiKey || settings.apiKey === 'YOUR_STEPFUN_API_KEY') {
    throw new Error('Set STEP_API_KEY in this stage’s .env or the workshop root (voice-agent/.env).');
  }
  const step = createOpenAICompatible({
    name: 'stepfun',
    apiKey: settings.apiKey,
    baseURL: settings.baseURL,
  });
  return step(settings.model);
}
