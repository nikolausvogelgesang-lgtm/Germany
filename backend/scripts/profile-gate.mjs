// Private laptop only. Check the exact editions to be presented, not a second
// draft in the same language. --saved makes no model or TTS requests.
import {loadConfig} from '../src/config.mjs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {scenarios} from './scenarios.mjs';
import {transcript} from '../src/tts.mjs';
import {loadArticles} from '../src/news.mjs';
import {editionIndex} from '../src/editorial.mjs';
import {factId} from '../src/claims.mjs';
import {requireLiveService,smokeProfile,checkEdition} from './smoke.mjs';

const args=process.argv.slice(2), saved=args[0]==='--saved';
if (!(args.length===1 && ['--live','--presets-only'].includes(args[0]) || saved && [3,4].includes(args.length)))
  throw new Error('Use --presets-only (two jobs), --saved FX.json NL.json [DE.json] (no paid jobs), or --live (three potentially billable jobs). No jobs submitted without an explicit mode.');
loadConfig();
const asOf=process.env.AS_OF||'2026-11-19T23:59:59Z', cutoff=Date.parse(asOf);
if (!Number.isFinite(cutoff)) throw new Error('Invalid AS_OF');
const articles=await loadArticles(process.env.NEWSTEX_DATA_DIR), byId=new Map(articles.map(a=>[a.id,a]));
const base=process.env.BACKEND_URL||'http://127.0.0.1:3001';
if (!saved && (await requireLiveService(base)).articles!==articles.length) throw new Error('Use the server’s private export');

const eligible=a=>a && a.dateMs<=cutoff && a.dateMs>=cutoff-7*86400000;
const groups=editionIndex(articles)(asOf);
const groupOf=new Map(groups.flatMap(g=>{
  const inWindow=g.filter(eligible);
  return inWindow.map(a=>[a.id,inWindow[0].id]); // same representative across languages
}));
const sha=text=>createHash('sha256').update(text).digest('hex');
const parsePrivate=text=>{try{return JSON.parse(text);}catch{throw new Error('Invalid private JSON; inspect the saved edition or audit locally.');}};
async function audit(r,facts,profile) {
  const rows=await readFile(new URL('../../generated/fact-audit.jsonl',import.meta.url),'utf8');
  const row=rows.trim().split('\n').map(parsePrivate).find(x=>x.briefingId===r.id);
  if (row?.asOf!==r.asOf || row?.factCards?.length!==facts.length) throw new Error('Missing or mismatched private audit for '+r.id);
  if(row.audioSha256!==r.audioSha256 || row.audioUrl!==r.audioUrl || row.transcriptSha256!==sha(transcript(r.segments)) || row.maxMinutes!==profile.listener.maxMinutes || row.profileSummary!==r.profileSummary)
    throw new Error('Edition, time budget, transcript or recording differs from private audit');
  // Cross-check an immutable local admission receipt against the ACTUAL bytes served.
  const receipt=parsePrivate(await readFile(new URL('../../generated/audio/'+r.audioUrl.split('/').at(-1)+'.json',import.meta.url),'utf8'));
  if(receipt.name!==r.audioUrl.split('/').at(-1) || receipt.transcriptSha256!==row.transcriptSha256 || r.audioSha256!==receipt.audioSha256)
    throw new Error('Delivered audio does not match this transcript receipt');
  for (const [i,s] of facts.entries()) {
    const c=row.factCards[i], a=byId.get(c.articleId), src=s.sources[0];
    if (!groupOf.has(c.articleId) || groupOf.get(c.articleId)!==groupOf.get(s.storyId) ||
        c.eventGroup!==s.storyId || c.factId!==s.factIds[0] || c.articleDate!==a.date ||
        src.articleId!==a.id || src.publishedAt!==a.date || src.url!==a.url || src.title!==a.headline || src.publisher!==a.outlet ||
        c.field!=='text' || ![c.start,c.focusStart,c.focusEnd,c.end].every(Number.isInteger) ||
        !(0<=c.start && c.start<=c.focusStart && c.focusStart<c.focusEnd && c.focusEnd<=c.end && c.end<=a.text.length) ||
        sha(a.text.slice(c.start,c.end))!==c.evidenceSha256 || sha(s.text)!==c.spokenSha256 ||
        factId(a.id,a.text.slice(c.focusStart,c.focusEnd))!==c.factId)
      throw new Error(`Source, cutoff, event, evidence or spoken-text mismatch: ${r.id}, claim ${i+1}`);
  }
  const index=Math.max(0,facts.findIndex(s=>profile.listener.language==='nl'?/\b(?:als|mits|tenzij)\b/i.test(s.text):/\d/.test(s.text)));
  const c=row.factCards[index];
  return {factualSentence:index+1,factId:c.factId,articleId:c.articleId,publishedAt:c.articleDate,utf16Evidence:[c.start,c.end]};
}

const profiles=scenarios.slice(0,saved?args.length-1:args[0]==='--presets-only'?2:3);
const results=[];
for (const [i,p] of profiles.entries()) {
  const r=saved?parsePrivate(await readFile(args[i+1],'utf8')):await smokeProfile(p,base,asOf);
  if (saved) await checkEdition(p,base,asOf,r);
  const {language,topics,depth}=p.listener;
  if (r.profileSummary!==`${language.toUpperCase()} · ${topics.join(', ')} · ${depth}`) throw new Error('Unexpected listener edition');
  const facts=r.segments.filter(s=>s.kind==='summary');
  const reviewCue=await audit(r,facts,p);
  const sourceIds=[...new Set(facts.flatMap(s=>s.sources.map(src=>src.articleId)))];
  const stories=Map.groupBy(facts,s=>s.storyId);
  const selectedEventIds=r.diagnostics.selectedEvents.map(e=>e.eventGroup);
  const eventIds=[...new Set(sourceIds.map(id=>groupOf.get(id)))];
  if (eventIds.length<2 || eventIds.length!==stories.size || [...stories.keys()].some(id=>!selectedEventIds.includes(id)))
    throw new Error(p.name+': need two distinct, selected and verified event groups');
  const cluster=[...stories.values()].find(lines=>new Set(lines.map(s=>s.sources[0].articleId)).size>1);
  results.push({briefingId:r.id,reviewCue,selectedEventIds,eventIds,clusterForReview:cluster?.map(s=>({factId:s.factIds[0],articleId:s.sources[0].articleId}))??null,
    name:p.name,mode:r.generationMode,verifiedWords:r.diagnostics.finalVerifiedWords,facts:facts.length,stories:stories.size,
    words:r.diagnostics.finalSpokenWords,sourceIds,durationSeconds:r.durationSeconds,estimatedDurationSeconds:r.estimatedDurationSeconds,
    scriptMs:r.scriptMs,ttsMs:r.ttsMs,totalMs:r.generationMs,audioStatus:r.audioStatus,usage:r.usage});
}
const [fx,ai]=results.map(r=>new Set(r.eventIds));
const overlap=fx.intersection(ai).size;
const sets=results.map(r=>new Set(r.eventIds));
const sameSelection=sets.some((a,i)=>sets.slice(i+1).some(b=>a.isSubsetOf(b)||b.isSubsetOf(a)));
console.log(JSON.stringify({asOf,overlap,results},null,2));
if (sameSelection) throw new Error('Each compared listener must contribute a distinct delivered event, not just a different lead or translation.');
console.log('PASS source identities, private audit pointers and different event groups. '+(profiles.length===2?'Two presets only; custom NOT checked. ':'All three scenarios. ')+'Editorial and listening review still required.');
