// Things you can carry, and what's inside the furniture. Items are logical records:
// an id into ITEMS and a count. Contents are generated from (building, prop, period),
// so a cupboard nobody has opened costs nothing to store; what you take or leave is a
// delta (world/inventory.js). Shops and other people's kitchens restock every week —
// a new period means newly generated stock.
import { Rng } from '../core/prng.js';
import { derive, hashStr } from '../core/hash.js';
import { weekOf } from './careers.js';

// cat: food | drink | ingredient | meal | medicine | clothing | tool | part | valuable | data | supply
// eat: changes to the body when consumed (hunger/fatigue, −1…1)
export const ITEMS = {
  ration:      { name: 'Ration bar', cat: 'food', kg: 0.1, value: 4, eat: { hunger: -0.2 } },
  fruit:       { name: 'Hydroponic fruit', cat: 'food', kg: 0.2, value: 3, eat: { hunger: -0.1 } },
  bread:       { name: 'Loaf of bread', cat: 'food', kg: 0.5, value: 5, eat: { hunger: -0.3 } },
  cheese:      { name: 'Vat cheese', cat: 'food', kg: 0.3, value: 7, eat: { hunger: -0.2 } },
  noodles:     { name: 'Instant noodles', cat: 'ingredient', kg: 0.15, value: 3 },
  protein:     { name: 'Protein mince', cat: 'ingredient', kg: 0.4, value: 9 },
  vegetables:  { name: 'Greens', cat: 'ingredient', kg: 0.3, value: 4 },
  rice:        { name: 'Rice', cat: 'ingredient', kg: 1.0, value: 6 },
  eggs:        { name: 'Eggs', cat: 'ingredient', kg: 0.4, value: 5 },
  water:       { name: 'Bottled water', cat: 'drink', kg: 0.5, value: 1, eat: { hunger: -0.03 } },
  juice:       { name: 'Juice', cat: 'drink', kg: 0.5, value: 3, eat: { hunger: -0.06 } },
  caf:         { name: 'Caf', cat: 'drink', kg: 0.3, value: 3, eat: { fatigue: -0.12 } },
  beer:        { name: 'Beer', cat: 'drink', kg: 0.5, value: 4, eat: { hunger: -0.05, fatigue: 0.05 } },
  stew:        { name: 'Bowl of stew', cat: 'meal', kg: 0.5, value: 14, eat: { hunger: -0.6 } },
  stirfry:     { name: 'Stir-fry', cat: 'meal', kg: 0.4, value: 12, eat: { hunger: -0.5 } },
  omelette:    { name: 'Omelette', cat: 'meal', kg: 0.3, value: 9, eat: { hunger: -0.4 } },
  noodlebowl:  { name: 'Noodle bowl', cat: 'meal', kg: 0.3, value: 6, eat: { hunger: -0.35 } },
  painkillers: { name: 'Painkillers', cat: 'medicine', kg: 0.05, value: 8, eat: { fatigue: -0.08 } },
  stim:        { name: 'Stim shot', cat: 'medicine', kg: 0.05, value: 25, eat: { fatigue: -0.35 } },
  medkit:      { name: 'First-aid kit', cat: 'medicine', kg: 0.8, value: 40 },
  shirt:       { name: 'Work shirt', cat: 'clothing', kg: 0.3, value: 15 },
  jacket:      { name: 'Insulated jacket', cat: 'clothing', kg: 1.2, value: 60 },
  boots:       { name: 'Boots', cat: 'clothing', kg: 1.4, value: 45 },
  coverall:    { name: 'Coverall', cat: 'clothing', kg: 0.9, value: 30 },
  torch:       { name: 'Torch', cat: 'tool', kg: 0.3, value: 18 },
  multitool:   { name: 'Multitool', cat: 'tool', kg: 0.25, value: 35 },
  wrench:      { name: 'Torque wrench', cat: 'tool', kg: 1.1, value: 40 },
  cutter:      { name: 'Plasma cutter', cat: 'tool', kg: 2.5, value: 180 },
  scanner:     { name: 'Hand scanner', cat: 'tool', kg: 0.4, value: 120 },
  scrap:       { name: 'Scrap metal', cat: 'part', kg: 2.0, value: 3 },
  plate:       { name: 'Alloy plate', cat: 'part', kg: 3.0, value: 22 },
  wiring:      { name: 'Wiring loom', cat: 'part', kg: 0.6, value: 15 },
  circuit:     { name: 'Circuit board', cat: 'part', kg: 0.2, value: 30 },
  cell:        { name: 'Power cell', cat: 'part', kg: 1.5, value: 55 },
  servo:       { name: 'Servo motor', cat: 'part', kg: 0.9, value: 48 },
  filter:      { name: 'Air filter', cat: 'part', kg: 0.7, value: 20 },
  bracket:     { name: 'Machined bracket', cat: 'part', kg: 0.5, value: 26 },
  drone:       { name: 'Survey drone', cat: 'valuable', kg: 2.2, value: 420 },
  watch:       { name: 'Wristwatch', cat: 'valuable', kg: 0.1, value: 150 },
  ring:        { name: 'Silver ring', cat: 'valuable', kg: 0.02, value: 90 },
  cash:        { name: 'Cash chit', cat: 'valuable', kg: 0.01, value: 20 },
  holo:        { name: 'Family holo', cat: 'valuable', kg: 0.2, value: 5 },
  datachip:    { name: 'Data chip', cat: 'data', kg: 0.01, value: 12 },
  datapad:     { name: 'Datapad', cat: 'data', kg: 0.4, value: 85 },
  ledger:      { name: 'Company ledger', cat: 'data', kg: 0.3, value: 40 },
  soap:        { name: 'Detergent', cat: 'supply', kg: 1.0, value: 4 },
  tape:        { name: 'Sealant tape', cat: 'supply', kg: 0.2, value: 3 },
  sealant:     { name: 'Sealant gun', cat: 'supply', kg: 0.6, value: 10 },
};
export const CAT_LABEL = { food: 'Food', drink: 'Drink', ingredient: 'Ingredient', meal: 'Meal', medicine: 'Medicine', clothing: 'Clothing', tool: 'Tool', part: 'Part', valuable: 'Valuable', data: 'Data', supply: 'Supply' };

// What each kind of container holds, by where it stands: [itemId, chance, min, max]
const POOLS = {
  fridge: [['fruit', .7, 1, 4], ['cheese', .5, 1, 2], ['eggs', .6, 1, 2], ['protein', .5, 1, 2], ['vegetables', .7, 1, 3], ['juice', .5, 1, 2], ['water', .8, 1, 4], ['beer', .4, 1, 4], ['stew', .25, 1, 1]],
  pantry: [['rice', .6, 1, 1], ['noodles', .8, 1, 4], ['bread', .5, 1, 1], ['ration', .5, 1, 3], ['caf', .6, 1, 2], ['soap', .3, 1, 1]],
  wardrobe: [['shirt', .8, 1, 3], ['jacket', .5, 1, 1], ['boots', .5, 1, 1], ['coverall', .3, 1, 1], ['watch', .12, 1, 1], ['ring', .1, 1, 1], ['cash', .3, 1, 3], ['holo', .4, 1, 1], ['painkillers', .4, 1, 2]],
  homecabinet: [['datachip', .5, 1, 3], ['datapad', .2, 1, 1], ['holo', .5, 1, 2], ['torch', .3, 1, 1], ['tape', .4, 1, 2], ['medkit', .25, 1, 1], ['cash', .2, 1, 2], ['drone', .03, 1, 1]],
  utility: [['soap', .9, 1, 3], ['tape', .6, 1, 3], ['sealant', .3, 1, 1], ['filter', .4, 1, 2], ['torch', .3, 1, 1], ['scrap', .3, 1, 2]],
  office: [['datachip', .9, 1, 5], ['datapad', .3, 1, 1], ['ledger', .3, 1, 1], ['caf', .4, 1, 2], ['cash', .15, 1, 4]],
  desk: [['datachip', .6, 1, 3], ['caf', .4, 1, 1], ['ration', .3, 1, 1], ['painkillers', .2, 1, 1]],
  shop: [['ration', .9, 4, 12], ['bread', .7, 2, 6], ['fruit', .8, 4, 10], ['noodles', .9, 4, 10], ['rice', .6, 2, 5], ['protein', .6, 2, 6], ['vegetables', .8, 3, 8], ['eggs', .7, 2, 6], ['cheese', .5, 2, 5],
    ['water', .9, 5, 15], ['juice', .7, 3, 8], ['caf', .8, 3, 10], ['beer', .6, 4, 12], ['painkillers', .7, 2, 6], ['stim', .3, 1, 3], ['medkit', .4, 1, 2], ['soap', .7, 2, 5], ['tape', .7, 2, 6],
    ['torch', .5, 1, 3], ['multitool', .4, 1, 2], ['shirt', .4, 1, 4], ['jacket', .25, 1, 2], ['boots', .3, 1, 2]],
  stockroom: [['ration', .6, 6, 20], ['water', .6, 6, 20], ['noodles', .5, 6, 20], ['soap', .4, 2, 8], ['caf', .4, 4, 12]],
  workshop: [['scrap', .9, 2, 8], ['plate', .7, 1, 5], ['wiring', .6, 1, 4], ['circuit', .4, 1, 3], ['servo', .3, 1, 2], ['bracket', .4, 1, 4], ['wrench', .3, 1, 1], ['multitool', .3, 1, 1], ['cutter', .08, 1, 1], ['tape', .5, 1, 3]],
  bench: [['wrench', .5, 1, 1], ['multitool', .5, 1, 1], ['scanner', .1, 1, 1], ['wiring', .4, 1, 2], ['tape', .6, 1, 2], ['bracket', .3, 1, 2]],
  hangar: [['plate', .7, 2, 6], ['cell', .5, 1, 3], ['filter', .6, 1, 4], ['servo', .4, 1, 2], ['wiring', .6, 1, 4], ['scrap', .7, 2, 10], ['circuit', .3, 1, 2], ['drone', .05, 1, 1]],
};

// The container a prop is, given where it stands — or null if it holds nothing.
//   { pool, restock, label, shop }
export function containerOf(b, room, pr) {
  const home = b.type === 'house' || (b.type === 'hab' && room?.unit !== undefined);
  const p = room?.purpose;
  switch (pr.kind) {
    case 'fridge': return { pool: 'fridge', restock: true, label: 'Fridge' };
    case 'counter':
      if (p === 'kitchen' || p === 'studio') return { pool: 'pantry', restock: true, label: 'Kitchen cupboards' };
      if (p === 'shopfloor') return null;                              // the till: you buy and sell there
      return { pool: 'desk', restock: false, label: 'Counter drawers' };
    case 'locker': return { pool: 'wardrobe', restock: false, label: home ? 'Wardrobe' : 'Locker' };
    case 'cabinet': return { pool: home ? 'homecabinet' : 'office', restock: false, label: 'Cabinet' };
    case 'desk': return { pool: 'desk', restock: false, label: 'Desk drawers' };
    case 'shelf': return b.type === 'store' ? { pool: 'shop', restock: true, label: 'Shelves', shop: true } : { pool: 'homecabinet', restock: false, label: 'Shelves' };
    case 'rack':
      if (p === 'utility') return { pool: 'utility', restock: false, label: 'Storage rack' };
      if (b.type === 'store') return { pool: 'stockroom', restock: true, label: 'Stock rack' };
      return { pool: b.type === 'hangar' || b.type === 'ship' ? 'hangar' : 'workshop', restock: false, label: 'Parts rack' };
    case 'crate': return { pool: b.type === 'store' ? 'stockroom' : b.type === 'hangar' || b.type === 'ship' ? 'hangar' : 'workshop', restock: b.type === 'store', label: 'Crate' };
    case 'bench': return p === 'shopfloor-workshop' ? { pool: 'bench', restock: false, label: 'Workbench drawers' } : null;
  }
  return null;
}

// Generated contents of one container for one period. Pure.
export function generatedContents(planet, b, propIndex, pool, period) {
  const rng = new Rng(derive(planet.universeSeed, 'stock', [hashStr(3, b.key), propIndex, period]));
  const out = [];
  for (const [id, chance, lo, hi] of POOLS[pool]) if (rng.next() < chance) out.push({ id, n: rng.int(lo, hi) });
  return out;
}
export const restockPeriod = (planet, t) => weekOf(planet, t);

// A shop's prices: the value with the store's margin; it buys back at half.
export const buyPrice = (id, markup = 1.25) => Math.max(1, Math.round(ITEMS[id].value * markup));
export const sellPrice = id => Math.max(0, Math.floor(ITEMS[id].value * 0.5));
export const massOf = list => list.reduce((m, it) => m + ITEMS[it.id].kg * it.n, 0);
export const valueOf = list => list.reduce((v, it) => v + ITEMS[it.id].value * it.n, 0);
