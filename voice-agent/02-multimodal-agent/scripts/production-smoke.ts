import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { settings, publicError } from '../src/config.js';
import { newSession } from '../src/state.js';
import { runTurn } from '../src/runner.js';

// Opt-in full integration check. No recording, image, or Tavily key is required.
const session = newSession();
try {
  const result = await runTurn(session, {
    text: 'Use this included sample brief to create a clear 20-second English project pitch, save it, and produce audio with gentle background music matched to the story and voice, without an opening effect. Choose all production settings yourself and do not ask questions. CampusMate is a workshop prototype for students arriving at a hackathon. Event details are scattered across posters. The demo accepts an uploaded poster image, uses Step 5 Preview to explain visible information, and creates a spoken invitation using StepAudio. No live-camera feature, mobile app, creator background, customers, or measured performance results are claimed.',
  }, event => {
    if (event.type === 'tool-start') console.log(`[tool] ${event.tool}`);
    if (event.type === 'tool-end' && !event.ok) console.log(`[tool error] ${event.error}`);
  });
  assert.equal(result.model, settings.model);
  assert.ok(session.scripts.length >= 1);
  assert.ok(session.scripts.at(-1)?.check);
  assert.equal(session.takes.length, 1);
  assert.equal(session.takes[0].kind, 'production');
  assert.equal(session.takes[0].model, 'local-pcm-mixer');
  assert.equal(session.takes[0].format, 'wav');
  assert.ok(session.takes[0].bytes > 1000);
  assert.ok(session.takes[0].production?.music);
  assert.ok(session.takes[0].score?.rationale);
  assert.ok(session.takes[0].score!.targetSeconds > 0);
  assert.equal(session.takes[0].production?.soundEffects.toLowerCase(), 'none');
  assert.equal(session.takes[0].mix?.method, 'pcm-overlay-v2');
  assert.ok(session.takes[0].mix!.musicRmsDuringVoice > 0.001);
  assert.ok(session.takes[0].stems!.some(stem => stem.kind === 'music'));
  await mkdir(settings.outputDir, { recursive: true });
  await writeFile(resolve(settings.outputDir, 'production-smoke.json'), JSON.stringify({ passed: true, audibility: 'not_checked', reasoningModel: result.model, scripts: session.scripts, takes: session.takes, checkedAt: new Date().toISOString() }, null, 2));
  console.log(`PASS: project brief → checked pitch → simultaneous voice/music mix (${session.takes[0].bytes} bytes).`);
  console.log(resolve(settings.outputDir, session.id, `${session.takes[0].id}.wav`));
  console.log('Overlay and nonzero music during narration checked. Listen separately to judge content and balance.');
} catch (error) {
  console.error(error instanceof assert.AssertionError ? error.message : publicError(error));
  process.exitCode = 1;
}
