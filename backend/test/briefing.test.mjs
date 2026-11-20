import test from 'node:test';
import assert from 'node:assert/strict';
import { makeScript, selectArticles, validateModelSegment } from '../src/briefing.mjs';

const article = (id, headline, text, date, language = 'en') => ({
  id, headline, text, date, dateMs: Date.parse(date), language,
  author: 'Reporter', outlet: 'Test outlet', url: `https://example.com/${id}`,
  providerCategories: [], feed: 'test.jsonl',
});

test('numeric claim needs the exact number in a real supporting passage', () => {
  const source = article('a', 'Producer prices rose', 'Producer prices rose 0.3% in October.', '2026-11-18T12:00:00Z');
  assert.equal(validateModelSegment({ text: 'The report says producer prices rose 0.3% in October.', evidenceQuote: 'Producer prices rose 0.3% in October.' }, source), true);
  assert.equal(validateModelSegment({ text: 'The report says producer prices rose 0.8% in October.', evidenceQuote: 'Producer prices rose 0.3% in October.' }, source), false);
  assert.equal(validateModelSegment({ text: 'The report says producer prices rose 0.3% in October.', evidenceQuote: 'A made-up passage said prices rose 0.3%.' }, source), false);
  assert.equal(validateModelSegment({ text: 'The report says producer prices rose 0.3 points in October.', evidenceQuote: 'Producer prices rose 0.3% in October.' }, source), false);
  assert.equal(validateModelSegment({ text: 'Dem Bericht zufolge stiegen die Erzeugerpreise im Oktober um 0,3 Prozent.', evidenceQuote: 'Producer prices rose 0.3% in October.' }, source), true);
  const oil = article('oil', 'Brent price update', 'Brent oil fell toward 90 $ per barrel.', '2026-11-18T12:00:00Z');
  assert.equal(validateModelSegment({ text: 'Brent oil fell toward $90 per barrel.', evidenceQuote: 'Brent oil fell toward 90 $ per barrel.' }, oil), true);
  assert.equal(validateModelSegment({ text: 'Brent oil fell toward 90 € per barrel.', evidenceQuote: 'Brent oil fell toward 90 $ per barrel.' }, oil), false);
});

test('two listener interests produce different source-backed fallback stories', async () => {
  const asOf = '2026-11-19T23:59:59Z';
  const groups = [
    [article('fx', 'Currency FX markets follow central bank decision', 'Currency markets followed the central bank decision.', '2026-11-18T12:00:00Z')],
    [article('ai', 'Nvidia AI chip announcement reaches investors', 'Nvidia announced a chip.', '2026-11-18T12:01:00Z')],
  ];
  const fx = await makeScript(groups, { language: 'en', topics: ['currency FX'], maxMinutes: 1 }, asOf, '');
  const ai = await makeScript(groups, { language: 'en', topics: ['Nvidia AI'], maxMinutes: 1 }, asOf, '');
  assert.notDeepEqual(fx.segments.flatMap((s) => s.sources.map((x) => x.articleId)), ai.segments.flatMap((s) => s.sources.map((x) => x.articleId)));
  assert.equal(fx.generationMode, 'source-headline-fallback');
});

test('energy listener skips a soybean-led mixed commodity article when oil stories exist', () => {
  const asOf = '2026-11-19T23:59:59Z';
  const groups = [
    [article('mixed', 'Sojabohnenpreis: Brent-Öl prallt von Unterstützung ab', 'Sojabohnen und Brent.', '2026-11-18T12:00:00Z', 'de')],
    [article('oil', 'Brent-Öl unter Druck wegen Lagerbeständen', 'Brent-Öl fällt.', '2026-11-18T11:00:00Z', 'de')],
  ];
  const chosen = selectArticles(groups, { language: 'de', topics: ['Energie', 'Öl'], depth: 'brief', maxMinutes: 2 }, asOf);
  assert.deepEqual(chosen.map((item) => item.id), ['oil']);
});

test('an unmatched wildcard is explicitly labelled as general news', async () => {
  const groups = [[article('fx', 'Dollar rises against the yen', 'The dollar rose.', '2026-11-18T12:00:00Z')]];
  const result = await makeScript(groups, { language: 'en', topics: ['volcanic insurance'], maxMinutes: 1 }, '2026-11-19T23:59:59Z', '');
  assert.equal(result.topicMatchStatus, 'general-fallback');
  assert.match(result.segments[0].text, /general news/);
});

test('fallback never presents English headlines as a German briefing', async () => {
  const asOf = '2026-11-19T23:59:59Z';
  const groups = [
    [article('en', 'Currency markets react to central bank', 'Currency markets reacted.', '2026-11-18T12:00:00Z')],
    [article('de', 'Deutsche Zentralbank meldet neue Entscheidung', 'Die Zentralbank meldete eine Entscheidung.', '2026-11-18T12:01:00Z', 'de')],
  ];
  const result = await makeScript(groups, { language: 'de', topics: ['currency'], maxMinutes: 1 }, asOf, '');
  assert.deepEqual(result.segments.flatMap((s) => s.sources.map((x) => x.articleId)), ['de']);
  assert.equal(result.topicMatchStatus, 'general-fallback');
});

test('model output is accepted only when its quote supports the numeric claim', async () => {
  const source = article('source', 'Producer price report published', 'Producer prices rose 0.3% in October.', '2026-11-18T12:00:00Z');
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({
      output: [{ content: [{ type: 'output_text', text: JSON.stringify({ segments: [{
        text: 'Producer prices rose 0.8% in October according to the report.',
        articleId: 'source',
        evidenceQuote: 'Producer prices rose 0.3% in October.',
      }] }) }] }],
      usage: { input_tokens: 12, output_tokens: 8 },
    }) });
    const result = await makeScript([[source]], { language: 'en', topics: [], maxMinutes: 1 }, '2026-11-19T23:59:59Z', 'fake-key');
    assert.equal(result.generationMode, 'source-headline-fallback');
    assert.equal(result.segments[1].sources[0].articleId, 'source');
  } finally { globalThis.fetch = originalFetch; }
});

test('model sees independent outlet coverage of one selected event', async () => {
  const first = article('one', 'Intel faces shareholder lawsuit', 'Intel faces a shareholder lawsuit after a stock decline.', '2026-11-18T12:00:00Z');
  const second = { ...article('two', 'Intel sued by shareholders', 'Shareholders sued Intel after a stock decline.', '2026-11-18T13:00:00Z'), outlet: 'Other outlet' };
  const originalFetch = globalThis.fetch;
  let sent;
  try {
    globalThis.fetch = async (_url, options) => {
      sent = JSON.parse(options.body);
      return { ok: true, json: async () => ({
        output: [{ content: [{ type: 'output_text', text: JSON.stringify({ segments: [{
          text: 'Intel faces a shareholder lawsuit after a stock decline.',
          articleId: 'one', evidenceQuote: 'Intel faces a shareholder lawsuit after a stock decline.',
        }] }) }] }], usage: { input_tokens: 12, output_tokens: 8 },
      }) };
    };
    const result = await makeScript([[first, second]], { language: 'en', topics: [], maxMinutes: 1 }, '2026-11-19T23:59:59Z', 'fake-key');
    assert.equal(result.generationMode, 'source-checked-model');
    assert.deepEqual(JSON.parse(sent.input).articles.map((item) => item.articleId).sort(), ['one', 'two']);
  } finally { globalThis.fetch = originalFetch; }
});

test('a fact keeps its ID when spoken wording changes but evidence stays the same', async () => {
  const source = article('stable', 'Producer prices rose 0.3%', 'Producer prices rose 0.3% in October.', '2026-11-18T12:00:00Z');
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({
      output: [{ content: [{ type: 'output_text', text: JSON.stringify({ segments: [{
        text: calls++ ? 'In October, producer prices rose 0.3% according to the report.' : 'The report says producer prices rose 0.3% in October.',
        articleId: 'stable', evidenceQuote: 'Producer prices rose 0.3% in October.',
      }] }) }] }], usage: { input_tokens: 1, output_tokens: 1 },
    }) });
    const first = await makeScript([[source]], { language: 'en', maxMinutes: 1 }, '2026-11-19T23:59:59Z', 'fake-key');
    const second = await makeScript([[source]], { language: 'en', maxMinutes: 1 }, '2026-11-19T23:59:59Z', 'fake-key');
    assert.equal(first.factCards[0].factId, second.factCards[0].factId);
    assert.equal(first.segments[1].factIds[0], first.factCards[0].factId);
  } finally { globalThis.fetch = originalFetch; }
});
