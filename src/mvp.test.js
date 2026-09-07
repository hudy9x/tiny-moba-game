import test from 'node:test';
import assert from 'node:assert/strict';
import {selectMvp} from './mvp.js';
import {Match} from '../socket-server/match.js';
test('MVP rewards kills and damage with a death penalty and stable ties',()=>{
 const a={id:'a',name:'A',kills:2,deaths:5,damageDealt:250};
 const b={id:'b',name:'B',kills:2,deaths:1,damageDealt:400};
 assert.equal(selectMvp([a,b]).id,'b');assert.equal(selectMvp([a,b]).score,215);
 assert.equal(selectMvp([{...b,id:'z'},{...b,id:'a'}]).id,'a');assert.equal(selectMvp([]),null);
});
test('MVP captures actual damage, survives disconnect, expires after 3 seconds and resets next round',()=>{
 const m=new Match(),a=m.addPlayer('a'),b=m.addPlayer('b');m.command('a',{type:'start'});
 b.health=10;m.damage(b,a,100);assert.equal(a.damageDealt,10);
 m.command('b',{type:'end'});const state=m.snapshot();assert.equal(state.mvp.id,'a');assert.equal(state.mvp.damageDealt,10);assert.equal(state.celebrationEndsAt-state.time,3);
 m.removePlayer('a');assert.equal(m.snapshot().mvp.id,'a');m.step(3);assert.ok(m.time>=m.celebrationEndsAt);
 m.command('b',{type:'start'});assert.equal(m.snapshot().mvp,null);assert.equal(b.damageDealt,0);
});
test('damage dealt persists through respawn and damage is rejected outside active rounds',()=>{
 const m=new Match(),a=m.addPlayer('a'),b=m.addPlayer('b');m.damage(b,a,20);assert.equal(a.damageDealt,0);
 m.command('a',{type:'start'});m.damage(b,a,20);m.damage(a,b,100);m.step(5);assert.equal(a.damageDealt,20);
 m.command('b',{type:'end'});m.damage(b,a,20);assert.equal(a.damageDealt,20);
});
