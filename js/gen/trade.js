// Trade between towns: what each town makes (its industry, gen/society.js) it sells cheap; what it doesn't, it pays for.
// Crates go in your ship's hold, not your pockets. Prices drift a little from day to day, the same for everyone who looks.
// Pure: (planet, town, day) → prices. The hold is a save delta (main.js).
import { townSociety } from './society.js';
import { INDUSTRIES } from './genome.js';
import { hash01 } from '../core/hash.js';

// a crate of each industry's goods: what it is, what it's worth where it isn't made, how heavy
export const GOODS = {
  grain: ['Grain', 60], livestock: ['Livestock pens', 140], timber: ['Timber', 70], ore: ['Ore', 90], stone: ['Cut stone', 55], crystal: ['Crystal', 260], rare: ['Rare metals', 320],
  fish: ['Fish, iced', 80], kelp: ['Dried kelp', 50], pearl: ['Pearls', 300], salt: ['Salt', 40], fruit: ['Fruit', 65], medicine: ['Medicines', 220], fibre: ['Fibre bales', 60],
  spore: ['Spore cultures', 180], spice: ['Spice', 240], solar: ['Solar cells', 160], water: ['Water tanks', 45], ice: ['Ice blocks', 35], fur: ['Furs', 150], geothermal: ['Power cells', 130],
  sulphur: ['Sulphur', 55], helium3: ['Helium-3 canisters', 280], gas: ['Refined gas', 120],
};
export const goodName = g => GOODS[g]?.[0] || g;
// What a crate of `good` goes for in `town` on `day`: [buy price, sell price]. Made here: cheap. Anywhere else: dearer, more so for the rare.
export function priceAt(planet, town, good, day) {
  const soc = townSociety(planet, town), base = GOODS[good]?.[1] || 50, made = soc?.industry === good;
  const drift = 0.9 + 0.2 * hash01(town.seed, [day, good.length, good.charCodeAt(0)]), want = made ? 0.55 : 1.05 + 0.5 * hash01(town.seed, [good.length * 7, good.charCodeAt(1)]);
  const p = base * want * drift; return [Math.round(p * 1.08), Math.round(p * 0.92)];
}
// What's for sale here: this town's own goods, and anything the world makes that someone ships in.
export function marketOf(planet, town, day) {
  const soc = townSociety(planet, town), S = planet.genome?.society; if (!soc || !S) return [];
  const goods = [...new Set([soc.industry, S.primary, S.secondary])].filter(g => GOODS[g]);
  return goods.map(g => ({ good: g, name: goodName(g), made: soc.industry === g, buy: priceAt(planet, town, g, day)[0], sell: priceAt(planet, town, g, day)[1] }));
}
// How many crates a ship's hold takes: its floor area, a crate to every 3 m².
export const holdSize = L => Math.max(2, Math.round((L.hull[2] - L.hull[0]) * (L.hull[3] - L.hull[1]) / 3));
