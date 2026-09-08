import test from 'node:test';
import assert from 'node:assert/strict';
import {maps} from './maps/registry.js';
import {createWorld} from './world.js';
import {Match} from '../socket-server/match.js';
for(const map of maps)test(`${map.name}: open combat space, varied border cover, crossings`,()=>{
 const world=createWorld(map.id),a=map.arena;
 const center=world.tiles.filter(t=>((t.x-a.x)/a.radiusX)**2+((t.z-a.z)/a.radiusZ)**2<=1);
 assert.ok(center.length>450);assert.ok(center.filter(t=>!t.water && !t.tree).length/center.length>.8);
 const border=world.tiles.filter(t=>Math.min(t.x,t.z,map.size-1-t.x,map.size-1-t.z)<4);
 assert.ok(border.filter(t=>t.tree).length/border.length>.4);
 assert.ok(world.tiles.some(t=>t.bridge));assert.ok(world.tiles.some(t=>t.mountain));
});
test('selected map initializes existing shared players; invalid map and in-match changes rejected',()=>{
 const m=new Match();m.addPlayer('a');m.addPlayer('b');
 m.command('a',{type:'start',mapId:'bad'});assert.equal(m.phase,'waiting');
 for(const map of maps){
  m.command('a',{type:'start',mapId:map.id});assert.equal(m.world.map.id,map.id);assert.equal(m.players.size,2);
  for(const p of m.players.values())assert.ok(m.canOccupy(p.x,p.z));
  m.command('b',{type:'start',mapId:'bad'});assert.equal(m.world.map.id,map.id);m.command('b',{type:'end'});
 }
});
test('four distinct seasons retain their palettes when generating maps',()=>{
 assert.deepEqual(maps.map(m=>m.season),['Spring','Summer','Fall','Winter']);
 assert.equal(new Set(maps.map(m=>m.palette.land[0])).size,4);
 assert.equal(maps.find(m=>m.season==='Winter').obstacle,'pine');
});
test('live season changes preserve round state, scores and health while clearing hazards',()=>{
 const m=new Match();const a=m.addPlayer('a'),b=m.addPlayer('b');
 m.command('b',{type:'map',mapId:'winter'});assert.equal(m.world.map.id,'winter');assert.equal(m.phase,'waiting');
 m.command('a',{type:'start'});m.damage(b,a,20);const endsAt=m.endsAt;
 a.kills=2;m.command('a',{type:'skill',skill:'ultimate',target:b});
 m.command('b',{type:'map',mapId:'canyon'});
 assert.equal(m.world.map.id,'canyon');assert.equal(m.phase,'running');assert.equal(m.endsAt,endsAt);assert.equal(a.kills,2);assert.equal(b.health,80);assert.equal(m.explosions.length,0);
 for(const p of m.players.values()){assert.ok(m.canOccupy(p.x,p.z));assert.deepEqual(p.input,{x:0,z:0});}
 m.command('a',{type:'map',mapId:'invalid'});assert.equal(m.world.map.id,'canyon');
});
