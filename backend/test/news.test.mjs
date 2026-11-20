import test from 'node:test';
import assert from 'node:assert/strict';
import { groupArticles, rankGroups } from '../src/news.mjs';

function article(id, headline, date, { feed = 'invezz_en.jsonl', author = 'Reporter', language = 'en', outlet = 'Invezz' } = {}) {
  return { id, headline, date, dateMs: Date.parse(date), feed, author, language, outlet, text: id, providerCategories: [] };
}

test('merges a close same-author translation but keeps a separate event', () => {
  const rows = [
    article('en', 'Central bank announces interest rate decision', '2026-11-18T10:00:00Z'),
    article('de', 'Zentralbank gibt Zinsentscheidung bekannt', '2026-11-18T10:05:00Z', { feed: 'invezz_de.jsonl', language: 'de' }),
    article('other', 'Central bank governor resigns after vote', '2026-11-18T10:08:00Z', { outlet: 'ActionForex', feed: 'actionforex.jsonl' }),
  ];
  const result = groupArticles(rows);
  assert.equal(result.groups.length, 2);
  assert.equal(result.diagnostics.translationPairs, 1);
});

test('old context cannot become a current briefing and future news is excluded', () => {
  const rows = [
    article('old', 'Long term stock performance', '2026-07-28T10:00:00Z', { feed: 'zacks.jsonl', outlet: 'Zacks' }),
    article('today', 'Currency market responds to central bank', '2026-11-18T10:00:00Z'),
    article('future', 'Future story should not appear', '2026-11-20T10:00:00Z'),
  ];
  const ranked = rankGroups(groupArticles(rows).groups, { topics: ['currency market'] }, '2026-11-19T23:59:59Z');
  assert.deepEqual(ranked.flatMap((group) => group.articles.map((a) => a.id)), ['today']);
});

test('editorial event aliases join cross-outlet reports without merging unrelated Intel news', () => {
  const rows = [
    article('lawsuit-a', 'Intel faces shareholder fraud lawsuit', '2026-11-16T10:00:00Z', { outlet: 'Invezz' }),
    article('lawsuit-b', 'Intel hit with shareholder lawsuit after stock decline', '2026-11-16T12:00:00Z', { outlet: 'IBTimes', feed: 'ibtimes_uk.jsonl' }),
    article('other-intel', 'Intel announces new PC chip', '2026-11-16T13:00:00Z', { outlet: 'IBTimes', feed: 'ibtimes_uk.jsonl' }),
  ];
  const { groups, diagnostics } = groupArticles(rows);
  assert.equal(groups.length, 2);
  assert.equal(diagnostics.curatedPairs, 1);
});

test('groups the Musk return campaign across outlets but not a separate Nvidia leadership story', () => {
  const rows = [
    article('petition', 'Elon Musk Joins Petition To Reinstate Jensen Huang', '2026-11-14T18:50:00Z', { outlet: 'IBTimes', feed: 'ibtimes_uk.jsonl' }),
    article('campaign', 'Nvidia stock faces a new Jensen Huang crisis as Elon Musk enters the fight', '2026-11-16T07:16:00Z'),
    article('board', 'Nvidia board rules out Huang return', '2026-11-16T19:40:00Z'),
  ];
  const { groups } = groupArticles(rows);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.find((group) => group.length === 2).map((item) => item.id).sort(), ['campaign', 'petition']);
});

test('FX listener does not mistake ordinary bank outages for central-bank news', () => {
  const rows = [
    article('outage', 'Chase bank users report login outage', '2026-11-18T12:00:00Z'),
    article('brand', 'Family Dollar reports settlement', '2026-11-18T11:30:00Z'),
    article('valuation', 'SpaceX billion-dollar forecast emerges', '2026-11-18T11:15:00Z'),
    article('fx', 'Dollar and euro currencies react to rate decision', '2026-11-18T11:00:00Z'),
    article('central', 'Central bank announces interest rate decision', '2026-11-18T10:00:00Z'),
  ];
  const ranked = rankGroups(groupArticles(rows).groups, { topics: ['FX', 'central bank'] }, '2026-11-19T23:59:59Z');
  assert.equal(ranked[0].articles[0].id, 'fx');
  assert.equal(ranked[1].articles[0].id, 'central');
  assert.equal(ranked.filter((group) => group.topicHits > 0).length, 2);
});

test('German oil wildcard selects energy stories instead of unrelated IPO news', () => {
  const rows = [
    article('ipo', 'Anthropic setzt IPO-Preis bei 83 Dollar fest', '2026-11-18T12:00:00Z', { language: 'de' }),
    article('brent', 'Brent-Öl prallt von Unterstützung ab', '2026-11-18T11:00:00Z', { language: 'de' }),
    article('energy', 'Energiepreise steigen nach Bericht', '2026-11-18T10:00:00Z', { language: 'de' }),
  ];
  const ranked = rankGroups(groupArticles(rows).groups, { language: 'de', topics: ['Energie', 'Öl'] }, '2026-11-19T23:59:59Z');
  assert.equal(ranked.filter((group) => group.topicHits > 0).length, 2);
  assert.equal(ranked.at(-1).articles[0].id, 'ipo');
});
