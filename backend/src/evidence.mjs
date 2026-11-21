// Private, per-edition evidence selection. All offsets are UTF-16 indices into
// the ORIGINAL text field; no normalized string is ever used as a citation.
import { rankGroups, energyTitle } from './news.mjs';

export const PASSAGE_LIMIT = 800;
const ARTICLE_CHARS = 3600, ARTICLE_FACTS = 10, BANDS = 5, BAND_SLOTS = 10;
const splitters = Object.fromEntries(['en','de','nl'].map(l => [l, new Intl.Segmenter(l,{granularity:'sentence'})]));
// ICU cuts “15 Mio. Euro” before the currency. Segment a same-length
// view; quotations and offsets ALWAYS refer to the unmodified original.
export const splitter = l => ({*segment(text) {
  const view=text.replace(/\b(Mio|Mrd|mln|bln)\.(?=\s*(?:Euro|EUR|USD|Dollar|US-Dollar|GBP|Pfund|Tonnen|Barrel|Aktien|kWh|MWh|GWh)\b)/giu,'$1·');
  for(const s of (splitters[l]??splitters.en).segment(view))
    yield {index:s.index,segment:text.slice(s.index,s.index+s.segment.length)};
}});
export const plain = s => s.toLowerCase().normalize('NFKD').replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const stop = new Set(('a an as at and about are be but by from has had have in is it of on that the their these this to was were which with would said says for its '+
  'aan als bij dat de den der des deze die dit een en er het in is met naar nog of om op te tot uit van voor was werden zijn '+
  'am auf aus bei das dem den der des die ein eine einer es für im ist mit nach nicht sich und von war zu zum').split(' '));
const terms = s => new Set(plain(s).split(' ').filter(w => w.length >= 2 && !stop.has(w)));
const common = (a,b) => { let n=0; for (const w of a) if (b.has(w)) n++; return n; };
const figures = s => (s.match(/\d+(?:[.,]\d+)*/g) ?? []).sort().join('|');
export function similarFact(a,b) {
  // Changed signs/currencies, negation and qualifications are not duplicates.
  const marks=s=>(s.match(/[$€£¥%−+-]/gu)??[]).join('');
  const negative=/\b(?:no|not|never|geen|niet|nicht|kein)\b/iu;
  if (marks(a)!==marks(b) || negative.test(a)!==negative.test(b) || condition.test(a)!==condition.test(b)) return false;
  if (plain(a) === plain(b)) return true;
  if (figures(a) !== figures(b)) return false;
  const x=terms(a), y=terms(b), n=common(x,y);
  return n >= 3 && n / Math.min(x.size,y.size) >= .83 && n / Math.max(x.size,y.size) >= .67;
}
export function headlineEcho(s, title) {
  const c=plain(s), h=plain(title);
  if (c === h || (h.split(' ').length >= 5 && ` ${c} `.includes(` ${h} `))) return true;
  const a=new Set(c.split(' ')), b=new Set(h.split(' ')), n=common(a,b);
  return n >= 5 && n/Math.max(a.size,b.size) >= .85;
}
const boilerplate = /(?:https?:\/\/|www\.|\b(?:advertisement|advertorial|advertentie|anzeige|sponsored (?:content|by)|gesponsord|sponsorbijdrage|subscribe|subscription offer|click here|read (?:also|more)|related (?:articles|stories)|sign up|follow us|privacy policy|all rights reserved|not (?:investment|financial) advice|appeared first on|partner content|meld je aan|lees (?:ook|meer)|klik hier|volg ons|abonneer|abonnieren|lesen sie (?:auch|mehr)|jetzt anmelden|keine anlageberatung)\b)/iu;
const statement = /\b(?:said|says|reported|announced|expects?|proposed|approved|plans?|confirmed|according to|agreed|beschloss|meldet\w*|sagte|teilte|laut|verwacht\w*|meldde|zei|volgens|besloot|kondigde)\b/iu;
export const condition = /\b(?:if|unless|provided (?:that|only)|on condition|conditional\w*|subject to|only (?:with|when|after|once)|must [^.!?;]{1,64} before|depends? on|contingent|wenn|falls|sofern|vorausgesetzt|nur mit|alleen als|mits|tenzij|op voorwaarde|afhankelijk van|alleen met)\b/iu;
const qualification = /\b(?:until|pending|uncertain|unlikely|not yet|before deciding|has not|nog niet|totdat|onzeker|onwaarschijnlijk|unklar|unwahrscheinlich|noch nicht|vorbehaltlich)\b/iu;
const dates = /\b(?:quarter|january|february|march|april|june|july|august|september|october|november|december|kwartaal|januari|maart|oktober|quartal|januar|märz|dezember)\b/iu;
const concrete = /\b(?:rose|fell|reduced|raised|cut|filed|published|opened|closed|held|charge|price|cost|fee|revenue|rate|sales|shipped|orders?|prijzen|tarief|omzet|kosten|daalde|steeg|stijgt|umsatz|preis\w*|stieg|sank)\b/iu;
const dependent = /^(?:[“"„']?)(?:it|its|they|their|this (?:change|decision|plan|measure)|the (?:company|firm|fund|bank|lender|agency|group|port|mill|cooperative)|dit|deze (?:maatregel|beslissing)|het bedrijf|de onderneming|de bank|de groep|zij|es|das unternehmen|die bank|der konzern|dies[er]?)\b/iu;
// Short financial metrics often have a predicate and value but no reporting
// entity. Only add context for these when the preceding sentence identifies a
// subject from the story; never use its amounts or explanations.
const compactMetric=/^(?:(?:net|gross|operating|adjusted|netto|bruto)\s+)?(?:revenue|income|earnings|sales|profit|margin|costs|omzet|winst|marge|umsatz|gewinn|marge)\b/iu;
const qualifiesPrior = /^(?:it|this|that|the (?:plan|proposal|change|timetable|payment|decision)|dit|dat|het (?:plan|voorstel|besluit)|das|der (?:plan|vorschlag))\b.{0,65}\b(?:depends? on|only if|subject to|conditional on|requires? (?:approval|permission)|tenzij|alleen als|mits|afhankelijk van|nur wenn|sofern|vorbehaltlich)\b/iu;
const independentClause = s => /^[\p{Lu}“"„«]/u.test(s) && !/^(?:and|but|because|although|which|while|unless|if|en|maar|omdat|und|aber|weil)\b/iu.test(s);

function trimSpan(body,start,end) {
  const raw=body.slice(start,end), text=raw.trim();
  start += raw.length-raw.trimStart().length;
  return {start,end:start+text.length,text};
}
function* paragraphs(article) {
  const body=article.text;
  let start=0, lineStart=0;
  // A hard-wrapped line is NOT a complete sentence. Segment a length-
  // preserving view; all citations still slice the unmodified source.
  for (const m of body.matchAll(/\r\n|[\r\n\u2028\u2029]/gu)) {
    const end=m.index, next=end+m[0].length;
    const last=body.slice(lineStart,end).trimEnd();
    lineStart=next;
    if (!last || m[0]==='\u2029' ||
        /[.!?…][”’"»)]?$/u.test(last) || (last.length<article.headline.length*2+8 && plain(last)===plain(article.headline)) || boilerplate.test(last)) {
      if (start<end) yield [start,end];
      start=next;
    }
  }
  if(start<body.length) yield [start,body.length];
}
function* wholeSentences(article) {
  const body=article.text;
  for (const [p,end] of paragraphs(article)) {
    const view=body.slice(p,end).replace(/[\r\n\u2028\u2029]/gu,' ');
    for (const s of splitter(article.language).segment(view)) {
      yield {...trimSpan(body,p+s.index,p+s.index+s.segment.length),p};
    }
  }
}
// Do not truncate a sentence at a character boundary. An overlong sentence
// may contain independently reportable, semicolon-delimited clauses. Never
// detach one from an attribution, conditional, quote or adjacent caveat.
function* boundedParts(span,next,body) {
  if(!span) return;
  if(span.text.length<=PASSAGE_LIMIT) { yield span; return; }
  yield {...span,unusable:true}; // still visible to neighbours as an uncitable boundary
  const scoped=/\b(?:according to|would|could|may|might|should|forecasts?|projected|alleged|estimated|only|except|however|although|zou|zouden|kan|mogelijk|behalve|echter|alleen|könnte|würde|außer|jedoch|nur)\b/iu;
  if ((!next || !qualifiesPrior.test(next.text)) && !condition.test(span.text) && !qualification.test(span.text) &&
      !statement.test(span.text) && !scoped.test(span.text) && !/["“”„«»:]/u.test(span.text)) {
    for (const m of span.text.matchAll(/[^;]+/gu)) {
      const part=trimSpan(body,span.start+m.index,span.start+m.index+m[0].length);
      if(part.text.length<=PASSAGE_LIMIT && independentClause(part.text) && !dependent.test(part.text)) yield {...part,p:-1};
    }
  }
  yield null; // never attach a neighbour across discarded text
}
function* spans(article) {
  let current=null;
  for(const next of wholeSentences(article)) { yield* boundedParts(current,next,article.text); current=next; }
  yield* boundedParts(current,null,article.text);
}
const content = (s,headline) => !!s && !s.unusable && s.text.length>=12 && /\p{L}/u.test(s.text) && !/\S{105,}|\?\s*$/u.test(s.text) &&
  !boilerplate.test(s.text) && !(headlineEcho(s.text,headline) && terms(s.text).size-common(terms(s.text),terms(headline))<3) && plain(s.text).split(' ').length >= 3;

function distinctBest(pool,limit,chars=Infinity) {
  const chosen=[], remaining=[...pool];
  // Reserve variety by scoring marginal relevance, not by blindly taking a
  // quota from each region. Never let a long introductory block fill the pool.
  while (remaining.length && chosen.length<limit) {
    const score=p=>p.score - (chosen.some(q=>q.role===p.role)?1.5:0) - (chosen.some(q=>q.band===p.band)?1:0);
    remaining.sort((a,b)=>score(b)-score(a) || a.focusStart-b.focusStart);
    const p=remaining.shift();
    if (p.quote.length>chars || chosen.some(q=>similarFact(p.focus,q.focus))) continue;
    chosen.push(p); chars-=p.quote.length;
  }
  return chosen;
}

export function selectEvidence(article, topics=[], stats={}) {
  Object.assign(stats,{bodyCharacters:article.text?.length??0,examinedSpans:0,qualifyingSpans:0,excluded:{}});
  if (!article.text) return [];
  const body=article.text, title=terms(article.headline), interest=terms(topics.join(' '));
  if (interest.has('fx')) for(const w of ['currency','currencies','exchange','forex','dollar','yen','euro','sterling']) interest.add(w);
  if (interest.has('energie')||interest.has('energy')) for(const w of ['brent','crude','olie','oil','erdgas','energie']) interest.add(w);
  const bins=Array.from({length:BANDS},()=>[]);
  let main, leadTerms, prev=null, current=null;
  function consider(s,before,after) {
    if (!s) return;
    stats.examinedSpans++;
    const omit=key=>{stats.excluded[key]=(stats.excluded[key]??0)+1;};
    if (!content(s,article.headline)) return omit(s.unusable?'oversize':boilerplate.test(s.text)?'boilerplate':'non_reportable_span');
    const words=terms(s.text);
    if (words.size<2) return omit('thin_span');
    const adjacent=t => s.p>=0 && t?.p===s.p && content(t,article.headline);
    const metricNeedsSubject=compactMetric.test(s.text) && /\d/u.test(s.text) && s.text.split(/\s+/u).length<=8 &&
      adjacent(before) && common(terms(before.text),title)>0;
    const prior=(dependent.test(s.text)||metricNeedsSubject) && adjacent(before) ? before : null;
    const following=after && qualifiesPrior.test(after.text) ? after : null;
    if (following && !adjacent(following)) return omit('detached_caveat'); // don't detach a needed out-of-window caveat
    if (qualifiesPrior.test(s.text) && adjacent(before)) return omit('bound_to_prior'); // already bound to the fact it qualifies
    // Only one neighbour, only for reference resolution or a necessary caveat.
    // If both are needed, or the caveat won't fit, don't offer a clipped fact.
    if (prior && following) return omit('needs_two_neighbours');
    const start=prior?.start??s.start, end=following?.end??s.end;
    if (end-start>PASSAGE_LIMIT || body.slice(start,end).trim().split(/\s+/u).length<6) return omit('window_size');
    const context=prior?'referent':following?'qualification':null;
    const lead=!leadTerms;
    const topicHits=common(words,interest), titleHits=common(words,title);
    const ties=titleHits + common(words,leadTerms??new Set()) + (prior ? common(terms(prior.text),title) : 0);
    const qty=/\d/u.test(s.text), when=dates.test(s.text), says=statement.test(s.text), detail=concrete.test(s.text);
    const termsApply=condition.test(s.text)||qualification.test(s.text)||!!following;
    if (lead && !topicHits && !titleHits && !(qty||when||says||detail||termsApply)) return omit('no_development_anchor');
    const role=lead?'development':termsApply?'qualification':qty||when?'quantity_or_date':says?'reported_statement':'detail';
    // A late, disconnected statistic/aside is not useful just because it has a number.
    if (!lead && !ties && !topicHits && !context) {
      const nearby=[before,after].some(t=>adjacent(t) && (common(terms(t.text),title)||common(terms(t.text),leadTerms)));
      const reportMetric=(qty||when) && (says||detail) && /\b(?:revenue|sales|profit|rate|earnings|debt|price|omzet|winst|rente|schuld|umsatz|gewinn|zins)\b/iu.test(s.text);
      if (!(nearby && (says||detail||termsApply||qty||when)) && !reportMetric) return omit('disconnected_detail');
    }
    if (lead) leadTerms=words;
    const score=(lead?6:0)+Math.min(3,titleHits)*2+Math.min(2,topicHits)*3+Math.min(2,ties)+
      (qty?3:0)+(when?1:0)+(says?2:0)+(detail?1:0)+(termsApply?3:0);
    const band=Math.min(BANDS-1,Math.floor(BANDS*s.start/body.length)), bin=bins[band];
    const entry={articleId:article.id,start,end,focusStart:s.start,focusEnd:s.end,quote:body.slice(start,end),focus:s.text,role,score,band,context};
    stats.qualifyingSpans++;
    if (lead) main=entry;
    if (bin.some(q=>similarFact(q.focus,s.text))) return;
    bin.push(entry); bin.sort((a,b)=>b.score-a.score || a.start-b.start);
    if (bin.length>BAND_SLOTS) bin.pop();
  }
  // One-sentence lookahead. Only the fixed-size region pools survive this scan.
  for (const next of spans(article)) { consider(current,prev,next); prev=current; current=next; }
  consider(current,prev,null);
  const pool=bins.flat();
  const picked=distinctBest(pool,ARTICLE_FACTS,ARTICLE_CHARS);
  if (main && !picked.includes(main)) {
    while (picked.length>=ARTICLE_FACTS || picked.reduce((n,p)=>n+p.quote.length,main.quote.length)>ARTICLE_CHARS) picked.pop();
    picked.push(main);
  }
  stats.excluded.duplicate_or_selection_budget=stats.qualifyingSpans-picked.length;
  return picked.sort((a,b)=>a.focusStart-b.focusStart).map((p,evidenceIndex)=>({...p,evidenceIndex}));
}

export function editionSelection(groups, listener, asOf) {
  const ranked=rankGroups(groups,listener,asOf), cache=new Map(), stats=new Map();
  const evidence=a=>{
    if (!cache.has(a)) {
      const counts={}; cache.set(a,selectEvidence(a,listener.topics,counts)); stats.set(a.id,counts);
    }
    return cache.get(a);
  };
  const maximum=listener.maxMinutes<1?1:listener.maxMinutes<2 || (listener.depth==='deep' && listener.maxMinutes<3)?2:3;
  function choose(nativeOnly=false) {
    const available=nativeOnly?ranked.filter(g=>g.articles.some(a=>a.language===listener.language)):ranked;
    const matched=available.filter(g=>g.topicHits);
    const relevant=listener.topics.length?matched:available;
    const energy=listener.topics.length && listener.topics.every(t=>/^(energie|energy|öl|oil)$/iu.test(t));
    const focused=energy?relevant.filter(g=>g.articles.some(a=>energyTitle(a.headline) &&
      !/^(?:sojabohnenpreis|soybean price|abendbericht|market (?:wrap|roundup))\s*:/iu.test(a.headline))):relevant;
    const supported=[], reserve=[], thin=[];
    for (const [rank,group] of (focused.length?focused:relevant).entries()) {
      const depth=a=>Math.min(4,evidence(a).length);
      const lead=group.articles.filter(a=>!nativeOnly||a.language===listener.language).sort((a,b)=>depth(b)-depth(a)||
        Number(b.language===listener.language)-Number(a.language===listener.language)||b.dateMs-a.dateMs||a.id.localeCompare(b.id))[0];
      // Keep the ranked supported lead. For the remaining slots prefer events
      // with reporting beyond one line, not the longest article in the feed.
      const n=depth(lead), slot=nativeOnly || n>=2 || (n && !supported.length) ? supported : n ? reserve : thin;
      slot.push({lead,group,rank});
      if (supported.length===maximum) break;
    }
    return [...supported,...reserve,...thin].slice(0,maximum).sort((a,b)=>a.rank-b.rank);
  }
  return {ranked,choose,evidence,stats};
}

// Don't equate "another outlet" with another fact. Require an event anchor
// plus a concrete new dimension; generic rewordings of the lead don't qualify.
const dimensions=[condition,qualification, /\b(?:formerly|formerly charged|existing rules|current rules|previously|voorheen|bisher)\b/iu,
  /\b(?:application|deadline|eligibility|aanvraag|frist)\b/iu,/\b(?:voted?|stemming|abstimmung)\b/iu,
  /\b(?:inspection|audit|inspectie|prüfung)\b/iu,/\b(?:contract|terms|agreement|overeenkomst|vertrag)\b/iu,
  /\b(?:shipments?|dispatch|delivery|levering|lieferung)\b/iu,/\b(?:permit|licence|regulator|vergunning|aufsicht)\b/iu];
function complementary(other, lead, primary, selection, leadBody) {
  if (other.id===lead.id || other.language!==lead.language || other.outlet===lead.outlet ||
    (other.feed?.startsWith('invezz_') && lead.feed?.startsWith('invezz_'))) return [];
  const base=[lead.headline,...primary.map(p=>p.focus)].join(' '), known=terms(base);
  const baseNumbers=new Set(base.match(/\d+(?:[.,]\d+)*/gu)??[]);
  const titles=terms(lead.headline);
  const generic=/^(?:\d+|usd|eur|gbp|million|billion|miljoen|percent|procent|company|firm|bedrijven|report|shares|stock|price|quarter|year|revenue|group)$/u;
  return selection.evidence(other).filter(p=> {
    if (leadBody.includes(p.focus.replace(/\s+/gu,' ')) || primary.some(q=>similarFact(p.focus,q.focus))) return false;
    const words=terms(p.focus), ties=common(words,known);
    const anchors=[...words].filter(w=>known.has(w) && !generic.test(w));
    // Shared event anchor AND material not already in the lead. Don't count a
    // second permalink, translation or a near-restatement as a second fact.
    const freshNumber=(p.focus.match(/\d+(?:[.,]\d+)*/gu)??[]).some(n=>!baseNumbers.has(n));
    const newDimension=dimensions.some(pattern=>pattern.test(p.focus)&&!pattern.test(base));
    const newNamedActor=(p.focus.match(/(?<!^)(?<![\p{L}])\p{Lu}[\p{Ll}]{2,}/gu)??[]).some(w=>!known.has(plain(w)));
    return (anchors.length>=2 || anchors.some(w=>titles.has(w))) && words.size-ties>=2 && (freshNumber || newDimension || (newNamedActor && statement.test(p.focus)));
  });
}
export function planEvent({lead,group},selection) {
  const primary=selection.evidence(lead);
  let extra=[], second=null, best=0;
  const leadBody=group.articles.length>1?lead.text.replace(/\s+/gu,' '):'';
  for (const other of group.articles) {
    const novel=distinctBest(complementary(other,lead,primary,selection,leadBody),3,1400);
    const value=novel.reduce((n,p)=>n+p.score,0);
    if (value>best) { extra=novel.map(p=>p.role==='development'?{...p,role:'complementary_detail'}:p); second=other; best=value; }
  }
  const bank=[...primary,...extra];
  // Small fact outline, not a word quota per paragraph. Remaining distinct
  // details are PRIVATE reserves for a single targeted repair, if worthwhile.
  const main=primary.find(p=>p.role==='development')??primary[0];
  const outline=main?[main]:[];
  const unused=()=>bank.filter(p=>!outline.some(q=>similarFact(q.focus,p.focus)));
  // Cover different reporting questions before filling the remaining slots.
  for(const role of ['quantity_or_date','reported_statement','qualification']) {
    const [fact]=distinctBest(unused().filter(p=>p.role===role),1);
    if(fact) outline.push(fact);
  }
  outline.push(...distinctBest(unused(),6-outline.length));
  return {id:lead.id,lead,group,stats:selection.stats,articles:new Map([lead,...(second?[second]:[])].map(a=>[a.id,a])),bank,outline};
}
