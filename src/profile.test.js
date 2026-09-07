import test from 'node:test';
import assert from 'node:assert/strict';
import {loadProfile,saveProfile,defaultOutfit,randomOutfit} from './profile.js';
import {screenDirection} from './movement.js';
test('profile persists identity, randomized cosmetics and bare reset; corrupt storage is safe',()=>{
 let value=null;const storage={getItem:()=>value,setItem:(key,v)=>{assert.equal(key,'player_profile');value=v;}};
 assert.equal(loadProfile(storage),null);const p={nickname:'Alice',outfit:randomOutfit()};saveProfile(p,storage);assert.deepEqual(loadProfile(storage),p);
 p.outfit={...defaultOutfit};saveProfile(p,storage);assert.deepEqual(loadProfile(storage),p);value='{';assert.equal(loadProfile(storage),null);
 assert.doesNotThrow(()=>saveProfile(p,{setItem(){throw Error();}}));
});
test('all eight inputs map to screen axes and normalized world velocity; opposite keys cancel',()=>{
 const vertical=30/Math.hypot(25,30,25);
 for(const [keys,expected] of [[['w'],[0,-1]],[['s'],[0,1]],[['a'],[-1,0]],[['d'],[1,0]],[['w','d'],[1,-1]],[['s','a'],[-1,1]],[['w','a'],[-1,-1]],[['s','d'],[1,1]]]){
  const [x,z]=screenDirection(new Set(keys));assert.ok(Math.abs(Math.hypot(x,z)-1)<1e-10);
  const screen=[x-z,(x+z)*vertical];const n=Math.hypot(...screen),en=Math.hypot(...expected);
  screen.forEach((v,i)=>assert.ok(Math.abs(v/n-expected[i]/en)<1e-10));
 }
 assert.equal(screenDirection(new Set(['w','s','a','d'])),null);
});
