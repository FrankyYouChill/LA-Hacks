import type { ModelMessage } from 'ai';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createAgent } from './agent.js';
import { ROOT, settings } from './config.js';
import { createDraftStore } from './workspace.js';

async function main() {
  if (!settings.apiKey || settings.apiKey === 'YOUR_STEPFUN_API_KEY') throw new Error('Missing StepFun key.');
  const store = createDraftStore();
  let messages: ModelMessage[] = [];
  let reportedModel: string | undefined;
  const terminal = createInterface({ input: stdin, output: stdout });
  let closed = false;
  const inputClosed = new AbortController();
  terminal.on('close', () => { closed = true; inputClosed.abort(); });
  console.log(`Demo Coach · Stage 1 · ${settings.model} via the Vercel AI SDK`);
  console.log('Turn project notes into a clear, checked pitch. Type /demo to use the included brief.');
  console.log('/draft shows the latest saved pitch · /model shows model IDs · /reset clears conversation · /exit quits');
  try {
    while (true) {
      let text = (await terminal.question('\nYou > ', { signal: inputClosed.signal })).trim();
      if (text === '/exit') break;
      if (text === '/reset') { messages = []; reportedModel = undefined; console.log('Conversation cleared.'); continue; }
      if (text === '/model') {
        console.log(`Configured: ${settings.model}\nAPI-reported: ${reportedModel ?? 'No reply received yet.'}\nRuntime: Node.js · Framework: Vercel AI SDK`);
        continue;
      }
      if (text === '/draft') {
        const draft = await store.read();
        console.log(draft ? `Draft ${draft.version}: ${draft.title}\n\n${draft.text}\n\n${draft.wordCount} words · estimated ${draft.estimatedSeconds}s\n${store.directory}` : 'No saved drafts yet. Try /demo.');
        continue;
      }
      if (text === '/demo') {
        const brief = await readFile(resolve(ROOT, 'examples/project-brief.json'), 'utf8');
        text = `Use this sample project brief to create a clear, credible 30-second English demo pitch. Check its length with your tool, revise if needed, then save the checked version. Proceed with sensible defaults and no questions.\n${brief}`;
        console.log('Using the included CampusMate project brief.');
      }
      if (!text) continue;
      try {
        const agent = createAgent(event => {
          if (event.phase === 'start') console.log(`\n[tool] ${event.tool}`);
          if (event.phase !== 'end') return;
          if (event.tool === 'set_goal') console.log(`\n[set_goal] ${JSON.stringify(event.result)}`);
          const result = event.result as { passed?: boolean; checkId?: string; wordCount?: number; estimatedSeconds?: number; issues?: string[]; saved?: boolean; version?: number; markdownPath?: string; error?: string };
          if (event.tool === 'check_pitch') console.log(`\n[check_pitch] ${result.passed ? 'PASS' : 'REVISE'}${result.checkId ? ' · '+result.checkId : ''} · ${result.wordCount} words · estimated ${result.estimatedSeconds}s${result.issues?.length ? '\n'+result.issues.join('\n') : ''}`);
          if (event.tool === 'save_pitch') console.log(result.saved ? `\n[save_pitch] Draft ${result.version} saved → ${result.markdownPath}` : `\n[save_pitch] ${result.error}`);
          if (event.tool === 'read_draft') console.log(result.error ? `\n[read_draft] ${result.error}` : '\n[read_draft] Workspace inspected.');
        }, { store });
        const pending: ModelMessage[] = [...messages, { role: 'user', content: text }];
        const result = await agent.stream({ messages: pending, abortSignal: AbortSignal.timeout(180_000) });
        for await (const part of result.stream) {
          if (part.type === 'text-delta') stdout.write(part.text);
          if (part.type === 'error') throw part.error;
          if (part.type === 'abort') throw new Error('The request was stopped.');
        }
        // Keep the entire exchange so the next turn can refer to earlier answers.
        messages = [...pending, ...await result.responseMessages];
        reportedModel = (await result.response).modelId;
        if ((await result.finishReason) === 'length') console.log('\nThe reply reached its output limit. Inspect /draft and send another message to continue.');
        console.log();
      } catch {
        console.log('\nRequest failed. Check your connection, model access, and API credits.');
      }
    }
  } catch (error) {
    if (!closed) throw error;
  } finally { terminal.close(); }
}

main().catch(() => {
  console.error('Could not start. Set STEP_API_KEY in this stage’s .env or the workshop root (voice-agent/.env).');
  process.exitCode = 1;
});
