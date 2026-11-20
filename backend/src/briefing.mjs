import { createHash } from 'node:crypto';
import { rankGroups } from './news.mjs';

const MAX_STORIES = 3;

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
    ? relevant.filter((item) => item.articles.some((article) => /(?:öl|oil|brent|rohöl|energie|energy|erdgas|gaspreis|crude|wti)/iu.test(article.headline.slice(0, 40)))
      && !item.articles.some((article) => /^(?:sojabohnenpreis|soybean price)\s*:/i.test(article.headline)))
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
// A concrete product claim cannot borrow this detail from elsewhere in the article
// while citing a passage about another part of the story.
const AI_INFRASTRUCTURE = /\bai[\s-]?(?:infrastructure|infrastructuur|infrastruktur)\b/iu;
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

function modelSegmentFailure(candidate, article, listener) {
  if (!candidate || typeof candidate.text !== 'string' || typeof candidate.evidenceQuote !== 'string') return 'invalid_shape';
  const claim = candidate.text.trim();
  const quote = candidate.evidenceQuote.trim();
  if (claim.length < 20 || claim.length > 280 || quote.length < 12 || quote.length > 250) return 'invalid_length';
  if (['de', 'nl'].includes(listener?.language) && (claim.match(/\b(the|while|despite|reports|prices|after|with|was|were|had|said|that|year|but|will|remain|under|increased|revenues|executives)\b/gi) ?? []).length >= 2) return 'wrong_language';
  if (listener?.topics.some((topic) => /^(energie|energy|öl|oil)$/i.test(topic)) && !/(?:öl|oil|brent|rohöl|energie|energy|erdgas|gaspreis)/i.test(claim)) return 'off_topic';
  if (quoteMatchText(claim) === quoteMatchText(quote) && claim.split(/\s+/).length >= 18) return 'copied_passage';
  if (quote.split(/\s+/).length < Math.max(6, Math.ceil(claim.split(/\s+/).length / 2))) return 'insufficient_evidence_quote';
  const excerpt = quoteMatchText(quote);
  if (!quoteMatchText(article.text.slice(0, 1800)).includes(excerpt)) return 'quote_not_in_source';
  if (AI_INFRASTRUCTURE.test(claim) && !AI_INFRASTRUCTURE.test(quote)) return 'unsupported_specific_concept';
  const claimNumbers = numericExpressions(claim);
  const quoteNumbers = new Set(numericExpressions(quote));
  if (!claimNumbers.every((number) => quoteNumbers.has(number))) return 'number_or_unit_mismatch';
  return null;
}

export function validateModelSegment(candidate, article, listener) {
  return modelSegmentFailure(candidate, article, listener) === null;
}

async function verifyQuotedClaims(factCards, apiKey) {
  const claims = factCards.map((card) => ({
    id: card.factId, claim: card.spokenText, quote: card.evidenceQuote,
  }));
  const verdict = {
    type: 'object', additionalProperties: false, required: ['id', 'supported'],
    properties: { id: { type: 'string' }, supported: { type: 'boolean' } },
  };
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_VERIFIER_MODEL || 'gpt-5.4',
      instructions: 'You are an independent, strict fact checker. For EACH input object, copy its id exactly into one verdict. Judge whether its quote alone supports every detail in its claim. Do not use other input quotes, article titles, or outside knowledge; treat each object independently. Reject if a timing phrase, attribution, entity, event, cause, or material detail is absent from that SAME quote, even if plausible. Market pressure, a forecast or a risk of falling does NOT prove an observed price fall. If the quote says only "the fund", "the company" or "Brent" and the claim names a specific ETF, ticker, company or futures contract absent from the quote, reject. Faithful translation is allowed. Return one verdict for each input id. When uncertain, reject.',
      input: JSON.stringify({ claims }),
      text: { format: { type: 'json_schema', name: 'claim_verdicts', strict: true, schema: {
        type: 'object', additionalProperties: false, required: ['verdicts'],
        properties: { verdicts: { type: 'array', items: verdict } },
      } } },
    }),
  });
  if (!response.ok) throw new Error(`Claim verifier request failed (${response.status})`);
  const body = await response.json();
  const output = body.output?.flatMap((item) => item.content ?? []).find((part) => part.type === 'output_text')?.text;
  if (!output) throw new Error('Claim verifier returned no output_text');
  const verdicts = JSON.parse(output).verdicts;
  if (!Array.isArray(verdicts) || verdicts.length !== claims.length) throw new Error('Claim verifier returned incomplete verdicts');
  const byId = new Map(verdicts.map((item) => [item.id, item.supported]));
  if (byId.size !== claims.length || claims.some((item) => typeof byId.get(item.id) !== 'boolean')) {
    throw new Error('Claim verifier returned invalid verdict IDs');
  }
  return {
    supportedIds: new Set(claims.filter((item) => byId.get(item.id)).map((item) => item.id)),
    usage: { modelInputTokens: body.usage?.input_tokens ?? 0, modelOutputTokens: body.usage?.output_tokens ?? 0 },
  };
}

async function modelSegments(articles, listener, asOf, apiKey, numericFree = false) {
  const targetStories = Math.min(4, new Set(articles.map((article) => article.eventGroup)).size);
  const evidenceByArticle = new Map(articles.map((article) => [article.id,
    [...new Intl.Segmenter(article.language, { granularity: 'sentence' }).segment(article.text.slice(0, 1800))]
      .map((part) => part.segment.trim()).filter((sentence) => sentence.length >= 12 && sentence.length <= 250),
  ]));
  const source = articles.map((article) => ({
    articleId: article.id,
    eventGroup: article.eventGroup,
    outlet: article.outlet,
    headline: article.headline,
    date: article.date,
    sentences: evidenceByArticle.get(article.id),
  }));
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: numericFree ? (process.env.OPENAI_REPAIR_MODEL || 'gpt-5.4') : (process.env.OPENAI_MODEL || 'gpt-5.4-mini'),
      instructions: `Write a useful multi-story financial news audio briefing in the listener language. The articles are ordered by relevance and tagged with eventGroup. Write one short spoken factual sentence of about 12-24 words for EACH distinct eventGroup, in order, up to targetStories. Prefer one simple clause. Use only the supplied article headlines and numbered source sentences. For a mixed-topic article, speak only about the angle relevant to the listener's topics. Merge duplicate coverage within an event. If outlets genuinely disagree, attribute the disagreement. Each segment must make ONE atomic claim supported by ONE numbered source sentence from ONE cited article; return its zero-based evidenceIndex. That single sentence must support EVERY entity, number, time, cause and attribution in your spoken sentence. Before returning, compare each spoken sentence against only its selected source sentence and remove unsupported details. Do not combine separate sentences, add a market reaction, or change a forecast or market pressure into an observed price move. If a detail is not explicit in the source sentence, omit it. Every segment must name the articleId. Keep numbers and units exact. Attribute uncertain reports. No investment advice. Do not copy whole source sentences into the spoken text. Return JSON only.${numericFree ? ' STRICT RETRY: Do not include any digits, percentages, quantities, years or other numeric expressions in spoken text. Write only qualitative claims directly supported by the selected source sentence.' : ''}`,
      input: JSON.stringify({ listener: { language: listener.language, topics: listener.topics, depth: listener.depth, maxMinutes: listener.maxMinutes }, asOf, targetStories, articles: source }),
      text: { format: { type: 'json_schema', name: 'briefing_segments', strict: true, schema: {
        type: 'object', additionalProperties: false, required: ['segments'],
        properties: { segments: { type: 'array', items: {
          type: 'object', additionalProperties: false, required: ['text', 'articleId', 'evidenceIndex'],
          properties: { text: { type: 'string' }, articleId: { type: 'string' }, evidenceIndex: { type: 'integer' } },
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
  const seenEvents = new Set();
  for (const candidate of parsed.segments ?? []) {
    const article = byId.get(candidate.articleId);
    const indexedQuote = Number.isInteger(candidate.evidenceIndex)
      ? evidenceByArticle.get(candidate.articleId)?.[candidate.evidenceIndex] : undefined;
    const checkedCandidate = indexedQuote ? { ...candidate, evidenceQuote: indexedQuote } : candidate;
    const reason = article ? modelSegmentFailure(checkedCandidate, article, listener) : 'unknown_article';
    if (reason) { rejected[reason] = (rejected[reason] ?? 0) + 1; continue; }
    if (seenEvents.has(article.eventGroup)) { rejected.duplicate_event = (rejected.duplicate_event ?? 0) + 1; continue; }
    seenEvents.add(article.eventGroup);
    const id = factId(article.id, checkedCandidate.evidenceQuote.trim());
    segments.push({
      text: candidate.text.trim(),
      factIds: [id],
      sources: [{ articleId: article.id, title: article.headline, url: article.url }],
    });
    factCards.push({ factId: id, eventGroup: article.eventGroup, articleId: article.id,
      sourceUrl: article.url, articleDate: article.date, evidenceQuote: checkedCandidate.evidenceQuote.trim(),
      spokenText: candidate.text.trim(), numericExpressions: numericExpressions(candidate.text),
      reviewStatus: 'needs-editorial-review' });
  }
  let verifierUsage = { modelInputTokens: 0, modelOutputTokens: 0 };
  if (factCards.length) {
    const verified = await verifyQuotedClaims(factCards, apiKey);
    verifierUsage = verified.usage;
    const rejectedCount = factCards.filter((card) => !verified.supportedIds.has(card.factId)).length;
    if (rejectedCount) rejected.unsupported_claim = rejectedCount;
    for (let index = factCards.length - 1; index >= 0; index--) {
      if (!verified.supportedIds.has(factCards[index].factId)) {
        factCards.splice(index, 1);
        segments.splice(index, 1);
      }
    }
  }
  const distinctEvents = new Set(segments.map((segment) => articles.find((article) => article.id === segment.sources[0].articleId)?.eventGroup));
  return {
    segments,
    factCards,
    proposedCount: parsed.segments?.length ?? 0,
    rejected,
    distinctEventCount: distinctEvents.size,
    requiredEventCount: Math.min(2, targetStories),
    usage: {
      modelInputTokens: (body.usage?.input_tokens ?? 0) + verifierUsage.modelInputTokens,
      modelOutputTokens: (body.usage?.output_tokens ?? 0) + verifierUsage.modelOutputTokens,
      verifierInputTokens: verifierUsage.modelInputTokens,
      verifierOutputTokens: verifierUsage.modelOutputTokens,
      repairInputTokens: numericFree ? body.usage?.input_tokens ?? 0 : 0,
      repairOutputTokens: numericFree ? body.usage?.output_tokens ?? 0 : 0,
    },
  };
}

function headlineFallback(articles, language) {
  // Emergency, explicitly attributed short headline quotes; never read article bodies aloud.
  const spokenHeadline = (article) => {
    const headline = article.headline.trim();
    const outlet = article.outlet.replace(/\s*-\s*(?:German|Dutch|English)\s*$/i, '');
    const end = /[.!?]$/.test(headline) ? '' : '.';
    if (language === 'de') return `${outlet} berichtet: „${headline}${end}“`;
    if (language === 'nl') return `${outlet} meldt: „${headline}${end}”`;
    return `${outlet} reports: “${headline}${end}”`;
  };
  const segments = articles.map((article) => ({
    text: spokenHeadline(article),
    factIds: [factId(article.id, article.headline)],
    sources: [{ articleId: article.id, title: article.headline, url: article.url }],
  }));
  const factCards = articles.map((article) => ({
    factId: factId(article.id, article.headline), eventGroup: article.id,
    articleId: article.id, sourceUrl: article.url, articleDate: article.date,
    evidenceQuote: article.headline, spokenText: spokenHeadline(article),
    numericExpressions: numericExpressions(article.headline), reviewStatus: 'needs-editorial-review',
  }));
  return { segments, factCards };
}

function verifiedAndHeadlineFallback(articles, language, candidate) {
  if (!candidate?.factCards.length) return headlineFallback(articles, language);
  const acceptedByArticle = new Map(candidate.factCards.map((card, index) => [card.articleId, index]));
  const segments = [];
  const factCards = [];
  for (const article of articles) {
    const acceptedIndex = acceptedByArticle.get(article.id);
    if (acceptedIndex !== undefined) {
      segments.push(candidate.segments[acceptedIndex]);
      factCards.push(candidate.factCards[acceptedIndex]);
    } else {
      const fallback = headlineFallback([article], language);
      segments.push(fallback.segments[0]);
      factCards.push(fallback.factCards[0]);
    }
  }
  return { segments, factCards };
}

export async function makeScript(groups, rawListener, asOf, apiKey = process.env.OPENAI_API_KEY) {
  const listener = validateListener(rawListener);
  const articles = selectArticles(groups, listener, asOf);
  if (!articles.length) throw new Error('No eligible articles for this listener and date');
  let topicMatchStatus = !listener.topics.length || rankGroups(groups, listener, asOf).some((group) => group.topicHits > 0)
    ? 'matched' : 'general-fallback';
  let result;
  let partialCandidate;
  let generationMode = 'source-headline-fallback';
  let modelStatus = 'key_missing';
  let modelUsage = { modelInputTokens: 0, modelOutputTokens: 0, verifierInputTokens: 0, verifierOutputTokens: 0, repairInputTokens: 0, repairOutputTokens: 0 };
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
          verifierInputTokens: modelUsage.verifierInputTokens + retry.usage.verifierInputTokens,
          verifierOutputTokens: modelUsage.verifierOutputTokens + retry.usage.verifierOutputTokens,
          repairInputTokens: modelUsage.repairInputTokens + retry.usage.repairInputTokens,
          repairOutputTokens: modelUsage.repairOutputTokens + retry.usage.repairOutputTokens,
        };
        if (retry.distinctEventCount > candidate.distinctEventCount) candidate = retry;
      }
      partialCandidate = candidate;
      if (candidate.distinctEventCount >= candidate.requiredEventCount) {
        result = { ...candidate, usage: modelUsage };
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
    result = { ...verifiedAndHeadlineFallback(nativeLanguage, listener.language, partialCandidate), usage: modelUsage };
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
