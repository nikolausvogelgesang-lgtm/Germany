import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {mkdtemp,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {makeScript,validateModelSegment} from '../src/briefing.mjs';
import {synthesize} from '../src/tts.mjs';
import {estimatedSeconds,wordCount,wordBudget} from '../src/timing.mjs';
import {replay,sample} from '../src/memory.mjs';
import {groups,cutoff,draft,output} from '../../tests/radio-fixture.mjs';

const brief = (minutes, language='en', news=groups) => makeScript(news,{language,maxMinutes:minutes},cutoff,'mock');
function mockModel(t, write, check = c => c.map(({id})=>({id,supported:true}))) {
  const calls=[];
  t.mock.method(globalThis,'fetch',async (url,options) => {
    assert.equal(url,'https://api.openai.com/v1/responses');
    const request=JSON.parse(options.body), input=JSON.parse(request.input);
    calls.push(input);
    return input.claims ? output({verdicts:check(input.claims).map(v=>({...v,reason:v.supported?'ok':'unsupported_claim'}))}) : output({segments:write(input)});
  });
  return calls;
}
test('three substantive stories, one verdict per sentence, no title narration, one writer/checker batch', async t => {
  const calls=mockModel(t,()=>draft);
  const result=await brief(3);
  assert.equal(result.generationMode,'source-checked-model');
  assert.equal(calls.length,2);
  const verified=calls[1].claims;
  assert.equal(verified.length,15);
  assert.equal(result.factCards.length,15);
  assert.equal(result.segments.length,16);
  assert.ok(result.estimatedDurationSeconds >= 120 && result.estimatedDurationSeconds <= 180);
  for(const g of groups) {
    const lines=result.segments.filter(s=>s.storyId===g[0].id);
    assert.ok(estimatedSeconds(lines)>=35 && estimatedSeconds(lines)<=55);
    for(const s of lines) {
      const card=result.factCards.find(c=>c.factId===s.factIds[0]);
      assert.ok(g[0].text.includes(card.evidenceQuote));
      assert.ok(verified.some(v=>v.id===card.factId && v.claim===s.text && v.quote===card.evidenceQuote));
      assert.ok(s.text!==g[0].headline && !g[0].text.includes(s.text));
      assert.deepEqual(s.sources,[{articleId:g[0].id,title:g[0].headline,url:g[0].url,publisher:g[0].outlet,publishedAt:cutoff}]);
    }
  }
  assert.equal(result.diagnostics.finalVerifiedWords,293);
  t.diagnostic(`Fictional measured script (293 verified factual words): ${result.segments.reduce((n,s)=>n+wordCount(s.text),0)} words / ${result.segments.map(s=>s.text).join('\n\n').length} characters / ${result.estimatedDurationSeconds}s estimate. Not provider audio.`);
});
test('short cap keeps a coherent prefix, only final fact IDs reach the private audit and ElevenLabs', async t => {
  const calls=mockModel(t,input=>draft.filter(c=>input.articles.some(a=>a.articleId===c.articleId)));
  const result=await brief(0.5);
  const lines=result.segments, spoken=lines.map(s=>s.text).join('\n\n');
  assert.ok(lines.length>=2 && wordCount(spoken)<=wordBudget(0.5));
  assert.ok(result.estimatedDurationSeconds<=30 && result.factCards.length<calls[1].claims.length);
  assert.deepEqual(result.factCards.map(c=>c.factId),lines.flatMap(s=>s.factIds));
  assert.deepEqual(result.factCards.map(c=>c.spokenText),lines.slice(1).map(s=>s.text));
  globalThis.fetch.mock.mockImplementation(async (url,opts)=>{
    assert.ok(url.startsWith('https://api.elevenlabs.io/'));
    assert.equal(JSON.parse(opts.body).text,spoken);
    const frame=Buffer.alloc(417);frame.set([255,251,144,0]);
    return new Response(Buffer.concat([frame,frame,frame]),{headers:{'content-type':'audio/mpeg'}});
  });
  const path=await mkdtemp(join(tmpdir(),'radio-qa-')); t.after(()=>rm(path,{recursive:true,force:true}));
  const audio=await synthesize(lines,'mock',pathToFileURL(path+'/'),30);
  assert.equal(audio.audioStatus,'generated');
  assert.equal(audio.ttsCharacters,spoken.length);
});
test('within a rich story a rejected assertion never reaches transcript or audit, siblings survive',async t=>{
  const unsupported='Juniper has promised to cut prices before the end of the year.';
  const proposed=draft.map((c,i)=>i===6?{...c,text:unsupported}:c);
  const calls=mockModel(t,()=>proposed,list=>list.map(c=>({id:c.id,supported:c.claim!==unsupported})));
  const r=await brief(3);
  assert.equal(calls[1].claims.length,15);
  assert.equal(r.factCards.length,14);
  assert.equal(r.segments.filter(s=>s.storyId==='mill').length,4);
  assert.ok(!JSON.stringify(r).includes(unsupported));
});
test('missing a single independent verdict fails closed, even for an otherwise fluent draft',async t=>{
  mockModel(t,()=>draft,list=>list.slice(1).map(c=>({id:c.id,supported:true})));
  const r=await brief(3);
  assert.equal(r.generationMode,'source-headline-fallback');
  assert.ok(r.segments.slice(1).every(s=>s.kind==='headline'));
  assert.equal(r.usageComplete,false);
  assert.equal(r.modelStatus,'verifier:incomplete_verdicts');assert.equal(r.diagnostics.finalVerifiedSentences,0);
});
test('thin story cannot displace rich coverage; an intact fact across the old boundary is no longer clipped',async t=>{
  const rich=groups[0][0], news=[[{...rich,id:'thin',text:''}],...groups];
  const calls=mockModel(t,()=>draft);
  await brief(3,'en',news);
  assert.ok(calls[0].articles.every(a=>a.articleId!=='thin'));
  const partial='The cooperative has agreed to make payments';
  const clipped={...rich,text:'x'.repeat(4155)+'. '+partial+' only after inspection of each delivery.'};
  const text='Inspection of each delivery must take place before the cooperative will release payment.';
  globalThis.fetch.mock.mockImplementation(async(_u,opt)=>{
    const input=JSON.parse(JSON.parse(opt.body).input);
    if(input.claims) {
      assert.equal(input.claims[0].quote,partial+' only after inspection of each delivery.');
      return output({verdicts:[{id:input.claims[0].id,supported:true,reason:'ok'}]});
    }
    return output({segments:[{text,articleId:clipped.id,evidenceIndex:0}]});
  });
  const r=await brief(3,'en',[[clipped]]);
  assert.equal(r.diagnostics.finalVerifiedSentences,1);assert.equal(r.segments[1].text,text);
  assert.equal(r.qualityStatus,'insufficient_verified_content');assert.equal(r.diagnostics.repairAttempted,false);
});
test('rejects title echoes, reordered title words and a paragraph with an extra sentence',()=>{
  const a=groups[0][0], evidenceQuote=a.text.split('. ')[0]+'.';
  const headline='Port authority proposes dropping overnight storage charge';
  for(const claim of [headline,'Overnight storage charge: port authority proposes dropping.',
    draft[0].text+' The port has already implemented the change.', 'As an AI, I would summarise the inspection fee proposal.']) {
    assert.equal(validateModelSegment({text:claim,evidenceQuote},{...a,headline}),false);
  }
});
for(const [lang,first,summary] of [
  ['de','Hier ist dein Überblick.','Tideglass schlägt vor, die nächtliche Lagergebühr für Kisten in der Warteschlange zur Kontrolle zu streichen.'],
  ['nl','Dit is je briefing.','Tideglass wil de kosten voor nachtelijke opslag schrappen voor kratten die op inspectie wachten.'],
  ['en',"Here's your briefing.",draft[0].text],
]) test(lang+': no spoken technology disclosure in daily, native fallback or curated replay',async t=>{
  mockModel(t,()=>[{...draft[0],text:summary}]);
  const a={...groups[0][0],language:lang};
  const r=await brief(1,lang,[[a]]);
  assert.equal(r.qualityStatus,'insufficient_verified_content');assert.equal(r.segments[1].kind,'summary');assert.equal(r.segments[1].text,summary);
  const fallback=await makeScript([[a]],{language:lang},cutoff,'');
  assert.equal(fallback.segments[0].text,first);
  const memory=replay({...sample,language:lang},{storyId:sample.storyId,asOf:sample.editions[1],heardUpdateIds:[sample.updates[0].updateId]});
  for(const result of [r,fallback,memory]) assert.doesNotMatch(result.segments.map(s=>s.text).join(' '),/syntheti|syntheti[sc]|artificial voice|künstlich|kunstmatig|as an ai/i);
});

test('an ISO amount cannot borrow a different currency in the same sentence; qualifications cannot disappear',()=>{
  const cases=[
    ['The example depot owed USD 35 million and separately owed EUR 12 million for the warehouse.', 'The depot reported a warehouse liability of EUR 35 million.'],
    ['The board said a change was unlikely before the review ended.', 'The board rejected a change before the end of its review.'],
    ['Alder would return only if the committee gave written approval.', 'Alder has decided to return to the cooperative.'],
  ];
  for(const [evidenceQuote,text] of cases) {
    assert.equal(validateModelSegment({text,evidenceQuote},{...groups[0][0],text:evidenceQuote}),false);
  }
});
test('one bounded additive repair deepens a shallow draft when multiple usable details exist',async t=>{
  let drafts=0;
  const calls=mockModel(t,()=>++drafts===1?draft.filter(c=>!c.evidenceIndex):draft);
  const r=await brief(3);
  assert.equal(calls.length,4);assert.equal(r.repairApplied,true);assert.equal(r.generationMode,'source-checked-model');
  assert.ok(r.factCards.length>3 && r.factCards.length<=9);
  assert.ok(calls[2].articles.every(a=>a.passages.every(p=>p.evidenceIndex!==0))); // only uncovered facts
  assert.ok(draft.filter(c=>c.evidenceIndex===0).every(c=>r.segments.some(s=>s.text===c.text)));
});

test('a substantial surviving story is not padded with titles or promoted past the editorial coverage gate',async t=>{
  mockModel(t,()=>draft.filter(c=>c.articleId==='harbour'));
  const r=await brief(3);
  assert.equal(r.generationMode,'source-headline-fallback'); // compatible fallback status
  assert.notEqual(r.modelStatus,'ok');
  assert.equal(r.factCards.length,5);
  assert.ok(r.segments.slice(1).every(s=>s.kind==='summary'));
});

test('cross-outlet event retains two distinct QA facts with sentence-specific links in one spoken story', async t=>{
  const {groupArticles}=await import('../src/news.mjs');
  const {testStories}=await import('../../tests/radio-fixture.mjs');
  const rows=testStories[0][2].slice(0,2);
  const articles=rows.map(([text],i)=>({...groups[0][0], id:'port-'+i, url:'https://example.test/port-'+i,
    headline:'Harbour fee proposal '+['announced','details'][i],outlet:'QA desk '+i,text}));
  const grouped=groupArticles(articles);
  assert.equal(grouped.groups.length,1);
  mockModel(t,()=>rows.map(([,text],i)=>({text,articleId:articles[i].id,evidenceIndex:0})));
  const result=await brief(2,'en',grouped.groups);
  assert.equal(result.qualityStatus,'insufficient_verified_content');
  assert.equal(result.diagnostics.finalVerifiedSentences,2);
  assert.equal(new Set(result.segments.slice(1).map(s=>s.storyId)).size,1);
  assert.deepEqual(result.segments.slice(1).map(s=>s.sources[0].url),articles.map(a=>a.url));
  assert.deepEqual(result.factCards.map(c=>c.evidenceQuote),rows.map(r=>r[0]));
});
