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
