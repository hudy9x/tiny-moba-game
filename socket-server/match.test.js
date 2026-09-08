import test from 'node:test';
import assert from 'node:assert/strict';
import {Match} from './match.js';
import {gameConfig} from '../src/gameConfig.js';
const pair=()=>{const m=new Match();const a=m.addPlayer('a'),b=m.addPlayer('b');m.command('a',{type:'start'});Object.assign(a,{x:23,z:24});Object.assign(b,{x:25,z:24});return {m,a,b};};
const advance=(m,t)=>{for(let e=0;e<t-1e-9;e+=.01)m.step(Math.min(.01,t-e));};
test('continuous normalized movement, immediate stop, stale and malformed input',()=>{
 for(const direction of [{x:1,z:0},{x:1,z:1},{x:999,z:999}]){
  const {m,a}=pair();m.command('a',{type:'move',direction});m.step(.1);
  assert.ok(Math.abs(Math.hypot(a.x-23,a.z-24)-gameConfig.player.moveSpeed*.1)<1e-8);
  m.command('a',{type:'move',direction:{x:0,z:0}});const x=a.x,z=a.z;m.step(.1);assert.deepEqual([a.x,a.z],[x,z]);
  m.command('a',{type:'move',direction:{x:NaN,z:0}});assert.deepEqual(a.input,{x:0,z:0});
  m.command('a',{type:'move',direction});advance(m,1);const stopped=a.x;advance(m,1);assert.equal(a.x,stopped);
 }
});
test('circle collisions prevent normal movement and dash tunneling through obstacles or bounds',()=>{
 const {m,a}=pair();
 for(const kind of ['tree','water']) {
  const t=m.world.tiles.find(t=>t[kind] && m.canOccupy(t.x-1,t.z));
  Object.assign(a,{x:t.x-1,z:t.z,facing:{x:1,z:0},motion:null});a.cooldowns.dash=0;
  m.command('a',{type:'skill',skill:'dash'});m.step(.3);
  assert.ok(a.x<=t.x-.5-gameConfig.player.hitRadius+1e-8);assert.ok(m.canOccupy(a.x,a.z));
 }
 assert.equal(m.canOccupy(-1,0),false);
});
test('piercing beam hits all other players once, emits impacts, respects cooldown and range',()=>{
 const {m,a,b}=pair();const c=m.addPlayer('c');Object.assign(c,{x:24,z:24});
 const cmd={type:'skill',skill:'basic',target:b};m.command('a',cmd);m.command('a',cmd);assert.equal(m.projectiles.length,1);
 advance(m,.3);assert.equal(b.health,78);assert.equal(c.health,78);assert.equal(a.health,100);
 assert.equal(m.events.filter(e=>e.type==='damage').length,2);assert.ok(m.events.some(e=>e.type==='impact'));
 advance(m,1);assert.equal(m.projectiles.length,0);
});
test('death counts once, blocks controls, retains profile and scores through respawn and shield',()=>{
 const {m,a,b}=pair();a.name='Alice';a.costume={hat:'crown'};a.kills=3;
 m.damage(a,b,100);m.damage(a,b,100);assert.equal(b.kills,1);assert.equal(a.deaths,1);
 m.command('a',{type:'move',direction:{x:1,z:0}});m.command('a',{type:'skill',skill:'basic',target:b});
 assert.equal(m.projectiles.length,0);advance(m,4.99);assert.equal(a.status,'dead');advance(m,.02);
 assert.equal(a.health,100);assert.equal(a.status,'alive');assert.equal(a.kills,3);assert.equal(a.deaths,1);assert.equal(a.name,'Alice');assert.equal(a.costume.hat,'crown');
 m.damage(a,b,100);assert.equal(a.health,100);advance(m,2.01);m.damage(a,b,22);assert.equal(a.health,78);
});
test('health never regenerates outside combat',()=>{
 const {m,a,b}=pair();a.health=50;b.health=50;m.damage(b,a,10);advance(m,2.99);assert.equal(a.health,50);assert.equal(b.health,40);advance(m,.2);assert.equal(a.health,50);assert.equal(b.health,40);advance(m,15);assert.equal(a.health,50);assert.equal(b.health,40);
});
test('five-minute deadline stops attacks, kills decide winner, round restart resets scores',()=>{
 const {m,a,b}=pair();a.kills=4;b.kills=2;a.name='Alice';a.gems=99;advance(m,5);assert.equal(m.gems.length,0);assert.equal(m.winner,null);
 m.time=m.endsAt-.01;m.step(.01);assert.equal(m.winner,'a');assert.equal(m.snapshot().winnerName,'Alice');
 const x=b.x;m.command('b',{type:'move',direction:{x:1,z:0}});m.command('b',{type:'skill',skill:'ultimate',target:a});m.step(.1);assert.ok(b.x>x);assert.equal(m.explosions.length,0);
 advance(m,8);assert.equal(m.winner,'a');m.command('b',{type:'start'});assert.equal(m.winner,null);assert.equal(a.kills,0);assert.equal(a.name,'Alice');assert.ok(m.endsAt-m.time>299);
});
test('kill ties use fewer deaths then stable player ID; configured capacity is enforced',()=>{
 const {m,a,b}=pair();a.kills=b.kills=3;a.deaths=2;b.deaths=1;m.time=m.endsAt;m.updateVictory();assert.equal(m.winner,'b');
 const cfg=structuredClone(gameConfig);cfg.match.maxPlayers=2;const room=new Match(cfg);room.addPlayer('a');room.addPlayer('b');assert.equal(room.addPlayer('c'),null);
});
test('waiting arena ignores combat, any player including dead players can end, and start resets round',()=>{
 const m=new Match(),a=m.addPlayer('a'),b=m.addPlayer('b');const x=a.x;
 m.command('a',{type:'move',direction:{x:1,z:0}});m.command('a',{type:'skill',skill:'basic',target:b});m.step(.1);assert.ok(a.x>x);const moved=a.x;m.step(400);
 assert.equal(m.phase,'waiting');assert.equal(m.snapshot().remaining,300);assert.equal(a.x,moved);assert.equal(m.projectiles.length,0);
 m.command('b',{type:'start'});assert.equal(m.endsAt,m.time+300);
 const deadline=m.endsAt;m.command('a',{type:'start'});assert.equal(m.endsAt,deadline);
 m.damage(b,a,100);assert.equal(b.status,'dead');m.command('b',{type:'end'});assert.equal(m.phase,'ended');
 m.command('a',{type:'start'});assert.equal(a.kills,0);assert.equal(b.status,'alive');assert.equal(b.health,100);
});
test('successful hits award combo milestones, shields do not count, death and end reset streak',()=>{
 const {m,a,b}=pair();b.health=b.maxHealth=1000;
 for(let i=1;i<=5;i++)m.damage(b,a,1);
 assert.equal(a.hitStreak,5);assert.deepEqual(m.events.filter(e=>e.type==='damage').map(e=>e.hitStreak),[1,2,3,4,5]);
 b.invulnerableUntil=m.time+2;m.damage(b,a,1);assert.equal(a.hitStreak,5);
 m.damage(a,b,100);assert.equal(a.hitStreak,0);assert.equal(b.hitStreak,1);
 m.command('a',{type:'end'});assert.equal(b.hitStreak,0);
});
