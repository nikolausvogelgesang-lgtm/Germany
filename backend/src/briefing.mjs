import { createHash } from 'node:crypto';
import { rankGroups } from './news.mjs';

const MAX_STORIES = 4;

function factId(articleId, text) {
  return `fact-${createHash('sha256').update(`${articleId}\n${text}`).digest('hex').slice(0, 16)}`;
}

export function validateListener(listener) {
  if (!listener || typeof listener !== 'object') throw new Error('listener is required');
  const language = typeof listener.language === 'string' ? listener.language.toLowerCase() : 'en';
  if (!['en', 'de', 'nl'].includes(language)) throw new Error('language must be en, de or nl');
  const topics = Array.isArray(listener.topics) ? listener.topics.filter((x) => typeof x === 'string' && x.trim()).slice(0, 6).map((x) => x.trim().slice(0, 50)) : [];
  const depth = listener.depth === 'deep' ? 'deep' : 'brief';
  const maxMinutes = Number(listener.maxMinutes ?? 2);
  if (!Number.isFinite(maxMinutes) || maxMinutes < 0.5 || maxMinutes > 10) throw new Error('maxMinutes must be between 0.5 and 10');
  const heardFactIds = Array.isArray(listener.heardFactIds) ? listener.heardFactIds.filter((x) => typeof x === 'string').slice(0, 100) : [];
  return { language, topics, depth, maxMinutes, heardFactIds };
}

export function selectArticles(groups, listener, asOf, { nativeOnly = false } = {}) {
  const ranked = rankGroups(groups, listener, asOf);
  const available = nativeOnly ? ranked.filter((item) => item.articles.some((article) => article.language === listener.language)) : ranked;
  const relevant = listener.topics.length && available.some((item) => item.topicHits > 0)
    ? available.filter((item) => item.topicHits > 0)
    : available;
  const maximum = Math.min(MAX_STORIES, Math.max(2, Math.ceil(listener.maxMinutes * (listener.depth === 'deep' ? 1.1 : 1.8))));
  return relevant.slice(0, maximum).map((group) => group.articles
    .slice()
    .sort((a, b) => Number(b.language === listener.language) - Number(a.language === listener.language) || b.dateMs - a.dateMs || a.id.localeCompare(b.id))[0]);
}

function addIndependentCoverage(groups, primaries, asOf) {
  const cutoff = Date.parse(asOf);
  const selected = [];
  for (const primary of primaries) {
    selected.push(primary);
    const group = groups.find((items) => items.some((item) => item.id === primary.id));
    const secondary = group?.filter((item) => item.outlet !== primary.outlet && item.dateMs <= cutoff)
      .sort((a, b) => b.dateMs - a.dateMs)[0];
    if (secondary) selected.push(secondary);
  }
  return selected;
}

const NUMBER = /(?<![a-z0-9])[$€£]?\d+(?:[.,]\d+)*(?:\s?(?:%|percent|percentage points?|basis points?|million|billion|trillion))?/gi;
const normalized = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim();
const numericExpressions = (text) => (text.match(NUMBER) ?? []).map((value) => normalized(value).replace(/\s*%$/, ' percent'));

export function validateModelSegment(candidate, article) {
  if (!candidate || typeof candidate.text !== 'string' || typeof candidate.evidenceQuote !== 'string') return false;
  const claim = candidate.text.trim();
  const quote = candidate.evidenceQuote.trim();
  if (claim.length < 20 || claim.length > 280 || quote.length < 12 || quote.length > 250) return false;
  if (!normalized(article.text).includes(normalized(quote))) return false;
  const claimNumbers = numericExpressions(claim);
  const quoteNumbers = new Set(numericExpressions(quote));
  return claimNumbers.every((number) => quoteNumbers.has(number));
}

async function modelSegments(articles, listener, asOf, apiKey) {
  const source = articles.map((article) => ({
    articleId: article.id,
    outlet: article.outlet,
    headline: article.headline,
    date: article.date,
    passage: article.text.slice(0, 1800),
  }));
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      instructions: 'Write a short financial news audio briefing in the listener language. Use only the supplied source passages. Articles about the same event may come from different outlets; merge duplicate coverage. If outlets genuinely disagree, give separate attributed sentences rather than inventing a resolution. One concise factual sentence per segment. Every segment must name one articleId and copy a short exact evidence quote from that article passage. Keep every number, unit, entity and time period exact. Attribute uncertain reports. No investment advice. Do not copy whole sentences from articles into the spoken text. Return JSON only.',
      input: JSON.stringify({ listener: { language: listener.language, topics: listener.topics, depth: listener.depth, maxMinutes: listener.maxMinutes }, asOf, articles: source }),
      text: { format: { type: 'json_schema', name: 'briefing_segments', strict: true, schema: {
        type: 'object', additionalProperties: false, required: ['segments'],
        properties: { segments: { type: 'array', items: {
          type: 'object', additionalProperties: false, required: ['text', 'articleId', 'evidenceQuote'],
          properties: { text: { type: 'string' }, articleId: { type: 'string' }, evidenceQuote: { type: 'string' } },
        } } },
      } } },
    }),
  });
  if (!response.ok) throw new Error(`Text model request failed (${response.status})`);
  const body = await response.json();
  const output = body.output?.flatMap((item) => item.content ?? []).find((part) => part.type === 'output_text')?.text;
  if (!output) throw new Error('Text model returned no output_text');
  const parsed = JSON.parse(output);
  const byId = new Map(articles.map((article) => [article.id, article]));
  const segments = [];
  for (const candidate of parsed.segments ?? []) {
    const article = byId.get(candidate.articleId);
    if (!article || !validateModelSegment(candidate, article)) continue;
    segments.push({
      text: candidate.text.trim(),
      factIds: [factId(article.id, candidate.text.trim())],
      sources: [{ articleId: article.id, title: article.headline, url: article.url }],
    });
  }
  if (!segments.length) throw new Error('No model segment passed source checks');
  return { segments, usage: { modelInputTokens: body.usage?.input_tokens ?? 0, modelOutputTokens: body.usage?.output_tokens ?? 0 } };
}

function headlineFallback(articles) {
  // Emergency, explicitly attributed short headline quotes; never read article bodies aloud.
  return articles.map((article) => ({
    text: `${article.outlet} reports: “${article.headline}.”`,
    factIds: [factId(article.id, article.headline)],
    sources: [{ articleId: article.id, title: article.headline, url: article.url }],
  }));
}

export async function makeScript(groups, rawListener, asOf, apiKey = process.env.OPENAI_API_KEY) {
  const listener = validateListener(rawListener);
  const articles = selectArticles(groups, listener, asOf);
  if (!articles.length) throw new Error('No eligible articles for this listener and date');
  let result;
  let generationMode = 'source-headline-fallback';
  let modelStatus = 'key_missing';
  if (apiKey) {
    try {
      result = await modelSegments(addIndependentCoverage(groups, articles, asOf), listener, asOf, apiKey);
      generationMode = 'source-checked-model';
      modelStatus = 'ok';
    } catch (error) {
      modelStatus = error instanceof Error ? error.message : 'Model error';
    }
  }
  if (!result) {
    const nativeLanguage = selectArticles(groups, listener, asOf, { nativeOnly: true });
    if (!nativeLanguage.length) throw new Error(`No ${listener.language} source headlines available for fallback`);
    result = { segments: headlineFallback(nativeLanguage), usage: { modelInputTokens: 0, modelOutputTokens: 0 } };
  }
  const introduction = listener.language === 'de'
    ? 'Guten Morgen. Diese Zusammenfassung wird von einer synthetischen Stimme gesprochen.'
    : listener.language === 'nl'
      ? 'Goedemorgen. Deze briefing wordt voorgelezen door een synthetische stem.'
      : 'Good morning. This briefing is spoken by a synthetic voice.';
  return {
    listener,
    generationMode,
    modelStatus,
    segments: [{ text: introduction, factIds: [], sources: [] }, ...result.segments],
    usage: result.usage,
  };
}
