import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import presets from '../../shared/listener-profiles.json' with {type:'json'};
import {cutoff,groups as radio,output,testStories} from '../../tests/radio-fixture.mjs';
import {articles,news,fixtureDraft,fixtureVerdicts,stories} from '../../tests/daily-evidence-fixture.mjs';
import {selectArticles,makeScript,auditPointers,validateModelSegment} from '../src/briefing.mjs';
import {selectEvidence,PASSAGE_LIMIT} from '../src/evidence.mjs';
import {wordCount,wordBudget} from '../src/timing.mjs';

function provider(t,write,check) {
  const calls=[];
  t.mock.method(globalThis,'fetch',async(url,opts)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');
    const req=JSON.parse(opts.body), input=JSON.parse(req.input); assert.equal(req.store,false);
    calls.push(input);
    return input.claims ? output({verdicts:check(input)}) : output({segments:write(input)});
  });
  return calls;
}
const allOK=input=>input.claims.map(c=>({id:c.id,supported:true,reason:'ok'}));
const run=(groups,profile={language:'en',maxMinutes:3})=>makeScript(groups,profile,cutoff,'mock');
const article=(id,headline,text,other={})=>({...radio[0][0],id,headline,text,url:`https://example.test/${id}`,...other});

for(const {name,listener} of presets) test(`native preset ${name}: a distinct reporting outline passes the post-fit gate`,async t=>{
  const calls=provider(t,fixtureDraft,fixtureVerdicts), r=await run(news,listener), d=r.diagnostics;
  assert.equal(r.qualityStatus,'sufficient_verified_content');assert.equal(r.generationMode,'source-checked-model');
  assert.equal(d.eligibleEvents,6);assert.equal(d.selectedEventCount,2);assert.equal(d.finalVerifiedEvents,2);
  assert.ok(d.selectedEvents.every(e=>e.availableEvidenceCount>=5&&e.plannedFacts===5));assert.equal(d.minVerifiedWords,140);
  assert.deepEqual(d.preferredVerifiedWords,[180,300]);assert.equal(d.finalVerifiedSentences,10);assert.equal(calls.length,2);
  assert.equal(calls[0].storyPlan.length,2);assert.equal(d.draftFactualSentences,d.finalVerifiedSentences);assert.deepEqual(d.rejected,{});
  assert.equal(d.finalVerifiedWords,r.factCards.reduce((n,c)=>n+wordCount(c.spokenText),0));assert.equal(d.draftWords,d.finalVerifiedWords);
  assert.ok(d.finalVerifiedWords>=140);assert.ok(d.verifiedEstimatedSeconds>=60&&r.estimatedDurationSeconds<=180);
  assert.equal(r.repairApplied,false);assert.equal(d.repairAttempted,false);assert.equal(d.fallbackReason,null);
  assert.ok(r.factCards.every(c=>articles.find(a=>a.id===c.articleId)?.language===listener.language));
  assert.deepEqual(r.factCards.map(c=>c.spokenText),r.segments.slice(1).map(s=>s.text));
  t.diagnostic(`${name}: ${d.finalVerifiedWords} verified factual words in ${d.finalVerifiedSentences} sentences; ${d.verifiedEstimatedSeconds}s factual / ${d.estimatedDurationSeconds}s transcript (estimate).`);
});

test('full-body selection cites a long, qualified fact past both old cutoffs without exporting the body',async t=>{
  const filler=Array.from({length:52},(_,i)=>`Harbour archive reference ${i} lists routine administrative papers in a separately indexed catalogue maintained by the records office.`).join(' ');
  const late='Meridian Harbour said the inspection rebate would apply to EUR 18 million of fees only if independent auditors confirm that the containers were already on the quay when the rules changed, a restriction that the written proposal extends to cargo awaiting a second inspection as well as cargo cleared at the first inspection.';
  const a=article('meridian','Meridian Harbour announces inspection rebate',`Meridian Harbour announces inspection rebate\nSubscribe to our premium advertising newsletter for more.\n${filler}\n${late}\nRelated articles: the local choir will rehearse on Thursday.`);
  assert.ok(late.length>250&&a.text.indexOf(late)>4200);
  const spoken='Meridian Harbour says the rebate could cover EUR 18 million in fees only if auditors independently confirm the containers were on the quay when the rules changed.';
  const calls=provider(t,input=>{
    const ps=input.articles[0].passages, p=ps.find(p=>p.quote===late);
    assert.ok(p);assert.ok(ps.length<=6&&ps.every(p=>p.quote.length<=PASSAGE_LIMIT));
    assert.ok(ps.reduce((n,p)=>n+p.quote.length,0)<=3600);assert.ok(!JSON.stringify(input).includes(a.text));
    assert.doesNotMatch(JSON.stringify(ps),/subscribe|local choir/i);
    return [{articleId:a.id,text:spoken,evidenceIndex:p.evidenceIndex}];
  },input=>{assert.equal(input.claims[0].quote,late);assert.equal(input.claims[0].claim,spoken);return allOK(input);});
  const r=await run([[a]],{language:'en',topics:['inspection rebate'],maxMinutes:.5});
  const c=r.factCards[0], ptr=auditPointers([c])[0];assert.equal(c.spokenText,spoken);
  assert.equal(c.articleId,a.id);assert.equal(ptr.start,a.text.indexOf(late));assert.equal(a.text.slice(ptr.start,ptr.end),late);
  assert.equal(ptr.evidenceSha256,createHash('sha256').update(late).digest('hex'));assert.ok(!JSON.stringify(ptr).includes(late));
  assert.equal(r.segments[1].sources[0].articleId,a.id);assert.ok(!JSON.stringify(r.diagnostics).includes(late));
  assert.equal(calls[1].claims[0].quote,late);
});

test('oversize sentences: a whole independent late clause, never a truncated conditional or arbitrary word slice',()=>{
  const clause='Meridian Harbour will charge EUR 17 million for a separate inspection programme in December';
  const long='The Meridian records office indexed the following batches of warehouse receipts '+('from the port archives and the inspection register '.repeat(23));
  const a=article('clause','Meridian Harbour inspection programme',long+'; '+clause+'.');
  const passages=selectEvidence(a,['inspection']);assert.ok(passages.some(p=>p.quote===clause+'.'&&p.focusStart>800));
  const laterCaveat={...a,text:a.text+' It will do so only if the regulator grants permission.'};
  assert.ok(!selectEvidence(laterCaveat).some(p=>p.focus===clause+'.'));
  const qualified={...a,text:long+'; '+clause+' only if the auditors approve.'};
  assert.equal(selectEvidence(qualified).length,0); // no safe standalone reading of this oversized conditional
});

test('a dependent focus gets only its adjacent referent, figures cannot be borrowed and inference is checked on that exact window',async t=>{
  const first='Waxmere Trust reported EUR 90 million in deposits in its quarterly filing.';
  const second='It proposed a limit of EUR 12 million on overnight loans to a single member bank.';
  const unrelated='Elsewhere the garden committee released its programme of outdoor lectures.';
  const a=article('wax','Waxmere Trust proposes credit limit',[unrelated,first,second].join('  '));
  const trueLine='Waxmere Trust proposed capping overnight lending to any one member bank at EUR 12 million.';
  const invented='Waxmere Trust blamed its overnight loan limit of EUR 12 million on falling deposits.';
  let attack=true;
  provider(t,input=>{
    const ref=input.articles[0].passages.find(p=>p.contextRole==='referent');
    assert.equal(ref.quote,first+'  '+second);assert.equal(ref.quote.slice(...ref.focusRange),second);
    return [{articleId:a.id,evidenceIndex:ref.evidenceIndex,text:trueLine.replace('12','90')},
      {articleId:a.id,evidenceIndex:ref.evidenceIndex,text:attack?invented:trueLine}];
  },input=>input.claims.map(c=>{
    assert.equal(c.quote,first+'  '+second);assert.equal(c.focus,second);assert.ok(!c.quote.includes(unrelated));
    return {id:c.id,supported:c.claim===trueLine,reason:c.claim===trueLine?'ok':'unsupported_inference'};
  }));
  const bad=await run([[a]]);assert.equal(bad.diagnostics.rejected.number_or_unit_mismatch,1);
  assert.equal(bad.diagnostics.rejected.unsupported_inference,1);assert.equal(bad.diagnostics.finalVerifiedWords,0);
  attack=false;const good=await run([[a]]);assert.equal(good.segments[1].text,trueLine);
  assert.equal(good.factCards[0].evidenceQuote,first+'  '+second);
  assert.ok(selectEvidence({...a,text:first+'\n\n'+second}).every(p=>!p.context)); // never bridge paragraphs
});

test('a trailing caveat stays with its fact; unit and relative-day changes are not repaired by a fluent sentence',async t=>{
  const main='Bell Quay proposed adding 14 tonnes to the certified lifting capacity of the East Pier crane.';
  const caveat='The proposal is subject to a load test witnessed by the port inspector.';
  const a=article('east','Bell Quay crane proposal',main+' '+caveat,{date:'2026-11-17T09:00:00Z',dateMs:Date.parse('2026-11-17T09:00:00Z')});
  const good='Bell Quay proposed adding 14 tonnes of crane capacity at East Pier, subject to a load test observed by the port inspector.';
  const calls=provider(t,input=>{
    const p=input.articles[0].passages.find(p=>p.contextRole==='qualification');
    return [good.split(',')[0]+'.',good.replace('tonnes','barrels'),good.replace('proposed','today proposed'),good].map(text=>({articleId:a.id,evidenceIndex:p.evidenceIndex,text}));
  },input=>{assert.equal(input.claims.length,1);assert.equal(input.claims[0].quote,main+' '+caveat);return allOK(input);});
  const r=await run([[a]]);assert.equal(calls.length,2);assert.equal(r.segments[1].text,good);
  assert.deepEqual(r.diagnostics.rejected,{lost_qualification:1,number_or_unit_mismatch:1,relative_timing:1});
});

test('fresh second permalink is not automatically evidence: skip restatements, exact syndication, out-of-window articles and advertisements',async t=>{
  const primary=article('bank','Coast Reserve fee report','Coast Reserve reported a 7 percent increase in account fees for its settlement service. Coast Reserve kept the fee on paper transfers unchanged for existing clients.');
  const other=(id,text,overrides={})=>({...primary,id,text,outlet:id,...overrides});
  const variants=[other('copy',primary.text),other('rewrite','Coast Reserve said fees for accounts in the settlement service rose 7 percent.'),
    other('ads','Subscribe today for details of the Coast Reserve fee report.'),other('tomorrow','Coast Reserve waived EUR 41 million in service fees for member accounts.',{dateMs:Date.parse(cutoff)+1})];
  const calls=provider(t,()=>[],allOK);
  await run([[primary,...variants]]);assert.deepEqual(calls[0].articles.map(a=>a.articleId),['bank']);
  calls.length=0;const extra=other('other-desk','Coast Reserve set a separate ceiling of EUR 13 million on fees for international transfers.');
  await run([[primary,...variants,extra]]);assert.deepEqual(calls[0].articles.map(a=>a.articleId),['bank','other-desk']);
});

test('thin evidence stays thin even with two distinct events, repeated claims and a long nonfactual opening',async t=>{
  const brief=news.slice(0,2).map(([a],i)=>[{...a,text:stories[i][3][0][0]}]);
  const calls=provider(t,i=>fixtureDraft(i).flatMap(c=>[c,{...c,text:c.text.replace(/\.$/,' in the report.')}]),fixtureVerdicts);
  const r=await run(brief,{language:'en',topics:['FX','central bank'],maxMinutes:3});
  assert.equal(r.diagnostics.finalVerifiedSentences,2);assert.equal(r.diagnostics.finalVerifiedEvents,2);
  assert.ok(r.diagnostics.finalVerifiedWords<60);assert.equal(r.qualityStatus,'insufficient_verified_content');
  assert.equal(r.diagnostics.fallbackKind,'verified_only');assert.equal(r.diagnostics.rejected.duplicate_fact,2);
  assert.equal(r.diagnostics.repairAttempted,false);assert.equal(calls.length,2);assert.ok(r.segments.every(s=>s.kind!=='headline'));
  assert.equal(r.segments.length,3);t.diagnostic(`Thin: ${r.diagnostics.finalVerifiedWords} verified words; not accepted.`);
});

test('independent verifier outage fails closed, retains draft and known token counts, never retries or logs response bodies',async t=>{
  let calls=0;
  t.mock.method(globalThis,'fetch',async(_u,o)=>{
    calls++;const i=JSON.parse(JSON.parse(o.body).input);
    return i.claims?new Response('PRIVATE PROVIDER ECHO',{status:429}):output({segments:fixtureDraft(i)});
  });
  const r=await run(news,presets[1].listener),d=r.diagnostics;
  assert.equal(calls,2);assert.equal(r.qualityStatus,'insufficient_verified_content');assert.equal(d.fallbackKind,'headlines_only');
  assert.equal(r.modelStatus,'verifier:rate_limit');assert.equal(d.fallbackReason,r.modelStatus);
  assert.deepEqual(d.providerFailures,[{stage:'verifier',category:'rate_limit',httpStatus:429}]);
  assert.equal(d.rejected.unverified_batch,10);assert.equal(d.draftFactualSentences,10);assert.ok(d.draftWords>=140);
  assert.equal(d.finalVerifiedWords,0);assert.equal(r.usage.modelOutputTokens,1);assert.equal(r.usageComplete,false);
  assert.ok(r.segments.slice(1).every(s=>s.kind==='headline'&&s.text.startsWith('Alleen de kop.')));
  assert.ok(!JSON.stringify(r).includes('PRIVATE PROVIDER ECHO'));t.diagnostic(`429 at checker: ${d.draftWords} draft → ${d.finalVerifiedWords} verified words.`);
});

test('one targeted recovery; a verifier timeout on the addition cannot erase or alter first-pass verified content',async t=>{
  const batches=[];let checks=0;
  t.mock.method(globalThis,'fetch',async(_u,o)=>{
    const i=JSON.parse(JSON.parse(o.body).input);batches.push(i);
    if(i.claims) {if(++checks===2) throw new DOMException('PRIVATE','TimeoutError'); return output({verdicts:fixtureVerdicts(i)});}
    const candidates=fixtureDraft(i);return output({segments:checks?candidates:candidates.filter(c=>c.articleId==='cairn')});
  });
  const r=await run(news,presets[0].listener),d=r.diagnostics;assert.equal(batches.length,4);
  assert.ok(batches[2].articles.every(a=>a.articleId==='fen'));assert.ok(batches[3].claims.every(c=>c.eventGroup==='fen'));
  assert.deepEqual(d.providerFailures,[{stage:'repair_verifier',category:'timeout',httpStatus:null}]);
  assert.equal(d.repairAttempted,true);assert.equal(d.repairApplied,false);assert.equal(d.fallbackKind,'verified_only');
  assert.deepEqual(r.segments.slice(1).map(s=>s.text),stories[0][3].map(row=>row[1]));
  assert.equal(r.usage.modelInputTokens,3);assert.equal(r.usage.repairInputTokens,1);
});

test('a sub-minute listener gets a smaller target and complete verified sentences inside the selected cap',async t=>{
  provider(t,fixtureDraft,fixtureVerdicts);
  const r=await run(news,{...presets[1].listener,maxMinutes:.5}),d=r.diagnostics;
  assert.equal(d.selectedEventCount,1);assert.ok(d.minVerifiedWords<140&&d.finalVerifiedWords>=d.minVerifiedWords);
  assert.equal(r.qualityStatus,'sufficient_verified_content');assert.ok(d.estimatedDurationSeconds<=30);
  assert.ok(wordCount(r.segments.map(s=>s.text).join(' '))<=wordBudget(.5));assert.ok(d.rejected.time_budget>0);
  t.diagnostic(`30 s cap: ${d.finalVerifiedWords} verified words; ${d.estimatedDurationSeconds}s transcript estimate.`);
});

for(const [n,indices] of [[139,[0,1,2,5,6,9,10]],[140,[0,1,2,5,6,10,12]]]) {
  test(`${n} actual verified words: introductions and headlines cannot push an edition through the 140-word gate`,async t=>{
    const rows=testStories.flatMap(([id,,pairs])=>pairs.map(([focus,claim])=>({id,focus,claim})));
    const facts=indices.map(i=>rows[i]);
    // Real punctuation, not an extra fact or spoken word. Naive whitespace
    // counting would now give 140 factual tokens even on the failing side.
    if(n===139) facts[0].claim=facts[0].claim.replace('Port, crates','Port — crates');
    const selected=radio.map(([a])=>[{...a,text:facts.filter(f=>f.id===a.id).map(f=>f.focus).join(' ')}]);
    const calls=provider(t,input=>input.articles.flatMap(a=>a.passages.map(p=>({articleId:a.articleId,evidenceIndex:p.evidenceIndex,
      text:facts.find(f=>f.id===a.articleId && f.focus===(p.focusRange?p.quote.slice(...p.focusRange):p.quote)).claim}))),
      input=>input.claims.map(c=>{
        const supported=facts.some(f=>f.id===c.articleId&&(c.focus??c.quote)===f.focus&&f.claim===c.claim&&c.quote.includes(f.focus));
        return {id:c.id,supported,reason:supported?'ok':'unsupported_claim'};
      }));
    const r=await run(selected);assert.equal(r.diagnostics.finalVerifiedWords,n);assert.equal(calls.length,2);
    assert.ok(wordCount(r.segments.map(s=>s.text).join(' '))>140);
    assert.equal(wordCount(r.segments.slice(1).map(s=>s.text).join(' ')),140);
    assert.equal(r.qualityStatus,n===140?'sufficient_verified_content':'insufficient_verified_content');
    assert.equal(r.diagnostics.finalVerifiedSentences,7);
  });
}

test('line wrapping is not permission to detach a condition or log a copied short body',()=>{
  const a=article('tempest','Quay repayment proposal','Tempest Quay proposed settling EUR 11 million of warehouse claims\r\nonly if the auditors approve the complete ledger of receipts.');
  const [p]=selectEvidence(a);assert.equal(p.quote,a.text);assert.equal(p.start,0);assert.equal(p.end,a.text.length);
  assert.equal(validateModelSegment({text:'Tempest Quay agreed to pay EUR 11 million to settle warehouse claims.',evidenceQuote:p.quote},a),false);
  const short=article('short','An archive account','The quay settled the old warehouse claims.');
  assert.equal(validateModelSegment({text:'According to the ledger, the quay settled the old warehouse claims.',evidenceQuote:short.text},short),false);
});

test('valid but rejected repair verdict cannot inflate the gate; earlier approval is not a licence to reuse its evidence',async t=>{
  let calls=0;
  const data=provider(t,i=>{
    const candidates=fixtureDraft(i);
    return ++calls===1?candidates.filter(c=>c.articleId==='cairn'):candidates;
  },i=>i.claims.map(c=>{
    const supported=c.articleId==='cairn'&&fixtureVerdicts({...i,claims:[c]})[0].supported;
    return {id:c.id,supported,reason:supported?'ok':'unsupported_claim'};
  }));
  const r=await run(news,presets[0].listener),d=r.diagnostics;
  assert.equal(data.length,4);assert.deepEqual(data[3].previouslyCovered.map(f=>f.claim),data[1].claims.map(c=>c.claim));
  assert.ok(data[3].claims.every(c=>c.articleId==='fen'));assert.equal(d.attempts[1].verified,0);
  assert.equal(d.repairAttempted,true);assert.equal(d.repairApplied,false);assert.equal(r.usageComplete,true);
  assert.equal(d.finalVerifiedSentences,5);assert.equal(d.qualityStatus,'insufficient_verified_content');
  assert.equal(d.rejected.unsupported_claim,data[3].claims.length);assert.equal(d.finalVerifiedWords,stories[0][3].reduce((n,r)=>n+wordCount(r[1]),0));
});

test('no native emergency option on a provider error still returns safe diagnostics; no unverified foreign-language briefing',async t=>{
  const f=t.mock.method(globalThis,'fetch',async()=>new Response('PRIVATE error body',{status:401}));
  await assert.rejects(run([[articles[0]]],{...presets[0].listener,language:'nl'}),e=>e.diagnostics?.fallbackReason==='writer:authentication' &&
    e.diagnostics.providerFailures[0].httpStatus===401 && e.diagnostics.finalVerifiedSentences===0 && e.diagnostics.generationMode==='none');
  assert.equal(f.mock.callCount(),1);
});

test('a number in a mandatory adjacent caveat stays in that condition, not in the main financial claim',async t=>{
  const fact='Coral Bank proposed a dividend of EUR 12 million to be paid from retained earnings.';
  const condition='The proposal is conditional on maintaining a cash reserve of EUR 80 million.';
  const a=article('coral','Coral Bank dividend proposal',fact+' '+condition);
  const good='Coral Bank proposed distributing EUR 12 million from retained earnings only if it keeps EUR 80 million in cash reserves.';
  provider(t,i=>{
    const p=i.articles[0].passages.find(p=>p.contextRole==='qualification');assert.equal(p.quote,a.text);
    return [good.replace('EUR 12','EUR 80').replace('keeps EUR 80','keeps EUR 12'),good].map(text=>({text,articleId:a.id,evidenceIndex:p.evidenceIndex}));
  },i=>{assert.equal(i.claims.length,1);assert.equal(i.claims[0].claim,good);return allOK(i);});
  const r=await run([[a]]);assert.equal(r.diagnostics.rejected.number_or_unit_mismatch,1);assert.equal(r.segments[1].text,good);
});

test('semantically redundant wording from a different focus cannot count twice after independent review',async t=>{
  const a=article('sandbar','Sandbar changes tender rules',
    'Sandbar closed its morning tender to paper bills issued by its members. Sandbar now treats printed member notes as ineligible collateral for the early auction.');
  const lines=['Member banks can no longer offer paper bills at the Sandbar morning tender.',
    'Printed notes from members are no longer among the assets Sandbar accepts for its early auction.'];
  const calls=provider(t,i=>i.articles[0].passages.map(p=>({articleId:a.id,evidenceIndex:p.evidenceIndex,text:lines[p.evidenceIndex]})),
    i=>i.claims.map((c,n)=>({id:c.id,supported:!n,reason:n?'duplicate_fact':'ok'})));
  const r=await run([[a]]);assert.equal(calls[1].claims.length,2);assert.equal(calls.length,2);
  assert.equal(r.diagnostics.rejected.duplicate_fact,1);assert.equal(r.diagnostics.finalVerifiedSentences,1);
  assert.equal(r.segments[1].text,lines[0]);assert.ok(r.segments.every(s=>s.text!==lines[1]));
});

test('a compact reported metric can use the adjacent named subject, not figures from the rest of the article',async t=>{
  const actor='Oriole Mills published its accounts for the southern division.';
  const metric='Operating profit fell 8%.';
  const a=article('oriole','Oriole Mills publishes division accounts',actor+' '+metric);
  const claim='Operating profit in the southern division of Oriole Mills declined by 8%.';
  provider(t,input=>{
    const p=input.articles[0].passages.find(p=>p.contextRole==='referent');
    return [{articleId:a.id,evidenceIndex:p.evidenceIndex,text:claim}];
  },input=>{assert.equal(input.claims[0].focus,metric);assert.equal(input.claims[0].quote,actor+' '+metric);return allOK(input);});
  const r=await run([[a]]);assert.equal(r.diagnostics.finalVerifiedSentences,1);assert.equal(r.qualityStatus,'insufficient_verified_content');
  assert.equal(r.segments[1].text,claim);
});

test('British per cent retains its unit through a paraphrase; a bare amount or percentage-point move is not equivalent',()=>{
  const quote='Fen Exchange said its margin for unsettled currency bids would remain at 2.5 per cent through the end of the auction.';
  const a=article('margin','Fen publishes auction terms',quote);
  const ok=n=>validateModelSegment({text:`Until the auction ends, Fen Exchange will keep its margin on open currency bids at ${n}.`,evidenceQuote:quote},a,{language:'en'});
  for (const n of ['2.5 percent','2.5%']) assert.equal(ok(n),true,n);
  for (const n of ['2.5','2.5 percentage points','2.5 basis points','25 percent']) assert.equal(ok(n),false,n);
});

test('Dutch past-tense was/had are not English evidence in a Dutch sentence; it still needs its own verifier verdict',async t=>{
  const focus='Wilg Cloud was voor de prijswijziging afhankelijk van een contract dat nog een looptijd van een jaar had.';
  const claim='Bij het wijzigen van de prijs was Wilg Cloud afhankelijk van een overeenkomst die nog een jaar te lopen had.';
  const a=article('wilg-term','Nieuwe prijsafspraak bij Wilg Cloud',focus,{language:'nl'});
  const calls=provider(t,i=>[{articleId:a.id,evidenceIndex:i.articles[0].passages[0].evidenceIndex,text:claim}],
    i=>{assert.equal(i.claims[0].quote,focus);assert.equal(i.claims[0].claim,claim);return allOK(i);});
  const result=await run([[a]],presets[1].listener);
  assert.equal(calls.length,2);assert.equal(result.segments[1].kind,'summary');assert.equal(result.segments[1].text,claim);
  assert.equal(result.qualityStatus,'insufficient_verified_content'); // not an excuse to pad
  assert.equal(validateModelSegment({text:'Wilg Cloud was reliant on a contract which had a year left to run.',evidenceQuote:focus},a,{language:'nl'}),false);
});

test('topics change actual selected evidence even with output language held fixed',()=>{
  for (const language of ['en','nl']) {
    const selected=presets.map(p=>selectArticles(news,{...p.listener,language},cutoff).map(a=>a.id).sort());
    assert.deepEqual(selected,[['cairn','fen'],['riet','wilg']]);
  }
});

test('a full six-slot outline below the word gate may draw on distinct private reserves, once and rechecked',async t=>{
  const rows=[...stories[0][3],
    ['Cairn Reserve requires participating banks to file their collateral schedules before the overnight lending desk opens for business.',
     'Banks must send Cairn Reserve their collateral schedules before its overnight lending desk opens for the day.'],
    ['Cairn Reserve will audit the receipts against warehouse registers at the end of each month using its own staff.',
     'At the end of every month Cairn Reserve staff will check the receipts against the registers kept in warehouses.'],
    ['Cairn Reserve assigned its legal department to handle appeals from banks whose collateral applications are turned down by the lending desk.',
     'A bank whose collateral application the lending desk turns down can appeal to the legal department of Cairn Reserve.']];
  const a={...articles[0],text:rows.map(r=>r[0]).join(' ')};
  const calls=provider(t,i=>i.articles.flatMap(a=>a.passages.map(p=>({articleId:a.articleId,evidenceIndex:p.evidenceIndex,
    text:rows.find(r=>r[0]===(p.focusRange?p.quote.slice(...p.focusRange):p.quote))[1]}))),
    i=>i.claims.map(c=>{const ok=rows.some(([focus,text])=>focus===(c.focus??c.quote)&&text===c.claim&&c.articleId===a.id);
      return {id:c.id,supported:ok,reason:ok?'ok':'unsupported_claim'};}));
  const r=await run([[a]],presets[0].listener),d=r.diagnostics;
  assert.equal(d.attempts[0].verified,6);assert.ok(d.attempts[0].verifiedWords<140);
  assert.equal(calls.length,4);assert.equal(d.attempts[1].verified,2);assert.equal(d.repairApplied,true);
  assert.ok(d.finalVerifiedWords>=140);assert.equal(r.qualityStatus,'sufficient_verified_content');
});
