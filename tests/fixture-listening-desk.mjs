// Disposable browser test ONLY. Never loads project .env, touches the project
// cache, or falls through to real providers. Ctrl-C removes all fixture audio.
import {mkdtemp,mkdir,cp,writeFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {articles} from './daily-evidence-fixture.mjs';
const dir=await mkdtemp(join(tmpdir(),'second-take-fiction-'));
try {
  await cp(new URL('../backend/src',import.meta.url),join(dir,'backend/src'),{recursive:true});
  await cp(new URL('../shared/fixtures',import.meta.url),join(dir,'shared/fixtures'),{recursive:true});
  const feeds=join(dir,'feeds');await mkdir(feeds);
  const records=articles.map(a=>({$id:a.id,headline:a.headline,text_content:a.text,date:a.date,language:a.language,source:a.id,
    publication:{name:a.outlet},permalink:a.url}));
  const copy={...records[1],$id:'syndicated-fen',permalink:'https://example.test/copy',publication:{name:'QA wire'}};
  const translation={...records[2],$id:'willow-en',language:'en',headline:'Wilg Cloud revises annual storage contracts',
    text_content:'Wilg Cloud customers with annual contracts can carry unused capacity into the next month of the contract.',permalink:'https://example.test/willow-en'};
  const byFeed={actionforex:[records[0]],ibtimes_uk:[records[1]],invezz_de:records.slice(4),invezz_en:[translation],invezz_nl:records.slice(2,4),zacks:[copy]};
  for(const [name,rows] of Object.entries(byFeed))
    await writeFile(join(feeds,name+'.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
  const preload=fileURLToPath(new URL('mock-daily-provider.mjs',import.meta.url));
  const child=spawn(process.execPath,['--import',preload,'backend/src/server.mjs'],{cwd:dir,stdio:'inherit',
    env:{PATH:process.env.PATH,PORT:process.env.QA_PORT||'3001',NEWSTEX_DATA_DIR:feeds,OPENAI_API_KEY:'test-only',
      ELEVENLABS_API_KEY:'test-only',QA_TTS:'speech',QA_MODE:'slow'}});
  for(const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>child.kill());
  const code=await new Promise((resolve,reject)=>{child.on('exit',resolve);child.on('error',reject);});
  if(code)process.exitCode=code;
} finally {await rm(dir,{recursive:true,force:true});}
