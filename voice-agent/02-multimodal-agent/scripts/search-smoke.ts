import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { settings, searchConfigured, publicError } from '../src/config.js';
import { newSession } from '../src/state.js';
import { runTurn } from '../src/runner.js';

// Opt-in live search check. Never substitute fixtures for a missing provider key.
if (!searchConfigured()) {
  console.error('Live search was not run. Set TAVILY_API_KEY in .env, then run npm run smoke:search again.');
  process.exitCode = 1;
} else {
  try {
    const session = newSession();
    const result = await runTurn(session, {
      text: 'Research when Griffith Observatory opened, preferably from its official website. Save a short English audio-guide script with the supporting source IDs. Do not generate audio.',
    }, event => {
      if (event.type === 'tool-start') console.log(`[tool] ${event.tool}`);
      if (event.type === 'tool-end' && event.ok === false) console.log(`[tool error] ${event.error}`);
    });
    assert.ok(session.research.length > 0, 'A real search must have succeeded.');
    assert.ok(session.scripts.at(-1)?.sources?.length, 'The draft must include a retrieved source.');
    assert.equal(session.takes.length, 0, 'Draft-only research must not generate speech.');
    await mkdir(settings.outputDir, { recursive: true });
    await writeFile(resolve(settings.outputDir, 'search-smoke.json'), JSON.stringify({
      passed: true, model: result.model, research: session.research, scripts: session.scripts,
      answer: result.text, usage: result.usage, checkedAt: new Date().toISOString(),
    }, null, 2));
    console.log(`PASS: ${session.research.length} searches and ${session.scripts.length} sourced drafts. No speech requested.`);
  } catch (error) {
    console.error(error instanceof assert.AssertionError ? error.message : publicError(error));
    process.exitCode = 1;
  }
}
