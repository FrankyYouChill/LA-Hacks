import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { LanguageModel } from 'ai';
import { ROOT, settings, runtimeInfo, publicError, DemoError } from './config.js';
import { createDraftStore } from './workspace.js';
import { newSession, runTurn, type Session } from './runner.js';

const staticFiles: Record<string, [string, string]> = {
  '/': ['index.html', 'text/html'],
  '/app.js': ['app.js', 'text/javascript'],
  '/styles.css': ['styles.css', 'text/css'],
};
function json(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(data));
}
async function body(request: IncomingMessage) {
  if (!request.headers['content-type']?.startsWith('application/json'))
    throw new DemoError('Send application/json.');
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 24_000) throw new DemoError('This message is too large.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new DemoError('Invalid JSON.');
  }
}

export function createDemoServer(options: { outputDir?: string; model?: LanguageModel } = {}) {
  const sessions = new Map<string, Session>();
  const storeFor = (session: Session) =>
    createDraftStore(resolve(options.outputDir ?? settings.outputDir, 'browser', session.id));
  const view = async (session: Session) => ({
    chat: session.chat,
    activity: session.activity,
    drafts: await storeFor(session).all(),
    busy: session.busy,
    reportedModel: session.reportedModel,
  });
  const getSession = (request: IncomingMessage, response: ServerResponse) => {
    const cookie = request.headers.cookie
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('coach_session='))
      ?.slice(14);
    let session = cookie ? sessions.get(cookie) : undefined;
    if (!session) {
      if (sessions.size >= 20) {
        const oldest = [...sessions.values()]
          .filter((s) => !s.busy)
          .sort((a, b) => a.touchedAt - b.touchedAt)[0];
        if (!oldest) throw new DemoError('All local demo sessions are busy. Try again shortly.');
        sessions.delete(oldest.id);
      }
      // The cookie restores this browser's saved workspace after a server restart.
      session = newSession(cookie && /^[a-f0-9-]{36}$/.test(cookie) ? cookie : undefined);
      sessions.set(session.id, session);
      response.setHeader(
        'Set-Cookie',
        `coach_session=${session.id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`,
      );
    }
    session.touchedAt = Date.now();
    return session;
  };
  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    try {
      const allowed = [
        `localhost:${request.socket.localPort}`,
        `127.0.0.1:${request.socket.localPort}`,
      ];
      if (
        !allowed.includes(request.headers.host ?? '') ||
        (request.headers.origin &&
          !allowed.map((h) => `http://${h}`).includes(request.headers.origin))
      )
        return json(response, 403, { error: 'This local demo accepts same-origin requests only.' });
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (request.method === 'GET' && staticFiles[path]) {
        const [file, type] = staticFiles[path];
        response.writeHead(200, {
          'Content-Type': `${type}; charset=utf-8`,
          'Cache-Control': 'no-cache',
        });
        return response.end(await readFile(resolve(ROOT, 'public', file)));
      }
      if (request.method === 'GET' && path === '/api/health')
        return json(response, 200, runtimeInfo());
      if (request.method === 'GET' && path === '/api/examples') {
        const brief = await readFile(resolve(ROOT, 'examples/project-brief.json'), 'utf8');
        const rough =
          'CampusMate is a workshop prototype for students arriving at a hackathon. Event details can be scattered across posters, and arriving students need a clear way to understand the information. The demo accepts an uploaded poster image and uses Step 5 Preview to explain visible information. StepAudio can then create a spoken invitation from that explanation. The goal of the prototype is to help a student turn the poster into a concise introduction they can share. This is a workshop demonstration, with no live camera, mobile app, customer numbers, or measured performance results claimed.';
        const demo = `Create a clear, credible 30-second English pitch from this sample project brief. Set the goal, check and revise as needed, and save the checked pitch. Use sensible defaults and no questions.\n${brief}`;
        const repair = `Repair this supplied rough draft for a 15-second English pitch. Set the goal, then use check_pitch on the EXACT original words before editing. Use its feedback to shorten, check again and save a new pitch. Keep the supplied facts and do not ask questions.\nOriginal draft: ${rough}`;
        return json(response, 200, {
          demo,
          repair,
          details: {
            demo: {
              title: 'CampusMate',
              description:
                'Input: a bundled text brief describing a workshop prototype. CampusMate is the project being pitched, not this agent. No image or recording is attached.',
              output: 'Output: a checked, saved 30-second English pitch.',
              prompt: demo,
            },
            repair: {
              title: 'Repair a rough draft',
              description:
                'Input: a supplied text draft that exceeds the requested 15-second word budget. The agent checks the original before editing.',
              output: 'Output: a shorter, checked pitch saved as a new version.',
              prompt: repair,
            },
          },
        });
      }
      const session = getSession(request, response);
      if (request.method === 'GET' && path === '/api/session')
        return json(response, 200, await view(session));
      if (request.method === 'POST' && path === '/api/reset') {
        if (session.busy) return json(response, 409, { error: 'Stop the active task first.' });
        session.messages = [];
        session.chat = [];
        session.activity = [];
        session.turns = 0;
        session.reportedModel = undefined;
        return json(response, 200, await view(session));
      }
      const download = path.match(/^\/drafts\/(\d{1,4})\.(md|json)$/);
      if (request.method === 'GET' && download) {
        const version = Number(download[1]);
        const store = storeFor(session);
        if (!(await store.read(version)))
          return json(response, 404, { error: 'Draft not found in this workspace.' });
        const file = `draft-${String(version).padStart(4, '0')}.${download[2]}`;
        response.writeHead(200, {
          'Content-Type':
            download[2] === 'json' ? 'application/json' : 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${file}"`,
          'Cache-Control': 'no-store',
        });
        return response.end(await readFile(resolve(store.directory, file)));
      }
      if (request.method === 'POST' && path === '/api/chat') {
        if (session.busy) return json(response, 409, { error: 'A task is already running.' });
        const input = await body(request);
        if (
          !input ||
          typeof input.text !== 'string' ||
          !input.text.trim() ||
          input.text.length > 4000
        )
          throw new DemoError('Enter a goal or brief (up to 4,000 characters).');
        const abort = new AbortController();
        response.on('close', () => {
          if (!response.writableEnded) abort.abort();
        });
        response.writeHead(200, {
          'Content-Type': 'application/x-ndjson',
          'Cache-Control': 'no-store',
          'X-Accel-Buffering': 'no',
        });
        response.flushHeaders();
        const emit = (event: unknown) => {
          if (!response.destroyed) response.write(`${JSON.stringify(event)}\n`);
        };
        const heartbeat = setInterval(() => emit({ type: 'heartbeat' }), 15_000);
        try {
          await runTurn(session, input.text, storeFor(session), emit, abort.signal, options.model);
        } catch (error) {
          emit({ type: 'error', message: publicError(error) });
        } finally {
          clearInterval(heartbeat);
          response.end();
        }
        return;
      }
      return json(response, 404, { error: 'Not found.' });
    } catch (error) {
      if (!response.headersSent)
        json(response, error instanceof DemoError ? 400 : 500, { error: publicError(error) });
      else response.end();
    }
  });
  server.requestTimeout = 200_000;
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(ROOT, 'src/server.ts')) {
  createDemoServer().listen(settings.port, '127.0.0.1', () =>
    console.log(
      `Demo Coach → http://localhost:${settings.port}\n${settings.model} · Vercel AI SDK · ${runtimeInfo().configured ? 'API key loaded' : 'Set STEP_API_KEY before running a task'}`,
    ),
  );
}
