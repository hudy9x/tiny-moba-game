import test from 'node:test';
import assert from 'node:assert/strict';
import {MovementInput} from './input.js';
const key=(code,extra={})=>({code,key:'ư',preventDefault(){},...extra});
test('physical WASD release survives IME-changed key text; composition cancels motion',()=>{
 const sent=[],input=new MovementInput(v=>sent.push(v));
 input.keydown(key('KeyW'));assert.ok(input.direction());input.keyup(key('KeyW'));assert.equal(input.direction(),null);
 input.keydown(key('KeyD'));input.keydown(key('KeyW',{keyCode:229}));assert.equal(sent.at(-1),null);
 input.keydown(key('KeyD',{isComposing:true}));assert.equal(input.held.size,0);
});
test('right-click, blur, visibility and composition immediately send stop; repeat cannot relatch',()=>{
 const sent=[],input=new MovementInput(v=>sent.push(v)),target=new EventTarget(),doc=new EventTarget();input.bind(target,doc);
 for(const name of ['contextmenu','blur','compositionstart','compositionend','combat-input-reset']) {
  input.composing=false;input.keydown(key('KeyW'));target.dispatchEvent(new Event(name));assert.equal(sent.at(-1),null);assert.equal(input.held.size,0);
  input.keydown(key('KeyW',{repeat:true}));assert.equal(input.held.size,0);
 }
 input.composing=false;input.keydown(key('KeyD'));const right=new Event('pointerdown');Object.defineProperty(right,'button',{value:2});target.dispatchEvent(right);assert.equal(sent.at(-1),null);
 input.keydown(key('KeyD'));doc.dispatchEvent(new Event('visibilitychange'));assert.equal(sent.at(-1),null);input.dispose();
});
test('editing focus blocks and clears movement',()=>{let editing=false;const input=new MovementInput(()=>{},()=>editing);input.keydown(key('KeyW'));editing=true;input.keydown(key('KeyD'));assert.equal(input.held.size,0);});
