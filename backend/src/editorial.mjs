// These are pointers into the private export, not evidence or approval.
import { curatedEventKey, groupArticles } from './news.mjs';
export const candidate = {
  storyId: 'nvidia-huang-return',
  updateIds: ['return-campaign-2026-11-16', 'huang-statement-2026-11-17'],
  editions: ['2026-11-16T23:59:59Z', '2026-11-17T23:59:59Z'],
  articleIds: ['INVZ-10009737-01M7HKN100QWRFZXPSMS8WWFQ1','INVZ-10009737-01M7N83B6HGJSN8P6PRG6ZJBNJ'],
};
export function eligibleGroups(groups) {
  return groups.filter(group => !group.some(a => candidate.articleIds.includes(a.id) ||
    curatedEventKey(a.headline) === 'nvidia-musk-return-campaign' ||
    (/huang/i.test(a.headline) && /reinstat|return|comeback|terugk|rückkehr/i.test(a.headline))));
}

// Group and apply editorial holds ONLY after the edition window is known.
// Share the derived groups across listeners with the same eligible intake;
// identical memberships also cover successive "current" clock ticks.
export function editionIndex(dataset) {
  const sorted=[...dataset].sort((a,b)=>a.dateMs-b.dateMs);
  const cache=new Map();
  function lower(ms) {
    let lo=0,hi=sorted.length;
    while(lo<hi) {const i=Math.floor((lo+hi)/2); if(sorted[i].dateMs<ms) lo=i+1;else hi=i;}
    return lo;
  }
  return asOf=>{
    const end=Date.parse(asOf);
    if(!Number.isFinite(end)) throw new Error('Invalid asOf date');
    const from=lower(end-7*86400000),to=lower(end+1),key=from+':'+to;
    if(!cache.has(key)) {
      if(cache.size>=4) cache.delete(cache.keys().next().value);
      cache.set(key,eligibleGroups(groupArticles(sorted.slice(from,to)).groups));
    }
    return cache.get(key);
  };
}
