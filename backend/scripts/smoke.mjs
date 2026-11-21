// One live, potentially billable daily request per profile. No auto-retry.
import {pathToFileURL} from 'node:url';
import {scenarios,cutoff} from './scenarios.mjs';
import {opening} from '../src/briefing.mjs';
import {sha256} from '../src/tts.mjs';
import {factualWordCount} from '../src/claims.mjs';
import {dailyAudioFloor, durationFailure, measureMp3} from '../src/timing.mjs';

export async function requireLiveService(base) {
  const response=await fetch(`${base}/api/health`);
  if (!response.ok) throw new Error(`Health HTTP ${response.status}`);
  const health=await response.json();
  if (!health.articles || !health.textModelConfigured || !health.ttsConfigured)
    throw new Error('Live smoke requires the six feeds and both configured providers. No job submitted.');
  return health;
}

// Independently read the DELIVERED frames, even on a cache hit. A positive
// duration, an estimate or a success flag cannot stand in for the time floor.
export function checkRecording(bytes, edition, maxSeconds) {
  const timing=measureMp3(bytes), min=dailyAudioFloor(maxSeconds);
  const failure=durationFailure(timing,maxSeconds,min);
  if (failure) throw new Error(`Delivered MP3: ${failure} (playable ${timing?.playableSeconds ?? 'unknown'} s, frames ${timing?.frameSeconds ?? 'unknown'} s; required ${min}–${maxSeconds} s)`);
  const actual=timing.playableSeconds;
  if (!['generated','cached'].includes(edition.audioStatus) ||
      actual!==edition.durationSeconds || actual!==edition.diagnostics?.actualMp3DurationSeconds)
    throw new Error('Delivered MP3 and reported status/durations disagree');
  return actual;
}

export async function smokeProfile(profile,base,asOf) {
  const response=await fetch(`${base}/api/briefings`,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({asOf,listener:profile.listener})});
  const r=await response.json(),d=r.diagnostics;
  console.log(JSON.stringify({profile:profile.id,asOf,http:response.status,id:r.id,qualityStatus:r.qualityStatus,modelStatus:r.modelStatus,
    audioStatus:r.audioStatus,audioUrl:r.audioUrl,diagnostics:d,usageComplete:r.usageComplete,usage:r.usage}));
  if (!response.ok) throw new Error(`Briefing HTTP ${response.status}`);
  await checkEdition(profile,base,asOf,r);
  return r;
}

// May also check an exact response saved locally by the editor. GET audio
// only; this path cannot issue a new generation job.
export async function checkEdition(profile,base,asOf,r) {
  const d=r.diagnostics;
  const lead=opening(profile.listener.language);
  const summary=r.segments.filter(s=>s.kind==='summary'), words=summary.reduce((n,s)=>n+factualWordCount(s.text),0);
  const max=profile.listener.maxMinutes*60;
  if (r.segments[0]?.text!==lead.text || r.segments[0]?.kind!==undefined || Date.parse(r.asOf)!==Date.parse(asOf) || r.topicMatchStatus!=='matched' || r.qualityStatus!=='sufficient_verified_content' ||
      r.generationMode!=='source-checked-model' || words<Math.floor(140*Math.min(max,180)/180) || words!==d?.finalVerifiedWords ||
      new Set(summary.map(s=>s.storyId)).size<2 || summary.length!==d.finalVerifiedSentences ||
      new Set(summary.flatMap(s=>s.factIds)).size!==summary.length ||
      r.segments.some((s,i)=>s.kind!=='summary' && (i!==0 || s.kind==='headline' || s.factIds.length || s.sources.length)) ||
      summary.some(s=>!s.storyId || s.factIds.length!==1 || s.sources.length!==1 || !s.sources[0]?.articleId ||
        !s.sources[0]?.url || !(Date.parse(s.sources[0].publishedAt)<=Date.parse(asOf))))
    throw new Error('Verified script gate failed. See diagnostics; no automatic retry.');
  if (!r.audioUrl || r.editionStatus!=='complete') throw new Error(`No deliverable recording: ${r.audioStatus}. See diagnostics.`);
  if (!/^\/api\/audio\/[a-f0-9]{24}\.mp3$/.test(r.audioUrl)) throw new Error('Unexpected recording URL');
  const audio=await fetch(`${base}${r.audioUrl}`);
  if (!audio.ok || !audio.headers.get('content-type')?.includes('audio/mpeg')) throw new Error(`Audio unavailable: HTTP ${audio.status}`);
  const bytes=Buffer.from(await audio.arrayBuffer()), actual=checkRecording(bytes,r,max);
  if(sha256(bytes)!==r.audioSha256) throw new Error('Delivered audio bytes differ from the generated edition.');
  console.log(`PASS transport + automatic script gate: ${words} verified words; ${r.estimatedDurationSeconds}s estimate, ${actual.toFixed(2)}s MP3 (${r.audioStatus}). Listen and review sources before release.`);
  return sha256(bytes);
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const profile=scenarios.find(p=>p.id===(process.argv[2]??'fx-trader'));
  if (!profile) throw new Error('Use fx-trader, dutch-ai-investor or custom-energy-de');
  const base=process.env.BACKEND_URL||'http://127.0.0.1:3001';
  await requireLiveService(base);
  await smokeProfile(profile,base,process.env.AS_OF||cutoff);
}
