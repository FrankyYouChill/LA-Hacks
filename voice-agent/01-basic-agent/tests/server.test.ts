import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { MockLanguageModelV4 } from 'ai/test';
import { createDemoServer } from '../src/server.js';

const pitch = {
  title: 'CampusMate',
  audience: 'Arriving students',
  problem: 'Scattered poster details',
  benefit: 'A clearer invitation',
  targetSeconds: 20,
  text: 'CampusMate is a workshop prototype for students arriving at a hackathon. Upload an event poster, and Step 5 Preview explains the visible information. StepAudio turns that explanation into a spoken invitation to help students understand the event.',
};
function stream(parts: LanguageModelV4StreamPart[], tools = true) {
  return {
    stream: new ReadableStream<LanguageModelV4StreamPart>({
      start(controller) {
        controller.enqueue({ type: 'stream-start', warnings: [] });
        for (const part of parts) controller.enqueue(part);
        controller.enqueue({
          type: 'finish',
          finishReason: { unified: tools ? 'tool-calls' : 'stop', raw: undefined },
          usage: {
            inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 10, text: 10, reasoning: undefined },
          },
        });
        controller.close();
      },
    }),
  };
}
test('HTTP streams actual failed-check revision, scoped downloads, and file restoration after restart', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'coach-http-'));
  let step = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      step++;
      const calls: [string, unknown][] = [
        [
          'set_goal',
          {
            objective: 'Deliver a checked pitch',
            targetSeconds: 20,
            criteria: ['Fit the word budget', 'Save a new file'],
          },
        ],
        ['check_pitch', { ...pitch, text: 'word '.repeat(80) }],
        ['check_pitch', pitch],
        ['save_pitch', { checkId: 'C1' }],
      ];
      if (step <= calls.length)
        return stream([
          {
            type: 'tool-call',
            toolCallId: String(step),
            toolName: calls[step - 1][0],
            input: JSON.stringify(calls[step - 1][1]),
          },
        ]);
      return stream(
        [
          { type: 'text-start', id: 'a' },
          { type: 'text-delta', id: 'a', delta: 'Saved.' },
          { type: 'text-end', id: 'a' },
        ],
        false,
      );
    },
  });
  let server = createDemoServer({ outputDir, model });
  const start = async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };
  let url = await start();
  try {
    const initial = await fetch(`${url}/api/session`);
    const cookie = initial.headers.get('set-cookie')!.split(';')[0];
    assert.equal((await initial.json()).drafts.length, 0);
    const response = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Repair the rough draft.' }),
    });
    const events = (await response.text())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      events
        .filter((e) => e.type === 'tool' && e.tool === 'check_pitch' && e.phase === 'end')
        .map((e) => e.result.passed),
      [false, true],
    );
    assert.equal(events.at(-1).outcome, 'saved');
    const download = await fetch(`${url}/drafts/1.md`, { headers: { Cookie: cookie } });
    assert.equal(download.status, 200);
    assert.match(await download.text(), /CampusMate/);
    assert.equal((await fetch(`${url}/drafts/1.md`)).status, 404);
    assert.equal(
      (await fetch(`${url}/api/session`, { headers: { Origin: 'https://outside.example' } }))
        .status,
      403,
    );
    await fetch(`${url}/api/reset`, { method: 'POST', headers: { Cookie: cookie } });
    const reset = await (await fetch(`${url}/api/session`, { headers: { Cookie: cookie } })).json();
    assert.equal(reset.chat.length, 0);
    assert.equal(reset.drafts.length, 1);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    server = createDemoServer({ outputDir, model });
    url = await start();
    const restored = await (
      await fetch(`${url}/api/session`, { headers: { Cookie: cookie } })
    ).json();
    assert.equal(restored.drafts[0].text, pitch.text);
    assert.equal(restored.activity.length, 0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
