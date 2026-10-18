import { createDirector } from './agent.js';
import { publicError, runtimeInfo, UserError } from './config.js';
import { turnSchema, userMessage, type Emit, type Session } from './state.js';

// Both the CLI and browser call the same agent. History includes tool calls AND tool results.
export async function runTurn(
  session: Session,
  input: unknown,
  send: Emit = () => {},
  signal?: AbortSignal,
  dependencies?: Parameters<typeof createDirector>[2],
) {
  const parsed = turnSchema.safeParse(input);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? 'Invalid message.');
  const { text, image } = parsed.data;
  if (session.busy) throw new UserError('A reply is already running in this conversation.');
  if (session.turns >= 40) throw new UserError('This demo keeps up to 40 turns. Start a new conversation.');
  if (image && session.chat.filter(entry => entry.image).length >= 8) {
    throw new UserError('This demo keeps up to 8 images per conversation. Start a new conversation.');
  }
  session.busy = true;
  session.activity = []; session.goal = undefined;
  const oldDrafts = session.scripts.length; const oldTakes = session.takes.length; const oldResearch = session.research.length;
  const emit: Emit = event => {
    if (['run-start', 'goal', 'tool-start', 'tool-end', 'status', 'done'].includes(event.type)) session.activity.push(event);
    send(event);
  };
  session.turns += 1;
  session.touchedAt = Date.now();
  const userEntry = { role: 'user' as const, text, ...(image ? { image } : {}) };
  session.chat.push(userEntry);
  let answer = '';
  try {
    emit({ type: 'run-start', request: text });
    const agent = createDirector(session, emit, dependencies);
    emit({ type: 'runtime', runtime: { ...runtimeInfo(), reportedModel: session.reportedModel } });
    emit({ type: 'status', message: image ? 'Looking at your image…' : 'Thinking…' });
    const result = await agent.stream({
      messages: [...session.messages, userMessage(text, image)],
      abortSignal: AbortSignal.any([AbortSignal.timeout(600_000), ...(signal ? [signal] : [])]),
    });
    for await (const part of result.stream) {
      if (part.type === 'text-delta') {
        answer += part.text;
        emit({ type: 'text', text: part.text });
      }
      if (part.type === 'error') throw part.error;
      if (part.type === 'abort') throw new DOMException('Stopped', 'AbortError');
    }
    const responseMessages = await result.responseMessages;
    const response = await result.response;
    session.reportedModel = response.modelId;
    emit({ type: 'runtime', runtime: { ...runtimeInfo(), reportedModel: session.reportedModel } });
    const finishReason = await result.finishReason;
    // Keep protocol-correct history; never drop individual messages inside a tool exchange.
    session.messages.push(userMessage(text, image), ...responseMessages);
    if (!answer.trim()) {
      answer = 'Your saved work is in the studio. Send another message to continue.';
      emit({ type: 'text', text: answer });
      session.messages.push({ role: 'assistant', content: answer });
    }
    session.chat.push({ role: 'assistant', text: answer });
    if (finishReason === 'length') emit({ type: 'notice', message: 'The reply reached its output limit. Ask to continue.' });
    const usage = await result.totalUsage;
    const errors = session.activity.some(event => event.type === 'tool-end' && event.ok === false);
    const rendered = session.takes.length > oldTakes || session.activity.some(event => event.type === 'tool-end' && event.ok === true && ['create_production', 'create_voiceover'].includes(String(event.tool)));
    // Tool callbacks can set the goal while the model stream is running.
    const goal = session.goal as Session['goal'];
    const unmetGoal = goal && (goal.deliverable === 'pitch' ? session.scripts.length <= oldDrafts : !rendered);
    const outcome = rendered ? 'rendered' : errors || unmetGoal ? 'incomplete' : session.scripts.length > oldDrafts ? 'saved' : session.research.length > oldResearch ? 'researched' : finishReason === 'length' ? 'incomplete' : 'answered';
    emit({ type: 'done', outcome, turns: session.turns, usage, finishReason });
    return { text: answer, usage, finishReason, model: session.reportedModel };
  } catch (error) {
    Object.assign(userEntry, { failed: true });
    // Saved scripts and completed audio survive a later generation error.
    const message = publicError(error);
    session.activity.push({ type: 'error', message });
    session.messages.push(userMessage(text, image), { role: 'assistant', content: `The application could not finish this request: ${message}` });
    session.chat.push({ role: 'assistant', text: answer ? `${answer}\n\n${message}` : message, failed: true });
    throw error;
  } finally {
    session.busy = false;
    session.touchedAt = Date.now();
  }
}
