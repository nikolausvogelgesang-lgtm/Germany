// Safe operator CLI, not a browser route. Never posts a prompt or a script.
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {loadConfig,openAIModel,voiceConfig} from '../src/config.mjs';
import {ProviderFailure,transport,requireOK,requireJson} from '../src/providers.mjs';
import {loadArticles} from '../src/news.mjs';
import {editionIndex} from '../src/editorial.mjs';
import {editionSelection,planEvent} from '../src/evidence.mjs';
import {cutoff,scenarios} from './scenarios.mjs';

const labels={authentication:'AUTHENTICATION FAILED',permission:'MODEL OR VOICE UNAVAILABLE',not_found:'MODEL OR VOICE UNAVAILABLE',
  unavailable:'MODEL OR VOICE UNAVAILABLE',rate_limit:'RATE LIMITED',network:'NETWORK UNAVAILABLE',timeout:'NETWORK UNAVAILABLE'};
export async function providerPreflight(env,send=fetch) {
  const rows=[];
  async function probe(role,key,url,headers,check) {
    if(!key) {rows.push({role,status:'NOT CONFIGURED'});return;}
    try {
      const res=await transport('preflight',()=>send(url,{method:'GET',headers,signal:AbortSignal.timeout(8_000),redirect:'error'}));
      requireOK('preflight',res);requireJson('preflight',res);
      const v=await transport('preflight',async()=>{
        try{return await res.json();}catch(e){if(e instanceof SyntaxError) throw new ProviderFailure('preflight','invalid_response_json');throw e;}
      });
      if(!check(v)) throw new ProviderFailure('preflight','unavailable');
      rows.push({role,status:'READY',scope:'metadata access only'});
    } catch(e) {
      const why=e instanceof ProviderFailure?e:new ProviderFailure('preflight','invalid_response');
      rows.push({role,status:labels[why.category]??'PROVIDER ERROR',category:why.category,httpStatus:why.httpStatus});
    }
  }
  const keys=Map.groupBy(['writer','verifier','repair'],role=>openAIModel(role,env));
  for(const [model,roles] of keys)
    await probe('OpenAI '+roles.join('/'),env.OPENAI_API_KEY,'https://api.openai.com/v1/models/'+encodeURIComponent(model),
      {authorization:'Bearer '+env.OPENAI_API_KEY},v=>v?.id===model);
  const headers={'xi-api-key':env.ELEVENLABS_API_KEY}, {voice,model}=voiceConfig(env);
  await probe('ElevenLabs voice',env.ELEVENLABS_API_KEY,'https://api.elevenlabs.io/v1/voices/'+encodeURIComponent(voice),headers,v=>v?.voice_id===voice);
  await probe('ElevenLabs model',env.ELEVENLABS_API_KEY,'https://api.elevenlabs.io/v1/models',headers,
    vs=>Array.isArray(vs)&&vs.some(v=>v?.model_id===model && v.can_do_text_to_speech===true && v.is_allowed_to_use!==false));
  return rows;
}

async function main(args) {
  if(args.length && (args.length!==1 || args[0]!=='--providers')) throw new Error('Use preflight or preflight --providers');
  loadConfig();
  if(args.length) {
    const rows=await providerPreflight(process.env);
    console.log(JSON.stringify(rows,null,2));
    console.log('Read-only metadata, not authorization for inference, remaining credit, structured outputs or voice quality. 403 can mean insufficient metadata scope. No generation.');
    return rows.every(r=>r.status==='READY');
  }
  const configured=k=>process.env[k]?'configured (unverified)':'NOT CONFIGURED';
  const decoder=process.platform==='darwin'?existsSync('/usr/bin/afconvert'):spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status===0;
  const info={cutoff,openAI:configured('OPENAI_API_KEY'),elevenLabs:configured('ELEVENLABS_API_KEY'),decoder,
    privateLedger:process.env.MEMORY_LEDGER_FILE?'configured (not proof of approval)':'absent; fictional rehearsal only'};
  let viable=false;
  if(process.env.NEWSTEX_DATA_DIR) {
    const articles=await loadArticles(process.env.NEWSTEX_DATA_DIR);
    const groups=editionIndex(articles)(cutoff);
    info.articles=articles.length;
    info.plans=scenarios.map(({id,listener})=>{
      const s=editionSelection(groups,listener,cutoff);
      return {id,matchingGroups:s.ranked.filter(g=>g.topicHits).length,planned:s.choose().map(slot=>{
        const e=planEvent(slot,s);return {eventId:e.id,passages:e.bank.length,plannedFacts:e.outline.length};})};
    });
    viable=info.articles===1740 && info.plans.every(p=>p.planned.filter(s=>s.plannedFacts).length>=2);
  } else info.articles='NOT CONFIGURED';
  console.log(JSON.stringify(info,null,2));console.log('Local checks only. Passage counts are not verified words. No external requests.');
  return viable && decoder && !!process.env.OPENAI_API_KEY && !!process.env.ELEVENLABS_API_KEY;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {if(!await main(process.argv.slice(2))) process.exitCode=1;}
  catch(e) {
    const safe=/^(?:Invalid (?:article (?:JSON|metadata)|publisher, language or zoned publication time)|Duplicate article ID) in (?:actionforex|ibtimes_uk|invezz_(?:en|de|nl)|zacks)\.jsonl$/.test(e.message);
    console.error(safe?e.message:'Preflight incomplete: check command, root configuration and six readable feeds. No provider payloads printed.');
    process.exitCode=1;
  }
}
