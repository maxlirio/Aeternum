// Which version of a thing a planet builds. Every family of object (cottages, shrines, water towers,
// boats…) exists once per way of building (tools/assets/family_kit.py); a people's culture favours a
// few of those ways, and within them each family settles on its own, from the seed. So on one planet
// the cottages are brick and the sheds tin, and on the next they're thatch and stone, and the choice
// holds across that whole planet. Pure, and it only ever names a model: nothing reads its shape.
import { hash01 } from '../core/hash.js';
import { cultureOf } from './culture.js';
import { FOOT, WAY_NAMES } from './familydata.js';
import { houseDesigns, houseFoot } from './housegen.js';

// a culture's ways of building, most favoured first
const FAVOURS = { masonry: ['stone', 'brick', 'render'], corporate: ['prefab', 'render', 'concrete'], brutalist: ['concrete', 'tin', 'brick'], garden: ['render', 'timber', 'stone'], foundry: ['tin', 'brick', 'concrete'], neon: ['tin', 'concrete', 'prefab'] };
const WEIGHT = [0.62, 0.28, 0.1];
const memo = new WeakMap();

// this planet's usual way of building one family, then its second choice: [way index, way index]
function waysFor(planet, fam) {
  let m = memo.get(planet); if (!m) memo.set(planet, m = new Map());
  if (m.has(fam)) return m.get(fam);
  const fav = FAVOURS[cultureOf(planet).key] || FAVOURS.corporate, h = hash01(planet.seed, [fam.length, ...[...fam].map(c => c.charCodeAt(0)), 71]);
  let a = 0; for (let acc = WEIGHT[0]; h > acc && a < 2; a++, acc += WEIGHT[a]);
  const out = [WAY_NAMES.indexOf(fav[a]), WAY_NAMES.indexOf(fav[(a + 1) % 3])];
  m.set(fam, out); return out;
}
// the model for one placed thing: mostly the planet's usual, sometimes (share `odd`) its second choice
export function designOf(planet, fam, key = 0, odd = 0.2) {
  if (fam === 'cottage') { const H = houseDesigns(planet); return H[Math.floor(hash01(planet.seed, [key, 74]) * H.length)].id; }    // houses are designed for each planet, not picked from a set
  const [a, b] = waysFor(planet, fam);
  return `fam_${fam}_${hash01(planet.seed, [key, 72]) < odd ? b : a}`;
}
export const isFamily = k => k.startsWith('fam_');
export const footOf = (k, planet) => { if (k.startsWith('house_')) return houseFoot(houseDesigns(planet).find(q => q.id === k)); return FOOT[k] || 0; };
