import { ToolLoopAgent, isStepCount, tool, type LanguageModel } from 'ai';
import { z } from 'zod';
import { publicError, searchConfigured, UserError } from './config.js';
import { createStepModel } from './model.js';
import { scriptSchema, goalSchema, type Emit, type Session } from './state.js';
import { produceAudio, synthesizeSpeech } from './audio.js';
import { searchWeb } from './search.js';
import { directorInstructions } from './prompt.js';

// The framework: one model, instructions, a tool set, and a bounded agent loop.
export function createDirector(
  session: Session,
  emit: Emit = () => {},
  dependencies: { model?: LanguageModel; synthesize?: typeof synthesizeSpeech; produce?: typeof produceAudio; search?: typeof searchWeb } = {},
) {
  let renderAttempted = false;
  let searchAttempts = 0;
  const attemptedQueries = new Set<string>();
  const searchCache = new Map<string, { query: string; sources: typeof session.sources }>();
  let goalSet = false;

  return new ToolLoopAgent({
    model: dependencies.model ?? createStepModel(),
    instructions: directorInstructions(session, Boolean(dependencies.search) || searchConfigured()),
    maxOutputTokens: 8192,
    maxRetries: 0,
    reasoning: 'low',
    stopWhen: isStepCount(8),
    toolCallConcurrency: 1,
    tools: {
      set_goal: tool({
        description: 'Set the intended deliverable and up to three acceptance criteria for this pitch/audio task. Use once before creating artifacts; criteria describe the objective, not completed work.',
        inputSchema: goalSchema,
        execute: async goal => {
          emit({ type: 'tool-start', tool: 'set_goal', input: goal });
          if (goalSet) { emit({ type: 'tool-end', tool: 'set_goal', ok: false, error: 'Keep the current goal; revise it in a new turn.' }); return { accepted: false }; }
          goalSet = true; session.goal = goal;
          emit({ type: 'goal', goal }); emit({ type: 'tool-end', tool: 'set_goal', ok: true });
          return { accepted: true, goal };
        },
      }),
      search_web: tool({
        description: 'Retrieve up to three web source snippets through Tavily. Use for explicit research, verification, or current facts. Returns application-assigned source IDs. Requires TAVILY_API_KEY; at most two distinct queries per turn.',
        inputSchema: z.object({ query: z.string().trim().min(3).max(240) }),
        execute: async ({ query }, { abortSignal }) => {
          emit({ type: 'tool-start', tool: 'search_web', input: { query } });
          try {
            const cacheKey = query.toLowerCase();
            const cached = searchCache.get(cacheKey);
            if (cached) {
              emit({ type: 'sources', research: cached });
              emit({ type: 'tool-end', tool: 'search_web', ok: true, cached: true });
              return cached;
            }
            if (attemptedQueries.has(cacheKey)) throw new UserError('This search already failed in this turn. No automatic retry was made. Continue in a new message to try again.');
            if (searchAttempts >= 2) throw new UserError('Two search queries per turn. Continue in another message if more research is needed.');
            searchAttempts += 1;
            attemptedQueries.add(cacheKey);
            const results = await (dependencies.search ?? searchWeb)(query, abortSignal);
            const sources = results.map(result => {
              const existing = session.sources.find(source => source.url === result.url);
              if (existing) {
                Object.assign(existing, result);
                return existing;
              }
              const source = { ...result, id: `S${session.sources.length + 1}` };
              session.sources.push(source);
              return source;
            });
            const research = { query, sources };
            session.research.push(research);
            searchCache.set(cacheKey, research);
            emit({ type: 'sources', research });
            emit({ type: 'tool-end', tool: 'search_web', ok: true });
            return { ...research, ...(sources.length ? {} : { note: 'No usable results were found. Do not present this as factual confirmation.' }) };
          } catch (error) {
            const message = publicError(error);
            emit({ type: 'tool-end', tool: 'search_web', ok: false, error: message });
            return { error: message, searched: false, sources: [] };
          }
        },
      }),
      save_script: tool({
        description: 'Save a new voiceover script or revision. Returns its version number. Always call this before rendering a changed script.',
        inputSchema: scriptSchema,
        execute: async (input) => {
          emit({ type: 'tool-start', tool: 'save_script', input });
          try {
            if (session.scripts.length >= 40) throw new UserError('This conversation has 40 drafts. Start a new conversation.');
            const sourceIds = [...new Set(input.sourceIds ?? [])];
            if (sourceIds.some(id => !session.sources.some(source => source.id === id))) {
              throw new UserError('A cited source ID was not returned by search_web. Use only source IDs actually present in this conversation.');
            }
            const wordCount = input.text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
            const targetSeconds = input.targetSeconds ?? 20;
            if (input.language === 'en' && wordCount > Math.floor(targetSeconds * 2.5)) {
              throw new UserError(`The pitch has ${wordCount} words, over the ${Math.floor(targetSeconds * 2.5)}-word budget for ${targetSeconds} seconds. Shorten it and call save_script again.`);
            }
            if (input.language === 'en' && /\b(?:instantly|in seconds|every detail|everything you need)\b/i.test(input.text)) {
              throw new UserError('Remove broad speed/completeness promises such as "in seconds" or "every detail". Describe the concrete behavior and call save_script again. This wording check is not factual verification.');
            }
            const script = { ...input, sourceIds, check: { wordCount, estimatedSeconds: Math.round((input.language === 'en' ? wordCount / 2.5 : input.text.length / 4) * 10) / 10, targetSeconds }, sources: sourceIds.map(id => ({ ...session.sources.find(source => source.id === id)! })), version: session.scripts.length + 1 };
            session.scripts.push(script);
            emit({ type: 'script', script });
            emit({ type: 'tool-end', tool: 'save_script', ok: true });
            return script;
          } catch (error) {
            const message = publicError(error);
            emit({ type: 'tool-end', tool: 'save_script', ok: false, error: message });
            return { error: message, saved: false };
          }
        },
      }),
      create_voiceover: tool({
        description: 'Generate real speech using StepAudio 3 TTS from a saved script version. Returns a playable WAV. At most one new audio render per user turn.',
        inputSchema: z.object({ version: z.number().int().positive() }),
        execute: async ({ version }, { abortSignal }) => {
          emit({ type: 'tool-start', tool: 'create_voiceover', input: { version } });
          try {
            const existing = session.takes.find(take => take.version === version && take.kind !== 'production');
            if (existing) {
              emit({ type: 'audio', take: existing });
              emit({ type: 'tool-end', tool: 'create_voiceover', ok: true, cached: true });
              return existing;
            }
            if (renderAttempted) throw new UserError('One render per turn. Send another message to make a new take.');
            const script = session.scripts.find(item => item.version === version);
            if (!script) throw new UserError('Save the script before generating its audio.');
            renderAttempted = true;
            const take = await (dependencies.synthesize ?? synthesizeSpeech)(script, session.id, abortSignal);
            session.takes.push(take);
            emit({ type: 'audio', take });
            emit({ type: 'tool-end', tool: 'create_voiceover', ok: true });
            return take;
          } catch (error) {
            const message = publicError(error);
            emit({ type: 'tool-end', tool: 'create_voiceover', ok: false, error: message });
            return { error: message, rendered: false };
          }
        },
      }),
      create_production: tool({
        description: 'Produce a WAV by generating separate TTS narration and instrumental Music tracks, optionally a Gen opening effect, then overlaying them in Node.js. Returns the mixed file, individual stems and measured overlap. One production render uses two model generations plus an optional effect; shares the one-render-per-turn budget with create_voiceover.',
        inputSchema: z.object({ version: z.number().int().positive() }),
        execute: async ({ version }, { abortSignal }) => {
          emit({ type: 'tool-start', tool: 'create_production', input: { version } });
          try {
            const existing = session.takes.find(take => take.version === version && take.kind === 'production');
            if (existing) {
              emit({ type: 'audio', take: existing });
              emit({ type: 'tool-end', tool: 'create_production', ok: true, cached: true });
              return existing;
            }
            if (renderAttempted) throw new UserError('One new audio render per turn. Continue in another message to make a different take.');
            const script = session.scripts.find(item => item.version === version);
            if (!script) throw new UserError('Save the pitch before producing audio.');
            renderAttempted = true;
            const take = await (dependencies.produce ?? produceAudio)(script, session.id, abortSignal, undefined, (message, stage) => emit({ type: 'status', message, stage }));
            session.takes.push(take);
            emit({ type: 'audio', take });
            emit({ type: 'tool-end', tool: 'create_production', ok: true });
            return take;
          } catch (error) {
            const message = publicError(error);
            emit({ type: 'tool-end', tool: 'create_production', ok: false, error: message });
            return { error: message, rendered: false };
          }
        },
      }),
    },
  });
}
