import { randomUUID } from 'node:crypto';
import type { ModelMessage, LanguageModel } from 'ai';
import { z } from 'zod';
import { createAgent, type ToolEvent } from './agent.js';
import { DemoError, publicError, runtimeInfo } from './config.js';
import { createDraftStore } from './workspace.js';

export type Event = { type: string; [key: string]: unknown };
export function newSession(id: string = randomUUID()) {
  return {
    id,
    messages: [] as ModelMessage[],
    chat: [] as { role: 'user' | 'assistant'; text: string }[],
    activity: [] as Event[],
    busy: false,
    turns: 0,
    touchedAt: Date.now(),
    reportedModel: undefined as string | undefined,
  };
}
export type Session = ReturnType<typeof newSession>;

export async function runTurn(
  session: Session,
  text: string,
  store: ReturnType<typeof createDraftStore>,
  send: (event: Event) => void,
  signal?: AbortSignal,
  model?: LanguageModel,
) {
  const parsed = z.string().trim().min(1).max(4000).safeParse(text);
  if (!parsed.success)
    throw new DemoError('Enter a goal or project brief (up to 4,000 characters).');
  if (session.busy) throw new DemoError('A task is already running in this conversation.');
  if (session.turns >= 40)
    throw new DemoError(
      'Start a fresh conversation after 40 turns. Your saved files remain available.',
    );
  if (!model && !runtimeInfo().configured)
    throw new DemoError("Set STEP_API_KEY in this stage's .env or voice-agent/.env, then restart.");
  session.busy = true;
  session.turns++;
  session.activity = [];
  session.touchedAt = Date.now();
  const emit = (event: Event) => {
    if (event.type !== 'text') session.activity.push(event);
    send(event);
  };
  session.chat.push({ role: 'user', text: parsed.data });
  let answer = '';
  let saved = false;
  let hadToolError = false;
  let hadGoal = false;
  try {
    emit({ type: 'run-start', request: parsed.data });
    const agent = createAgent(
      (event: ToolEvent) => {
        const result = event.result as
          | { saved?: boolean; passed?: boolean; error?: string }
          | undefined;
        if (event.tool === 'save_pitch' && result?.saved) saved = true;
        if (event.tool === 'set_goal' && event.phase === 'end' && !result?.error) hadGoal = true;
        if (result?.error) hadToolError = true;
        emit({ type: 'tool', ...event });
      },
      { store, model },
    );
    const response = await agent.stream({
      messages: [...session.messages, { role: 'user', content: parsed.data }],
      abortSignal: AbortSignal.any([AbortSignal.timeout(180_000), ...(signal ? [signal] : [])]),
    });
    for await (const part of response.stream) {
      if (part.type === 'text-delta') {
        answer += part.text;
        send({ type: 'text', text: part.text });
      }
      if (part.type === 'error') throw part.error;
      if (part.type === 'abort') throw new DOMException('Stopped', 'AbortError');
    }
    session.messages.push(
      { role: 'user', content: parsed.data },
      ...(await response.responseMessages),
    );
    session.reportedModel = (await response.response).modelId;
    const finished = await response.finishReason;
    session.chat.push({
      role: 'assistant',
      text: answer || 'Inspect the task activity and saved drafts.',
    });
    emit({
      type: 'done',
      outcome: saved
        ? 'saved'
        : hadGoal || hadToolError || finished === 'length'
          ? 'incomplete'
          : 'answered',
      reportedModel: session.reportedModel,
    });
  } catch (error) {
    const message = publicError(error);
    session.messages.push(
      { role: 'user', content: parsed.data },
      { role: 'assistant', content: message },
    );
    session.chat.push({ role: 'assistant', text: `${answer}${answer ? '\n' : ''}${message}` });
    emit({ type: 'error', message });
  } finally {
    session.busy = false;
    session.touchedAt = Date.now();
  }
}
