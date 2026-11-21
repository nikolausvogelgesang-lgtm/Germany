// No keys or provider imports. Exercise the production JSONL loader and
// grouping on a denser seven-day intake, NOT by running paid editions.
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {performance} from 'node:perf_hooks';
import {groupArticles,loadArticles} from '../src/news.mjs';
import {editionSelection,planEvent} from '../src/evidence.mjs';
import {eligibleGroups} from '../src/editorial.mjs';
import {cutoff,scenarios} from './scenarios.mjs';
import {stories} from '../../tests/daily-evidence-fixture.mjs';
const names=['actionforex','ibtimes_uk','invezz_en','invezz_de','invezz_nl','zacks'];
async function measure(n,fn) {
  const u=process.cpuUsage(),start=performance.now(),v=await fn();
  const c=process.cpuUsage(u);
  return [v,{stage:n,ms:+(performance.now()-start).toFixed(1),cpuMs:+((c.user+c.system)/1000).toFixed(1)}];
}
for(const count of [1740,17400]) {
  const dir=await mkdtemp(join(tmpdir(),'st-intake-'));
  try {
    // Six feeds, repeated market vocabulary and bylines; explicit occasional
    // syndications and time-near translation pairs. Synthetic, not Newstex text.
    const records=names.map(()=>[]), blocks=count/6;
    for(let k=0;k<blocks;k++) {
      const date=Date.parse(cutoff)-7*86400000+Math.floor(k*(7*86400000-120000)/blocks)+1000;
      const t=k%5===0,copy=k%7===0;
      for(const [f,feed] of names.entries()) {
        const j=[0,1,1,4,3,0][f], topic=stories[j];
        const id='qa-'+k+'-'+f, actor='Desk'+k+'x'+(t&&[2,3,4].includes(f)?2:f);
        const repeated=t&&[2,3,4].includes(f);
        const pair=[
          ['revises cloud storage contracts','Annual customers may carry unused storage capacity into the following month. The existing price for reserved space remains in effect.'],
          ['ändert Verträge für Cloudspeicher','Jahreskunden dürfen ungenutzten Speicherplatz in den nächsten Monat übertragen. Der bisherige Preis für reservierten Speicherplatz gilt weiter.'],
          ['verandert contracten voor cloudopslag','Jaarklanten kunnen ongebruikte opslagruimte meenemen naar de volgende maand. De bestaande prijs voor gereserveerde ruimte blijft gelden.']
        ][f-2];
        const wire=copy&&f===5?JSON.parse(records[0].at(-1)):null;
        const headline=wire?wire.headline+' — wire update':actor+' '+(repeated?pair[0]:topic[2]);
        const text=wire?wire.text_content:actor+': '+(repeated?pair[1]:topic[3].map(row=>row[0]).join(' '));
        records[f].push(JSON.stringify({$id:id,headline,language:[3,4].includes(f)?(f===3?'de':'nl'):'en',
          date:new Date(date+f*1000).toISOString(),source:'Reporter'+(k%80)+'-'+(repeated?2:f),publication:{name:feed},permalink:'https://example.test/'+id,text_content:text}));
      }
    }
    for(const [f,name] of names.entries()) await writeFile(join(dir,name+'.jsonl'),records[f].join('\n')+'\n');
    const [articles,load]=await measure('parse-normalize',()=>loadArticles(dir));
    const [grouping,group]=await measure('deduplicate-group',()=>groupArticles(articles));
    const eligible=eligibleGroups(grouping.groups);
    const [ids,plan]=await measure('three listener plans',()=>scenarios.map(p=>{
      const s=editionSelection(eligible,p.listener,cutoff);return s.choose().map(slot=>planEvent(slot,s).id);
    }));
    if(articles.length!==count || ids.some(row=>!row.length)) throw new Error('Bounded intake did not produce all plans.');
    console.log(JSON.stringify({fixtureArticles:count,groups:grouping.groups.length,diagnostics:grouping.diagnostics,timings:[load,group,plan]}));
  } finally {await rm(dir,{recursive:true,force:true});}
}
