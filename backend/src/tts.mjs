import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir, mkdtemp, writeFile, rename, readFile, rm, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {voiceConfig} from './config.mjs';
import {ProviderFailure, requireOK, transport} from './providers.mjs';
import {measureMp3, durationFailure} from './timing.mjs';

const AUDIO_DIR = new URL('../../generated/audio/', import.meta.url);
const run=promisify(execFile), jobs=new Map(), MAX_BYTES=24*1024*1024;
export const sha256=data=>createHash('sha256').update(data).digest('hex');
export const transcript=segments=>segments.map(s=>s.text).join('\n\n');
const validName=name=>/^[a-f0-9]{24}\.mp3$/.test(name);
const invalid=status=>({audioUrl:null,ttsCharacters:0,audioStatus:status,durationSeconds:null});

// A receipt is a local integrity record, NOT authentication of a provider or
// editorial approval. No prompts, article bodies or spoken text on disk here.
async function inspect(name,directory,inputHash) {
  const target=new URL(name,directory);
  let bytes;
  try {
    if ((await stat(target)).size>MAX_BYTES) return {failure:'invalid_recording'};
    bytes=await readFile(target);
  } catch(e) {if(e.code==='ENOENT') return null; throw e;}
  const timing=measureMp3(bytes);
  if (!timing) return {failure:'invalid_recording'};
  try {
    const r=JSON.parse(await readFile(new URL(name+'.json',directory),'utf8'));
    if(r.v!==1 || r.name!==name || !/^[a-f0-9]{64}$/.test(r.transcriptSha256) ||
       (inputHash && r.transcriptSha256!==inputHash) || r.audioSha256!==sha256(bytes))
      return {timing,failure:'unverified_cache'};
    return {bytes,timing,hash:r.audioSha256};
  } catch(e) {
    if(e.code==='ENOENT'||e instanceof SyntaxError) return {timing,failure:'unverified_cache'};
    throw e;
  }
}

// Recheck the exact buffer returned by GET (also for range requests); an old
// URL is not permission to serve a replaced, unsigned or partial recording.
export async function publishedAudio(name) {
  if (!validName(name)) return null;
  return (await inspect(name,AUDIO_DIR))?.bytes??null;
}

// Header walks cannot detect all damaged Layer III payloads. Decode to the
// end once on admission, then verify the receipt AND frames on every reuse.
// macOS ships afconvert; other hosts need a local FFmpeg decoder for new TTS.
async function checkDecode(path,temp) {
  try {
    if (process.platform==='darwin')
      await run('/usr/bin/afconvert',['-f','WAVE','-d','LEI16',path,temp+'/check.wav'],{timeout:20_000});
    else
      await run('ffmpeg',['-nostdin','-v','error','-xerror','-err_detect','explode','-i',path,'-map','0:a:0','-f','null','-'],{timeout:20_000});
  } catch(e) { return e.code==='ENOENT'?'decoder_unavailable':'invalid_recording'; }
  return null;
}

export async function synthesize(segments, apiKey=process.env.ELEVENLABS_API_KEY, directory=AUDIO_DIR, maxSeconds=Infinity,onMeasured,minSeconds=0) {
  const text=transcript(segments);
  if (!text.trim()) throw new Error('Empty audio script');
  const {voice,model}=voiceConfig();
  const format='mp3_44100_128', inputHash=sha256(text);
  const id=sha256(JSON.stringify([voice,model,format,text])).slice(0,24), name=id+'.mp3';
  const target=new URL(name,directory);
  const outcome=(timing,characters,status,failure,hash)=>{
    const seconds=timing?.playableSeconds??null;
    if(seconds!==null) onMeasured?.(seconds);
    failure=durationFailure(timing,maxSeconds,minSeconds)??failure;
    return failure?{...invalid(failure),ttsCharacters:characters}:
      {audioUrl:'/api/audio/'+name,ttsCharacters:characters,audioStatus:status,durationSeconds:seconds,audioSha256:hash};
  };

  // Atomic single flight per exact voice job. A concurrent listener may have
  // a different time cap: it still measures the file against its OWN gate.
  const prior=jobs.get(target.href);
  if(prior) {
    const first=await prior;
    if(!first.audioUrl) return {...first,ttsCharacters:0};
  }
  async function job() {
    const hit=await inspect(name,directory,inputHash);
    if(hit) return outcome(hit.timing,0,'cached',hit.failure,hit.hash);
    if(!apiKey) return {audioUrl:null,ttsCharacters:0,audioStatus:'key_missing'};
    const response=await transport('tts',()=>fetch('https://api.elevenlabs.io/v1/text-to-speech/'+encodeURIComponent(voice)+'?output_format='+format,{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(60_000),
      headers:{'xi-api-key':apiKey,'content-type':'application/json',accept:'audio/mpeg'},
      body:JSON.stringify({text,model_id:model}),
    }));
    requireOK('tts',response);
    if(!/^audio\/(mpeg|mp3)(;|$)/i.test(response.headers.get('content-type')??'')) throw new ProviderFailure('tts','unexpected_content_type');
    const len=response.headers.get('content-length');
    if(Number(len)>MAX_BYTES) throw new ProviderFailure('tts','request_size');
    const bytes=await transport('tts',async()=>{
      const chunks=[];let size=0;
      for await(const c of response.body) {
        size+=c.length;if(size>MAX_BYTES) throw new ProviderFailure('tts','request_size');chunks.push(c);
      }
      return Buffer.concat(chunks);
    });
    if(len!==null && !response.headers.get('content-encoding') && bytes.length!==Number(len)) throw new ProviderFailure('tts','incomplete_audio');
    const timing=measureMp3(bytes);
    if(!timing && bytes.length<1000) throw new ProviderFailure('tts','incomplete_audio');
    const result=outcome(timing,text.length,'generated',null,sha256(bytes));
    if(!result.audioUrl) return result;
    await mkdir(directory,{recursive:true,mode:0o700});
    const temp=await mkdtemp(fileURLToPath(new URL('.admit-',directory)));
    try {
      await writeFile(temp+'/voice.mp3',bytes,{mode:0o600});
      const failure=await checkDecode(temp+'/voice.mp3',temp);
      if(failure) return {...invalid(failure),ttsCharacters:text.length};
      await writeFile(temp+'/receipt',JSON.stringify({v:1,name,transcriptSha256:inputHash,audioSha256:result.audioSha256}),{mode:0o600});
      await rename(temp+'/receipt',new URL(name+'.json',directory));
      await rename(temp+'/voice.mp3',target);
      return result;
    } finally {await rm(temp,{recursive:true,force:true});}
  }
  const promise=job();
  jobs.set(target.href,promise);
  try {return await promise;} finally {if(jobs.get(target.href)===promise) jobs.delete(target.href);}
}
