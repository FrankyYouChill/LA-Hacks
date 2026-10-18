import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { settings, requireKey } from './config.js';

export function createStepModel() {
  requireKey();
  const step = createOpenAICompatible({
    name: 'stepfun', apiKey: settings.apiKey, baseURL: settings.baseURL,
    transformRequestBody: (body) => {
      // The compatible provider has no image-detail option; Step 5 accepts it on image_url.
      for (const message of (body.messages ?? []) as { content?: unknown }[]) {
        if (Array.isArray(message.content)) {
          for (const part of message.content) {
            if (part.type === 'image_url') part.image_url.detail = 'high';
          }
        }
      }
      return body;
    },
  });
  return step(settings.model);
}
