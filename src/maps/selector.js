import { maps } from './registry.js';
import { gameConfig } from '../gameConfig.js';
export function setupMapSelector() {
  const select=document.querySelector('#map-select');
  select.replaceChildren(...maps.map(m=>new Option(m.name,m.id)));
  select.value=gameConfig.maps.defaultId;select.disabled=true;
  return gameConfig.maps.defaultId;
}
export class ArenaSelector {
  constructor(onSelect) {
    this.onSelect=onSelect;
    this.header=document.querySelector("#map-select");
    this.header.disabled=false;
    this.header.onchange=()=>this.onSelect(this.header.value);
    this.selected=gameConfig.maps.defaultId;
    this.panel=document.createElement('section');this.panel.className='arena-selector';
    this.panel.setAttribute('aria-label','Choose a season for everyone');
    const title=document.createElement('p');title.textContent='CHOOSE A SEASON · CHANGES FOR EVERYONE';this.panel.append(title);
    const cards=document.createElement('div');cards.className='arena-cards';this.panel.append(cards);
    for(const map of maps) {
      const button=document.createElement('button');button.type='button';button.dataset.map=map.id;button.title=map.layoutDescription || map.name;
      const canvas=document.createElement('canvas');canvas.width=canvas.height=132;canvas.setAttribute('aria-label',`${map.name} minimap preview`);
      const ctx=canvas.getContext('2d'),s=132/map.size;
      map.rows.forEach((row,z)=>[...row].forEach((tile,x)=>{
        ctx.fillStyle=tile==='H'?'#ae624a':tile==='M'?map.palette.earth[0]:tile==='B'?'#c5a06a':tile==='T'?map.palette.foliage[0]:tile==='~'?map.palette.water[0]:tile===':'?map.palette.sand:map.palette.land[2];ctx.fillRect(x*s,z*s,s+.3,s+.3);
      }));
      const name=document.createElement('strong');name.textContent=map.name;
      button.append(canvas,name);button.onclick=()=>this.onSelect(map.id);cards.append(button);
    }
    document.querySelector('#app').append(this.panel);this.refresh();
  }
  refresh() {for(const button of this.panel.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.map===this.selected));}
  sync(state) {this.panel.hidden=state.phase==='running';this.selected=state.mapId;this.header.value=state.mapId;this.refresh();}
  dispose(){this.header.onchange=null;this.panel.remove();}
}
