import {passages, lines} from '../../tests/candidate-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedStory, catalogue, replay, sample as story} from '../src/memory.mjs';
import {candidate,eligibleGroups} from '../src/editorial.mjs';
const [a,b] = story.updates, ids = [a.updateId,b.updateId];
const read = (edition, heardUpdateIds) => replay(story, {storyId:story.storyId, asOf:story.editions[edition], heardUpdateIds});

test('metadata contains no future story text; cutoff precedes both discussion and history', () => {
  assert.equal(JSON.stringify(catalogue(story)).includes(b.spokenText), false);
  for (const heard of [[], ids, [b.updateId]]) {
    const result = read(0, heard);
    for (const field of ['spokenText','articleId','publishedAt','sourceUrl','updateId']) assert.ok(!JSON.stringify(result).includes(b[field]));
  }
  assert.deepEqual(read(0).updateIds, [a.updateId]);
  assert.throws(() => read(2), /Invalid/);
});

test('fresh later listener gets chronological context; missing, malformed and foreign history ignored', () => {
  for (const heard of [undefined, null, 123, {}, 'not an array', ['random', {}]]) {
    assert.equal(read(1, heard).kind, 'catch-up');
    assert.deepEqual(read(1, heard).updateIds, ids);
  }
});

test('only new development in returning script, old claim remains attributed off-mic', () => {
  const r = read(1,[a.updateId,a.updateId]);
  assert.equal(r.kind, 'continuation');
  assert.deepEqual(r.updateIds, [b.updateId]);
  assert.ok(!JSON.stringify(r.segments).includes(a.spokenText));
  assert.equal(r.previouslyHeard[0].sources[0].url, a.sourceUrl);
  assert.match(r.segments[0].text, /Fictional.*what changed/);
  assert.equal(r.segments[1].sources[0].articleId, b.articleId);
  assert.equal(r.segments[1].text, b.spokenText);
});

test('never speaks unchanged editions or claims older missing context is a new development', () => {
  assert.deepEqual(read(1, ids).segments, []);
  assert.equal(read(0, ids).kind, 'no-change');
  assert.equal(read(1,[b.updateId]).kind, 'catch-up');
});

const ledger = {...story, synthetic:false, updates:story.updates.map((u,i)=>({...u,articleId:'qa-'+i})), storyId:'private-qa', status:'editor-approved', reviewedBy:'Test editor', reviewedAt:'2026-11-18T12:00:00Z'};
const articles = ledger.updates.map(u => ({id:u.articleId, date:u.publishedAt,dateMs:Date.parse(u.publishedAt),headline:u.sourceTitle,
  text:'QA fixture. '+u.evidenceQuote, url:'https://publisher.example/'+u.articleId}));
test('private approval binds exact source, original URL and cutoff; audit evidence never leaves server', () => {
  const [a,b]=ledger.updates;
  const approved = approvedStory(ledger, articles);
  assert.equal(approved.synthetic,false);
  assert.equal(approved.updates[0].sourceUrl,articles[0].url);
  assert.ok(!JSON.stringify(approved).includes(a.evidenceQuote));
  for (const change of [{status:'needs-review'}, {reviewedBy:''}, {editions:[story.editions[1],story.editions[0]]},
    {updates:[a,{...b,updateId:a.updateId}]}, {updates:[a,{...b,articleId:a.articleId}]}, {updates:[a,{...b,evidenceQuote:'Absent'}]},
    {updates:[a,{...b,publishedAt:a.publishedAt}]}]) assert.throws(()=>approvedStory({...ledger,...change},articles));
  assert.throws(()=>approvedStory(ledger,[]));
});

test('editorial hold covers known IDs and their grouped copies, not unrelated chip news', () => {
  const fresh = [{id:'safe',headline:'Chip manufacturer announces new product'}];
  assert.deepEqual(eligibleGroups([[{id:'INVZ-10009737-01M7N83B6HGJSN8P6PRG6ZJBNJ',headline:'Test'}, {id:'translation',headline:'Test'}],
    [{id:'related',headline:'Huang return petition'}], fresh]), [fresh]);
});

test('rewording/re-sourcing one curated update does not make the later report new', () => {
  const reworded = {...story,updates:[a,{...b,articleId:'other-report',spokenText:'Same reopening, differently worded.'}]};
  assert.equal(replay(reworded,{asOf:story.editions[1],storyId:story.storyId,heardUpdateIds:ids}).kind,'no-change');
  assert.throws(()=>approvedStory({...ledger,updates:[ledger.updates[0],{...ledger.updates[1],spokenText:a.spokenText}]},articles));
});

const pair = {...ledger,storyId:candidate.storyId,editions:candidate.editions,
  updates:ledger.updates.map((u,i)=>({...u, articleId:candidate.articleIds[i], updateId:candidate.updateIds[i], evidenceQuote:passages[i], spokenText:lines[i]}))};
const records=articles.map((r,i)=>({...r,id:candidate.articleIds[i],text:passages[i]+' A return is unlikely.'}));
test('approval binds named records, dates, semantic IDs and complete condition without a board claim',()=>{
  assert.equal(approvedStory(pair,records).synthetic,false);
  for (const changes of [{status:'needs-review'}, {reviewedAt:''}, {reviewedBy:''}, {storyId:'alias'}, {editions:ledger.editions}])
    assert.throws(()=>approvedStory({...pair,...changes},records));
  for (const i of [0,1]) for (const patch of [{articleId:'wrong'},{updateId:'new-id'},{evidenceQuote:passages[1-i]}, {publishedAt:pair.updates[1-i].publishedAt}]) {
    const changed=structuredClone(pair); Object.assign(changed.updates[i],patch); assert.throws(()=>approvedStory(changed,records));
  }
});
test('the full board best-interest condition in a dated source may pass, but a shortened one cannot',()=>{
  const evidenceQuote='In this QA scenario, Huang would consider a return if the company board decides the return is in its best interest.';
  const spokenText='Huang would consider a return in this QA scenario if the company board decides the return is in its best interest.';
  const revised=structuredClone(pair);
  revised.updates[1].evidenceQuote=evidenceQuote;
  revised.updates[1].spokenText=spokenText;
  const sources=records.map((record,i)=>i===1?{...record,text:evidenceQuote}:record);
  assert.equal(approvedStory(revised,sources).updates[1].spokenText,spokenText);
  revised.updates[1].spokenText='Huang would consider a return in this QA scenario if the company board decides.';
  assert.throws(()=>approvedStory(revised,sources));
});
test('review status cannot license a completed return, a shortened condition or a board rejection',()=>{
  for (const spokenText of ['Huang returned as CEO.', 'Huang would consider a return.', 'Huang would consider a return if requested.',
    'Huang would consider a return if requested by both fictional committees.', 'The board formally rejected him.']) {
    const changed=structuredClone(pair); changed.updates[1].spokenText=spokenText; assert.throws(()=>approvedStory(changed,records));
  }
  const changed=structuredClone(pair); Object.assign(changed.updates[1],{spokenText:'The board formally rejected him.', evidenceQuote:'A return is unlikely.'});
  assert.throws(()=>approvedStory(changed,records));
});
test('an opt-in fictional sample cannot be released by renaming its story',()=>{
  assert.equal(story.synthetic,true);
  assert.throws(()=>approvedStory({...ledger,synthetic:true},articles));
  assert.throws(()=>approvedStory({...ledger,updates:story.updates},articles.map((r,i)=>({...r,id:story.updates[i].articleId}))));
});

test('extra reviewed detail belongs to the same dated acknowledgement and cannot cite another article',()=>{
  const [a,b]=ledger.updates;
  const extra='Only a booking already on file qualifies for unloading.';
  const line='Unloading is limited to freight with an existing booking.';
  const records=articles.map((a,i)=>({...a,text:a.text+(i?' '+extra:'')}));
  const approved={...ledger,updates:[a,{...b,details:[{spokenText:line,evidenceQuote:extra}]}]};
  const story=approvedStory(approved,records);
  const open=(i,h)=>replay(story,{storyId:story.storyId,asOf:story.editions[i],heardUpdateIds:h});
  assert.ok(!JSON.stringify(open(0,[])).includes(line));
  assert.deepEqual(open(1,[a.updateId]).segments.slice(1).map(s=>s.text),[b.spokenText,line]);
  assert.deepEqual(open(1,[a.updateId]).updateIds,[b.updateId]);assert.deepEqual(open(1,ids).segments,[]);
  assert.equal(open(1,[a.updateId]).segments.at(-1).sources[0].url,records[1].url);
  assert.ok(!JSON.stringify(open(1,[])).includes(extra));
  assert.throws(()=>approvedStory({...approved,updates:[{...a,details:approved.updates[1].details},b]},records));
});

test('review cannot predate the later report or turn opposition in the cited sentence into support',()=>{
  assert.throws(()=>approvedStory({...pair,reviewedAt:pair.updates[0].publishedAt},records));
  const ledger=structuredClone(pair);ledger.updates[0].evidenceQuote='Musk rejected the reinstatement campaign in this QA scenario.';
  assert.throws(()=>approvedStory(ledger,records.map((a,i)=>i?a:{...a,text:ledger.updates[0].evidenceQuote})));
});
