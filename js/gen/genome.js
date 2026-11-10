// A planet's genome: everything that makes one world unlike another, drawn once from the body's seed. Terrain, ground,
// sky, water, plants, animals and the way its people build all read this one object, so a planet is of a piece: a frozen
// world has low tree lines, ice sheets, pale rock, a white-blue sky, domed towns; a fungal one has violet canopies over
// spongy ground and a milky sea. Most worlds are cousins of each other; a few (high `weird`) are like nothing else.
// Pure data, no three.js. Uses only + − × ÷, floor and sqrt, like the rest of generation.
import { Rng } from '../core/prng.js';
import { derive } from '../core/hash.js';

// The kinds of world. w: how common. weird: [lo, hi] of how strange it may be. lands: weights of the kinds of country
// (gen/land.js). warm/damp: how hot and wet it runs overall. relief: height of its mountains (1 = the old home world).
// sea: −1 dry … +1 drowned. treeline: metres. foliage: hue families it favours. flora/fauna: weights of tree and animal
// body plans. ways: building traditions (gen/culture.js). mount: how its mountains are made.
export const ARCHETYPES = {
  temperate: { w: 3.0, weird: [0, 0.4], warm: [0.4, 0.62], damp: [0.42, 0.62], relief: [0.8, 1.2], sea: [-0.1, 0.25], treeline: [800, 1100],
    lands: { meadow: 3, forest: 4, rockfield: 1, badlands: 0.6, dunes: 0.3, saltpan: 0.3, marsh: 1.4, lava: 0.3, moor: 1.2, karst: 1 },
    foliage: { green: 6, olive: 2, teal: 0.6 }, mount: { ridged: 3, domed: 1 },
    flora: { oak: 3, birch: 2, spruce: 2, pine: 1.5, parasol: 0.4, spiral: 0.3, bottle: 0.2, palm: 0.2, fungus: 0.1, coral: 0.05, crystal: 0.02, weeping: 1.2, columnar: 0.8 },
    fauna: { trundler: 2, rooter: 2, stilter: 1, strider: 1, hopper: 2, glider: 1.5, crawler: 0.5, grazer: 1, browser: 0.8, serpent: 0.3, flock: 1.2, jelly: 0.05, burrower: 0.6, shell: 0.4 },
    ways: { masonry: 3, corporate: 2, garden: 2, brutalist: 1, foundry: 1, neon: 1, spire: 0.6, adobe: 0.2, grown: 0.2 } },
  steppe: { w: 2.2, weird: [0, 0.45], warm: [0.45, 0.68], damp: [0.26, 0.42], relief: [0.6, 1.1], sea: [-0.35, 0.05], treeline: [900, 1300],
    lands: { meadow: 3, forest: 1, rockfield: 1.3, badlands: 3, dunes: 1.6, saltpan: 1.2, marsh: 0.3, lava: 0.5, moor: 0.6, karst: 0.6, canyon: 0.6 },
    foliage: { olive: 4, gold: 3, green: 2 }, mount: { ridged: 2, domed: 1, mesa: 1 },
    flora: { pine: 2, oak: 1, parasol: 2, bottle: 1.4, birch: 0.5, columnar: 1.2, palm: 0.3 },
    fauna: { strider: 3, trundler: 2, grazer: 2.5, hopper: 1.5, glider: 1, flock: 2, rooter: 0.6, crawler: 0.6, burrower: 1, shell: 0.6 },
    ways: { masonry: 2, adobe: 2, foundry: 1.5, brutalist: 1.2, corporate: 1, neon: 0.6, carved: 0.6 } },
  highland: { w: 1.8, weird: [0, 0.45], warm: [0.3, 0.5], damp: [0.4, 0.6], relief: [1.4, 2.2], sea: [-0.2, 0.15], treeline: [550, 850],
    lands: { meadow: 2, forest: 3, rockfield: 2.4, badlands: 0.6, dunes: 0.1, saltpan: 0.2, marsh: 0.8, lava: 0.8, moor: 2.6, karst: 1.3, ice: 0.6 },
    foliage: { green: 4, olive: 2, teal: 1 }, mount: { ridged: 4, domed: 1 },
    flora: { spruce: 4, pine: 3, birch: 2, oak: 1, columnar: 1, weeping: 0.6 },
    fauna: { trundler: 2, stilter: 1, strider: 1.5, hopper: 2, glider: 2, flock: 1.5, grazer: 1.5, burrower: 1, shell: 0.6, browser: 0.4 },
    ways: { masonry: 4, brutalist: 1.4, foundry: 1.4, carved: 1.2, corporate: 0.8, spire: 0.8, dome: 0.4 } },
  jungle: { w: 1.4, weird: [0.1, 0.6], warm: [0.66, 0.9], damp: [0.68, 0.92], relief: [0.7, 1.3], sea: [0, 0.4], treeline: [1200, 1700],
    lands: { forest: 3, jungle: 6, marsh: 3, karst: 2, meadow: 0.8, moor: 0.2, rockfield: 0.4 },
    foliage: { green: 4, teal: 2, olive: 1, red: 0.4, purple: 0.3 }, mount: { domed: 2, ridged: 1, spire: 1 },
    flora: { palm: 4, weeping: 3, spiral: 2, parasol: 2, oak: 1, coral: 0.6, fungus: 0.6, bottle: 0.4 },
    fauna: { rooter: 2.5, stilter: 2, hopper: 1.5, glider: 2, browser: 2, serpent: 2, flock: 2, crawler: 1.5, jelly: 0.3, shell: 0.8, trundler: 0.6 },
    ways: { grown: 2.5, stilt: 2, garden: 2, masonry: 1, neon: 1, corporate: 0.6, carved: 0.6 } },
  savanna: { w: 1.4, weird: [0, 0.45], warm: [0.62, 0.84], damp: [0.3, 0.48], relief: [0.5, 0.9], sea: [-0.2, 0.15], treeline: [1200, 1600],
    lands: { meadow: 5, badlands: 1.4, rockfield: 0.8, forest: 0.8, dunes: 0.6, saltpan: 0.8, marsh: 0.4, karst: 0.6, spires: 0.4 },
    foliage: { gold: 4, olive: 3, green: 1, red: 0.4 }, mount: { domed: 2, mesa: 1.5, ridged: 1 },
    flora: { parasol: 5, bottle: 3, columnar: 1.5, palm: 1, oak: 0.4 },
    fauna: { grazer: 3, browser: 3, strider: 2, trundler: 2, hopper: 1, flock: 2, glider: 1, burrower: 1, shell: 0.6 },
    ways: { adobe: 3, garden: 1.5, masonry: 1, corporate: 1, foundry: 0.8, neon: 0.6, grown: 0.6 } },
  arid: { w: 1.4, weird: [0.05, 0.55], warm: [0.68, 0.92], damp: [0.08, 0.26], relief: [0.6, 1.3], sea: [-0.7, -0.25], treeline: [1500, 2200],
    lands: { dunes: 5, badlands: 3, saltpan: 2, rockfield: 1.5, spires: 1.5, canyon: 1, meadow: 0.3, lava: 0.4 },
    foliage: { gold: 3, olive: 2, red: 1, green: 0.4 }, mount: { mesa: 2, ridged: 1.5, domed: 1 },
    flora: { bottle: 4, columnar: 4, parasol: 2, palm: 1.5, crystal: 0.2 },
    fauna: { strider: 3, crawler: 2, burrower: 2.5, shell: 2, serpent: 1, flock: 1, hopper: 0.8, grazer: 0.6 },
    ways: { adobe: 4, carved: 2.5, foundry: 1, brutalist: 1, masonry: 0.6, neon: 0.6 } },
  archipelago: { w: 1.0, weird: [0, 0.55], warm: [0.5, 0.8], damp: [0.5, 0.75], relief: [0.5, 1.0], sea: [0.55, 0.9], treeline: [900, 1400],
    lands: { meadow: 2, forest: 2.5, jungle: 2, karst: 3, marsh: 1, rockfield: 0.6, lava: 0.6, spires: 0.8 },
    foliage: { green: 4, teal: 2, olive: 1, blue: 0.3 }, mount: { domed: 2, spire: 1.5, ridged: 1 },
    flora: { palm: 4, parasol: 2, weeping: 1.5, spiral: 1, oak: 1, coral: 0.6 },
    fauna: { glider: 3, flock: 3, serpent: 1.5, hopper: 1.5, rooter: 1, shell: 2, crawler: 1, jelly: 0.4 },
    ways: { stilt: 4, garden: 2, grown: 1, masonry: 1, neon: 1, corporate: 0.6 } },
  frozen: { w: 1.0, weird: [0, 0.55], warm: [0.04, 0.22], damp: [0.3, 0.55], relief: [0.8, 1.6], sea: [-0.1, 0.3], treeline: [150, 420],
    lands: { ice: 6, rockfield: 2.4, moor: 1.2, forest: 0.8, meadow: 0.4, lava: 0.3, saltpan: 0.6, spires: 0.4 },
    foliage: { teal: 3, olive: 1, green: 1, white: 1.5, blue: 1 }, mount: { ridged: 3, domed: 1.5 },
    flora: { spruce: 4, pine: 2, birch: 2, columnar: 1, crystal: 0.6 },
    fauna: { trundler: 3, grazer: 2, strider: 1, hopper: 1.5, burrower: 2, shell: 1, flock: 1, serpent: 0.3 },
    ways: { dome: 4, brutalist: 2, masonry: 1.2, foundry: 1, carved: 1, corporate: 0.6 } },
  canyonland: { w: 0.8, weird: [0.05, 0.55], warm: [0.5, 0.78], damp: [0.16, 0.36], relief: [0.4, 0.8], sea: [-0.6, -0.15], treeline: [1200, 1800],
    lands: { canyon: 6, badlands: 3, spires: 2, rockfield: 1, meadow: 0.6, dunes: 0.8, saltpan: 0.4 },
    foliage: { olive: 3, gold: 2, red: 1.4, green: 0.6 }, mount: { mesa: 4, ridged: 1 },
    flora: { columnar: 3, bottle: 2, pine: 1.5, parasol: 1.5, crystal: 0.2 },
    fauna: { strider: 3, crawler: 2, flock: 2, glider: 1.5, burrower: 2, shell: 1.5, serpent: 1, grazer: 0.8 },
    ways: { carved: 5, adobe: 2.5, masonry: 1, brutalist: 0.8, foundry: 0.6 } },
  volcanic: { w: 0.7, weird: [0.2, 0.75], warm: [0.5, 0.82], damp: [0.25, 0.55], relief: [1.2, 2.0], sea: [-0.2, 0.3], treeline: [700, 1100],
    lands: { lava: 6, rockfield: 2, badlands: 1, meadow: 1, forest: 0.8, karst: 0.4, craters: 0.6, saltpan: 0.4 },
    foliage: { olive: 2, red: 2, green: 1, purple: 1, gold: 1 }, mount: { ridged: 2, domed: 1, spire: 1 },
    flora: { bottle: 2, columnar: 2, fungus: 1.5, parasol: 1.5, pine: 1, crystal: 0.4, coral: 0.4 },
    fauna: { crawler: 3, shell: 2.5, trundler: 2, strider: 1.5, burrower: 1.5, serpent: 1, flock: 1, glider: 0.6 },
    ways: { foundry: 4, brutalist: 2.5, carved: 1.5, dome: 1, neon: 1, masonry: 0.6 } },
  fungal: { w: 0.6, weird: [0.6, 1], warm: [0.45, 0.72], damp: [0.6, 0.9], relief: [0.5, 1.1], sea: [-0.1, 0.35], treeline: [900, 1500],
    lands: { fungal: 6, marsh: 3, forest: 1, jungle: 1, karst: 1, meadow: 0.6, moor: 0.6 },
    foliage: { purple: 3, red: 2, teal: 2, blue: 1, white: 1, gold: 0.6 }, mount: { domed: 3, spire: 1.5 },
    flora: { fungus: 6, coral: 3, spiral: 2, weeping: 1.5, bottle: 0.8 },
    fauna: { jelly: 3, crawler: 3, serpent: 2, rooter: 2, shell: 2, stilter: 1, browser: 1, flock: 1, glider: 1 },
    ways: { grown: 5, dome: 1.5, stilt: 1, neon: 1.5, spire: 1, carved: 0.6 } },
  crystal: { w: 0.5, weird: [0.65, 1], warm: [0.2, 0.55], damp: [0.15, 0.4], relief: [0.8, 1.6], sea: [-0.4, 0.15], treeline: [700, 1200],
    lands: { crystal: 6, saltpan: 2, rockfield: 2, spires: 1.5, dunes: 0.6, ice: 0.6, moor: 0.4 },
    foliage: { blue: 3, white: 2, teal: 2, purple: 1.5, gold: 0.6 }, mount: { spire: 3, ridged: 2 },
    flora: { crystal: 5, columnar: 2, spiral: 1.5, coral: 1.2, bottle: 0.6 },
    fauna: { shell: 3, crawler: 3, strider: 1.5, jelly: 1.5, flock: 1, glider: 1, burrower: 1, serpent: 0.6 },
    ways: { spire: 4, dome: 2, brutalist: 1, corporate: 1.4, neon: 1, carved: 1 } },
  spireforest: { w: 0.5, weird: [0.35, 0.85], warm: [0.45, 0.75], damp: [0.45, 0.75], relief: [0.6, 1.2], sea: [-0.1, 0.35], treeline: [1000, 1500],
    lands: { spires: 5, karst: 4, forest: 2, jungle: 1.4, meadow: 1, marsh: 0.6 },
    foliage: { teal: 2, green: 2, red: 1, purple: 1, gold: 0.6 }, mount: { spire: 4, domed: 1 },
    flora: { weeping: 2.5, spiral: 2.5, parasol: 2, palm: 1, coral: 1, fungus: 1, spruce: 0.6 },
    fauna: { glider: 3, flock: 3, stilter: 2, browser: 2, hopper: 1.5, serpent: 1, jelly: 0.6, crawler: 1 },
    ways: { carved: 3, spire: 2, stilt: 2, grown: 1.5, garden: 1, masonry: 0.6 } },
  ocean: { w: 0.8, weird: [0, 0.6], warm: [0.45, 0.8], damp: [0.6, 0.85], relief: [0.4, 0.8], sea: [0.85, 1.0], treeline: [900, 1400],
    lands: { meadow: 1.5, forest: 2, jungle: 1.5, karst: 3, marsh: 1.5, rockfield: 0.6, spires: 1 },
    foliage: { green: 3, teal: 3, blue: 0.6, olive: 1 }, mount: { spire: 2, domed: 2 },
    flora: { palm: 4, weeping: 2, parasol: 1.5, coral: 1.5, spiral: 1 },
    fauna: { flock: 4, glider: 3, serpent: 2, shell: 2, jelly: 1, hopper: 1, crawler: 1 },
    ways: { stilt: 6, grown: 1.5, garden: 1.5, neon: 1, corporate: 0.8 } },
  // a world with no ground at all: a gas giant's upper air, its people on floating cities over a sea of cloud (gen/skyisles.js)
  cloud: { w: 0.7, noGround: true, weird: [0.35, 0.9], warm: [0.35, 0.7], damp: [0.45, 0.8], relief: [0, 0], sea: [0, 0], treeline: [4000, 6000],
    lands: { meadow: 3, forest: 1 }, foliage: { gold: 2, purple: 1.5, teal: 1.5, red: 1, green: 1 }, mount: { domed: 1 },
    flora: { weeping: 2, parasol: 2, spiral: 2, coral: 1.5, palm: 1, fungus: 0.6 }, fauna: { jelly: 5, flock: 4, glider: 4, serpent: 0.5 },
    ways: { spire: 3, grown: 2, dome: 2, corporate: 2, neon: 1.4, garden: 1 } },
  cratered: { w: 0.5, weird: [0.3, 0.8], warm: [0.3, 0.6], damp: [0.08, 0.3], relief: [0.3, 0.7], sea: [-0.9, -0.4], treeline: [600, 1000],
    lands: { craters: 6, rockfield: 2, dunes: 1, saltpan: 1, badlands: 0.6, lava: 0.6, crystal: 0.3 },
    foliage: { olive: 2, gold: 1.5, white: 1, teal: 1, red: 1 }, mount: { domed: 3, ridged: 1 },
    flora: { columnar: 3, bottle: 2, crystal: 1.5, fungus: 1, pine: 0.6 },
    fauna: { shell: 3, crawler: 3, burrower: 3, strider: 1, jelly: 0.6, flock: 0.6 },
    ways: { dome: 4, brutalist: 2, foundry: 1.5, corporate: 1.4, carved: 1, neon: 0.8 } },
};

// Hue families for what grows: [hue (0..1), saturation, value] ranges for the green of the land, the dry of it, and the canopy.
const FOLIAGE = {
  green: { h: [0.22, 0.31], s: [0.5, 0.68], v: [0.24, 0.32] },
  olive: { h: [0.15, 0.21], s: [0.42, 0.6], v: [0.27, 0.36] },
  gold:  { h: [0.1, 0.15], s: [0.48, 0.66], v: [0.4, 0.52] },
  teal:  { h: [0.36, 0.47], s: [0.38, 0.6], v: [0.22, 0.32] },
  red:   { h: [0.97, 1.04], s: [0.48, 0.68], v: [0.26, 0.36] },
  purple:{ h: [0.74, 0.86], s: [0.32, 0.55], v: [0.24, 0.34] },
  blue:  { h: [0.55, 0.63], s: [0.36, 0.56], v: [0.24, 0.34] },
  white: { h: [0.12, 0.6], s: [0.06, 0.14], v: [0.5, 0.62] },
};
// Seas: shallow and deep colour (linear-ish), and how milky the water is.
const SEAS = {
  blue:   { shallow: [0.06, 0.26, 0.3], deep: [0.012, 0.06, 0.1], w: 6 },
  green:  { shallow: [0.1, 0.3, 0.2], deep: [0.02, 0.08, 0.06], w: 1.2 },
  amber:  { shallow: [0.34, 0.24, 0.08], deep: [0.1, 0.05, 0.02], w: 0.5 },
  violet: { shallow: [0.18, 0.12, 0.3], deep: [0.04, 0.02, 0.09], w: 0.5 },
  milky:  { shallow: [0.42, 0.48, 0.46], deep: [0.1, 0.13, 0.14], w: 0.5 },
  ink:    { shallow: [0.04, 0.08, 0.12], deep: [0.004, 0.01, 0.02], w: 0.5 },
};
// Skies: a tint laid over the scattering model, and the haze at the horizon. Earthlike most of the time.
const SKIES = {
  earth:  { tint: [1, 1, 1], haze: [0.66, 0.74, 0.84], w: 8 },
  pale:   { tint: [1.04, 1.02, 0.96], haze: [0.78, 0.8, 0.82], w: 1.4 },
  peach:  { tint: [1.12, 0.94, 0.8], haze: [0.86, 0.72, 0.62], w: 0.8 },
  green:  { tint: [0.9, 1.08, 0.88], haze: [0.66, 0.8, 0.66], w: 0.5 },
  violet: { tint: [0.98, 0.86, 1.12], haze: [0.72, 0.64, 0.84], w: 0.5 },
  teal:   { tint: [0.84, 1.04, 1.06], haze: [0.58, 0.8, 0.8], w: 0.6 },
  rust:   { tint: [1.16, 0.86, 0.7], haze: [0.8, 0.6, 0.48], w: 0.6 },
};
const ROCKS = {
  grey:   [[0.27, 0.25, 0.23], [0.3, 0.29, 0.28], [0.22, 0.22, 0.23]],
  warm:   [[0.36, 0.28, 0.22], [0.42, 0.3, 0.2], [0.34, 0.26, 0.24]],
  red:    [[0.42, 0.2, 0.14], [0.5, 0.26, 0.16], [0.38, 0.18, 0.16]],
  dark:   [[0.14, 0.13, 0.14], [0.17, 0.15, 0.15], [0.12, 0.12, 0.13]],
  pale:   [[0.56, 0.54, 0.5], [0.62, 0.6, 0.56], [0.52, 0.52, 0.54]],
  green:  [[0.24, 0.28, 0.24], [0.2, 0.26, 0.24]],
  violet: [[0.3, 0.24, 0.32], [0.26, 0.22, 0.3]],
};
const ROCK_BY = { ocean: { dark: 2, grey: 2, pale: 1 }, cloud: { pale: 2, grey: 1 }, temperate: { grey: 4, warm: 2 }, steppe: { warm: 3, grey: 2, red: 1 }, highland: { grey: 4, dark: 1 }, jungle: { grey: 2, warm: 2, red: 1 }, savanna: { red: 3, warm: 3 },
  arid: { red: 4, warm: 3, pale: 1 }, archipelago: { dark: 2, grey: 2, pale: 1 }, frozen: { pale: 3, grey: 3, dark: 1 }, canyonland: { red: 5, warm: 2 }, volcanic: { dark: 6, red: 1 },
  fungal: { violet: 2, dark: 2, green: 1, grey: 1 }, crystal: { pale: 3, violet: 2, grey: 1 }, spireforest: { warm: 2, pale: 2, grey: 2 }, cratered: { grey: 3, pale: 2, dark: 2 } };
// a gas giant's cloud bands: cream and ochre, rust, teal, violet; pairs of light and dark
const BANDS = [[[0.92, 0.86, 0.74], [0.78, 0.6, 0.42]], [[0.9, 0.8, 0.68], [0.66, 0.38, 0.26]], [[0.78, 0.9, 0.92], [0.36, 0.56, 0.62]], [[0.88, 0.82, 0.94], [0.5, 0.4, 0.62]], [[0.95, 0.92, 0.86], [0.62, 0.64, 0.7]], [[0.94, 0.84, 0.7], [0.5, 0.32, 0.3]]];

// hsv → rgb, h may run past 1 (it wraps)
function hsv(h, s, v) {
  h = h - Math.floor(h); const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
}
const pickW = (rng, obj) => rng.weighted(Object.entries(obj));
const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);


// ---- what the land gives, and who runs it ----
// Resources each kind of world is rich in (weights). The richest one or two set its industries; industries set where towns stand, what
// they look like, what people work at, and who ends up in charge.
const RESOURCES = {
  temperate: { grain: 4, timber: 3, ore: 2, stone: 1.5, fish: 1.5 }, steppe: { grain: 3, livestock: 3, ore: 2, salt: 1 }, highland: { ore: 4, stone: 3, timber: 2, livestock: 1.5 },
  jungle: { timber: 4, medicine: 3, fruit: 3, fish: 1 }, savanna: { grain: 4, livestock: 4, ore: 1 }, arid: { salt: 3, ore: 3, solar: 3, water: 2, spice: 1.5 },
  archipelago: { fish: 5, fruit: 2, salt: 1.5, timber: 1 }, cloud: { helium3: 6, gas: 4, fruit: 1 }, ocean: { fish: 6, kelp: 3, salt: 2, pearl: 1 }, frozen: { ore: 3, ice: 3, fur: 1.5, fish: 1.5 },
  canyonland: { ore: 4, stone: 3, water: 2 }, volcanic: { geothermal: 4, ore: 4, sulphur: 2.5 }, fungal: { medicine: 4, fibre: 3, spore: 3 },
  crystal: { crystal: 6, ore: 2, stone: 1 }, spireforest: { timber: 3, fruit: 2, stone: 2 }, cratered: { ore: 4, rare: 3, ice: 2 }, gas: { helium3: 6, gas: 4 },
};
// What an industry needs of the ground, and what its towns are like. form: how its towns sit. near: the kind of country they cling to.
export const INDUSTRIES = {
  grain: { label: 'farming', form: 'farm', near: ['meadow'], jobs: ['Farmhand', 'Tractor driver', 'Silo hand', 'Agronomist'] },
  livestock: { label: 'herding', form: 'farm', near: ['meadow', 'moor'], jobs: ['Herder', 'Drover', 'Butcher', 'Vet'] },
  timber: { label: 'logging', form: 'mill', near: ['forest', 'jungle'], jobs: ['Logger', 'Sawyer', 'Hauler', 'Forester'] },
  ore: { label: 'mining', form: 'mine', near: ['rockfield', 'badlands', 'canyon', 'lava', 'craters'], jobs: ['Miner', 'Driller', 'Blaster', 'Mine foreman'] },
  stone: { label: 'quarrying', form: 'mine', near: ['karst', 'rockfield', 'canyon'], jobs: ['Quarryman', 'Mason', 'Cutter'] },
  crystal: { label: 'crystal mining', form: 'mine', near: ['crystal'], jobs: ['Crystal cutter', 'Seam driller', 'Assayer', 'Mine foreman'] },
  rare: { label: 'rare-metal mining', form: 'mine', near: ['craters'], jobs: ['Miner', 'Assayer', 'Smelter hand'] },
  fish: { label: 'fishing', form: 'port', near: ['coast'], jobs: ['Fisher', 'Deckhand', 'Net mender', 'Skipper'] },
  kelp: { label: 'kelp farming', form: 'port', near: ['coast'], jobs: ['Kelp diver', 'Deckhand', 'Dryer'] },
  pearl: { label: 'pearling', form: 'port', near: ['coast'], jobs: ['Diver', 'Grader'] },
  salt: { label: 'salt works', form: 'works', near: ['saltpan', 'coast'], jobs: ['Salt raker', 'Packer'] },
  fruit: { label: 'orchards', form: 'farm', near: ['jungle', 'meadow', 'forest'], jobs: ['Picker', 'Packer', 'Grower'] },
  medicine: { label: 'medicine harvest', form: 'farm', near: ['jungle', 'fungal'], jobs: ['Gatherer', 'Chemist', 'Lab tech'] },
  fibre: { label: 'fibre', form: 'mill', near: ['fungal', 'marsh'], jobs: ['Gatherer', 'Spinner', 'Weaver'] },
  spore: { label: 'spore culture', form: 'farm', near: ['fungal'], jobs: ['Culturist', 'Harvester'] },
  spice: { label: 'spice', form: 'farm', near: ['dunes', 'badlands'], jobs: ['Harvester', 'Dryer', 'Trader'] },
  solar: { label: 'solar farms', form: 'works', near: ['dunes', 'saltpan'], jobs: ['Panel tech', 'Grid operator'] },
  water: { label: 'water mining', form: 'works', near: ['canyon', 'badlands'], jobs: ['Well driller', 'Pump hand'] },
  ice: { label: 'ice mining', form: 'mine', near: ['ice', 'craters'], jobs: ['Ice cutter', 'Hauler'] },
  fur: { label: 'trapping', form: 'mill', near: ['forest', 'moor'], jobs: ['Trapper', 'Tanner'] },
  geothermal: { label: 'geothermal power', form: 'works', near: ['lava'], jobs: ['Plant operator', 'Well tech'] },
  sulphur: { label: 'sulphur works', form: 'works', near: ['lava'], jobs: ['Digger', 'Refiner'] },
  helium3: { label: 'gas skimming', form: 'float', near: [], jobs: ['Skimmer pilot', 'Refinery hand', 'Rigger'] },
  gas: { label: 'gas refining', form: 'float', near: [], jobs: ['Refinery hand', 'Rigger'] },
};
// Forms of government, and what makes each likely: an economy that one company can own makes a charter; a crowd of small
// boat-owners makes a guild; a planet at war makes juntas.
export const GOVERNMENTS = {
  charter: { label: 'company charter', title: 'the Company', law: 1.2, gangs: 0.6 },        // a mining company owns the towns, the police and the payroll
  guild: { label: 'guild council', title: 'the Guilds', law: 0.9, gangs: 0.8 },
  council: { label: 'elected council', title: 'the Council', law: 1.0, gangs: 0.7 },
  house: { label: 'noble house', title: 'the House', law: 1.3, gangs: 0.5 },
  junta: { label: 'military junta', title: 'the Junta', law: 1.6, gangs: 0.4 },
  temple: { label: 'temple rule', title: 'the Temple', law: 1.4, gangs: 0.5 },
  commune: { label: 'workers\' commune', title: 'the Commune', law: 0.8, gangs: 0.6 },
  syndicate: { label: 'syndicate', title: 'the Syndicate', law: 0.5, gangs: 1.6 },            // the gangs ARE the government
};
const GOV_BY = { ore: { charter: 4, junta: 1, commune: 1.5, syndicate: 1 }, crystal: { charter: 5, house: 1.5, syndicate: 1.2 }, rare: { charter: 5, junta: 1 }, fish: { guild: 4, council: 2, commune: 1 }, kelp: { guild: 3, commune: 2 },
  grain: { council: 3, house: 2, commune: 1.5 }, livestock: { house: 3, council: 2 }, timber: { charter: 2, guild: 2, council: 1.5 }, medicine: { temple: 2, guild: 2, council: 1 }, spore: { temple: 3, commune: 2 },
  helium3: { charter: 4, guild: 2 }, geothermal: { charter: 2, junta: 2, council: 1 }, spice: { house: 3, syndicate: 2 }, salt: { guild: 2, council: 2 } };
const NATION_A = ['Ar', 'Bel', 'Cor', 'Dun', 'Esk', 'Fal', 'Gor', 'Hal', 'Ist', 'Kar', 'Lun', 'Mar', 'Nor', 'Oss', 'Pel', 'Quor', 'Rhe', 'Sal', 'Tav', 'Ulm', 'Ves', 'Wen', 'Yar', 'Zan'];
const NATION_B = ['ia', 'an', 'ora', 'esh', 'ond', 'avia', 'mark', 'holt', 'eth', 'uun', 'ary', 'ost'];
function society(rng, arch, weird) {
  const res = { ...(RESOURCES[arch] || RESOURCES.temperate) }; for (const k in res) res[k] *= rng.range(0.5, 1.6);
  const rich = Object.entries(res).sort((a, b) => b[1] - a[1]), primary = rich[0][0], secondary = rich[1]?.[0] || primary;
  const nN = rng.weighted([[1, 1], [2, 3], [3, 3], [4, 2], [5, 1]]), nations = [];
  for (let i = 0; i < nN; i++) {
    const econ = i === 0 ? primary : rng.chance(0.5) ? secondary : rng.pick(rich.slice(0, 4))[0];
    const gov = rng.weighted(Object.entries(GOV_BY[econ] || { council: 2, house: 1, charter: 1, junta: 0.5 }).concat([['syndicate', 0.15], ['junta', 0.2]]));
    nations.push({ id: i, name: rng.pick(NATION_A) + rng.pick(NATION_B), econ, gov, colour: hsv(rng.next(), rng.range(0.45, 0.8), rng.range(0.5, 0.8)), strength: rng.range(0.4, 1), seat: rng.next() });
  }
  // how they get on: a rivalry for every pair, and whether it has come to fighting (resource-rich, junta-led and crowded worlds fight more)
  const relations = [];
  for (let a = 0; a < nN; a++) for (let b = a + 1; b < nN; b++) {
    const A = nations[a], B = nations[b], hot = 0.25 + 0.3 * (A.econ === B.econ ? 1 : 0) + 0.25 * ((A.gov === 'junta') + (B.gov === 'junta')) + 0.15 * (nN > 3) + rng.range(-0.2, 0.3);
    relations.push({ a, b, rivalry: Math.max(0, Math.min(1, hot)), state: hot > 0.85 ? 'war' : hot > 0.62 ? 'border war' : hot > 0.4 ? 'cold' : 'peace' });
  }
  return { resources: res, primary, secondary, industries: [primary, secondary].filter((v, i, a) => a.indexOf(v) === i), nations, relations,
    gangs: Math.min(1, rng.range(0.1, 0.6) + (nations.some(n => n.gov === 'syndicate') ? 0.3 : 0) + 0.15 * weird), lawless: rng.range(0, 0.5) };
}

export function genomeOf(planet) { return planet.genome || buildGenome(planet.seed); }
// `seed` is the body's own seed: [hi, lo]. The same seed always gives the same genome.
export function buildGenome(seed) {
  const rng = new Rng(derive(seed, 'genome'));
  const arch = pickW(rng, Object.fromEntries(Object.entries(ARCHETYPES).map(([k, A]) => [k, A.w]))), A = ARCHETYPES[arch];
  // how strange: within the archetype's band, leaning to its low end; one world in eight leaps past it
  const u = rng.next(), leap = rng.chance(0.125);
  const weird = Math.min(1, leap ? Math.max(A.weird[1], 0.72) + 0.28 * rng.next() : A.weird[0] + (A.weird[1] - A.weird[0]) * u * u);
  const R = (lo, hi) => rng.range(lo, hi), J = (v, a) => v * R(1 - a, 1 + a);
  // ---- terrain ----
  const relief = R(...A.relief), seaT = R(...A.sea), mount = pickW(rng, A.mount);
  const terrain = {
    warp: J(900, 0.4), contScale: J(14000, 0.45), contAmp: J(260, 0.3),
    contBias: 40 - 150 * seaT,                         // high: more of it is above the sea; drowned worlds sit low
    mountAmp: 820 * relief, mountScale: J(3200, 0.35), mountFrom: 0.05 + 0.3 * Math.max(0, seaT), mount,
    hillAmp: J(55, 0.5), hillScale: J(800, 0.35),
    terrace: mount === 'mesa' ? R(18, 46) : 0,          // mesa worlds: the high ground is stepped in strata of this height
    spire: mount === 'spire' ? R(0.25, 0.6) : 0,         // how much of the ranges stand as needles
  };
  // ---- the kinds of country ----
  const lands = {}; for (const [k, v] of Object.entries(A.lands)) lands[k] = v * R(0.5, 1.5);
  if (weird > 0.7) for (const k of ['fungal', 'crystal', 'spires', 'craters']) if (rng.chance(0.25)) lands[k] = (lands[k] || 0) + R(0.5, 2.5);     // the strange ones bleed in
  // ---- colour ----
  const fam = weird > 0.66 && rng.chance(0.75) ? pickW(rng, { red: 2, purple: 2, blue: 1.5, teal: 1.5, gold: 1, white: 1 }) : pickW(rng, A.foliage), F = FOLIAGE[fam];
  const fh = R(...F.h), fs = R(...F.s), fv = R(...F.v);
  const grass = hsv(fh, fs, fv), canopy = hsv(fh + R(-0.03, 0.03), Math.min(1, fs * R(0.9, 1.15)), fv * R(0.75, 0.95));
  const dry = hsv(fh * 0.4 + 0.07 + R(-0.02, 0.03), Math.max(0.38, fs * R(0.6, 0.85)), Math.min(0.44, fv * R(1.15, 1.45)));    // the same land in a dry season: toward straw and dust (never so pale it reads as snow)
  const rockFam = weird > 0.75 && rng.chance(0.5) ? pickW(rng, { violet: 1, green: 1, pale: 1, red: 1, dark: 1 }) : pickW(rng, ROCK_BY[arch]), rock = rng.pick(ROCKS[rockFam]).map(v => J(v, 0.06));
  const sandKey = weird > 0.7 && rng.chance(0.5) ? rng.pick(['black', 'white', 'pink', 'green']) : 'gold';
  const sand = { gold: [R(0.55, 0.66), R(0.48, 0.56), R(0.36, 0.42)], black: [0.16, 0.15, 0.15], white: [0.82, 0.8, 0.76], pink: [0.74, 0.56, 0.52], green: [0.36, 0.42, 0.3] }[sandKey];
  const seaKey = weird > 0.55 && rng.chance(0.6) ? pickW(rng, { green: 1, amber: 1, violet: 1, milky: 1, ink: 1 }) : pickW(rng, Object.fromEntries(Object.entries(SEAS).map(([k, s]) => [k, s.w]))), sea = SEAS[seaKey];
  const skyKey = weird > 0.5 && rng.chance(0.6) ? pickW(rng, { pale: 1, peach: 1.4, green: 1, violet: 1, teal: 1, rust: 1 }) : pickW(rng, Object.fromEntries(Object.entries(SKIES).map(([k, s]) => [k, s.w]))), sky = SKIES[skyKey];
  const moons = []; for (let n = rng.weighted([[0, 3], [1, 4], [2, 2], [3, 0.8], [4, 0.3]]), i = 0; i < n; i++) moons.push({ az: R(0, 6.2832), el: R(0.08, 0.9), size: R(0.6, 5) * (i ? 0.6 : 1), col: mixc([0.85, 0.83, 0.8], rng.pick([[0.9, 0.7, 0.55], [0.7, 0.75, 0.85], [0.8, 0.8, 0.8], [0.75, 0.6, 0.7]]), R(0, 0.8)), phase: R(0, 1) });
  const ring = rng.chance(0.08 + 0.2 * weird) ? { tilt: R(0.15, 0.7), width: R(0.06, 0.22), col: rng.pick([[0.85, 0.8, 0.72], [0.7, 0.72, 0.78], [0.8, 0.66, 0.56]]), bands: rng.int(3, 9) } : null;
  const climate = {
    id: arch, grass, dry, rock, sand, canopy, snow: arch === 'frozen' ? 0.97 : 0.92, treeline: R(...A.treeline), moistBias: (R(...A.damp) - 0.5) * 0.6,
    sea: { shallow: sea.shallow, deep: sea.deep, key: seaKey }, warm: R(...A.warm), damp: R(...A.damp),
  };
  const atmosphere = { turbidity: R(2.2, 6) * (arch === 'arid' || arch === 'cratered' ? 1.3 : 1), rayleigh: R(1.2, 2.6) * (arch === 'cratered' ? 0.6 : 1), mie: R(0.003, 0.008), tint: sky.tint, haze: sky.haze, key: skyKey, cloud: arch === 'arid' || arch === 'cratered' ? R(0, 0.25) : arch === 'jungle' || arch === 'archipelago' ? R(0.45, 0.85) : R(0.15, 0.65) };
  // ---- life ----
  const pickSet = (pool, n) => { const out = []; const P = { ...pool }; for (let i = 0; i < n && Object.keys(P).length; i++) { const k = pickW(rng, P); out.push(k); delete P[k]; } return out; };
  const fl = { ...A.flora }; if (weird > 0.6) for (const k of ['fungus', 'coral', 'crystal', 'spiral']) fl[k] = (fl[k] || 0) + 2 * (weird - 0.5);
  const trees = pickSet(fl, rng.int(3, 6));
  const flora = { trees, shape: { w: J(1, 0.18), h: J(1, 0.22) }, density: J(1, 0.3) * (arch === 'cratered' || arch === 'arid' ? 0.5 : 1), grassForm: weird > 0.7 ? rng.pick(['blade', 'frond', 'moss', 'shard']) : arch === 'crystal' ? 'shard' : arch === 'fungal' ? 'frond' : 'blade',
    bloom: hsv(R(0, 1), R(0.5, 0.85), R(0.7, 0.95)) };
  const fa = { ...A.fauna }; if (weird > 0.6) for (const k of ['jelly', 'crawler', 'serpent', 'shell']) fa[k] = (fa[k] || 0) + 2 * (weird - 0.5);
  const fauna = { plans: pickSet(fa, rng.int(5, 8)), stretch: { leg: J(1, 0.25), neck: J(1, 0.3), bulk: J(1, 0.2) }, coatHue: fh + R(-0.15, 0.15), vivid: weird };
  // ---- people ----
  const ways = pickSet(A.ways, 2);
  const soc = society(rng, arch, weird);
  const cloud = A.noGround ? { deck: R(500, 900), bands: rng.pick(BANDS).map(c => c.map(v => J(v, 0.05))), storm: R(0.2, 1), speed: R(4, 14), puffs: R(0.5, 1) } : null;
  return { arch, weird, noGround: !!A.noGround, cloud, terrain, lands, climate, atmosphere, sky: { moons, ring }, flora, fauna, culture: { ways, old: ways[1] }, society: soc, keys: { foliage: fam, rock: rockFam, sand: sandKey, sea: seaKey, sky: skyKey } };
}
// A few numbers per planet, for comparing two of them (tests and tools/planets.mjs).
export function genomeVector(g) {
  return [g.weird, g.terrain.contBias / 150, g.terrain.mountAmp / 1600, g.terrain.terrace / 46, g.terrain.spire, ...g.climate.grass, ...g.climate.rock, ...g.climate.sea.shallow, ...g.atmosphere.tint.map(v => v - 1), g.climate.warm, g.climate.damp];
}
