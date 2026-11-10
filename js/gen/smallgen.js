// The small things every place has, designed for each planet: wells, fountains, shrines, monuments,
// crosses, notice boards, bus shelters, lamps, benches, gates, pavilions, stalls, water towers. A
// design is plain numbers and names, like a building's (gen/housegen.js); render/smallgen.js builds
// the mesh. How a people builds picks the materials, the seed picks the shape, so no two planets match.
import { Rng } from '../core/prng.js';
import { derive } from '../core/hash.js';
import { cultureOf } from './culture.js';

// what a culture makes solid things and frames out of
const STUFF = {
  masonry: { stone: ['limestone', 'rock', 'brick'], frame: ['plank', 'metal'], roof: ['slate', 'rooftile'] },
  corporate: { stone: ['concrete', 'hull'], frame: ['metal', 'hull'], roof: ['hull', 'metal'] },
  brutalist: { stone: ['concrete', 'concrete', 'brick'], frame: ['metal', 'concrete'], roof: ['concrete', 'corrugated'] },
  garden: { stone: ['limestone', 'render', 'rock'], frame: ['plank', 'paint'], roof: ['rooftile', 'thatch'] },
  foundry: { stone: ['brick', 'concrete', 'rock'], frame: ['metal', 'corrugated'], roof: ['corrugated', 'slate'] },
  adobe: { stone: ['adobe', 'render', 'rock'], frame: ['plank', 'adobe'], roof: ['adobe', 'thatch'] },
  carved: { stone: ['rock', 'limestone', 'rock'], frame: ['plank', 'metal'], roof: ['rock', 'limestone'] },
  stilt: { stone: ['plank', 'rock'], frame: ['plank', 'paint'], roof: ['thatch', 'corrugated'] },
  dome: { stone: ['concrete', 'hull'], frame: ['metal', 'hull'], roof: ['hull', 'concrete'] },
  grown: { stone: ['render', 'adobe'], frame: ['plank', 'paint'], roof: ['thatch', 'render'] },
  spire: { stone: ['limestone', 'rock', 'brick'], frame: ['metal', 'plank'], roof: ['slate', 'rooftile'] },
  neon: { stone: ['concrete', 'hull'], frame: ['metal', 'paint'], roof: ['corrugated', 'metal'] },
};
// [designs per planet, solid? (footprint from the design's r), what shapes it can take]
export const SMALL = {
  villagewell: { n: 3, solid: true, shapes: ['round', 'square', 'hooded'] },
  fountain: { n: 3, solid: true, shapes: ['tiered', 'pillar', 'basin'] },
  shrine: { n: 3, solid: true, shapes: ['niche', 'canopy', 'stele'] },
  monument: { n: 3, solid: true, shapes: ['obelisk', 'column', 'arch', 'slab'] },
  marketcross: { n: 2, solid: true, shapes: ['cross', 'lantern', 'clock'] },
  noticeboard: { n: 2, shapes: ['roofed', 'plain'] },
  busstop: { n: 3, shapes: ['glazed', 'solid', 'canopy'] },
  lamp: { n: 3, shapes: ['arm', 'crook', 'post', 'double'] },
  bench: { n: 3, shapes: ['backed', 'plain', 'slab'] },
  gate: { n: 3, shapes: ['pillars', 'lintel', 'arch'] },
  pavilion: { n: 3, solid: false, shapes: ['square', 'hex', 'oct'] },
  bandstall: { n: 3, shapes: ['awning', 'peaked', 'table'] },
  watertower: { n: 3, solid: true, shapes: ['drum', 'ball', 'cone'] },
  poweredge: { n: 3, shapes: ['tee', 'double', 'lattice'] },
  graves: { n: 3, shapes: ['stones', 'crosses', 'slabs', 'cairns'] },
  picnic: { n: 2, shapes: ['bench', 'round'] },
  swings: { n: 2, shapes: ['frame', 'arch'] },
  cart: { n: 3, shapes: ['handcart', 'flatbed', 'tipper'] },
  trough: { n: 2, shapes: ['stone', 'plank', 'tank'] },
  beehives: { n: 2, shapes: ['boxes', 'skeps'] },
  scarecrow: { n: 2, shapes: ['cross', 'pole'] },
  windpump: { n: 2, solid: true, shapes: ['lattice', 'post'] },
};
const FAM = Object.keys(SMALL), memo = new WeakMap();
export function smallDesigns(planet, fam) {
  let m = memo.get(planet); if (!m) memo.set(planet, m = new Map());
  if (m.has(fam)) return m.get(fam);
  const F = SMALL[fam], st = STUFF[cultureOf(planet).key] || STUFF.corporate, out = [], fi = FAM.indexOf(fam);
  for (let i = 0; i < F.n; i++) {
    const r = new Rng(derive(planet.seed, 'small', [fi, i])), v = (a, b) => +r.range(a, b).toFixed(2);
    const D = { id: `sm_${fam}_${i}`, fam, shape: r.pick(F.shapes), stone: r.pick(st.stone), frame: r.pick(st.frame), roof: r.pick(st.roof), steps: r.int(0, 2), n: r.int(4, 8), a: v(0, 1), b: v(0, 1), c: v(0, 1) };
    switch (fam) {
      case 'villagewell': D.r = v(0.7, 1.05); D.h = v(0.7, 1); D.top = v(2, 2.8); D.foot = [D.r + 0.1, D.r + 0.1, 1]; break;
      case 'fountain': D.r = v(1.5, 2.7); D.h = v(0.45, 0.75); D.top = v(1.6, 3.4); D.foot = [D.r, D.r, D.h]; break;
      case 'shrine': D.w = v(1.2, 2.6); D.h = v(1.8, 3.4); D.base = v(1.8, 4); D.foot = [D.base / 2, D.base / 2, D.steps ? 0.5 : 0.3]; break;
      case 'monument': D.w = v(0.8, 1.8); D.h = v(4, 9); D.base = v(2.6, 6); D.foot = [D.base / 2, D.base / 2, 0.8]; break;
      case 'marketcross': D.r = v(0.6, 1.1); D.h = v(2.8, 4.6); D.foot = [D.r + 0.2, D.r + 0.2, 0.6]; break;
      case 'noticeboard': D.w = v(1.4, 2.4); D.h = v(1.9, 2.3); D.foot = 0; break;
      case 'busstop': D.w = v(3, 5); D.d = v(1.1, 1.6); D.h = v(2.3, 2.7); D.foot = 0; break;
      case 'lamp': D.h = v(3.4, 5.6); D.reach = v(0.4, 1.1); D.foot = 0; break;
      case 'bench': D.w = v(1.4, 2.2); D.d = v(0.42, 0.55); D.h = v(0.42, 0.5); D.foot = 0; break;
      case 'gate': D.w = v(6.5, 9); D.h = v(3, 5.2); D.t = v(0.4, 0.8); D.foot = 0; break;
      case 'pavilion': D.r = v(2.8, 4.6); D.h = v(2.5, 3.2); D.rise = v(0.9, 2.2); D.floor = v(0.25, 0.5); D.foot = 0; break;
      case 'bandstall': D.w = v(2, 3.2); D.d = v(1, 1.5); D.h = v(2.1, 2.5); D.foot = 0; break;
      case 'poweredge': D.h = v(7, 10); D.w = v(1.2, 2); D.foot = 0; break;
      case 'graves': D.w = v(9, 14); D.d = v(6, 10); D.foot = 0; break;
      case 'picnic': D.w = v(1.5, 2.2); D.foot = 0; break;
      case 'swings': D.w = v(2.6, 4); D.h = v(2.1, 2.6); D.foot = 0; break;
      case 'cart': D.w = v(1.2, 1.7); D.d = v(1.9, 2.8); D.foot = 0; break;
      case 'trough': D.w = v(1.8, 3); D.d = v(0.55, 0.85); D.h = v(0.5, 0.75); D.foot = 0; break;
      case 'beehives': D.w = v(2.4, 4.4); D.foot = 0; break;
      case 'scarecrow': D.h = v(1.8, 2.3); D.foot = 0; break;
      case 'windpump': D.r = v(1, 1.6); D.h = v(7, 11); D.foot = [D.r, D.r, 6]; break;
      case 'watertower': D.r = v(1.8, 3.2); D.h = v(7, 12); D.tank = v(2.4, 4.2); D.foot = [D.r, D.r, 8]; break;
    }
    out.push(D);
  }
  m.set(fam, out); return out;
}
export const smallById = (planet, id) => { const [, fam, i] = id.split('_'); return smallDesigns(planet, fam)[+i]; };
