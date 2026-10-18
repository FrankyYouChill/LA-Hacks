import { z } from 'zod';
import { searchConfigured, settings, UserError } from './config.js';
import type { Source } from './state.js';

const resultSchema = z.object({
  results: z.array(z.object({
    title: z.string(), url: z.string(), content: z.string(),
    published_date: z.string().nullish(),
  })),
});

// Search retrieves source snippets only. Step 5 Preview writes the answer.
export async function searchWeb(query: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<Omit<Source, 'id'>[]> {
  if (!searchConfigured()) throw new UserError('Web search is not configured. Add TAVILY_API_KEY to .env and restart. Chat, image understanding, and voiceovers still work.');
  let response: Response;
  try {
    response = await fetcher('https://api.tavily.com/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${settings.tavilyApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, search_depth: 'basic', max_results: 3, include_answer: false, include_raw_content: false, include_images: false }),
      signal: AbortSignal.any([AbortSignal.timeout(15_000), ...(signal ? [signal] : [])]),
    });
  } catch {
    if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
    throw new UserError('Web search could not connect or timed out. No results were retrieved.');
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new UserError(`Tavily returned HTTP ${response.status}. Check the search API key, credits, or rate limit. No search results were retrieved.`);
  }
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new UserError('Tavily returned an unreadable response. No search results were retrieved.'); }
  const parsed = resultSchema.safeParse(payload);
  if (!parsed.success) throw new UserError('Tavily returned an unexpected result format. No search results were retrieved.');
  const sources: Omit<Source, 'id'>[] = [];
  for (const result of parsed.data.results) {
    try {
      const url = new URL(result.url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
      url.hash = '';
      if (sources.some(source => source.url === url.href)) continue;
      sources.push({
        title: result.title.slice(0, 200), url: url.href, content: result.content.slice(0, 1800),
        retrievedAt: new Date().toISOString(), ...(result.published_date ? { publishedAt: result.published_date } : {}),
      });
      if (sources.length === 3) break;
    } catch { /* Ignore malformed source URLs. */ }
  }
  return sources;
}
