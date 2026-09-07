export const eyes = {round:'Round',sleepy:'Sleepy',bright:'Blue',wink:'Wink',glasses:'Glasses',sunglasses:'Sunglasses'};
export const hats = {none:'None',sprout:'Sprout',cap:'Cap',winter:'Winter beanie',tophat:'Top hat',crown:'Crown',headphones:'Headphones'};
export const shoes = {classic:'Classic',sneakers:'Sneakers',boots:'Boots',slippers:'Slippers'};
export function sanitizeName(value) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f<>]/g,'').trim().slice(0,20) || 'Explorer' : 'Explorer';
}
export function sanitizeCostume(value = {}) {
  return {
    color: /^#[0-9a-f]{6}$/i.test(value?.color) ? value.color : '#f2684a',
    eye: Object.hasOwn(eyes,value?.eye) ? value.eye : 'round',
    hat: Object.hasOwn(hats,value?.hat) ? value.hat : 'none',
    shoes: Object.hasOwn(shoes,value?.shoes) ? value.shoes : 'classic',
  };
}
