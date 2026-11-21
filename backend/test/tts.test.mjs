import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {mp3Seconds} from '../src/timing.mjs';
import {checkRecording} from '../scripts/smoke.mjs';
import {synthesize} from '../src/tts.mjs';
import {sample,replay} from '../src/memory.mjs';
test('mock transport receives final transcript verbatim; different script never reuses the recording', async t => {
  const path = await mkdtemp(join(tmpdir(),'second-take-audio-')), dir = pathToFileURL(path+'/');
  t.after(()=>rm(path,{recursive:true,force:true}));
  const sent = [];
  t.mock.method(globalThis,'fetch',async (_url,opts) => {
    sent.push(JSON.parse(opts.body).text);
    // Structural MPEG frames for transport/timing assertions; no speech or playback.
    const frame = Buffer.alloc(417); frame.set([255,251,144,0]);
    return new Response(Buffer.concat([frame,frame,frame]),{headers:{'content-type':'audio/mpeg'}});
  });
  const first = replay(sample,{storyId:sample.storyId,asOf:sample.editions[0]});
  const later = replay(sample,{storyId:sample.storyId,asOf:sample.editions[1],heardUpdateIds:first.updateIds});
  const generate = (r,key) => synthesize(r.segments,key,dir);
  assert.equal((await generate(first,'')).audioUrl,null);
  const full = await generate(first,'test'), delta = await generate(later,'test');
  assert.notEqual(full.audioUrl, delta.audioUrl);
  assert.deepEqual(sent, [first,later].map(r=>r.segments.map(s=>s.text).join('\n\n')));
  assert.deepEqual(await generate(later,''),{audioUrl:delta.audioUrl,audioSha256:delta.audioSha256,audioStatus:'cached',ttsCharacters:0,durationSeconds:3*1152/44100});
  assert.equal(sent.length,2);
});
test('non-audio response and truncated bytes leave no cache file', async t => {
  const path = await mkdtemp(join(tmpdir(),'second-take-failure-'));
  t.after(()=>rm(path,{recursive:true,force:true}));
  const mock = t.mock.method(globalThis,'fetch',async()=>new Response('x'.repeat(2000)));
  const run = () => synthesize([{text:'Test'}],'test',pathToFileURL(path+'/'));
  await assert.rejects(run);
  mock.mock.mockImplementation(async()=>new Response('x',{headers:{'content-type':'audio/mpeg'}}));
  await assert.rejects(run);
  assert.deepEqual(await readdir(path),[]);
});

test('measured frame duration gates BOTH generated and cached audio without a second paid attempt', async t => {
  const path=await mkdtemp(join(tmpdir(),'second-take-cap-')), dir=pathToFileURL(path+'/');
  t.after(()=>rm(path,{recursive:true,force:true}));
  const frame=Buffer.alloc(417); frame.set([255,251,144,0]);
  const bytes=Buffer.concat(Array(1200).fill(frame)); // 31.35 seconds in requested format
  const fetch=t.mock.method(globalThis,'fetch',async()=>new Response(bytes,{headers:{'content-type':'audio/mpeg'}}));
  const s=[{text:'A fictional timing test.'}];
  const first=await synthesize(s,'mock',dir,30);
  assert.equal(first.audioStatus,'over_time_limit');assert.equal(first.audioUrl,null);
  assert.equal(first.ttsCharacters,s[0].text.length);assert.deepEqual(await readdir(path),[]);
  assert.equal(fetch.mock.callCount(),1);
  const longer=await synthesize(s,'mock',dir,60);
  assert.ok(longer.durationSeconds>31 && longer.durationSeconds<32);
  const cached=await synthesize(s,'',dir,30);
  assert.equal(cached.audioStatus,'over_time_limit');assert.equal(cached.audioUrl,null);
  assert.equal(fetch.mock.callCount(),2);assert.equal(cached.ttsCharacters,0);
});

test('unknown recording duration never creates a playable cache entry',async t=>{
  const path=await mkdtemp(join(tmpdir(),'second-take-invalid-'));
  t.after(()=>rm(path,{recursive:true,force:true}));
  t.mock.method(globalThis,'fetch',async()=>new Response(Buffer.alloc(2500),{headers:{'content-type':'audio/mpeg'}}));
  const res=await synthesize([{text:'Test only.'}],'mock',pathToFileURL(path+'/'),180);
  assert.equal(res.audioUrl,null);assert.equal(res.audioStatus,'invalid_recording');
  assert.deepEqual(await readdir(path),[]);
});

test('cache remeasurement rejects a sub-60 MP3 or invalid bytes without falling through to a paid attempt',async t=>{
  const path=await mkdtemp(join(tmpdir(),'second-take-floor-')), dir=pathToFileURL(path+'/');
  t.after(()=>rm(path,{recursive:true,force:true}));
  const frame=Buffer.alloc(417);frame.set([255,251,144,0]);
  const n=Math.floor(60*44100/1152), bytes=Buffer.concat(Array(n).fill(frame));
  const fetch=t.mock.method(globalThis,'fetch',async()=>new Response(bytes,{headers:{'content-type':'audio/mpeg'}}));
  const s=[{text:'Fixture for frame clock boundaries.'}];
  const old=await synthesize(s,'mock',dir,180); // existing valid cache built without a minimum
  assert.ok(old.durationSeconds<60 && old.durationSeconds>59.97);
  const timed=min=>synthesize(s,'mock',dir,180,undefined,min);
  const fail=await timed(60);
  assert.deepEqual(fail,{audioUrl:null,ttsCharacters:0,audioStatus:'below_minimum_duration',durationSeconds:null});
  const file=new URL(old.audioUrl.split('/').at(-1),dir);
  await writeFile(file,Buffer.concat([bytes,frame])); // one more frame crosses the floor
  const pass=await timed(60);assert.equal(pass.audioStatus,'unverified_cache');assert.equal(pass.audioUrl,null); // changed bytes, even if now long enough
  await writeFile(file,'not an MP3');assert.equal((await timed(60)).audioStatus,'invalid_recording');
  assert.equal(fetch.mock.callCount(),1);
});

test('a decodable 59.98s tagged MP3 cannot pass by counting its Info frame and gapless padding; exactly 60s can pass',
  {skip:spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status===0?false:'Optional tagged-MP3 regression needs FFmpeg/libmp3lame'},async t=>{
  const path=await mkdtemp(join(tmpdir(),'second-take-gapless-')), dir=pathToFileURL(path+'/');
  t.after(()=>rm(path,{recursive:true,force:true}));
  let bytes;
  const transport=t.mock.method(globalThis,'fetch',async()=>new Response(bytes,{headers:{'content-type':'audio/mpeg'}}));
  for (const seconds of [59.98,60]) {
    const file=join(path,'tone.mp3'); // local timing signal only, not a briefing
    execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i',`sine=frequency=220:sample_rate=44100:duration=${seconds}`,
      '-c:a','libmp3lame','-b:a','128k','-write_xing','1',file]);
    bytes=await readFile(file);
    const pcm=execFileSync('ffmpeg',['-v','error','-xerror','-i',file,'-f','s16le','pipe:1'],{maxBuffer:8*1024*1024});
    const decoded=pcm.length/(2*44100), frames=mp3Seconds(bytes);
    assert.equal(decoded,seconds);assert.ok(frames>60);
    const clock=[], s=[{text:`Only a codec fixture (${seconds}).`}];
    const invoke=()=>synthesize(s,'mock',dir,180,n=>clock.push(n),60);
    const r=await invoke(), legacy={audioStatus:'generated',durationSeconds:decoded,diagnostics:{actualMp3DurationSeconds:decoded}};
    if (seconds<60) {
      assert.equal(r.audioStatus,'below_minimum_duration');assert.equal(r.audioUrl,null);assert.deepEqual(clock,[decoded]);
      assert.throws(()=>checkRecording(bytes,legacy,180),/below_minimum_duration/);
    } else {
      assert.equal(r.audioStatus,'generated');assert.equal(r.durationSeconds,decoded);
      assert.equal((await invoke()).audioStatus,'cached');assert.deepEqual(clock,[decoded,decoded]);
      assert.equal(checkRecording(bytes,legacy,180),decoded);
    }
  }
  assert.equal(transport.mock.callCount(),2);
});

test('frame-shaped bytes with damaged payload do not publish a recording or receipt',async t=>{
  const path=await mkdtemp(join(tmpdir(),'st-decode-')),dir=pathToFileURL(path+'/');
  t.after(()=>rm(path,{recursive:true,force:true}));
  const frame=Buffer.alloc(417,255);frame.set([255,251,144,0]);
  const bytes=Buffer.concat(Array(64).fill(frame));
  assert.ok(mp3Seconds(bytes)>0); // timing alone would accept
  t.mock.method(globalThis,'fetch',async()=>new Response(bytes,{headers:{'content-type':'audio/mpeg'}}));
  const r=await synthesize([{text:'A local integrity check.'}],'test',dir,30);
  assert.equal(r.audioStatus,'invalid_recording');assert.equal(r.audioUrl,null);
  assert.deepEqual(await readdir(path),[]);
});
