import {eyes,hats,shoes} from './costume.js';
import {loadProfile,saveProfile,defaultOutfit,randomOutfit} from './profile.js';
import {gameConfig} from './gameConfig.js';
import './style.css';
import './menu.css';
import {MenuPreview} from './menuPreview.js';
const app=document.querySelector('#app');
app.hidden=true;
const saved=loadProfile();
async function enter(profile) {
  saveProfile(profile);
  const url=new URL(location.href);
  url.searchParams.delete('customize');url.searchParams.set('mode','ffa');url.searchParams.set('map',gameConfig.maps.defaultId);url.searchParams.set('room','arena');
  history.replaceState(null,'',url);
  app.hidden=false;
  await import('./main.js');
}
if(saved && !new URLSearchParams(location.search).has("customize")) await enter(saved);
else {
  const menu=document.createElement('main');menu.className='game-menu';document.body.append(menu);
  menu.innerHTML='<div class="menu-scene"></div><div class="menu-overlay"><a class="brand" href="/">▧ little world.</a><form class="menu-panel"><p class="eyebrow">FREE-FOR-ALL / FIVE MINUTES</p><h1>Make your mark.</h1><p>One shared arena. Everyone is a rival. Most kills wins.</p><label>Nickname<input name="nickname" maxlength="20" required autocomplete="nickname" placeholder="Explorer"></label><div class="outfit-fields"></div><div class="menu-actions"><button type="button" id="mix">Auto-Mix</button><button type="button" id="default">Reset to Default</button><button class="primary">Enter arena</button></div></form></div>';
  const preview=new MenuPreview(menu.querySelector('.menu-scene'));
  let outfit={...(saved?.outfit || defaultOutfit)};
  menu.querySelector("[name=nickname]").value=saved?.nickname || "";
  const fields=menu.querySelector('.outfit-fields');
  const choices={skin:{pip:'Pip',sprout:'Sprout'},eye:eyes,hat:hats,shoes};
  for(const [key,values] of Object.entries(choices)) {
    const label=document.createElement('label');label.textContent=key;
    const select=document.createElement('select');select.name=key;
    for(const [value,text] of Object.entries(values))select.add(new Option(text,value));
    label.append(select);fields.append(label);
    select.onchange=()=>{outfit[key]=select.value;refresh();};
  }
  fields.insertAdjacentHTML('beforeend','<label>Color tint<input name="color" type="color"></label>');
  fields.querySelector('[name=color]').oninput=e=>{outfit.color=e.target.value;refresh();};
  function refresh(){const nickname=menu.querySelector("[name=nickname]").value.trim();if(nickname)saveProfile({nickname,outfit});for(const key of Object.keys(outfit))fields.querySelector(`[name=${key}]`).value=outfit[key];preview.show(gameConfig.maps.defaultId,outfit,true);}
  menu.querySelector('#mix').onclick=()=>{outfit=randomOutfit();refresh();};
  menu.querySelector('#default').onclick=()=>{outfit={...defaultOutfit};refresh();};
  menu.querySelector('form').onsubmit=async e=>{e.preventDefault();const nickname=menu.querySelector('[name=nickname]').value.trim();if(!nickname)return;preview.dispose();menu.remove();await enter({nickname,outfit});};
  refresh();
}
