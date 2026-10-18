import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { newSession } from '../src/state.js';
import { runTurn } from '../src/runner.js';
import { ROOT, settings, publicError } from '../src/config.js';

// Opt-in live integration check. Makes real API calls and uses account credits.
const session = newSession();
const events: { type: string; tool?: unknown; ok?: unknown }[] = [];
const emit = (event: { type: string; [key: string]: unknown }) => {
  if (['tool-start', 'tool-end', 'done'].includes(event.type)) {
    const safe = { type: event.type, ...(event.tool ? { tool: event.tool } : {}), ...(event.ok !== undefined ? { ok: event.ok } : {}) };
    events.push(safe);
    console.log(JSON.stringify(safe));
  }
};
try {
  const image = `data:image/png;base64,${(await readFile(resolve(ROOT, 'public/sample.png'))).toString('base64')}`;
  console.log('Live check: image → saved script → follow-up revision → StepAudio 3 WAV');
  const first = await runTurn(session, {
    text: 'My name is Alex. First tell me the configured conversation model and speech model that power you. Then write a 15-second invitation based on this poster and save the script. Do not generate audio yet. Only use visible facts; do not invent dates or locations.', image,
  }, emit);
  assert.ok(session.scripts.length > 0, 'Agent must actually save a script.');
  assert.equal(session.takes.length, 0, 'Draft-only request must not generate audio.');
  assert.equal(first.model, settings.model, 'The API-reported model must match the configured model.');
  assert.match(first.text, /step[ -]?5[ -]?preview/i, 'The assistant must know its deployment model.');
  assert.equal(session.scripts.at(-1)!.language, 'en', 'Scripts must default to English.');
  assert.match(session.scripts.at(-1)!.text, /hacks|hackathon/i, 'Script must use the image content.');
  const second = await runTurn(session, {
    text: 'First, tell me my name. Then revise the invitation into a cinematic 20-second trailer. Keep the event name, use a deep male voice, save a new version, and generate the voiceover.',
  }, emit);
  assert.ok(session.scripts.length >= 2, 'Follow-up must create a new script version.');
  assert.equal(session.takes.length, 1, 'Agent must call the audio tool.');
  assert.equal(session.takes[0].language, 'en');
  assert.match(second.text, /Alex/i, 'Follow-up must remember the name from the first turn.');
  assert.ok(session.messages.some(message => message.role === 'tool'), 'History must include tool results.');
  await mkdir(settings.outputDir, { recursive: true });
  const summary = {
    passed: true, model: settings.model, reportedModel: session.reportedModel, audioModel: settings.audioModel,
    turns: session.turns, scripts: session.scripts, takes: session.takes, events,
    answers: [first.text, second.text], usage: [first.usage, second.usage],
    checkedAt: new Date().toISOString(),
  };
  await writeFile(resolve(settings.outputDir, 'live-smoke.json'), JSON.stringify(summary, null, 2));
  console.log(`PASS: ${session.turns} turns, ${session.scripts.length} drafts, ${session.takes[0].bytes} audio bytes.`);
  console.log(`Audio: ${settings.outputDir}/${session.id}/${session.takes[0].id}.wav`);
} catch (error) {
  const message = error instanceof assert.AssertionError ? error.message : publicError(error);
  console.error(`Live check failed: ${message}`);
  process.exitCode = 1;
}
