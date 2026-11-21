import test from 'node:test';
import assert from 'node:assert/strict';
import {historyKey,profileKey,readHistory,markHeard,resetHistory} from '../frontend/src/history.js';
function memoryStorage() {
  const map=new Map();
  return {getItem:k=>map.get(k) ?? null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
}
test('explicit mark only; persist minimal IDs, deduplicate and reset one listener/story',()=>{
  const store = memoryStorage(), a=historyKey('fx','one'), b=historyKey('nl','one');
  assert.deepEqual(readHistory(a,store),[]);
  assert.equal(store.getItem(a),null);
  markHeard(a,['u','u'],store);markHeard(b,['v'],store);
  assert.deepEqual(readHistory(a,store),['u']);
  resetHistory(a,store);
  assert.deepEqual(readHistory(a,store),[]);
  assert.deepEqual(readHistory(b,store),['v']);
});
test('invalid stored JSON or shape is recoverable without poisoning other profiles',()=>{
  const store=memoryStorage();
  for(const value of ['{}','null','bad','[3,"<x>"]']) {
    store.setItem('k',value);
    assert.deepEqual(readHistory('k',store),[]);
    assert.deepEqual(markHeard('k',['u'],store),['u']);
  }
});
test('wildcard configuration is namespaced; reordered topics share history; blocked writes throw',()=>{
  const p={language:'nl',topics:[' AI','cloud'],depth:'brief',maxMinutes:2};
  const k=profileKey('custom',p);
  assert.equal(k,profileKey('custom',{...p,topics:['cloud','ai']}));
  assert.notEqual(k,profileKey('custom',{...p,language:'de'}));
  assert.notEqual(k,profileKey('fx-trader',p));
  assert.throws(()=>markHeard('k',['u'],{getItem:()=>null,setItem:()=>{throw Error('blocked')}}));
});
