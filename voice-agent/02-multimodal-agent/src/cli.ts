import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { newSession } from './state.js';
import { runTurn } from './runner.js';
import { settings, publicError } from './config.js';

let session = newSession();
const terminal = createInterface({ input: stdin, output: stdout });
let closed = false;
const inputClosed = new AbortController();
terminal.on('close', () => { closed = true; inputClosed.abort(); });
console.log(`Frame & Voice · ${settings.model} · ${settings.audioModel} + ${settings.musicModel} → Node.js mix`);
console.log('/image /absolute/path.png attaches an image to your next message. /reset starts over. /exit quits.');
let image: string | undefined;
try {
  while (true) {
    const text = (await terminal.question('\nYou > ', { signal: inputClosed.signal })).trim();
    if (text === '/exit') break;
    if (text === '/reset') { session = newSession(); image = undefined; console.log('New conversation.'); continue; }
    if (text.startsWith('/image ')) {
      try {
        const path = text.slice(7).trim();
        const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[extname(path).toLowerCase()];
        if (!mime) throw new Error('Choose PNG, JPEG, or WebP.');
        const bytes = await readFile(path);
        if (bytes.length > 5_000_000) throw new Error('Choose an image smaller than 5 MB.');
        image = `data:${mime};base64,${bytes.toString('base64')}`;
        console.log('Image attached to your next message.');
      } catch { console.log('Could not attach image. Check the path, format, and 5 MB size limit.'); }
      continue;
    }
    if (!text) continue;
    try {
      await runTurn(session, { text, image }, event => {
        if (event.type === 'text') stdout.write(String(event.text));
        if (event.type === 'status') console.log(`\n[status] ${event.message}`);
        if (event.type === 'tool-start') console.log(`\n[tool] ${event.tool}`);
        if (event.type === 'sources') {
          const research = event.research as { sources: { id: string; title: string; url: string }[] };
          for (const source of research.sources) console.log(`\n[${source.id}] ${source.title}\n${source.url}`);
        }
        if (event.type === 'audio') {
          const take = event.take as { id: string; version: number; format?: string };
          console.log(`\n[audio take ${take.version}] ${settings.outputDir}/${session.id}/${take.id}.${take.format ?? 'wav'}`);
        }
        if (event.type === 'tool-end' && event.ok === false) console.log(`\n[tool error] ${event.error}`);
      });
      image = undefined;
      console.log();
    } catch (error) { console.log(`\n${publicError(error)}`); }
  }
} catch (error) {
  if (!closed) {
    console.error(publicError(error));
    process.exitCode = 1;
  }
} finally { terminal.close(); }
