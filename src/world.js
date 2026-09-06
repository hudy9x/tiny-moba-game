export const SIZE = 44;
export const START = {x:23,z:24};
export function noise(x,z){const n=Math.sin(x*127.1+z*311.7)*43758.5453;return n-Math.floor(n)}
export function isWater(x,z){const river=15+Math.floor(Math.sin(z*.19)*4);const cross=32+Math.floor(Math.sin(x*.17)*3);return (Math.abs(x-river)<2 && !(z>=22&&z<=24))||(Math.abs(z-cross)<1.6&&!(x>=27&&x<=29));}
export function createWorld(){const tiles=[];const lookup=new Map();for(let z=0;z<SIZE;z++)for(let x=0;x<SIZE;x++){const water=isWater(x,z);const clearing=Math.hypot(x-START.x,z-START.z)<4.3;const path=Math.abs(z-23)<2||Math.abs(x-27)<2;const tree=!water&&!clearing&&!path&&noise(x,z)>.72;const tile={x,z,water,tree,sand:!water&&((path&&noise(x+8,z)>.48)||noise(x,z)>.965)};tiles.push(tile);lookup.set(`${x},${z}`,tile)}return {tiles,lookup,canWalk(x,z){const t=lookup.get(`${x},${z}`);return !!t&&!t.water&&!t.tree}}}
