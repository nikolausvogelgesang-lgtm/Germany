import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { groupArticles, loadArticles } from '../src/news.mjs';
import { selectArticles, validateListener } from '../src/briefing.mjs';

const envPath = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

const definitions = [
  {
    updateId: 'return-campaign-2026-11-16',
    articleId: 'INVZ-10009737-01M7HKN100QWRFZXPSMS8WWFQ1',
    datePrefix: '2026-11-16',
    evidenceHash: '7ff5c4fb90d490a9d7929a6cf34e37317b6e186c6a204b87059819c2a69a28b9',
    proposedSpokenText: 'Elon Musk joined a campaign calling for Jensen Huang to return as Nvidia CEO.',
  },
  {
    updateId: 'huang-statement-2026-11-17',
    articleId: 'INVZ-10009737-01M7N83B6HGJSN8P6PRG6ZJBNJ',
    datePrefix: '2026-11-17',
    evidenceHash: '573d9554e9e757d72371186bff9e9beeea1f6078b78ba1c1b167d06109f5cbb3',
    proposedSpokenText: 'The next day, Huang said he would be willing to return as Nvidia CEO if the board decided it was in the company’s best interest.',
  },
];

const sourceArticles = await loadArticles(process.env.NEWSTEX_DATA_DIR);
const articles = new Map(sourceArticles.map((article) => [article.id, article]));
const updates = definitions.map(({ evidenceHash, datePrefix, ...definition }) => {
  const article = articles.get(definition.articleId);
  if (!article || !article.date.startsWith(datePrefix)) throw new Error(`Missing or incorrectly dated source: ${definition.updateId}`);
  const firstSentence = article.text.match(/^[^.!?]+[.!?]/)?.[0]?.trim();
  if (!firstSentence || createHash('sha256').update(firstSentence).digest('hex') !== evidenceHash) {
    throw new Error(`Candidate evidence changed: ${definition.updateId}`);
  }
  return {
    storyId: 'nvidia-huang-return',
    updateId: definition.updateId,
    articleId: article.id,
    publishedAt: article.date,
    sourceUrl: article.url,
    sourceHeadline: article.headline,
    evidenceQuote: firstSentence,
    proposedSpokenText: definition.proposedSpokenText,
    reviewStatus: 'needs-person-b-editorial-review',
  };
});
if (Date.parse(updates[0].publishedAt) >= Date.parse(updates[1].publishedAt)) throw new Error('Candidate updates are not chronological');

const result = {
  storyId: 'nvidia-huang-return',
  listener: { language: 'en', topics: ['Nvidia', 'Jensen Huang'], depth: 'brief', maxMinutes: 2 },
  earlierAsOf: '2026-11-16T23:59:59Z',
  laterAsOf: '2026-11-17T23:59:59Z',
  interpretation: 'A public campaign calling for Huang’s return followed by Huang’s own conditional statement; this is a genuine new development, not a correction.',
  updates,
};
if (Date.parse(updates[0].publishedAt) > Date.parse(result.earlierAsOf)
  || Date.parse(updates[1].publishedAt) <= Date.parse(result.earlierAsOf)
  || Date.parse(updates[1].publishedAt) > Date.parse(result.laterAsOf)) {
  throw new Error('Candidate updates do not match the two edition cutoffs');
}
const { groups } = groupArticles(sourceArticles);
const listener = validateListener(result.listener);
const earlierSelected = new Set(selectArticles(groups, listener, result.earlierAsOf).map((article) => article.id));
const laterSelected = new Set(selectArticles(groups, listener, result.laterAsOf).map((article) => article.id));
if (!earlierSelected.has(updates[0].articleId) || earlierSelected.has(updates[1].articleId)
  || !laterSelected.has(updates[1].articleId)) {
  throw new Error('Candidate updates are not present in the expected listener editions');
}
result.selectionProof = {
  earlierArticleIds: [...earlierSelected],
  laterArticleIds: [...laterSelected],
};
const output = new URL('../../generated/memory-candidate.json', import.meta.url);
await mkdir(new URL('../../generated/', import.meta.url), { recursive: true });
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ storyId: result.storyId, earlierAsOf: result.earlierAsOf, laterAsOf: result.laterAsOf,
  updates: updates.map(({ updateId, articleId, publishedAt, sourceUrl, reviewStatus }) => ({ updateId, articleId, publishedAt, sourceUrl, reviewStatus })),
  privateReviewFile: fileURLToPath(output) }, null, 2));
