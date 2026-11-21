// Test-only preload for the disposable HTTP server. No network pass-through.
import {createHash} from 'node:crypto';
import {appendFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fixtureDraft,fixtureVerdicts} from './daily-evidence-fixture.mjs';
import {output} from './radio-fixture.mjs';
const note=stage=>appendFile('qa-calls.txt',stage+'\n');
globalThis.fetch=async (url,options)=>{
  const req=JSON.parse(options.body);
  if (url==='https://api.openai.com/v1/responses') {
    const i=JSON.parse(req.input);
    if(process.env.QA_CHECK_CONFIG && (req.model!==(i.claims?'check-fixture':i.previouslyCovered?'repair-fixture':'draft-fixture') ||
      options.method!=='POST' || options.headers.authorization!=='Bearer test-only' || options.headers['content-type']!=='application/json' ||
      !options.signal || req.store!==false || req.text.format.type!=='json_schema' || req.text.format.strict!==true))
      throw new Error('QA Responses protocol mismatch');
    if (i.claims) {
      await note(i.previouslyCovered.length?'repair_verifier':'verifier');
      if (process.env.QA_MODE==='verifier-error') return new Response('PRIVATE',{status:429});
      return output({verdicts:fixtureVerdicts(i)});
    }
    await note(i.previouslyCovered?'repair':'writer');
    const draft=fixtureDraft(i);
    if(process.env.QA_MODE==='slow') await new Promise(resolve=>setTimeout(resolve,100));
    return output({segments:process.env.QA_MODE==='repair' && !i.previouslyCovered?draft.filter(c=>c.articleId==='cairn'):draft});
  }
  if (url.startsWith('https://api.elevenlabs.io/v1/text-to-speech/')) {
    if(process.env.QA_CHECK_CONFIG && (url!=='https://api.elevenlabs.io/v1/text-to-speech/test-voice?output_format=mp3_44100_128' ||
      options.method!=='POST' || options.headers['xi-api-key']!=='test-only' || options.headers.accept!=='audio/mpeg' ||
      !options.signal || req.model_id!=='voice-fixture')) throw new Error('QA voice protocol mismatch');
    await note('tts');
    if (process.env.QA_TTS==='http') return new Response('DO NOT ECHO THIS RESPONSE',{status:503});
    await writeFile('tts-text.sha256',createHash('sha256').update(req.text).digest('hex'));
    let bytes;
    if (process.env.QA_TTS==='speech') {
      // Actual local speech of the exact fictional script at default rate.
      // Only the optional codec integration test takes this path.
      const wav=execFileSync('espeak',['--stdin','--stdout','-v',req.text.startsWith('Dit is')?'nl':req.text.startsWith('Hier ist')?'de':'en'],
        {input:req.text,maxBuffer:24*1024*1024});
      bytes=execFileSync('ffmpeg',['-v','error','-i','pipe:0','-ar','44100','-c:a','libmp3lame','-b:a','128k','-f','mp3','pipe:1'],
        {input:wav,maxBuffer:8*1024*1024});
    } else {
      // Structural timing fixtures only, not speech measurements.
      const frame=Buffer.alloc(417); frame.set([255,251,144,0]);
      bytes=Buffer.concat(Array(process.env.QA_TTS==='short-frames'?1200:3600).fill(frame));
    }
    return new Response(bytes,{headers:{'content-type':'audio/mpeg'}});
  }
  throw new Error('Unexpected transport in offline test');
};
