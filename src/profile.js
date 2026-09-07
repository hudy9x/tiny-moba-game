import {sanitizeCostume, sanitizeName, eyes, hats, shoes} from './costume.js';
export const defaultOutfit = {skin:'pip',color:'#f2684a',eye:'round',hat:'none',shoes:'none'};
export function loadProfile(storage = globalThis.localStorage) {
  try {
    const p = JSON.parse(storage.getItem('player_profile'));
    if (!p || typeof p.nickname !== 'string' || !p.nickname.trim()) return null;
    return {nickname:sanitizeName(p.nickname),outfit:{...sanitizeCostume(p.outfit),skin:p.outfit?.skin==='sprout'?'sprout':'pip'}};
  } catch { return null; }
}
export function saveProfile(profile, storage = globalThis.localStorage) {
  try {storage.setItem('player_profile',JSON.stringify(profile));} catch { /* Play remains available when storage is blocked. */ }
}
export function randomOutfit(random = Math.random) {
  const pick = values => values[Math.floor(random()*values.length)];
  return {skin:pick(['pip','sprout']),color:'#'+Math.floor(random()*16777216).toString(16).padStart(6,'0'),eye:pick(Object.keys(eyes)),hat:pick(Object.keys(hats)),shoes:pick(Object.keys(shoes))};
}
