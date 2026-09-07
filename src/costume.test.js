import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeName,sanitizeCostume,eyes,hats,shoes} from './costume.js';
import {Player} from './player.js';
import {createWorld} from './world.js';
import {Scene} from 'three';
test('names strip control characters and have a bounded nonempty fallback',()=>{
 assert.equal(sanitizeName('  Ada<>\n '),'Ada');assert.equal(sanitizeName(' '),'Explorer');assert.equal(sanitizeName('x'.repeat(100)).length,20);
});
test('all costume choices build on the actual character',()=>{
 const p=new Player(new Scene(),createWorld(),()=>{});
 for(const eye of Object.keys(eyes))for(const hat of Object.keys(hats))for(const shoe of Object.keys(shoes)){
 p.costume=sanitizeCostume({eye,hat,shoes:shoe});p.build();assert.equal(p.feet.length,2);assert.ok(p.group.children.length>6);
 }
 assert.equal(Object.keys(shoes).length,4);
});
