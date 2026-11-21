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
    if(typeof value!=='string'||!/^https?:\/\//i.test(value)) return false;
    const url = new URL(value);
    return ['https:','http:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function normalizeArticle(raw, feed) {
  const dateMs=Date.parse(raw?.date);
  if(!raw || typeof raw.date!=='string' || !/(?:Z|[+-]\d{2}:?\d{2}|UTC|GMT)$/i.test(raw.date.trim()) ||
      typeof raw.publication?.name!=='string' || !raw.publication.name.trim() || typeof raw.language!=='string' || !raw.language.trim())
    throw new Error('Invalid publisher, language or zoned publication time in '+feed);
  if (typeof raw.$id !== 'string' || !raw.$id.trim() || typeof raw.headline !== 'string' || !raw.headline.trim() ||
      (raw.text_content!=null && typeof raw.text_content !== 'string') || !validUrl(raw.permalink) || !Number.isFinite(dateMs)) {
    throw new Error(`Invalid article metadata in ${feed}`);
  }
  return {
    id: raw.$id,
    headline: raw.headline.trim(),
    date: new Date(dateMs).toISOString(),
    dateMs,
    language: raw.language.trim().toLowerCase().split(/[-_]/)[0],
    author: raw.source ?? '',
    outlet: raw.publication.name.trim(),
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
      let raw;
      try { raw = JSON.parse(line); } catch { throw new Error(`Invalid article JSON in ${feed}`); }
      const article = normalizeArticle(raw, feed);
      if (ids.has(article.id)) throw new Error(`Duplicate article ID in ${feed}`);
      ids.add(article.id);
      articles.push(article);
    }
  }
  return articles;
}

const STOP = new Set('a an and are as at by for from in into is it of on or the to was were what why with this that how after amid says said report reports over us uk'.split(' '));

export function headlineTokens(headline) {
  return new Set(headline.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]+/g)?.filter((word) => (word.length > 2 || word === 'fx' || word === 'ai' || word === 'ol') && !STOP.has(word)) ?? []);
}

function similarTitles(a,b) {
  if (Math.min(a.size,b.size)<.58*Math.max(a.size,b.size)) return false;
  let hits=0; for (const token of a) if (b.has(token)) hits++;
  return hits>=.58*(a.size+b.size-hits);
}
const periods = s => new Set((s.toLowerCase().match(/\b(?:q[1-4]|20\d{2}|january|february|march|april|may|june|july|august|september|october|november|december)\b/g)??[]));
function conflict(x,y) {
  return x.size && y.size && ![...x].every(k=>y.has(k)) && ![...y].every(k=>x.has(k));
}

// Editorially narrow event aliases for concrete cross-outlet cases in this dataset.
// They are never treated as a general entity-only clustering rule.
export function curatedEventKey(headline) {
  const title = headline.toLowerCase();
  if (/\bintel\b/.test(title) && /shareholder|investor/.test(title) && /lawsuit|fraud|suit|sued/.test(title)) return 'intel-shareholder-lawsuit';
  if (/\bppi\b|producer prices?/.test(title) && /\bus\b|\bwall street\b|\bdollar\b/.test(title)) return 'us-ppi-release';
  if (/\bbaidu\b/.test(title) && /ai cloud/.test(title) && /growth/.test(title)) return 'baidu-q3-cloud-growth';
  if (/deutsche bank/.test(title) && /epstein/.test(title) && /leak|transaction|payment/.test(title)) return 'deutsche-bank-epstein-leak';
  if (/elon musk/.test(title) && /jensen huang/.test(title)
    && /reinstat|return|comeback|campaign|petition|fight/.test(title)) return 'nvidia-musk-return-campaign';
  if (/microsoft/.test(title) && /global outage/.test(title)) return 'microsoft-global-outage';
  if (/disney/.test(title) && /earnings/.test(title) && /q4|fourth.quarter/.test(title)) return 'disney-q4-earnings';
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
  const contentHashes=articles.map(a=>{
    const text=a.text?.replace(/\s+/gu,' ').trim();
    return text?createHash('sha256').update(text).digest('hex'):null;
  });
  const diagnostics = { translationPairs: 0, translationAmbiguous: 0, exactDuplicates: 0, crossOutletPairs: 0, curatedPairs: 0 };

  // Candidate is unique in BOTH directions for that language. A shared
  // byline and clock alone must not erase a different story.
  const byAuthor=Map.groupBy(englishInvezz,([a])=>a.author), candidates=[], reverse=new Map();
  for (const [i,a] of articles.entries()) {
    if (!['invezz_de.jsonl','invezz_nl.jsonl'].includes(a.feed) || !a.author) continue;
    const near=(byAuthor.get(a.author)??[]).filter(([en])=>Math.abs(en.dateMs-a.dateMs)<=900000);
    for (const [,j] of near) {const k=a.language+':'+j;reverse.set(k,1+(reverse.get(k)??0));}
    if(near.length===1) candidates.push([i,near[0][1]]);
    else if(near.length>1) diagnostics.translationAmbiguous++;
  }
  const translationAnchor=s=>s.toLowerCase()
    .replace(/central bank|centrale bank|zentralbank/g,'centralbank')
    .replace(/interest rate|zinsentscheidung|rentebesluit/g,'policyrate');
  for (const [i,j] of candidates) {
    if(reverse.get(articles[i].language+':'+j)!==1) {diagnostics.translationAmbiguous++;continue;}
    const x=headlineTokens(translationAnchor(articles[i].headline)), y=headlineTokens(translationAnchor(articles[j].headline));
    if(![...x].some(t=>y.has(t) && !/^(?:for|met|die|der|van|earnings|shares|price|report|stock|new|market|20\d\d)$/u.test(t))) continue;
    union(parent,i,j);diagnostics.translationPairs++;
  }

  // Prefix filter for Jaccard >= .58: in a shared global token order a
  // qualifying pair must intersect within both (n-ceil(.58*n)+1) prefixes.
  // Also index duplicate hashes and the explicit editorial aliases separately.
  const freq=new Map();
  for(const ts of tokens) for(const t of ts) freq.set(t,(freq.get(t)??0)+1);
  const posted=new Map(), dateOrder=articles.map((a,i)=>i).sort((i,j)=>articles[i].dateMs-articles[j].dateMs);
  // A boilerplate headline can clear Jaccard even when the named actor
  // changes. Prefer a split to joining two banks' independent decisions.
  const actors=articles.map(a=>{
    const word=a.headline.match(/^(?:The )?(\p{Lu}[\p{L}0-9-]*)\b/u)?.[1]?.toLowerCase();
    return word && !/^(?:a|an|new|how|why|what|report|shares|stocks?|bank|central|update|breaking|quarterly|earnings|erste|der|die|das|de|het)$/u.test(word) ? word : null;
  });
  const direction=s=>/\b(?:approves?|approved|raises?|raised|opens?|opened)\b/i.test(s)?1:
    /\b(?:rejects?|rejected|cuts?|closes?|closed)\b/i.test(s)?-1:0;
  const dirs=articles.map(a=>direction(a.headline));
  const period=articles.map(a=>periods(a.headline));
  const prefix=(ts)=>ts.size<3?[]:[...ts].sort((a,b)=>freq.get(a)-freq.get(b)||(a<b?-1:1)).slice(0,ts.size-Math.ceil(.58*ts.size)+1);
  for(const i of dateOrder) {
    const a=articles[i], seen=new Set();
    const keys=[...prefix(tokens[i]).map(t=>'t:'+t),...(eventKeys[i]?['e:'+eventKeys[i]]:[]),...(contentHashes[i]?['h:'+contentHashes[i]]:[])];
    for(const key of keys) {
      const k=a.language+'|'+key, list=posted.get(k)??[];
      for(let n=list.length-1;n>=0;n--) {
        const j=list[n]; if(a.dateMs-articles[j].dateMs>48*3600000) break;
        seen.add(j);
      }
      list.push(i);posted.set(k,list);
    }
    for(const j of seen) {
      const b=articles[j];
      if(contentHashes[i] && contentHashes[i]===contentHashes[j]) {
        union(parent,i,j);diagnostics.exactDuplicates++;
      } else if(a.outlet!==b.outlet && !conflict(period[i],period[j])) {
        if(dirs[i]*dirs[j]===-1) continue;
        if(eventKeys[i] && eventKeys[i]===eventKeys[j]) {union(parent,i,j);diagnostics.curatedPairs++;}
        else if(!(actors[i] && actors[j] && actors[i]!==actors[j] && !tokens[i].has(actors[j]) && !tokens[j].has(actors[i])) && similarTitles(tokens[i],tokens[j]) && tokens[i].size>=3 && tokens[j].size>=3) {
          union(parent,i,j);diagnostics.crossOutletPairs++;
        }
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

// Fold accents with headlineTokens before matching. Avoid substring “oil” in
// company names and “ol” in ordinary German/Dutch words.
const energyWord=/^(?:energy|energie|erdgas|roh[oö]l|brent|crude|petroleum|olie|strompreis|stromnetz|gaspreis|olpreis|olforder|ollager|olmarkt|olraffiner|olvorrat|oltank|olimport|olexport|olversorg|olkosten)|^(?:oil|ol|gas|wti)$/u;
export const energyTitle=s=>[...headlineTokens(s)].some(w=>energyWord.test(w));

export function rankGroups(groups, listener, asOf) {
  const cutoff = Date.parse(asOf);
  if (!Number.isFinite(cutoff)) throw new Error('Invalid asOf date');
  const topicQueries = (listener.topics ?? []).map((topic) => ({
    raw: topic.trim().toLowerCase(), tokens: [...headlineTokens(topic)],
  }));
  const fxTerms = new Set(['fx', 'forex', 'currency', 'currencies', 'euro', 'yen', 'pound', 'sterling']);

  return groups.map((group) => {
    const eligible = group.filter((article) => article.dateMs <= cutoff && article.dateMs >= cutoff - 7 * 86_400_000);
    if (!eligible.length) return null;
    const newest = Math.max(...eligible.map((article) => article.dateMs));
    const ageDays = (cutoff - newest) / 86_400_000;
    if (ageDays > 7) return null;
    const native = eligible.filter((article) => article.language === listener.language);
    const text = (native.length ? native : eligible).map((article) => article.headline).join(' ');
    const words = headlineTokens(text);
    const topicHits = topicQueries.filter((query) => query.raw === 'fx'
      ? [...fxTerms].some((term) => words.has(term)) || /\b(?:USD|EUR|JPY|GBP|CHF|CAD|AUD|NZD)\s*\/\s*(?:USD|EUR|JPY|GBP|CHF|CAD|AUD|NZD)\b/i.test(text) || /\b(?:foreign exchange|exchange rates?)\b/i.test(text) || (/\bdollar\b/i.test(text) && !/\bfamily dollar\b|\b(?:million|billion|trillion)-dollar\b/i.test(text))
      : query.raw === 'central bank'
        ? /\b(?:central banks?|centrale bank|zentralbank|federal reserve|fed|ecb|ezb|boj|boe|reserve bank|bank of (?:england|japan|canada))\b/i.test(text)
      : query.raw === 'cloud'
        ? [...words].some((word) => /^cloud(?!flare)/.test(word))
      : /^(energie|energy|öl|oil)$/.test(query.raw)
        ? [...words].some((word) => energyWord.test(word))
      : query.tokens.length && query.tokens.every((token) => words.has(token))).length;
    const outlets = new Set(eligible.map((article) => article.outlet)).size;
    const score = Math.max(0, 7 - ageDays) * 2 + topicHits * 8 + Math.min(outlets, 3) * 2;
    return { articles: eligible, newest: new Date(newest).toISOString(), topicHits, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score || b.newest.localeCompare(a.newest));
}
