import test from 'node:test';
import assert from 'node:assert/strict';
import { searchWeb } from '../src/search.js';
import { settings } from '../src/config.js';

test('search returns bounded source excerpts and excludes unsafe or duplicate URLs', async () => {
  const original = settings.tavilyApiKey;
  settings.tavilyApiKey = 'test-key';
  try {
    const fakeFetch: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.include_answer, false);
      assert.equal(body.max_results, 3);
      assert.ok(init?.signal);
      return Response.json({ results: [
        { title: 'Bad link', url: 'javascript:alert(1)', content: 'Ignore this.' },
        { title: 'Official history', url: 'https://example.com/history', content: 'A'.repeat(5000) },
        { title: 'Duplicate', url: 'https://example.com/history#section', content: 'Duplicate.' },
        { title: 'Second source', url: 'https://example.org/about', content: 'Another excerpt.', published_date: '2026-10-17' },
      ] });
    };
    const sources = await searchWeb('observatory history', undefined, fakeFetch);
    assert.equal(sources.length, 2);
    assert.equal(sources[0].content.length, 1800);
    assert.equal(sources[1].publishedAt, '2026-10-17');
    assert.ok(sources.every(source => source.url.startsWith('https://')));
  } finally { settings.tavilyApiKey = original; }
});

test('search failures do not expose provider error bodies or credentials', async () => {
  const original = settings.tavilyApiKey;
  settings.tavilyApiKey = 'test-key';
  try {
    await assert.rejects(searchWeb('latest facts', undefined, async () => new Response('sensitive-provider-body', { status: 429 })), error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /HTTP 429/);
      assert.doesNotMatch(error.message, /sensitive-provider-body|test-key/);
      return true;
    });
    await assert.rejects(searchWeb('latest facts', undefined, async () => Response.json({ unexpected: true })), /unexpected result format/);
  } finally { settings.tavilyApiKey = original; }
});

test('missing search configuration makes no network request', async () => {
  const original = settings.tavilyApiKey;
  settings.tavilyApiKey = '';
  try {
    await assert.rejects(searchWeb('current facts', undefined, async () => { throw new Error('Should not fetch.'); }), /TAVILY_API_KEY/);
  } finally { settings.tavilyApiKey = original; }
});
