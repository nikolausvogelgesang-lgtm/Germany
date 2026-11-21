import test from 'node:test';
import assert from 'node:assert/strict';
import { groups as richGroups, draft as richDraft } from '../../tests/radio-fixture.mjs';
import { makeScript, selectArticles, validateModelSegment } from '../src/briefing.mjs';

const article = (id, headline, text, date, language = 'en') => ({
  id, headline, text, date, dateMs: Date.parse(date), language,
  author: 'Reporter', outlet: 'Test outlet', url: `https://example.com/${id}`,
  providerCategories: [], feed: 'test.jsonl',
});

const mockOutput = (value) => ({ ok: true, headers:new Headers({'content-type':'application/json'}), json: async () => ({status:'completed',
  output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
  usage: { input_tokens: 1, output_tokens: 1 },
}) });
const approveClaims = (request) => mockOutput({
  verdicts: JSON.parse(request.input).claims.map((claim) => ({ id: claim.id, supported: true, reason:'ok' })),
});

test('numeric claim needs the exact number in a real supporting passage', () => {
  const source = article('a', 'Producer prices rose', 'Producer prices rose 0.3% in October.', '2026-11-18T12:00:00Z');
  assert.equal(validateModelSegment({ text: 'In October the increase in producer prices was 0.3%.', evidenceQuote: 'Producer prices rose 0.3% in October.' }, source), true);
  assert.equal(validateModelSegment({ text: 'The report says producer prices rose 0.8% in October.', evidenceQuote: 'Producer prices rose 0.3% in October.' }, source), false);
  assert.equal(validateModelSegment({ text: 'In October the increase in producer prices was 0.3%.', evidenceQuote: 'A made-up passage said prices rose 0.3%.' }, source), false);
  assert.equal(validateModelSegment({ text: 'The report says producer prices rose 0.3 points in October.', evidenceQuote: 'Producer prices rose 0.3% in October.' }, source), false);
  assert.equal(validateModelSegment({ text: 'Dem Bericht zufolge stiegen die Erzeugerpreise im Oktober um 0,3 Prozent.', evidenceQuote: 'Producer prices rose 0.3% in October.' }, source), true);
  const oil = article('oil', 'Brent price update', 'Brent oil fell toward 90 $ per barrel.', '2026-11-18T12:00:00Z');
  assert.equal(validateModelSegment({ text: 'A barrel of Brent oil moved down toward $90.', evidenceQuote: 'Brent oil fell toward 90 $ per barrel.' }, oil), true);
  assert.equal(validateModelSegment({ text: 'A barrel of Brent oil moved down toward 90 €.', evidenceQuote: 'Brent oil fell toward 90 $ per barrel.' }, oil), false);
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

test('an unmatched wildcard stops rather than spending money on general news',async()=>{
  const groups=[[article('fx','Dollar rises against the yen','The dollar rose.','2026-11-18T12:00:00Z')]];
  await assert.rejects(makeScript(groups,{language:'en',topics:['volcanic insurance'],maxMinutes:1},'2026-11-19T23:59:59Z',''),
    e=>e.diagnostics.fallbackReason==='no_matching_topics');
});

test('missing native fallback does not substitute an unrelated German headline', async()=>{
  const groups=[[article('en','Currency markets react to central bank','A currency auction opened.','2026-11-18T12:00:00Z')],
    [article('de','Deutsches Kino öffnet wieder','Das Kino teilte es mit.','2026-11-18T12:01:00Z','de')]];
  await assert.rejects(makeScript(groups,{language:'de',topics:['currency'],maxMinutes:1},'2026-11-19T23:59:59Z',''),/No de source headlines/);
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
    globalThis.fetch = async () => ({ ok: true, headers:new Headers({'content-type':'application/json'}), json: async () => ({status:'completed',
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
        text: 'In October the increase in producer prices was 0.3%.', articleId: 'source', evidenceIndex: 0,
      }] });
    };
    const accepted = await makeScript([[source]], { language: 'en', maxMinutes: 1 }, '2026-11-19T23:59:59Z', 'fake-key');
    assert.equal(accepted.qualityStatus, 'insufficient_verified_content'); // independently checked, not a substantive edition
    assert.equal(accepted.diagnostics.finalVerifiedSentences,1);
    assert.equal(accepted.factCards[0].evidenceQuote, 'Producer prices rose 0.3% in October.');
    globalThis.fetch = async () => mockOutput({ segments: [{
      text: 'In October the increase in producer prices was 0.3%.', articleId: 'source', evidenceIndex: 999,
    }] });
    const rejected = await makeScript([[source]], { language: 'en', maxMinutes: 1 }, '2026-11-19T23:59:59Z', 'fake-key');
    assert.equal(rejected.generationMode, 'source-headline-fallback');
    assert.equal(rejected.diagnostics.finalVerifiedWords,0);
    assert.equal(rejected.diagnostics.rejected.invalid_evidence_reference,1);
  } finally { globalThis.fetch = originalFetch; }
});

test('model sees independent outlet coverage of one selected event', async () => {
  const first = article('one', 'Intel faces shareholder lawsuit', 'A filing says Intel must respond within 30 days of the shareholder lawsuit.', '2026-11-18T12:00:00Z');
  const second = { ...article('two', 'Intel sued by shareholders', 'Shareholders sued Intel after a stock decline.', '2026-11-18T13:00:00Z'), outlet: 'Other outlet' };
  const originalFetch = globalThis.fetch;
  let sent;
  try {
    globalThis.fetch = async (_url, options) => {
      const request = JSON.parse(options.body);
      if (request.text.format.name === 'claim_verdicts') return approveClaims(request);
      sent = request;
      return { ok: true, headers:new Headers({'content-type':'application/json'}), json: async () => ({status:'completed',
        output: [{ content: [{ type: 'output_text', text: JSON.stringify({ segments: [{
          text: 'The filing gives Intel 30 days to respond to the shareholder lawsuit.',
          articleId: 'one', evidenceQuote: 'A filing says Intel must respond within 30 days of the shareholder lawsuit.',
        }] }) }] }], usage: { input_tokens: 12, output_tokens: 8 },
      }) };
    };
    const result = await makeScript([[first, second]], { language: 'en', topics: [], maxMinutes: 1 }, '2026-11-19T23:59:59Z', 'fake-key');
    assert.equal(result.qualityStatus,'insufficient_verified_content');
    assert.equal(result.factCards[0].articleId,'one');
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
        text: calls++ ? 'The rise in October producer prices came to 0.3%.' : 'In October the increase in producer prices was 0.3%.',
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
  const fxPassage = 'In the fictional currency exercise, the example exchange rate slipped to 2.35 as participants settled their trades on the last afternoon.';
  const fx = article('fx-passage', 'AUD/JPY declines', fxPassage, '2026-11-18T12:00:00Z');
  assert.equal(validateModelSegment({ text: fxPassage, evidenceQuote: fxPassage }, fx), false);
});

test('a short quote cannot support a long market explanation or English Dutch output', () => {
  const source = article('uup', 'Dollar fund update', 'The fund just hit a 52-week high during the exercise, according to the fictional test ledger.', '2026-11-18T12:00:00Z');
  assert.equal(validateModelSegment({ text: 'Zacks says the dollar fund hit a 52-week high as hawkish Fed comments reinforced expectations of further interest rate hikes.', evidenceQuote: 'The fund just hit a 52-week high' }, source), false);
  const dutchSource = article('baidu', 'Baidu AI cloud', 'In this classroom exercise revenues increased 31% year over year.', '2026-11-18T12:00:00Z', 'nl');
  assert.equal(validateModelSegment({ text: 'Test revenues increased 31% year over year, but advertising will remain under pressure.', evidenceQuote: 'In this classroom exercise revenues increased 31% year over year.' }, dutchSource, { language: 'nl', topics: ['AI'] }), false);
});

test('a cited passage must contain a specific AI infrastructure detail spoken aloud', () => {
  const passage = 'Delta Testgroep bespreekt AI-infrastructuur voor een fictief laboratorium. Volgens de oefening overweegt Delta Testgroep de aanleg van een eigen mobiel netwerk.';
  const source = article('spacex', 'SpaceX en AI', passage, '2026-11-18T12:00:00Z', 'nl');
  const listener = { language: 'nl', topics: ['AI', 'cloud'] };
  assert.equal(validateModelSegment({
    text: 'Delta Testgroep overweegt AI-infrastructuur naast een eigen mobiel netwerk.',
    evidenceQuote: 'Volgens de oefening overweegt Delta Testgroep de aanleg van een eigen mobiel netwerk.',
  }, source, listener), false);
  assert.equal(validateModelSegment({
    text: 'Het plan voor het fictieve lab gaat over AI-infrastructuur bij Delta Testgroep.',
    evidenceQuote: 'Delta Testgroep bespreekt AI-infrastructuur voor een fictief laboratorium.',
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
        return mockOutput({ verdicts: JSON.parse(request.input).claims.map((claim, index) => ({ id: claim.id, supported: index === 0, reason:index === 0 ? 'ok' : 'unsupported_claim' })) });
      }
      return mockOutput({ segments: [
        { text: 'Against the dollar, the euro lost ground.', articleId: 'fx', evidenceQuote: 'The euro fell against the dollar.' },
        { text: 'This year brought rapid growth in AI cloud revenue.', articleId: 'ai', evidenceQuote: 'AI cloud revenue grew rapidly this year.' },
      ] });
    };
    const result = await makeScript([[first], [second]], { language: 'en', topics: [], maxMinutes: 2 }, '2026-11-19T23:59:59Z', 'fake-key');
    assert.equal(result.generationMode, 'source-headline-fallback');
    assert.match(result.modelStatus, /unsupported_claim/);
    const byArticle = new Map(result.segments.slice(1).map((segment) => [segment.sources[0].articleId, segment.text]));
    assert.equal(byArticle.get('fx'), 'Against the dollar, the euro lost ground.');
    assert.match(byArticle.get('ai'), /^Headline only\. Test outlet reports: “Cloud grows\.”$/);
  } finally { globalThis.fetch = originalFetch; }
});

test('a successful retry reports generator and verifier tokens from both attempts', async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  const requestedModels = [];
  try {
    globalThis.fetch = async (_url, options) => {
      const request = JSON.parse(options.body);
      if (request.text.format.name === 'claim_verdicts') return approveClaims(request);
      requestedModels.push(request.model);
      attempts++;
      const offered=JSON.parse(request.input).articles;
      const segments=richDraft.filter(c=>offered.some(a=>a.articleId===c.articleId && a.passages.some(p=>p.evidenceIndex===c.evidenceIndex)));
      return mockOutput({segments:attempts===1?segments.filter(c=>c.articleId==='harbour'):segments});
    };
    const result = await makeScript(richGroups, {language:'en',maxMinutes:3}, '2026-11-19T23:59:59Z', 'fake-key');
    assert.equal(result.generationMode, 'source-checked-model');
    assert.equal(attempts, 2);
    assert.equal(result.repairApplied, true);
    assert.deepEqual(requestedModels, [process.env.OPENAI_MODEL || 'gpt-5.4', process.env.OPENAI_REPAIR_MODEL || 'gpt-5.4']);
    assert.deepEqual(result.usage, {
      modelInputTokens: 4, modelOutputTokens: 4,
      verifierInputTokens: 2, verifierOutputTokens: 2,
      repairInputTokens: 1, repairOutputTokens: 1,
    });
  } finally { globalThis.fetch = originalFetch; }
});

test('model suppresses a second use of the same evidence even within a story', async () => {
  const first = article('one', 'Brent crude falls', 'Brent crude fell after inventory data.', '2026-11-18T12:00:00Z');
  const second = article('two', 'Oil prices stay weak', 'Oil prices stayed weak despite supply risks.', '2026-11-18T11:00:00Z');
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, options) => {
      const request = JSON.parse(options.body);
      if (request.text.format.name === 'claim_verdicts') return approveClaims(request);
      return mockOutput({ segments: [
        { text: 'Brent crude declined following the inventory figures.', articleId: 'one', evidenceQuote: 'Brent crude fell after inventory data.' },
        { text: 'After the inventory data Brent crude prices moved lower.', articleId: 'one', evidenceQuote: 'Brent crude fell after inventory data.' },
        { text: 'Even with supply risks, oil prices remained weak.', articleId: 'two', evidenceQuote: 'Oil prices stayed weak despite supply risks.' },
      ] });
    };
    const result = await makeScript([[first], [second]], { language: 'en', topics: [], maxMinutes: 2 }, '2026-11-19T23:59:59Z', 'fake-key');
    assert.equal(result.qualityStatus,'insufficient_verified_content');
    assert.equal(result.diagnostics.rejected.duplicate_fact,1);
    assert.equal(result.diagnostics.finalVerifiedSentences,2);
    assert.equal(result.factCards.length, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test('signed amounts, English millions and ambiguous thousands separators do not lose meaning', () => {
  for (const [original,changed] of [['-$40','$40'],['$7 million','$7'],['1,200','1.200']]) {
    const quote = `The fictional reserve balance reached ${original} in September.`;
    const source = article('amount','Synthetic reserve report',quote,'2026-11-18T12:00:00Z');
    assert.equal(validateModelSegment({text:`In September the reserve balance reached ${changed}.`,evidenceQuote:quote},source),false);
  }
});

test('scores 24/18/16/14: a fresh, supported FX event beats older sentence-rich coverage', () => {
  const asOf='2026-11-19T12:00:00Z';
  const one='The market desk published a new currency report.';
  const long=one+' The bulletin reviews the previous trading session. The desk also published its monthly comparison.';
  const groups=[19,16,15,14].map((day,i)=>[article(i?'OLDER'+i:'FRESH','FX update '+i,i?long:one,`2026-11-${day}T12:00:00Z`)]);
  groups[1].unshift({...groups[1][0],id:'thin-copy',text:one});
  const picked=selectArticles(groups,{language:'en',topics:['FX'],depth:'brief',maxMinutes:3},asOf);
  assert.deepEqual(picked.map(a=>a.id),['FRESH','OLDER1','OLDER2']);
});
