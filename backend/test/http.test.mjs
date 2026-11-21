import {passages, lines} from '../../tests/candidate-fixture.mjs';
// Spawn the actual HTTP app in a disposable tree: never read team keys, use
// licensed data, write into a developer's audio cache, or contact a provider.
import {test} from 'node:test';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {articles as fixtureNews,stories} from '../../tests/daily-evidence-fixture.mjs';
import {cutoff} from '../../tests/radio-fixture.mjs';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, cp, writeFile, readFile, readdir, rm} from 'node:fs/promises';
import {once} from 'node:events';
import {spawn,spawnSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {mp3Seconds} from '../src/timing.mjs';
import {checkRecording} from '../scripts/smoke.mjs';
import {candidate} from '../src/editorial.mjs';
import {scenarios} from '../scripts/scenarios.mjs';
import presets from '../../shared/listener-profiles.json' with {type:'json'};
async function server(t,{data=true,badLedger=false,candidateLedger=false,dailyAudio=null,qaMode='normal',envFileOnly=false}={}) {
  const dir=await mkdtemp(join(tmpdir(),'second-take-server-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  await cp(new URL('../src',import.meta.url),join(dir,'backend/src'),{recursive:true});
  await cp(new URL('../../shared/fixtures',import.meta.url),join(dir,'shared/fixtures'),{recursive:true});
  const news=join(dir,'feeds');
  await mkdir(news);
  const feeds=['actionforex','ibtimes_uk','invezz_de','invezz_en','invezz_nl','zacks'];
  for (const [i,feed] of feeds.entries()) {
    const raw={$id:'synthetic-'+i,headline:['FX currency exchange test','Fictional unrelated test','Brent-Öl im Test','Shipping in a test','AI cloud groeit in test','Synthetic example'][i],
      language:({2:'de',4:'nl'})[i] || 'en', date:'2026-11-18T12:00:00Z',source:'QA '+i, permalink:'https://example.test/'+i,
      text_content:'SERVER-ONLY-'+i,publication:{name:'Test desk '+i}};
    let records=[raw];
    if (dailyAudio) {
      const record=(a,n)=>({...raw,$id:a.id,language:a.language,source:a.id,publication:{name:a.outlet},
        text_content:qaMode==='no-body'?'':qaMode==='thin'?stories[n][3][0][0]:a.text,date:a.date,headline:a.headline,permalink:a.url});
      if (i<2) records=[record(fixtureNews[i],i)];
      if (i===3) records=[{...raw,$id:'willow-en',date:cutoff,source:'wilg',headline:'Wilg Cloud storage contract change',
        text_content:'Wilg Cloud revised the terms for customers with annual storage contracts.'}]; // same event as wilg
      if (i===2) records=fixtureNews.slice(4).map((a,n)=>record(a,n+4));
      if (i===4) records=fixtureNews.slice(2,4).map((a,n)=>record(a,n+2));
      if (i===5) records=[{...record(fixtureNews[1],1),$id:'syndicated-fen',permalink:'https://example.test/copy',publication:{name:'Copy desk'}},
        ...[['future',1],['stale',-7*86400000-1]].map(([id,delta])=>({...raw,$id:id,date:new Date(Date.parse(cutoff)+delta).toISOString(),
          headline:'Central bank issues FX settlement guidance',text_content:'A currency settlement circular sets limits on the size of each transfer.'}))];
    }
    if (candidateLedger && i < 2) Object.assign(raw, {$id:candidate.articleIds[i],headline:`Held QA record ${i}`,
      date:`2026-11-${16+i}T12:00:00.000Z`, text_content:`PRIVATE material. ${passages[i]}`});
    await writeFile(join(news,feed+'.jsonl'),records.map(a=>JSON.stringify(a)).join('\n')+'\n');
  }
  if (candidateLedger) await writeFile(join(dir,'approved.json'), JSON.stringify({
    ...candidate, language:'en', title:'QA pair', status:'editor-approved', reviewedBy:'Fixture editor', reviewedAt:'2026-11-18T00:00:00Z',
    updates:candidate.articleIds.map((articleId,i)=>({articleId,updateId:candidate.updateIds[i],publishedAt:`2026-11-${16+i}T12:00:00.000Z`,
      evidenceQuote:passages[i],spokenText:lines[i]}))
  }));
  const preload=dailyAudio?['--import',fileURLToPath(new URL('../../tests/mock-daily-provider.mjs',import.meta.url))]:[];
  const settings={...(dailyAudio?{OPENAI_API_KEY:'test-only',ELEVENLABS_API_KEY:'test-only'}:{}),PORT:'0',NEWSTEX_DATA_DIR:data?news:'',
    MEMORY_LEDGER_FILE:badLedger?join(dir,'missing'):candidateLedger?join(dir,'approved.json'):''};
  if(envFileOnly) await writeFile(join(dir,'.env'),Object.entries({...settings,OPENAI_MODEL:'draft-fixture',OPENAI_VERIFIER_MODEL:'check-fixture',
    OPENAI_REPAIR_MODEL:'repair-fixture',ELEVENLABS_VOICE_ID:'test-voice',ELEVENLABS_MODEL:'voice-fixture'}).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600});
  const proc=spawn(process.execPath,[...preload,join(dir,'backend/src/server.mjs')],{cwd:envFileOnly?join(dir,'backend'):dir,env:{
    ...(envFileOnly?{QA_CHECK_CONFIG:'1'}:settings),QA_TTS:dailyAudio??'',QA_MODE:qaMode,PATH:process.env.PATH},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(proc.exitCode===null && !proc.signalCode){const ended=once(proc,'exit');proc.kill();await ended}});
  const [ready]=await once(proc.stdout,'data',{signal:AbortSignal.timeout(5000)});
  const base=ready.toString().match(/http:\/\/127\.0\.0\.1:\d+/)[0];
  return {dir,base,get:(path,options)=>fetch(base+path,options),post:(path,body)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})};
}
test('HTTP: six-feed ingestion; FX/NL/custom appropriate fallback and no history filter on daily news',async t=>{
  const {get,post}=await server(t);
  assert.equal((await (await get('/api/health')).json()).articles,6);
  for (const [i,listener] of [...presets.map(p=>p.listener),{language:'de',topics:['Öl'],depth:'deep',maxMinutes:2}].entries()) {
    const res=await post('/api/briefings',{listener:{...listener,heardFactIds:['sample']},heardUpdateIds:['arbitrary'],asOf:'2026-11-19T12:00:00Z'});
    assert.equal(res.status,200);
    const out=await res.json();
    assert.equal(out.generationMode,'source-headline-fallback');
    assert.equal(out.topicMatchStatus,'matched');
    assert.equal(out.audioStatus,'not_requested');assert.equal(out.modelStatus,'key_missing');
    assert.equal(out.segments[1].sources[0].url,'https://example.test/'+[0,4,2][i]);
    assert.ok(!JSON.stringify(out).includes('SERVER-ONLY'));
    const again=await (await post('/api/briefings',{listener:{...listener,heardFactIds:out.segments[1].factIds},asOf:out.asOf})).json();
    assert.deepEqual(again.segments,out.segments);
  }
});
test('HTTP: rehearsal without feeds, working fixture citations, silence on unchanged, explicit audio failure',async t=>{
  const {get,post}=await server(t,{data:false});
  assert.equal((await post('/api/briefings',{listener:presets[0].listener})).status,503);
  const story=await (await get('/api/memory')).json();
  const input={storyId:story.storyId,asOf:story.editions[0],withAudio:true};
  const first=await (await post('/api/memory',input)).json();
  assert.equal(first.audioUrl,null);assert.equal(first.audioStatus,'key_missing');
  const next=await (await post('/api/memory',{...input,asOf:story.editions[1],heardUpdateIds:first.updateIds})).json();
  assert.equal(next.kind,'continuation');
  assert.equal(next.previouslyHeard.length,1);
  const ref=await get(next.segments[1].sources[0].url);
  assert.match(await ref.text(),/FICTIONAL SOURCE/);
  const silent=await (await post('/api/memory',{...input,heardUpdateIds:first.updateIds})).json();
  assert.equal(silent.audioStatus,'not_requested');
  assert.deepEqual(silent.segments,[]);
  for(const bad of [null,[],{...input,storyId:'unapproved'},{...input,asOf:'tomorrow'}]) assert.equal((await post('/api/memory',bad)).status,400);
});
test('HTTP: invalid private ledger closes Memory but daily news stays online',async t=>{
  const {get,post}=await server(t,{badLedger:true});
  assert.equal((await get('/api/memory')).status,503);
  assert.equal((await post('/api/briefings',{listener:presets[0].listener,asOf:'2026-11-19'})).status,200);
});

test('HTTP: private approval releases only the curated pair to Memory; the daily hold remains',async t=>{
  const {get,post}=await server(t,{candidateLedger:true});
  const catalogue=await (await get('/api/memory')).json();
  assert.equal(catalogue.synthetic,false);
  const open=async(i,heardUpdateIds,withAudio=false)=>(await post('/api/memory',{storyId:candidate.storyId,asOf:candidate.editions[i],heardUpdateIds,withAudio})).json();
  const first=await open(0,[]);
  assert.ok(!JSON.stringify(first).includes(candidate.articleIds[1]));
  const later=await open(1,first.updateIds);
  assert.equal(later.kind,'continuation');
  assert.deepEqual(later.segments.at(-1).sources.map(s=>s.url),['https://example.test/1']);
  assert.ok(!JSON.stringify(later).includes('PRIVATE'));
  assert.equal((await open(1,[...first.updateIds,...later.updateIds],true)).audioStatus,'not_requested');
  const response=await post('/api/briefings',{listener:presets[0].listener,asOf:'2026-11-19'});
  assert.equal(response.status,400); // the only FX source was held; do not substitute unrelated news
  const daily=await response.text();
  for(const id of candidate.articleIds) assert.ok(!daily.includes(id));
});


test('native player can request exact MP3 byte ranges for seek and replay', async t=>{
  const {get,dir,post}=await server(t,{dailyAudio:'frames'});
  const r=await daily(post),path=r.audioUrl,bytes=await readFile(join(dir,'generated/audio',path.split('/').at(-1)));
  const whole=await get(path);assert.equal(whole.status,200);assert.deepEqual(Buffer.from(await whole.arrayBuffer()),bytes);
  for(const [range,start,end] of [['bytes=2-8',2,8],['bytes=5-',5,bytes.length-1],['bytes=-3',bytes.length-3,bytes.length-1]]) {
    const r=await get(path,{headers:{range}});assert.equal(r.status,206);
    assert.equal(r.headers.get('content-range'),`bytes ${start}-${end}/${bytes.length}`);
    assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes.subarray(start,end+1));
  }
  assert.equal((await get(path,{headers:{range:'bytes='+bytes.length+'-'}})).status,416);
});

test('HTTP daily: diagnostics, resolvable non-text audit, and only the exact final transcript goes to TTS',async t=>{
  const {post,dir}=await server(t,{dailyAudio:'frames'});
  const sha=s=>createHash('sha256').update(s).digest('hex');
  for(const minutes of [3,.5]) {
    const res=await post('/api/briefings',{listener:{...presets[0].listener,maxMinutes:minutes},asOf:cutoff});
    const r=await res.json();assert.equal(res.status,200);
    const spoken=r.segments.map(s=>s.text).join('\n\n'), d=r.diagnostics;
    assert.equal(r.qualityStatus,'sufficient_verified_content');assert.equal(r.usage.ttsCharacters,spoken.length);
    assert.equal(await readFile(join(dir,'tts-text.sha256'),'utf8'),sha(spoken));
    assert.equal(d.actualMp3DurationSeconds,3600*1152/44100);
    if(minutes===3) {assert.equal(r.audioStatus,'generated');assert.equal(r.durationSeconds,d.actualMp3DurationSeconds);}
    else {assert.equal(r.audioStatus,'over_time_limit');assert.equal(r.audioUrl,null);assert.equal(r.durationSeconds,null);}
    const log=async name=>JSON.parse((await readFile(join(dir,'generated',name+'.jsonl'),'utf8')).trim().split('\n').at(-1));
    const usage=await log('usage'), audit=await log('fact-audit');
    assert.equal(usage.briefingId,r.id);assert.deepEqual(usage.diagnostics,d);assert.equal(audit.briefingId,r.id);
    assert.deepEqual(audit.factCards.map(c=>c.factId),r.segments.flatMap(s=>s.factIds));
    for(const c of audit.factCards) {
      const body=fixtureNews.find(a=>a.id===c.articleId).text;
      const passage=body.slice(c.start,c.end), focus=body.slice(c.focusStart,c.focusEnd);
      assert.equal(c.field,'text');assert.ok(passage.includes(focus));assert.equal(c.evidenceSha256,sha(passage));
      const line=r.segments.find(s=>s.factIds.includes(c.factId));assert.equal(c.spokenSha256,sha(line.text));
      const a=fixtureNews.find(a=>a.id===c.articleId);
      assert.deepEqual(line.sources,[{articleId:a.id,url:a.url,title:a.headline,publishedAt:new Date(a.date).toISOString(),publisher:a.outlet}]);
      assert.ok(!JSON.stringify([r,usage,audit]).includes(focus));assert.ok(!JSON.stringify([usage,audit]).includes(line.text));
    }
  }
});

test('HTTP daily: TTS HTTP failure is reported separately from script quality and never echoes the provider payload',async t=>{
  const {post,dir}=await server(t,{dailyAudio:'http'});
  const r=await (await post('/api/briefings',{listener:presets[0].listener,asOf:cutoff})).json();
  assert.equal(r.audioUrl,null);assert.equal(r.audioStatus,'tts_failed');assert.equal(r.usageComplete,false);
  assert.equal(r.qualityStatus,'sufficient_verified_content');assert.equal(r.diagnostics.actualMp3DurationSeconds,null);
  assert.deepEqual(r.diagnostics.providerFailures,[{stage:'tts',category:'provider_server_error',httpStatus:503}]);
  assert.doesNotMatch(await readFile(join(dir,'generated/usage.jsonl'),'utf8'),/DO NOT ECHO|test-only/);
});


test('live smoke CLI checks both gates on the fixture transport; same server still gives a short, new-only Memory continuation',async t=>{
  const {post,get,base,dir}=await server(t,{dailyAudio:'frames'});
  const {stdout}=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../scripts/smoke.mjs',import.meta.url)),'fx-trader'],
    {env:{PATH:process.env.PATH,BACKEND_URL:base,AS_OF:cutoff},cwd:dir});
  assert.match(stdout,/PASS transport \+ automatic script gate: 221 verified words/);
  const m=await (await get('/api/memory')).json();
  const edition=async(i,heardUpdateIds,withAudio=false)=>(await post('/api/memory',{storyId:m.storyId,asOf:m.editions[i],maxMinutes:3,heardUpdateIds,withAudio})).json();
  const first=await edition(0,[]), next=await edition(1,first.updateIds);
  assert.equal(next.kind,'continuation');assert.equal(next.qualityStatus,undefined);assert.ok(next.estimatedDurationSeconds<60);
  assert.equal(next.updateIds.length,1);assert.ok(next.segments.every(s=>!first.updateIds.includes(s.updateId)));
  assert.deepEqual(next.previouslyHeard.map(s=>s.text),first.segments.filter(s=>s.factIds.length).map(s=>s.text));
  const silent=await edition(1,[...first.updateIds,...next.updateIds],true);
  assert.deepEqual(silent.segments,[]);assert.equal(silent.audioStatus,'not_requested');
  assert.equal((await readFile(join(dir,'generated/usage.jsonl'),'utf8')).trim().split('\n').length,1); // only the daily job
});

const daily=async(post,i=0)=>{
  const res=await post('/api/briefings',{asOf:cutoff,listener:scenarios[i].listener});
  assert.equal(res.status,200);return res.json();
};
async function calls(dir) {
  try {return (await readFile(join(dir,'qa-calls.txt'),'utf8')).trim().split('\n');}
  catch(e) {if(e.code==='ENOENT') return [];throw e;}
}
const sha=s=>createHash('sha256').update(s).digest('hex');
for (const [mode,reason,kind,expected] of [
  ['thin','insufficient_verified_content','verified_only',['writer','verifier']],
  ['no-body','no_body_evidence','headlines_only',[]],
  ['verifier-error','verifier:rate_limit','headlines_only',['writer','verifier']],
]) test('HTTP: no full TTS with configured keys: '+mode,async t=>{
  const {post,dir}=await server(t,{dailyAudio:'frames',qaMode:mode});
  const r=await daily(post),d=r.diagnostics;
  assert.equal(r.qualityStatus,'insufficient_verified_content');assert.equal(r.generationMode,'source-headline-fallback');
  assert.equal(r.audioStatus,'not_requested');assert.equal(r.audioUrl,null);assert.equal(r.durationSeconds,null);
  assert.equal(r.usage.ttsCharacters,0);assert.equal(r.ttsMs,0);assert.ok(r.segments[1].sources[0].url);
  assert.equal(d.actualMp3DurationSeconds,null);assert.equal(d.fallbackReason,reason);assert.equal(d.fallbackKind,kind);
  assert.equal(d.finalVerifiedWords,mode==='thin'?46:0);
  assert.deepEqual(d.providerFailures,mode==='verifier-error'?[{stage:'verifier',category:'rate_limit',httpStatus:429}]:[]);
  assert.equal(r.usageComplete,mode!=='verifier-error');
  assert.deepEqual(await calls(dir),expected); // not merely hidden audio
  assert.ok(!(await readdir(join(dir,'generated'))).includes('audio'));
});

test('HTTP: repair additions pass the separate evidence oracle before entering a substantive script and TTS',async t=>{
  const {post,dir}=await server(t,{dailyAudio:'frames',qaMode:'repair'});
  const r=await daily(post),d=r.diagnostics;
  assert.deepEqual(await calls(dir),['writer','verifier','repair','repair_verifier','tts']);
  assert.equal(r.qualityStatus,'sufficient_verified_content');assert.equal(r.repairApplied,true);
  assert.ok(d.finalVerifiedWords>=140);assert.equal(d.finalVerifiedEvents,2);
  const extra=r.segments.filter(s=>s.storyId==='fen');
  assert.ok(extra.length>=2);assert.equal(extra.length,d.attempts[1].verified);
  for (const s of extra) {
    assert.ok(stories[1][3].some(([,claim])=>claim===s.text));
    assert.deepEqual(s.sources.map(a=>[a.articleId,a.url]),[['fen','https://example.test/fen']]);
  }
  assert.equal(await readFile(join(dir,'tts-text.sha256'),'utf8'),sha(r.segments.map(s=>s.text).join('\n\n')));
});

test('HTTP: fresh under-floor recording is measured, charged characters counted, transcript retained, nothing published',async t=>{
  const {post,dir}=await server(t,{dailyAudio:'short-frames'});
  const r=await daily(post);
  assert.equal(r.qualityStatus,'sufficient_verified_content');assert.equal(r.diagnostics.finalVerifiedWords,221);
  assert.equal(r.audioStatus,'below_minimum_duration');assert.equal(r.diagnostics.audioStatus,r.audioStatus);
  assert.equal(r.audioUrl,null);assert.equal(r.durationSeconds,null);
  assert.equal(r.diagnostics.actualMp3DurationSeconds,1200*1152/44100);assert.equal(r.usageComplete,true);
  assert.equal(r.usage.ttsCharacters,r.segments.map(s=>s.text).join('\n\n').length);
  assert.deepEqual(await calls(dir),['writer','verifier','tts']);assert.deepEqual(r.diagnostics.providerFailures,[]);
  assert.ok(!(await readdir(join(dir,'generated'))).includes('audio'));
});

async function gateCLI({dir,base}) {
  // The audit must come from the disposable server's tree, never a team log.
  await cp(new URL('../scripts',import.meta.url),join(dir,'backend/scripts'),{recursive:true});
  await cp(new URL('../../shared/listener-profiles.json',import.meta.url),join(dir,'shared/listener-profiles.json'));
  return (...args)=>promisify(execFile)(process.execPath,['backend/scripts/profile-gate.mjs',...args],{cwd:dir,
    env:{PATH:process.env.PATH,NEWSTEX_DATA_DIR:join(dir,'feeds'),BACKEND_URL:base,AS_OF:cutoff}});
}

test('paired laptop gate: actual selection, final groups and original sources differ at one cutoff; copies/translation count once',async t=>{
  const app=await server(t,{dailyAudio:'frames'}), cli=await gateCLI(app);
  const {stdout}=await cli('--presets-only');
  const json=stdout.slice(stdout.indexOf('{\n  "asOf"'),stdout.indexOf('\nPASS source identities'));
  const {overlap,results,asOf}=JSON.parse(json);
  assert.equal(results.length,2);assert.equal(overlap,0);assert.equal(asOf,cutoff);
  for (const [i,r] of results.entries()) {
    const leads=i?['riet','wilg']:['cairn','fen'];
    assert.deepEqual(r.selectedEventIds.sort(),leads);assert.deepEqual(r.sourceIds.sort(),leads);
    assert.deepEqual(r.eventIds.sort(),i?['riet','willow-en']:leads); // not two different IDs for translated coverage
    assert.equal(r.facts,10);assert.equal(r.verifiedWords,i?220:221);assert.equal(r.audioStatus,'generated');
  }
  assert.deepEqual(await calls(app.dir),['writer','verifier','tts','writer','verifier','tts']);
});

const localCodecs=['espeak','ffmpeg','ffprobe'].every(c=>spawnSync(c,[c==='espeak'?'--version':'-version'],{stdio:'ignore'}).status===0);
test('decodable offline speech: two presets + custom German, source audit of three saved editions, short Memory and legacy cache floor',
  {skip:localCodecs?false:'Optional local codec integration needs espeak, ffmpeg (libmp3lame) and ffprobe'},async t=>{
  const app=await server(t,{dailyAudio:'speech'}),{post,dir,get}=app,cli=await gateCLI(app);
  const run=promisify(execFile), files=['fx.json','nl.json','de.json'], editions=[];
  for (const [i,file] of files.entries()) {
    const r=await daily(post,i);editions.push(r);
    assert.equal(r.qualityStatus,'sufficient_verified_content');assert.equal(r.audioStatus,'generated');
    assert.equal(await readFile(join(dir,'tts-text.sha256'),'utf8'),sha(r.segments.map(s=>s.text).join('\n\n')));
    const path=join(dir,'generated/audio',r.audioUrl.split('/').at(-1));
    const bytes=Buffer.from(await (await get(r.audioUrl)).arrayBuffer()), seconds=checkRecording(bytes,r,180);
    const probe=await run('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',path]);
    await run('ffmpeg',['-v','error','-xerror','-i',path,'-f','null','-']); // decode to the end
    assert.ok(seconds>=60 && seconds<=180 && Math.abs(seconds-Number(probe.stdout))<.03);
    for (const s of r.segments.filter(s=>s.factIds.length)) {
      const [id]=stories.find(row=>row[3].some(([,spoken])=>spoken===s.text)); // identify by claim, NOT by returned ID
      const a=fixtureNews.find(a=>a.id===id);
      assert.deepEqual(s.sources,[{articleId:id,title:a.headline,publisher:a.outlet,publishedAt:new Date(a.date).toISOString(),url:a.url}]);
    }
    t.diagnostic(`Local eSpeak only, ${scenarios[i].id}: ${r.diagnostics.finalVerifiedWords} factual words, ${r.usage.ttsCharacters} characters, ${r.estimatedDurationSeconds}s estimate, ${seconds.toFixed(3)}s MP3; ffprobe ${probe.stdout.trim()}s`);
    await writeFile(join(dir,file),JSON.stringify(r));
  }
  const before=await calls(dir);
  assert.match((await cli('--saved',...files)).stdout,/PASS source identities/);
  // A perfectly valid URL belonging to another article must fail the local audit.
  const wrong=structuredClone(editions[1]);wrong.segments[1].sources[0].url=editions[0].segments[1].sources[0].url;
  await writeFile(join(dir,files[1]),JSON.stringify(wrong));
  await assert.rejects(cli('--saved',...files),/Source, cutoff, event, evidence or spoken-text mismatch/);
  assert.deepEqual(await calls(dir),before);

  const m=await (await get('/api/memory')).json();
  const open=async(i,heardUpdateIds,withAudio)=>(await post('/api/memory',{storyId:m.storyId,asOf:m.editions[i],maxMinutes:3,heardUpdateIds,withAudio})).json();
  const first=await open(0,[],false), next=await open(1,first.updateIds,true);
  assert.equal(m.synthetic,true);assert.equal(next.audioStatus,'generated');assert.equal(next.kind,'continuation');
  assert.deepEqual(next.previouslyHeard.map(s=>s.text),first.segments.filter(s=>s.factIds.length).map(s=>s.text));
  assert.equal(next.updateIds.length,1);assert.ok(next.segments.every(s=>!first.updateIds.includes(s.updateId)));
  assert.equal(await readFile(join(dir,'tts-text.sha256'),'utf8'),sha(next.segments.map(s=>s.text).join('\n\n')));
  const short=Buffer.from(await (await get(next.audioUrl)).arrayBuffer()), seconds=mp3Seconds(short);
  assert.equal(next.durationSeconds,seconds);assert.ok(seconds>0 && seconds<60);
  const silent=await open(1,[...first.updateIds,...next.updateIds],true);
  assert.equal(silent.kind,'no-change');assert.deepEqual(silent.segments,[]);assert.equal(silent.audioStatus,'not_requested');
  assert.equal(silent.ttsCharacters,0);assert.deepEqual(await calls(dir),[...before,'tts']);
  t.diagnostic(`Local fictional new-only continuation: ${seconds.toFixed(3)}s MP3; caught up: no TTS.`);

  // Simulate an older server claiming success for real but short bytes, with
  // *matching* duration metadata. The independent smoke must still fail.
  for (const audioStatus of ['generated','cached'])
    assert.throws(()=>checkRecording(short,{audioStatus,durationSeconds:seconds,diagnostics:{actualMp3DurationSeconds:seconds}},180),/below_minimum_duration/);
  // Exercise the actual CLI independently of today's (fail-closed) server.
  const legacy={...editions[0],audioStatus:'cached',audioUrl:next.audioUrl,durationSeconds:seconds,
    diagnostics:{...editions[0].diagnostics,audioStatus:'cached',actualMp3DurationSeconds:seconds}};
  const old=createServer((req,res)=>{
    if (req.url===legacy.audioUrl) {res.writeHead(200,{'content-type':'audio/mpeg'});res.end(short);return;}
    if (req.url==='/api/health') res.end(JSON.stringify({articles:10,textModelConfigured:true,ttsConfigured:true}));
    else if (req.url==='/api/briefings') res.end(JSON.stringify(legacy));
    else {res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>old.listen(0,'127.0.0.1',resolve));
  try {
    await assert.rejects(run(process.execPath,['backend/scripts/smoke.mjs','fx-trader'],{cwd:dir,
      env:{PATH:process.env.PATH,AS_OF:cutoff,BACKEND_URL:'http://127.0.0.1:'+old.address().port}}),
      e=>e.code===1 && /Delivered MP3: below_minimum_duration/.test(e.stderr));
  } finally {await new Promise(resolve=>old.close(resolve));}
  const fx=editions[0], target=join(dir,'generated/audio',fx.audioUrl.split('/').at(-1));
  assert.equal((await daily(post)).audioStatus,'cached'); // good cache, no TTS
  await writeFile(target,short); // historical bad entry, disposable tree only
  const rejected=await daily(post);
  assert.deepEqual(rejected.segments,fx.segments);assert.equal(rejected.qualityStatus,fx.qualityStatus);
  assert.equal(rejected.audioStatus,'below_minimum_duration');assert.equal(rejected.diagnostics.actualMp3DurationSeconds,seconds);
  assert.equal(rejected.durationSeconds,null);assert.equal(rejected.audioUrl,null);assert.equal(rejected.usage.ttsCharacters,0);
  assert.deepEqual(await calls(dir),[...before,'tts','writer','verifier','writer','verifier']);
});

test('request boundary: missing/invalid interests, language, date, cap, no match and empty window never buy a draft',async t=>{
  const {post,dir}=await server(t,{dailyAudio:'frames'}), l=presets[0].listener;
  for (const patch of [{topics:undefined},{topics:[]},{topics:[' ']},{topics:['oil',42]},{topics:Array(7).fill('FX')},{depth:'other'},
    {language:'es'},{language:42},{maxMinutes:0},{maxMinutes:11},{maxMinutes:true},{maxMinutes:[3]}]) {
    assert.equal((await post('/api/briefings',{asOf:cutoff,listener:{...l,...patch}})).status,400);
  }
  for(const asOf of [null,{},'invalid','2026-02-30','2026-11-19T20:00:00'])
    assert.equal((await post('/api/briefings',{asOf,listener:l})).status,400);
  for(const [asOf,topics,reason] of [[cutoff,['lunar railways'],'no_matching_topics'],['2025-11-19',l.topics,'no_eligible_events']]) {
    const r=await post('/api/briefings',{asOf,listener:{...l,topics}});
    assert.equal(r.status,400);assert.equal((await r.json()).diagnostics.fallbackReason,reason);
  }
  assert.deepEqual(await calls(dir),[]);
});

test('simultaneous identical archive jobs only admit one paid workflow',async t=>{
  const {post,dir}=await server(t,{dailyAudio:'frames',qaMode:'slow'});
  const out=await Promise.all(Array.from({length:3},async()=>{const r=await post('/api/briefings',{listener:scenarios[2].listener,asOf:cutoff});return [r.status,await r.json()];}));
  assert.deepEqual(out.map(x=>x[0]).sort(),[200,409,409]);
  assert.equal(out.find(x=>x[0]===200)[1].diagnostics.finalVerifiedEvents,2);
  assert.deepEqual(await calls(dir),['writer','verifier','tts']);
});

test('byte-range and full playback refuse a changed cache, even a different complete in-window recording',async t=>{
  const {post,get,dir}=await server(t,{dailyAudio:'frames'});
  const r=await daily(post),file=join(dir,'generated/audio',r.audioUrl.split('/').at(-1));
  const b=await readFile(file);await writeFile(file,b.subarray(0,-417));
  for(const headers of [{},{range:'bytes=0-99'}]) assert.equal((await get(r.audioUrl,{headers})).status,404);
  const next=await daily(post);assert.equal(next.audioStatus,'unverified_cache');assert.equal(next.audioUrl,null);
  assert.deepEqual(next.segments,r.segments);assert.equal(next.usage.ttsCharacters,0);
  await rm(file);assert.equal((await get(r.audioUrl)).status,404);
});

test('root .env, independent models, auth, timeouts and configured voice through real HTTP routes (mock services)',async t=>{
  const {get,post}=await server(t,{dailyAudio:'frames',qaMode:'repair',envFileOnly:true});
  const health=await (await get('/api/health')).json();assert.ok(health.textModelConfigured && health.ttsConfigured);
  const r=await daily(post);assert.equal(r.repairApplied,true);assert.equal(r.editionStatus,'complete');
  assert.equal(r.audioSha256,createHash('sha256').update(Buffer.from(await (await get(r.audioUrl)).arrayBuffer())).digest('hex'));
  assert.doesNotMatch(JSON.stringify([health,r]),/test-only|Bearer |xi-api-key/);
});
