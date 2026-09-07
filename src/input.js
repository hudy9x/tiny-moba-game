import {screenDirection} from './movement.js';
const codes={KeyW:'w',KeyA:'a',KeyS:'s',KeyD:'d',ArrowUp:'ArrowUp',ArrowDown:'ArrowDown',ArrowLeft:'ArrowLeft',ArrowRight:'ArrowRight'};
export class MovementInput {
  constructor(send, blocked=()=>false) {this.held=new Set();this.send=send;this.blocked=blocked;this.composing=false;}
  clear(){this.held.clear();this.send(null);}
  keydown(e){
    if(e.isComposing || e.keyCode===229 || this.composing){this.clear();return;}
    if(this.blocked()){this.clear();return;}
    const key=codes[e.code] || (Object.values(codes).includes(e.key)?e.key:null);
    if(key && e.repeat && !this.held.has(key)) return;
    if(key){e.preventDefault();this.held.add(key);this.send(this.direction());}
  }
  keyup(e){const key=codes[e.code] || e.key;this.held.delete(key);if(e.isComposing || e.keyCode===229)this.clear();else this.send(this.direction());}
  direction(){return this.composing || this.blocked()?null:screenDirection(this.held);}
  bind(target,doc){
    const abort=new AbortController(),options={signal:abort.signal};
    target.addEventListener('keydown',e=>this.keydown(e),options);
    target.addEventListener('keyup',e=>this.keyup(e),options);
    for(const event of ['blur','contextmenu','combat-input-reset'])target.addEventListener(event,()=>{this.composing=false;this.clear();},options);
    target.addEventListener('pointerdown',e=>{if(e.button===2)this.clear();},options);
    target.addEventListener('compositionstart',()=>{this.composing=true;this.clear();},options);
    target.addEventListener('compositionend',()=>{this.composing=false;this.clear();},options);
    doc.addEventListener('visibilitychange',()=>{this.composing=false;this.clear();},options);
    doc.addEventListener('focusin',()=>{if(this.blocked())this.clear();},options);
    this.dispose=()=>abort.abort();
  }
}
