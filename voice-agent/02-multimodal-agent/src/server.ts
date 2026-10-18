import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { settings, ROOT, publicError, runtimeInfo, UserError } from './config.js';
import { newSession, sessionView, type Session } from './state.js';
import { runTurn } from './runner.js';

const sessions = new Map<string, Session>();
const uuid = '[a-f0-9-]{36}';

function getSession(request: IncomingMessage, response: ServerResponse) {
  const id = request.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('frame_session='))?.slice(14);
  let session = id ? sessions.get(id) : undefined;
  if (!session) {
    if (sessions.size >= 20) {
      const oldest = [...sessions.values()].filter(item => !item.busy).sort((a, b) => a.touchedAt - b.touchedAt)[0];
      if (!oldest) throw new UserError('All demo sessions are busy. Try again shortly.');
      sessions.delete(oldest.id);
    }
    session = newSession();
    sessions.set(session.id, session);
    response.setHeader('Set-Cookie', `frame_session=${session.id}; HttpOnly; SameSite=Strict; Path=/`);
  }
  session.touchedAt = Date.now();
  return session;
}

function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function readJSON(request: IncomingMessage) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new UserError('Send application/json.');
  const parts: Buffer[] = [];
  let length = 0;
  for await (const part of request) {
    length += part.length;
    if (length > 8_000_000) throw new UserError('The image is too large. Choose an image smaller than 5 MB.');
    parts.push(part);
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { throw new UserError('Invalid JSON request.'); }
}

const staticFiles: Record<string, [string, string]> = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/activity.js': ['activity.js', 'text/javascript; charset=utf-8'],
  '/demo-inputs.js': ['demo-inputs.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/sample.png': ['sample.png', 'image/png'],
};

export const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  try {
    const origin = request.headers.origin;
    if (origin && ![`http://localhost:${settings.port}`, `http://127.0.0.1:${settings.port}`].includes(origin)) {
      return json(response, 403, { error: 'This local demo accepts same-origin requests only.' });
    }
    const path = new URL(request.url ?? '/', `http://127.0.0.1:${settings.port}`).pathname;
    if (request.method === 'GET' && staticFiles[path]) {
      const [file, type] = staticFiles[path];
      const content = await readFile(resolve(ROOT, 'public', file));
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
      return response.end(content);
    }
    if (request.method === 'GET' && path === '/api/health') {
      return json(response, 200, { configured: Boolean(settings.apiKey && settings.apiKey !== 'YOUR_STEPFUN_API_KEY'), ...runtimeInfo() });
    }
    const session = getSession(request, response);
    if (request.method === 'GET' && path === '/api/session') return json(response, 200, sessionView(session));
    if (request.method === 'POST' && path === '/api/reset') {
      if (session.busy) return json(response, 409, { error: 'Stop the current reply before starting over.' });
      const fresh = newSession();
      sessions.delete(session.id);
      sessions.set(fresh.id, fresh);
      response.setHeader('Set-Cookie', `frame_session=${fresh.id}; HttpOnly; SameSite=Strict; Path=/`);
      return json(response, 200, sessionView(fresh));
    }
    if (request.method === 'POST' && path === '/api/chat') {
      if (session.busy) return json(response, 409, { error: 'A reply is already running.' });
      const input = await readJSON(request);
      const abort = new AbortController();
      response.on('close', () => { if (!response.writableEnded) abort.abort(); });
      response.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
      response.flushHeaders();
      const emit = (event: unknown) => { if (!response.destroyed) response.write(`${JSON.stringify(event)}\n`); };
      const heartbeat = setInterval(() => emit({ type: 'heartbeat' }), 15_000);
      try { await runTurn(session, input, emit, abort.signal); }
      catch (error) { emit({ type: 'error', message: publicError(error) }); }
      finally { clearInterval(heartbeat); response.end(); }
      return;
    }
    const audioMatch = path.match(new RegExp(`^/audio/(${uuid})/(${uuid})(?:-(voice|music|effects))?\\.(wav|mp3)$`));
    if (request.method === 'GET' && audioMatch) {
      const [, owner, id, stem, format] = audioMatch;
      const take = session.takes.find(item => item.id === id);
      if (owner !== session.id || !take || (stem ? format !== 'wav' || !take.stems?.some(item => item.kind === stem) : format !== (take.format ?? 'wav'))) return json(response, 404, { error: 'Audio not found in this conversation.' });
      const file = resolve(settings.outputDir, owner, `${id}${stem ? `-${stem}` : ''}.${format}`);
      const { size } = await stat(file);
      const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || end < start) {
        response.writeHead(416, { 'Content-Range': `bytes */${size}` });
        return response.end();
      }
      response.writeHead(range ? 206 : 200, {
        'Content-Type': format === 'mp3' ? 'audio/mpeg' : 'audio/wav', 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, no-store', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
      });
      const stream = createReadStream(file, { start, end });
      stream.on('error', () => response.destroy());
      stream.pipe(response);
      return;
    }
    json(response, 404, { error: 'Not found.' });
  } catch (error) {
    if (!response.headersSent) json(response, error instanceof UserError ? 400 : 500, { error: publicError(error) });
    else response.end();
  }
});

server.requestTimeout = 620_000;
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(error.code === 'EADDRINUSE'
    ? `Port ${settings.port} is already in use. Stop the earlier demo or set another PORT in .env, then restart.`
    : 'Could not start the local server. Check the PORT setting and local network permissions.');
  process.exitCode = 1;
});
server.listen(settings.port, '127.0.0.1', () => {
  console.log(`Frame & Voice → http://localhost:${settings.port}`);
  console.log(`${settings.model} · voice: ${settings.audioModel} · music: ${settings.musicModel} · Node.js PCM mixer · API key ${settings.apiKey ? 'loaded' : 'missing'}`);
});
