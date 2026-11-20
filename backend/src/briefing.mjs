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
  const energyProfile = listener.topics.some((topic) => /^(energie|energy|öl|oil)$/i.test(topic));
  const focused = energyProfile
    ? relevant.filter((item) => !item.articles.some((article) => /^(?:sojabohnenpreis|soybean price)\s*:/i.test(article.headline)))
    : relevant;
  const maximum = Math.min(MAX_STORIES, Math.max(2, Math.ceil(listener.maxMinutes * (listener.depth === 'deep' ? 1.1 : 1.8))));
  return (focused.length ? focused : relevant).slice(0, maximum).map((group) => group.articles
    .slice()
    .sort((a, b) => Number(b.language === listener.language) - Number(a.language === listener.language) || b.dateMs - a.dateMs || a.id.localeCompare(b.id))[0]);
}

function addIndependentCoverage(groups, primaries, asOf) {
  const cutoff = Date.parse(asOf);
  const selected = [];
  for (const primary of primaries) {
    selected.push({ ...primary, eventGroup: primary.id });
    const group = groups.find((items) => items.some((item) => item.id === primary.id));
    const secondary = group?.filter((item) => item.outlet !== primary.outlet && item.dateMs <= cutoff)
      .sort((a, b) => b.dateMs - a.dateMs)[0];
    if (secondary) selected.push({ ...secondary, eventGroup: primary.id });
  }
  return selected;
}

const NUMBER = /(?<![a-z0-9])(?:[$€£]\s*)?\d+(?:[.,]\d+)*(?:\s?(?:%|percentage points?|prozentpunkte?|procentpunten?|basis points?|basispunkte?|basispunten?|percent|prozent|procent|millionen?|miljoen|milliarden?|miljard|billion|trillion))?(?:\s*[$€£])?/gi;
const normalized = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim();
const quoteMatchText = (text) => text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
const numericExpressions = (text) => (text.match(NUMBER) ?? []).map((value) => {
  const currency = value.match(/[$€£]/)?.[0] ?? '';
  const unit = normalized(value).replace(/[$€£]/g, '').trim()
  .replace(/\s*(?:%|percent|prozent|procent)$/, ' percent')
  .replace(/\s*(?:millionen?|miljoen)$/, ' million')
  .replace(/\s*(?:milliarden?|miljard)$/, ' billion')
  .replace(/\s*(?:prozentpunkte?|procentpunten?)$/, ' percentage points')
  .replace(/\s*(?:basispunkte?|basispunten?)$/, ' basis points')
  .replace(/,(?=\d)/g, '.');
  return `${currency}${unit}`;
});

function modelSegmentFailure(candidate, article) {
  if (!candidate || typeof candidate.text !== 'string' || typeof candidate.evidenceQuote !== 'string') return 'invalid_shape';
  const claim = candidate.text.trim();
  const quote = candidate.evidenceQuote.trim();
  if (claim.length < 20 || claim.length > 280 || quote.length < 12 || quote.length > 250) return 'invalid_length';
  const excerpt = quoteMatchText(quote);
  if (!quoteMatchText(article.text).includes(excerpt) && !quoteMatchText(article.headline).includes(excerpt)) return 'quote_not_in_source';
  const claimNumbers = numericExpressions(claim);
  const quoteNumbers = new Set(numericExpressions(quote));
  if (!claimNumbers.every((number) => quoteNumbers.has(number))) return 'number_or_unit_mismatch';
  return null;
}

export function validateModelSegment(candidate, article) {
  return modelSegmentFailure(candidate, article) === null;
}

async function modelSegments(articles, listener, asOf, apiKey, numericFree = false) {
  const targetStories = Math.min(4, new Set(articles.map((article) => article.eventGroup)).size);
  const source = articles.map((article) => ({
    articleId: article.id,
    eventGroup: article.eventGroup,
    outlet: article.outlet,
    headline: article.headline,
    date: article.date,
    passage: article.text.slice(0, 1800),
  }));
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5.4-mini',
      instructions: `Write a useful multi-story financial news audio briefing in the listener language. The articles are ordered by relevance and tagged with eventGroup. Write one spoken factual sentence of about 20-35 words for EACH distinct eventGroup, in order, up to targetStories. Do not collapse the whole briefing into one sentence. Use only the supplied article headlines and passages. For a mixed-topic article, speak only about the angle relevant to the listener's topics; do not lead with an unrelated headline item. Merge duplicate coverage within an event. If outlets genuinely disagree, give separate attributed sentences rather than inventing a resolution. Every segment must name one articleId and copy a short exact evidence quote from that article headline OR supplied passage. Every numeric expression in the spoken text must also appear in that evidence quote with the same value and unit; otherwise omit the number. Keep entity and time period exact. Attribute uncertain reports. No investment advice. Do not copy whole sentences from articles into the spoken text. Return JSON only.${numericFree ? ' STRICT RETRY: Do not include any digits, percentages, quantities, years or other numeric expressions in spoken text. Write only qualitative claims directly supported by the exact evidence quote.' : ''}`,
      input: JSON.stringify({ listener: { language: listener.language, topics: listener.topics, depth: listener.depth, maxMinutes: listener.maxMinutes }, asOf, targetStories, articles: source }),
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
  const factCards = [];
  const rejected = {};
  for (const candidate of parsed.segments ?? []) {
    const article = byId.get(candidate.articleId);
    const reason = article ? modelSegmentFailure(candidate, article) : 'unknown_article';
    if (reason) { rejected[reason] = (rejected[reason] ?? 0) + 1; continue; }
    const id = factId(article.id, candidate.evidenceQuote.trim());
    segments.push({
      text: candidate.text.trim(),
      factIds: [id],
      sources: [{ articleId: article.id, title: article.headline, url: article.url }],
    });
    factCards.push({ factId: id, eventGroup: article.eventGroup, articleId: article.id,
      sourceUrl: article.url, articleDate: article.date, evidenceQuote: candidate.evidenceQuote.trim(),
      spokenText: candidate.text.trim(), numericExpressions: numericExpressions(candidate.text),
      reviewStatus: 'needs-editorial-review' });
  }
  const distinctEvents = new Set(segments.map((segment) => articles.find((article) => article.id === segment.sources[0].articleId)?.eventGroup));
  return {
    segments,
    factCards,
    proposedCount: parsed.segments?.length ?? 0,
    rejected,
    distinctEventCount: distinctEvents.size,
    requiredEventCount: Math.min(2, targetStories),
    usage: { modelInputTokens: body.usage?.input_tokens ?? 0, modelOutputTokens: body.usage?.output_tokens ?? 0 },
  };
}

function headlineFallback(articles) {
  // Emergency, explicitly attributed short headline quotes; never read article bodies aloud.
  const segments = articles.map((article) => ({
    text: `${article.outlet} reports: “${article.headline}.”`,
    factIds: [factId(article.id, article.headline)],
    sources: [{ articleId: article.id, title: article.headline, url: article.url }],
  }));
  const factCards = articles.map((article) => ({
    factId: factId(article.id, article.headline), eventGroup: article.id,
    articleId: article.id, sourceUrl: article.url, articleDate: article.date,
    evidenceQuote: article.headline, spokenText: `${article.outlet} reports: “${article.headline}.”`,
    numericExpressions: numericExpressions(article.headline), reviewStatus: 'needs-editorial-review',
  }));
  return { segments, factCards };
}

export async function makeScript(groups, rawListener, asOf, apiKey = process.env.OPENAI_API_KEY) {
  const listener = validateListener(rawListener);
  const articles = selectArticles(groups, listener, asOf);
  if (!articles.length) throw new Error('No eligible articles for this listener and date');
  let topicMatchStatus = !listener.topics.length || rankGroups(groups, listener, asOf).some((group) => group.topicHits > 0)
    ? 'matched' : 'general-fallback';
  let result;
  let generationMode = 'source-headline-fallback';
  let modelStatus = 'key_missing';
  let modelUsage = { modelInputTokens: 0, modelOutputTokens: 0 };
  if (apiKey) {
    try {
      const context = addIndependentCoverage(groups, articles, asOf);
      let candidate = await modelSegments(context, listener, asOf, apiKey);
      modelUsage = candidate.usage;
      if (candidate.distinctEventCount < candidate.requiredEventCount) {
        const retry = await modelSegments(context, listener, asOf, apiKey, true);
        modelUsage = {
          modelInputTokens: modelUsage.modelInputTokens + retry.usage.modelInputTokens,
          modelOutputTokens: modelUsage.modelOutputTokens + retry.usage.modelOutputTokens,
        };
        if (retry.distinctEventCount > candidate.distinctEventCount) candidate = retry;
      }
      if (candidate.distinctEventCount >= candidate.requiredEventCount) {
        result = candidate;
        generationMode = 'source-checked-model';
        modelStatus = 'ok';
      } else {
        modelStatus = `validated ${candidate.segments.length}/${candidate.proposedCount} segments across ${candidate.distinctEventCount}/${candidate.requiredEventCount} required events; rejected ${JSON.stringify(candidate.rejected)}`;
      }
    } catch (error) {
      modelStatus = error instanceof Error ? error.message : 'Model error';
    }
  }
  if (!result) {
    const nativeLanguage = selectArticles(groups, listener, asOf, { nativeOnly: true });
    if (!nativeLanguage.length) throw new Error(`No ${listener.language} source headlines available for fallback`);
    if (listener.topics.length && !rankGroups(groups, listener, asOf).some((group) => group.topicHits > 0 && group.articles.some((article) => article.language === listener.language))) {
      topicMatchStatus = 'general-fallback';
    }
    result = { ...headlineFallback(nativeLanguage), usage: modelUsage };
  }
  const introduction = listener.language === 'de'
    ? 'Guten Morgen. Diese Zusammenfassung wird von einer synthetischen Stimme gesprochen.'
    : listener.language === 'nl'
      ? 'Goedemorgen. Deze briefing wordt voorgelezen door een synthetische stem.'
      : 'Good morning. This briefing is spoken by a synthetic voice.';
  const noMatch = topicMatchStatus === 'general-fallback'
    ? listener.language === 'de' ? 'Für deine Themen fand ich in diesem Datensatz keine eindeutig passende Meldung. Hier sind allgemeine Nachrichten.'
      : listener.language === 'nl' ? 'Ik vond in deze dataset geen duidelijk passend bericht over jouw onderwerpen. Hier is algemeen nieuws.'
        : 'I found no clear match for your topics in this dataset. Here is general news.'
    : '';
  return {
    listener,
    topicMatchStatus,
    generationMode,
    modelStatus,
    factCards: result.factCards,
    segments: [{ text: noMatch ? `${introduction} ${noMatch}` : introduction, factIds: [], sources: [] }, ...result.segments],
    usage: result.usage,
  };
}
