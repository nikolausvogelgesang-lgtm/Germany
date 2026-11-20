import test from 'node:test';
import assert from 'node:assert/strict';
import { makeScript, selectArticles, validateModelSegment } from '../src/briefing.mjs';

const article = (id, headline, text, date, language = 'en') => ({
  id, headline, text, date, dateMs: Date.parse(date), language,
  author: 'Reporter', outlet: 'Test outlet', url: `https://example.com/${id}`,
  providerCategories: [], feed: 'test.jsonl',
});

const mockOutput = (value) => ({ ok: true, json: async () => ({
  output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
  usage: { input_tokens: 1, output_tokens: 1 },
}) });
const approveClaims = (request) => mockOutput({
  verdicts: JSON.parse(request.input).claims.map((claim) => ({ id: claim.id, supported: true })),
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
  const headlineOnly = article('h', 'Oil prices fall after inventory report', 'The inventory report is expected tomorrow.', '2026-11-18T12:00:00Z');
  assert.equal(validateModelSegment({ text: 'Oil prices fell after the inventory report.', evidenceQuote: 'Oil prices fall after inventory report' }, headlineOnly), false);
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
    [article('mixed-news', 'Abendbericht: Anthropic steigt, Gold und Öl fallen', 'Anthropic und Öl.', '2026-11-18T12:02:00Z', 'de')],
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
  assert.match(result.segments[1].text, /berichtet: „/);
});

test('Dutch fallback attributes the source without duplicate punctuation', async () => {
  const source = article('nl', 'Stijgt Brent morgen?', 'Brent blijft onzeker.', '2026-11-18T12:00:00Z', 'nl');
  const result = await makeScript([[source]], { language: 'nl', topics: ['Brent'], maxMinutes: 1 }, '2026-11-19T23:59:59Z', '');
  assert.match(result.segments[1].text, /meldt: „Stijgt Brent morgen\?”$/);
});

test('brief editions cap the live selection at three stories without reducing dataset ingestion', async () => {
  const groups = Array.from({ length: 5 }, (_, index) => [article(`story-${index}`, `Oil story ${index}`,
    `Oil story ${index} happened.`, `2026-11-18T12:0${index}:00Z`)]);
  const selected = selectArticles(groups, { language: 'en', topics: ['Oil'], depth: 'brief', maxMinutes: 2 }, '2026-11-19T23:59:59Z');
  assert.equal(selected.length, 3);
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

test('numbered evidence is retrieved from the source and an invalid index cannot create a claim', async () => {
  const source = article('source', 'Producer price report',
    'Producer prices rose 0.3% in October. The report was published on Friday.', '2026-11-18T12:00:00Z');
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, options) => {
      const request = JSON.parse(options.body);
      if (request.text.format.name === 'claim_verdicts') return approveClaims(request);
      return mockOutput({ segments: [{
        text: 'The report says producer prices rose 0.3% in October.', articleId: 'source', evidenceIndex: 0,
      }] });
    };
    const accepted = await makeScript([[source]], { language: 'en', maxMinutes: 1 }, '2026-11-19T23:59:59Z', 'fake-key');
    assert.equal(accepted.generationMode, 'source-checked-model');
    assert.equal(accepted.factCards[0].evidenceQuote, 'Producer prices rose 0.3% in October.');
    globalThis.fetch = async () => mockOutput({ segments: [{
      text: 'The report says producer prices rose 0.3% in October.', articleId: 'source', evidenceIndex: 999,
    }] });
    const rejected = await makeScript([[source]], { language: 'en', maxMinutes: 1 }, '2026-11-19T23:59:59Z', 'fake-key');
    assert.equal(rejected.generationMode, 'source-headline-fallback');
  } finally { globalThis.fetch = originalFetch; }
});

test('model sees independent outlet coverage of one selected event', async () => {
  const first = article('one', 'Intel faces shareholder lawsuit', 'Intel faces a shareholder lawsuit after a stock decline.', '2026-11-18T12:00:00Z');
  const second = { ...article('two', 'Intel sued by shareholders', 'Shareholders sued Intel after a stock decline.', '2026-11-18T13:00:00Z'), outlet: 'Other outlet' };
  const originalFetch = globalThis.fetch;
  let sent;
  try {
    globalThis.fetch = async (_url, options) => {
      const request = JSON.parse(options.body);
      if (request.text.format.name === 'claim_verdicts') return approveClaims(request);
      sent = request;
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
    globalThis.fetch = async (_url, options) => {
      const request = JSON.parse(options.body);
      if (request.text.format.name === 'claim_verdicts') return approveClaims(request);
      return mockOutput({ segments: [{
        text: calls++ ? 'In October, producer prices rose 0.3% according to the report.' : 'The report says producer prices rose 0.3% in October.',
        articleId: 'stable', evidenceQuote: 'Producer prices rose 0.3% in October.',
      }] });
    };
    const first = await makeScript([[source]], { language: 'en', maxMinutes: 1 }, '2026-11-19T23:59:59Z', 'fake-key');
    const second = await makeScript([[source]], { language: 'en', maxMinutes: 1 }, '2026-11-19T23:59:59Z', 'fake-key');
    assert.equal(first.factCards[0].factId, second.factCards[0].factId);
    assert.equal(first.segments[1].factIds[0], first.factCards[0].factId);
  } finally { globalThis.fetch = originalFetch; }
});

test('German energy output rejects unrelated, English and copied passages', () => {
  const passage = 'Die Ölpreise fielen um mehr als 2%, nachdem die US-Rohölbestände gestiegen waren und Händler wegen des zusätzlichen Angebots ihre Erwartungen für den Winter angepasst hatten.';
  const source = article('energy', 'Brent-Öl fällt', passage, '2026-11-18T12:00:00Z', 'de');
  const listener = { language: 'de', topics: ['Energie', 'Öl'] };
  assert.equal(validateModelSegment({ text: 'Anthropic bereitet wegen starker Nachfrage seinen Börsengang vor.', evidenceQuote: 'Die Ölpreise fielen um mehr als 2%' }, source, listener), false);
  assert.equal(validateModelSegment({ text: 'Oil prices fell after the US crude inventories rose sharply.', evidenceQuote: 'Die Ölpreise fielen um mehr als 2%' }, source, listener), false);
  assert.equal(validateModelSegment({ text: passage, evidenceQuote: passage }, source, listener), false);
  const fxPassage = 'AUD/JPY extended its decline on Tuesday, trading around 107.33 after breaking below key Fibonacci projection level at 107.63.';
  const fx = article('fx-passage', 'AUD/JPY declines', fxPassage, '2026-11-18T12:00:00Z');
  assert.equal(validateModelSegment({ text: fxPassage, evidenceQuote: fxPassage }, fx), false);
});

test('a short quote cannot support a long market explanation or English Dutch output', () => {
  const source = article('uup', 'Dollar fund update', 'The fund just hit a 52-week high as hawkish Fed comments reinforced expectations of rate hikes.', '2026-11-18T12:00:00Z');
  assert.equal(validateModelSegment({ text: 'Zacks says the dollar fund hit a 52-week high as hawkish Fed comments reinforced expectations of further interest rate hikes.', evidenceQuote: 'The fund just hit a 52-week high' }, source), false);
  const dutchSource = article('baidu', 'Baidu AI cloud', 'Revenues increased 94% year over year to RMB 8.2 billion.', '2026-11-18T12:00:00Z', 'nl');
  assert.equal(validateModelSegment({ text: 'Baidu revenues increased 94% year over year, but advertising will remain under pressure.', evidenceQuote: 'Revenues increased 94% year over year to RMB 8.2 billion.' }, dutchSource, { language: 'nl', topics: ['AI'] }), false);
});

test('a cited passage must contain a specific AI infrastructure detail spoken aloud', () => {
  const passage = 'SpaceX heeft plannen voor AI-infrastructuur in Texas. Citi ziet SpaceX zijn eigen mobiele netwerk opbouwen als het wil concurreren met gevestigde operators.';
  const source = article('spacex', 'SpaceX en AI', passage, '2026-11-18T12:00:00Z', 'nl');
  const listener = { language: 'nl', topics: ['AI', 'cloud'] };
  assert.equal(validateModelSegment({
    text: 'Volgens Citi heeft SpaceX plannen voor AI-infrastructuur en een eigen mobiel netwerk.',
    evidenceQuote: 'Citi ziet SpaceX zijn eigen mobiele netwerk opbouwen als het wil concurreren met gevestigde operators.',
  }, source, listener), false);
  assert.equal(validateModelSegment({
    text: 'SpaceX heeft volgens het bericht plannen voor AI-infrastructuur in Texas.',
    evidenceQuote: 'SpaceX heeft plannen voor AI-infrastructuur in Texas.',
  }, source, listener), true);
});

test('an unsupported claim is removed before the script can be called source checked', async () => {
  const first = article('fx', 'Euro falls', 'The euro fell against the dollar.', '2026-11-18T12:00:00Z');
  const second = article('ai', 'Cloud grows', 'AI cloud revenue grew rapidly this year.', '2026-11-18T12:01:00Z');
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, options) => {
      const request = JSON.parse(options.body);
      if (request.text.format.name === 'claim_verdicts') {
        return mockOutput({ verdicts: JSON.parse(request.input).claims.map((claim, index) => ({ id: claim.id, supported: index === 0 })) });
      }
      return mockOutput({ segments: [
        { text: 'The euro fell against the dollar.', articleId: 'fx', evidenceQuote: 'The euro fell against the dollar.' },
        { text: 'AI cloud revenue grew rapidly this year.', articleId: 'ai', evidenceQuote: 'AI cloud revenue grew rapidly this year.' },
      ] });
    };
    const result = await makeScript([[first], [second]], { language: 'en', topics: [], maxMinutes: 2 }, '2026-11-19T23:59:59Z', 'fake-key');
    assert.equal(result.generationMode, 'source-headline-fallback');
    assert.match(result.modelStatus, /unsupported_claim/);
    const byArticle = new Map(result.segments.slice(1).map((segment) => [segment.sources[0].articleId, segment.text]));
    assert.equal(byArticle.get('fx'), 'The euro fell against the dollar.');
    assert.match(byArticle.get('ai'), /^Test outlet reports: “Cloud grows\.”$/);
  } finally { globalThis.fetch = originalFetch; }
});

test('a successful retry reports generator and verifier tokens from both attempts', async () => {
  const first = article('fx', 'Euro falls', 'The euro fell against the dollar.', '2026-11-18T12:00:00Z');
  const second = article('ai', 'Cloud grows', 'AI cloud revenue grew rapidly this year.', '2026-11-18T12:01:00Z');
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  const requestedModels = [];
  try {
    globalThis.fetch = async (_url, options) => {
      const request = JSON.parse(options.body);
      if (request.text.format.name === 'claim_verdicts') return approveClaims(request);
      requestedModels.push(request.model);
      attempts++;
      const segments = [{ text: 'The euro fell against the dollar.', articleId: 'fx', evidenceQuote: 'The euro fell against the dollar.' }];
      if (attempts === 2) segments.push({ text: 'AI cloud revenue grew rapidly this year.', articleId: 'ai', evidenceQuote: 'AI cloud revenue grew rapidly this year.' });
      return mockOutput({ segments });
    };
    const result = await makeScript([[first], [second]], { language: 'en', topics: [], maxMinutes: 2 }, '2026-11-19T23:59:59Z', 'fake-key');
    assert.equal(result.generationMode, 'source-checked-model');
    assert.equal(attempts, 2);
    assert.deepEqual(requestedModels, [process.env.OPENAI_MODEL || 'gpt-5.4-mini', process.env.OPENAI_REPAIR_MODEL || 'gpt-5.4']);
    assert.deepEqual(result.usage, {
      modelInputTokens: 4, modelOutputTokens: 4,
      verifierInputTokens: 2, verifierOutputTokens: 2,
      repairInputTokens: 1, repairOutputTokens: 1,
    });
  } finally { globalThis.fetch = originalFetch; }
});

test('model keeps one verified segment per event', async () => {
  const first = article('one', 'Brent crude falls', 'Brent crude fell after inventory data.', '2026-11-18T12:00:00Z');
  const second = article('two', 'Oil prices stay weak', 'Oil prices stayed weak despite supply risks.', '2026-11-18T11:00:00Z');
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, options) => {
      const request = JSON.parse(options.body);
      if (request.text.format.name === 'claim_verdicts') return approveClaims(request);
      return mockOutput({ segments: [
        { text: 'Brent crude fell after inventory data.', articleId: 'one', evidenceQuote: 'Brent crude fell after inventory data.' },
        { text: 'Brent crude fell after inventory data again.', articleId: 'one', evidenceQuote: 'Brent crude fell after inventory data.' },
        { text: 'Oil prices stayed weak despite supply risks.', articleId: 'two', evidenceQuote: 'Oil prices stayed weak despite supply risks.' },
      ] });
    };
    const result = await makeScript([[first], [second]], { language: 'en', topics: [], maxMinutes: 2 }, '2026-11-19T23:59:59Z', 'fake-key');
    assert.equal(result.generationMode, 'source-checked-model');
    assert.equal(result.factCards.length, 2);
  } finally { globalThis.fetch = originalFetch; }
});
