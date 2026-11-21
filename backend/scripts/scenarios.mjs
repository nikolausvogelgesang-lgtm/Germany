// Two UI presets + a test of the existing Custom controls, NOT a third preset.
import presets from '../../shared/listener-profiles.json' with {type:'json'};
export const cutoff='2026-11-19T23:59:59Z';
export const scenarios=[...presets,{id:'custom-energy-de',name:'Custom German energy',listener:{language:'de',topics:['Energie','Öl'],depth:'brief',maxMinutes:3}}];
