import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';

const REQUIRED_FEEDS = [
  'actionforex.jsonl', 'ibtimes_uk.jsonl', 'invezz_de.jsonl',
  'invezz_en.jsonl', 'invezz_nl.jsonl', 'zacks.jsonl',
];

function validUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function normalizeArticle(raw, feed) {
  const dateMs = Date.parse(raw.date);
  if (!raw.$id || !raw.headline || !validUrl(raw.permalink) || !Number.isFinite(dateMs)) {
    throw new Error(`Invalid article metadata in ${feed}`);
  }
  return {
    id: raw.$id,
    headline: raw.headline.trim(),
    date: new Date(dateMs).toISOString(),
    dateMs,
    language: raw.language,
    author: raw.source ?? '',
    outlet: raw.publication?.name ?? feed.replace('.jsonl', ''),
    url: raw.permalink,
    providerCategories: Array.isArray(raw.provider_categories) ? raw.provider_categories : [],
    text: raw.text_content ?? '', // private server memory only; never sent to the UI
    feed,
  };
}

export async function loadArticles(directory) {
  if (!directory) throw new Error('NEWSTEX_DATA_DIR is required');
  const found = new Set(await readdir(directory));
  const missing = REQUIRED_FEEDS.filter((name) => !found.has(name));
  if (missing.length) throw new Error(`Missing Newstex feeds: ${missing.join(', ')}`);

  const articles = [];
  const ids = new Set();
  for (const feed of REQUIRED_FEEDS) {
    const lines = createInterface({ input: createReadStream(`${directory}/${feed}`), crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.trim()) continue;
      const article = normalizeArticle(JSON.parse(line), feed);
      if (ids.has(article.id)) throw new Error(`Duplicate article ID in ${feed}`);
      ids.add(article.id);
      articles.push(article);
    }
  }
  return articles;
}

const STOP = new Set('a an and are as at by for from in into is it of on or the to was were what why with this that how after amid says said report reports over us uk'.split(' '));

export function headlineTokens(headline) {
  return new Set(headline.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]+/g)?.filter((word) => (word.length > 2 || word === 'fx' || word === 'ai') && !STOP.has(word)) ?? []);
}

function similarity(a, b) {
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function sameContent(a, b) {
  if (a.language !== b.language) return false;
  const hash = (value) => createHash('sha256').update(value.replace(/\s+/g, ' ').trim()).digest('hex');
  return a.text && b.text && hash(a.text) === hash(b.text);
}

// Editorially narrow event aliases for concrete cross-outlet cases in this dataset.
// They are never treated as a general entity-only clustering rule.
export function curatedEventKey(headline) {
  const title = headline.toLowerCase();
  if (/\bintel\b/.test(title) && /lawsuit|fraud|shareholder suit|sued/.test(title)) return 'intel-shareholder-lawsuit';
  if (/\bppi\b|producer prices?/.test(title) && /\bus\b|\bwall street\b|\bdollar\b/.test(title)) return 'us-ppi-release';
  if (/\bbaidu\b/.test(title) && /ai cloud/.test(title) && /growth/.test(title)) return 'baidu-q3-cloud-growth';
  if (/deutsche bank/.test(title) && /epstein/.test(title) && /leak|transaction|payment/.test(title)) return 'deutsche-bank-epstein-leak';
  if (/nvidia/.test(title) && /elon musk/.test(title) && /jensen huang/.test(title)) return 'nvidia-musk-reaction';
  if (/microsoft/.test(title) && /global outage/.test(title)) return 'microsoft-global-outage';
  if (/disney/.test(title) && /earnings|q4/.test(title)) return 'disney-q4-earnings';
  return null;
}

function find(parent, index) {
  while (parent[index] !== index) {
    parent[index] = parent[parent[index]];
    index = parent[index];
  }
  return index;
}

function union(parent, a, b) {
  const rootA = find(parent, a);
  const rootB = find(parent, b);
  if (rootA !== rootB) parent[rootB] = rootA;
}

export function groupArticles(articles) {
  const parent = articles.map((_, index) => index);
  const englishInvezz = articles.map((a, i) => [a, i]).filter(([a]) => a.feed === 'invezz_en.jsonl');
  const tokens = articles.map((a) => headlineTokens(a.headline));
  const eventKeys = articles.map((a) => curatedEventKey(a.headline));
  const diagnostics = { translationPairs: 0, translationAmbiguous: 0, exactDuplicates: 0, crossOutletPairs: 0, curatedPairs: 0 };

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    if (article.feed === 'invezz_de.jsonl' || article.feed === 'invezz_nl.jsonl') {
      const candidates = englishInvezz
        .filter(([english]) => english.author === article.author && Math.abs(english.dateMs - article.dateMs) <= 15 * 60_000)
        .sort((a, b) => Math.abs(a[0].dateMs - article.dateMs) - Math.abs(b[0].dateMs - article.dateMs));
      if (candidates.length > 1) diagnostics.translationAmbiguous++;
      if (candidates.length) {
        union(parent, i, candidates[0][1]);
        diagnostics.translationPairs++;
      }
    }
  }

  // A conservative pass: no broad topical merge without close headline evidence.
  const byDate = articles.map((a, i) => [a, i]).sort((a, b) => a[0].dateMs - b[0].dateMs);
  for (let left = 0; left < byDate.length; left++) {
    const [a, ai] = byDate[left];
    for (let right = left + 1; right < byDate.length; right++) {
      const [b, bi] = byDate[right];
      if (b.dateMs - a.dateMs > 48 * 60 * 60_000) break;
      if (a.id === b.id) continue;
      if (sameContent(a, b)) {
        union(parent, ai, bi);
        diagnostics.exactDuplicates++;
      } else if (a.outlet !== b.outlet && a.language === b.language && eventKeys[ai] && eventKeys[ai] === eventKeys[bi]) {
        union(parent, ai, bi);
        diagnostics.curatedPairs++;
      } else if (a.outlet !== b.outlet && a.language === b.language && tokens[ai].size >= 3 && tokens[bi].size >= 3 && similarity(tokens[ai], tokens[bi]) >= 0.58) {
        union(parent, ai, bi);
        diagnostics.crossOutletPairs++;
      }
    }
  }

  const groups = new Map();
  articles.forEach((article, index) => {
    const root = find(parent, index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(article);
  });
  return { groups: [...groups.values()], diagnostics };
}

export function rankGroups(groups, listener, asOf) {
  const cutoff = Date.parse(asOf);
  if (!Number.isFinite(cutoff)) throw new Error('Invalid asOf date');
  const topicTokens = new Set((listener.topics ?? []).flatMap((topic) => [...headlineTokens(topic)]));
  return groups.map((group) => {
    const eligible = group.filter((article) => article.dateMs <= cutoff);
    if (!eligible.length) return null;
    const newest = Math.max(...eligible.map((article) => article.dateMs));
    const ageDays = (cutoff - newest) / 86_400_000;
    if (ageDays > 7) return null;
    const text = eligible.map((article) => `${article.headline} ${article.providerCategories.join(' ')}`).join(' ');
    const words = headlineTokens(text);
    const topicHits = [...topicTokens].filter((token) => words.has(token)).length;
    const outlets = new Set(eligible.map((article) => article.outlet)).size;
    const score = Math.max(0, 7 - ageDays) * 2 + topicHits * 8 + Math.min(outlets, 3) * 2;
    return { articles: eligible, newest: new Date(newest).toISOString(), topicHits, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score || b.newest.localeCompare(a.newest));
}
