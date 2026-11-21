// Deliberately not a general news detector. Only editor-defined changes enter this ledger.
import { candidate } from './editorial.mjs';
import { estimatedSeconds } from './timing.mjs';
import fixture from '../../shared/fixtures/memory.synthetic.json' with { type: 'json' };

export const sample = {
  ...fixture, synthetic: true,
  updates: fixture.updates.map(u => ({ ...u, sourceUrl: '/api/memory/sources/' + u.articleId })),
};

const validId = value => typeof value === 'string' && /^[a-z0-9-]{1,80}$/.test(value);
const instant = value => typeof value === 'string' && /T.*Z$/.test(value) && Number.isFinite(Date.parse(value));

// Narrow backstops for this English two-claim review, not an entailment model.
// Keep the complete source condition, not just the word "if". Fail closed when
// the source does not fit this form; an editor must still assess meaning in context.
function candidateClaim(update, index, article) {
  const {spokenText: claim, evidenceQuote: quote} = update;
  const sentences = text => [...new Intl.Segmenter('en', {granularity:'sentence'}).segment(text)].map(s => s.segment.trim());
  if (!sentences(article.text).includes(quote) || sentences(claim).length !== 1) return false;
  if (/\b(?:reject\w*|refus\w*|oppos\w*|returned|reappointed|resumed|ruled out)\b/i.test(quote+' '+claim)) return false;
  if (/\bunlikely\b/i.test(quote) && !/\b(?:unlikely|improbable)\b/i.test(claim)) return false;
  if (!index) return [quote,claim].every(s => /\bMusk\b/i.test(s) && /campaign|petition|push|backed|effort|support|calls? for|urged/i.test(s) && /return|reinstat|bring back|comeback/i.test(s)) &&
    !/\bboard\b|\bif\b|would consider/i.test(claim);
  // For this ledger use one whole source sentence with a trailing condition.
  const condition = quote.match(/\b((?:only )?(?:if|provided that|on condition that)\b.+?)[.!?"”’]*$/i)?.[1];
  const supportedCondition = /ask|request|call(?:ed)? (?:on|for)|invit/i.test(condition ?? '') ||
    (/\bboard\b.{0,50}\b(?:decid\w*|approv\w*)\b/i.test(condition ?? '') && /\bbest interest\b/i.test(condition ?? ''));
  return condition && supportedCondition &&
    [quote,claim].every(s => /\bHuang\b/i.test(s) && /return|comeback|come back/i.test(s) && /would|willing|open to|consider|could/i.test(s)) &&
    claim.toLowerCase().replace(/[.!?"”’]+$/, '').endsWith(condition.toLowerCase());
}

// A private, explicitly approved TWO-edition ledger; source metadata is resolved from
// normalized licensed records, never accepted from a request or the audit script.
export function approvedStory(ledger, articles) {
  const fail = () => { throw new Error('Private Memory ledger did not pass editorial/source checks'); };
  if (ledger?.synthetic || ledger?.status !== 'editor-approved' || !ledger.reviewedBy?.trim() || !instant(ledger.reviewedAt) ||
      !validId(ledger.storyId) || ledger.storyId.startsWith('sample-') || !ledger.title?.trim() ||
      !['en','de','nl'].includes(ledger.language) ||
      ledger.editions?.length !== 2 || !ledger.editions.every(instant) ||
      Date.parse(ledger.editions[0]) >= Date.parse(ledger.editions[1]) ||
      ledger.updates?.length !== 2 || ledger.updates[0].updateId === ledger.updates[1].updateId ||
      ledger.updates[0].articleId === ledger.updates[1].articleId) fail();
  // Only the named pair can be released from the daily hold, for this one timeline.
  const nvidia = ledger.storyId === candidate.storyId;
  if (nvidia || ledger.updates.some(u => candidate.articleIds.includes(u.articleId))) {
    if (!nvidia || !ledger.updates.every((u, i) => u.articleId === candidate.articleIds[i] &&
      ledger.editions[i] === candidate.editions[i] && u.publishedAt?.slice(0,10) === candidate.editions[i].slice(0,10))) fail();
  }
  const updates = ledger.updates.map((u, i) => {
    const a = articles.find(a => a.id === u.articleId);
    if (!a || sample.updates.some(s => s.articleId === a.id) || !validId(u.updateId) || !u.evidenceQuote?.trim() || !a.text.includes(u.evidenceQuote) ||
        !u.spokenText?.trim() || u.spokenText.length > 280 || [...new Intl.Segmenter(ledger.language,{granularity:'sentence'}).segment(u.spokenText)].length!==1 ||
        !instant(u.publishedAt) || Date.parse(ledger.reviewedAt)<a.dateMs ||
        a.dateMs !== Date.parse(u.publishedAt) || a.dateMs > Date.parse(ledger.editions[i]) ||
        (i === 1 && a.dateMs <= Date.parse(ledger.editions[0]))) fail();
    if (nvidia && (ledger.language !== 'en' || u.updateId !== candidate.updateIds[i] || !candidateClaim(u, i, a))) fail();
    // Optional editor-reviewed details of this SAME update, not new history
    // events. Legacy ledgers need no migration. Bind each to this exact record.
    const details = u.details ?? [];
    if (!Array.isArray(details) || details.length > 5 || details.some(d =>
        typeof d?.spokenText !== 'string' || !d.spokenText.trim() || d.spokenText.length > 280 ||
        Array.from(new Intl.Segmenter(ledger.language,{granularity:'sentence'}).segment(d.spokenText)).length !== 1 ||
        typeof d.evidenceQuote !== 'string' || !d.evidenceQuote.trim() || !a.text.includes(d.evidenceQuote) ||
        (nvidia && !candidateClaim(d, i, a)))) fail();
    return { details: details.map(d => d.spokenText.trim()), publisher: a.outlet, updateId: u.updateId, spokenText: u.spokenText, articleId: a.id, publishedAt: a.date,
      sourceTitle: a.headline, sourceUrl: a.url };
  });
  // Hard-reject a verbatim repeat. Semantic equivalence still requires human review.
  const norm = text => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const allSpoken = updates.flatMap(u => [u.spokenText,...u.details].map(norm));
  const allQuotes = ledger.updates.flatMap(u => [u.evidenceQuote,...(u.details ?? []).map(d=>d.evidenceQuote)].map(norm));
  if (new Set(allSpoken).size !== allSpoken.length || new Set(allQuotes).size !== allQuotes.length) fail();
  const {storyId, title, language, editions} = ledger;
  return {storyId, title, language, editions, synthetic: false, updates};
}

export function catalogue({storyId, title, language, editions, synthetic}) {
  return {storyId, title, language, editions, synthetic};
}

const lead = {
  en: ['Fictional demonstration.', "Here’s what changed."],
  de: ['Fiktives Beispiel.', 'Das hat sich geändert.'],
  nl: ['Fictief voorbeeld.', 'Dit is er veranderd.'],
};

export function replay(story, {storyId, asOf, heardUpdateIds}) {
  if (storyId !== story.storyId || !story.editions.includes(asOf)) throw new Error('Invalid story or edition');
  const heard = new Set(Array.isArray(heardUpdateIds) ? heardUpdateIds.filter(validId) : []);
  const eligible = story.updates.filter(u => Date.parse(u.publishedAt) <= Date.parse(asOf));
  const toSegments = u => [u.spokenText,...(u.details ?? [])].map(text => ({
    updateId: u.updateId, storyId:u.updateId, text, factIds: [u.updateId],
    sources: [{ articleId: u.articleId, publisher:u.publisher, publishedAt: u.publishedAt, title: u.sourceTitle, url: u.sourceUrl }],
  }));
  const previouslyHeard = eligible.filter(u => heard.has(u.updateId)).flatMap(toSegments);
  const unseen = eligible.filter(u => !heard.has(u.updateId));
  // Inconsistent client history (e.g. only update 2 heard) is catch-up, not "new".
  const changed = unseen.length && previouslyHeard.length &&
    Date.parse(unseen[0].publishedAt) > Date.parse(previouslyHeard.at(-1).sources[0].publishedAt);
  const kind = !unseen.length ? 'no-change' : changed ? 'continuation' : 'catch-up';
  const [disclosure, delta] = lead[story.language];
  const intro = [story.synthetic && disclosure, changed && delta].filter(Boolean).join(' ');
  const segments = unseen.length ? [...(intro ? [{text:intro, factIds:[], sources:[]}] : []), ...unseen.flatMap(toSegments)] : [];
  return { ...catalogue(story), asOf, kind, previouslyHeard, updateIds: unseen.map(u => u.updateId),
    segments, estimatedDurationSeconds: estimatedSeconds(segments) };
}
