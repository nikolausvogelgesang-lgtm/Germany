import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,rm,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {editionIndex} from '../src/editorial.mjs';
import {groupArticles,rankGroups} from '../src/news.mjs';
import {selectEvidence} from '../src/evidence.mjs';
import {modelSegmentFailure,numericExpressions} from '../src/claims.mjs';
import {measureMp3,durationFailure} from '../src/timing.mjs';
import {providerPreflight} from '../scripts/preflight.mjs';
import {ProviderFailure,structuredOutput} from '../src/providers.mjs';
import {cutoff,scenarios} from '../scripts/scenarios.mjs';
import {articles} from '../../tests/daily-evidence-fixture.mjs';

const art=(id,headline,extra={})=>({...articles[0],id,headline,outlet:id,text:id,...extra});
test('future or stale coverage cannot bridge two earlier groups or change their held status',()=>{
  const old=[art('a','Cairn bank approves currency settlement plan'),art('b','Cairn bank approves overnight lending plan')];
  const bridge=art('future','Cairn bank approves currency settlement overnight lending plan',{dateMs:Date.parse(cutoff)+1});
  const snapshot=editionIndex([...old,bridge]);
  assert.deepEqual(snapshot(cutoff),editionIndex(old)(cutoff));assert.equal(snapshot(cutoff).length,2);
  assert.equal(snapshot(new Date(bridge.dateMs).toISOString()).length,1);
  assert.deepEqual(editionIndex([...old,{...bridge,dateMs:Date.parse(cutoff)-7*86400000-1}])(cutoff),snapshot(cutoff));
});
test('time and byline alone or different earnings quarters are not the same event',()=>{
  const x=art('a','Wilg Cloud expands rental contracts',{author:'desk',feed:'invezz_en.jsonl'});
  const y=art('b','Ölpreise fallen nach einem Streik',{author:'desk',feed:'invezz_de.jsonl',language:'de'});
  assert.equal(groupArticles([x,y]).groups.length,2);
  assert.equal(groupArticles([art('q','Baidu Q2 earnings: AI cloud growth'),art('q3','Baidu Q3 earnings: AI cloud growth')]).groups.length,2);
});
test('German oil compounds select relevant reports; a sourced detail need not chant the topic',()=>{
  const l=scenarios[2].listener,a=art('werk','Öllager öffnet in Auenwerk',{language:'de',text:'Auenwerk behält die bisherigen Gebühren für bereits gebuchte Lagerplätze bei.'});
  assert.ok(rankGroups([[a]],l,cutoff)[0].topicHits>0);
  const [p]=selectEvidence(a,l.topics);
  assert.equal(modelSegmentFailure({evidenceQuote:p.quote,text:'Für Lagerplätze mit bestehender Buchung lässt Auenwerk die Gebühren unverändert.'},a,l,p,cutoff),null);
});
test('German abbreviated monetary scale stays in its sentence, with exact offsets, unit and currency',()=>{
  const a=art('netz','Auenwerk meldet Netzerlöse',{language:'de',text:'Auenwerk erwartet einen Erlös von 15 Mio. Euro aus dem Betrieb der Stromnetze im kommenden Winter.'});
  const [p]=selectEvidence(a);
  assert.equal(p.focus,a.text);assert.equal(a.text.slice(p.start,p.end),p.quote);
  assert.deepEqual(numericExpressions('15 Mio. Euro'),numericExpressions('15 Millionen Euro'));
  assert.notDeepEqual(numericExpressions('15 Mio. Euro'),numericExpressions('15 Euro'));
  assert.notDeepEqual(numericExpressions('32 MWh'),numericExpressions('32 kWh'));
  assert.notDeepEqual(numericExpressions('32MW'),numericExpressions('32MWh'));
});
test('an exactly 180s presentation is valid; truncation on or inside its last tagged frame is not',
 {skip:spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status!==0},async t=>{
  const dir=await mkdtemp(join(tmpdir(),'st-limit-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=join(dir,'boundary.mp3');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=sample_rate=44100:duration=180','-c:a','libmp3lame','-b:a','128k',file]);
  const b=await readFile(file),m=measureMp3(b);
  assert.equal(m.playableSeconds,180);assert.ok(m.frameSeconds>180);
  assert.equal(durationFailure(m,180,60),null);assert.equal(durationFailure(m,179.99,60),'over_time_limit');
  for(const cut of [1,417,418]) assert.equal(measureMp3(b.subarray(0,-cut)),null);
});
const env={OPENAI_API_KEY:'test-only-a',ELEVENLABS_API_KEY:'test-only-b',OPENAI_MODEL:'writer',OPENAI_VERIFIER_MODEL:'review',
  OPENAI_REPAIR_MODEL:'review',ELEVENLABS_MODEL:'voice-engine',ELEVENLABS_VOICE_ID:'voice'};
test('preflight uses metadata GET only, checks distinct configured models, voice and safe outcome categories',async()=>{
  const calls=[];
  const send=async(url,options)=>{
    calls.push(url);assert.equal(options.method,'GET');assert.ok(!options.body);assert.equal(options.redirect,'error');
    if(url.startsWith('https://api.openai.com/v1/models/')) {
      assert.equal(options.headers.authorization,'Bearer test-only-a');return Response.json({id:url.split('/').at(-1)});
    }
    assert.equal(options.headers['xi-api-key'],'test-only-b');
    if(url.endsWith('/v1/voices/voice')) return Response.json({voice_id:'voice'});
    assert.equal(url,'https://api.elevenlabs.io/v1/models');return Response.json([{model_id:'voice-engine',can_do_text_to_speech:true}]);
  };
  assert.ok((await providerPreflight({},send)).every(r=>r.status==='NOT CONFIGURED'));assert.equal(calls.length,0);
  assert.ok((await providerPreflight(env,send)).every(r=>r.status==='READY'));assert.equal(calls.length,4);
  for(const [code,label] of [[401,'AUTHENTICATION FAILED'],[403,'MODEL OR VOICE UNAVAILABLE'],[404,'MODEL OR VOICE UNAVAILABLE'],
    [429,'RATE LIMITED'],[500,'PROVIDER ERROR'],[0,'NETWORK UNAVAILABLE']]) {
    const rows=await providerPreflight(env,async()=>{if(!code) throw new TypeError('PRIVATE');return new Response('PRIVATE',{status:code});});
    assert.ok(rows.every(r=>r.status===label));assert.doesNotMatch(JSON.stringify(rows),/test-only|PRIVATE/);
  }
  const missing=await providerPreflight(env,async()=>Response.json([]));
  assert.ok(missing.every(r=>r.category==='unavailable'));
});
test('runtime rejects invalid HTTP/JSON, partial or queued structured output, refusals and timeouts without leaking bodies',async t=>{
  const f=t.mock.method(globalThis,'fetch');
  const normal={status:'completed',output:[{type:'message',status:'completed',content:[{type:'output_text',text:'{"result":true}'}]}]};
  for(const [send,why] of [
    [()=>new Response('PRIVATE'),'unexpected_content_type'],[()=>new Response('{PRIVATE',{headers:{'content-type':'application/json'}}),'invalid_response_json'],
    [()=>Response.json({...normal,status:'incomplete'}),'incomplete_output'],[()=>Response.json({...normal,status:'queued'}),'incomplete_output'],
    [()=>Response.json({...normal,output:[{...normal.output[0],status:'incomplete'}]}),'incomplete_output'],
    [()=>Response.json({...normal,output:[{content:[{type:'refusal'}]}]}),'refusal'],
    [()=>Response.json({...normal,output:[{content:[{type:'output_text',text:'{PRIVATE'}]}]}),'invalid_output_json'],
    [()=>{throw new DOMException('PRIVATE','TimeoutError');},'timeout'],
    ...[[401,'authentication'],[403,'permission'],[429,'rate_limit'],[500,'provider_server_error']].map(([code,reason])=>[()=>new Response('PRIVATE',{status:code}),reason]),
  ]) {
    f.mock.mockImplementation(send);
    await assert.rejects(structuredOutput('writer','test-only',{},()=>{}),e=>e instanceof ProviderFailure && e.category===why && !/PRIVATE/.test(e.message));
  }
});

test('matching template headlines do not combine different named banks or opposite decisions',()=>{
  const rows=[art('s','Seaford bank approves currency auction'),art('w','Westbank bank approves currency auction'),
    art('r','Seaford bank rejects currency auction')];
  assert.equal(groupArticles(rows).groups.length,3);
});

test('duplicate IDs and unbound source metadata fail ingestion, whitespace-only bodies are not wire copies',async t=>{
  const {loadArticles}=await import('../src/news.mjs'),{writeFile}=await import('node:fs/promises');
  const dir=await mkdtemp(join(tmpdir(),'st-meta-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  for(const n of ['actionforex','ibtimes_uk','invezz_de','invezz_en','invezz_nl','zacks']) await writeFile(join(dir,n+'.jsonl'),'');
  const a={$id:'meta',headline:'Fixture',language:'en',publication:{name:'QA'},permalink:'https://example.test/meta',date:cutoff,text_content:'Private-to-test'};
  for(const bad of [{permalink:'/no-original'},{publication:{}},{date:'2026-11-19T18:00:00'}]) {
    await writeFile(join(dir,'zacks.jsonl'),JSON.stringify({...a,...bad}));await assert.rejects(loadArticles(dir),/Invalid/);
  }
  await writeFile(join(dir,'zacks.jsonl'),JSON.stringify(a)+'\n'+JSON.stringify(a));
  await assert.rejects(loadArticles(dir),/Duplicate article ID/);
  assert.equal(groupArticles([art('a','Cairn credit terms',{text:'   '}),art('b','Fen revises timetable',{text:'\n'})]).groups.length,2);
});
