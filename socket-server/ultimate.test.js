import test from 'node:test';
import assert from 'node:assert/strict';
import {Match} from './match.js';
import {gameConfig} from '../src/gameConfig.js';
function setup(){const m=new Match();const a=m.addPlayer('a'),b=m.addPlayer('b');m.command('a',{type:'start'});Object.assign(a,{x:23,z:24});Object.assign(b,{x:25,z:24});m.command('a',{type:'skill',skill:'ultimate',target:b});return {m,a,b};}
test('ultimate telegraphs exactly one second, hits once for balanced damage, then cleans up',()=>{
 const {m,a,b}=setup();assert.equal(m.explosions[0].startedAt,1);m.step(.999);assert.equal(b.health,100);m.step(.001);assert.equal(b.health,55);assert.equal(a.health,100);m.step(.2);assert.equal(b.health,55);m.step(1.01);assert.equal(m.explosions.length,0);
 assert.ok(gameConfig.skills.ultimate.damage/gameConfig.player.baseHealth<=.5);
});
test('targets can dodge during windup; shielded and late entrants are unharmed',()=>{
 const {m,b}=setup();b.x=29;m.step(1);assert.equal(b.health,100);b.x=25;m.step(.1);assert.equal(b.health,100);
 const next=setup();next.b.invulnerableUntil=2;next.m.step(1);assert.equal(next.b.health,100);
});
test('all other players in radius can be damaged and target is range limited',()=>{
 const {m,b}=setup();const c=m.addPlayer('c');Object.assign(c,{x:25,z:23});b.health=40;b.lastCombat=0;m.step(1);assert.equal(b.status,'dead');assert.equal(c.health,55);assert.equal(m.players.get('a').kills,1);
 m.restart();const a=m.players.get('a');m.command('a',{type:'skill',skill:'ultimate',target:{x:999,z:999}});const blast=m.explosions[0];assert.ok(Math.hypot(blast.x-a.x,blast.z-a.z)<=gameConfig.skills.ultimate.range);
});
