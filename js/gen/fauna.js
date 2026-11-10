// Animals. Each planet has its own: a handful of species, each from one of a few body plans, every proportion
// and colour from the planet's seed. They're strange but likeable: big soft eyes, sensible bodies, nothing Earth
// would quite recognise (six legs, fan ears, trunk-noses, a tail held out for balance). A species here is pure
// data — bones and soft shapes in metres (+z forward, +y up), plus how it lives. render/fauna.js gives it a skin.
import { Rng } from '../core/prng.js';
import { derive, hashInts } from '../core/hash.js';
import { landAt } from './land.js';
import { surfaceAt } from './surface.js';
import { smoothstep } from '../core/noise.js';

// natural, dusty colours: back, belly, marking, plate/horn
const COATS = [
  [[0.33, 0.37, 0.42], [0.68, 0.64, 0.56], [0.17, 0.2, 0.26], [0.42, 0.36, 0.28]],   // slate
  [[0.46, 0.3, 0.2], [0.76, 0.64, 0.48], [0.24, 0.14, 0.1], [0.3, 0.24, 0.2]],        // rust
  [[0.42, 0.42, 0.24], [0.72, 0.68, 0.46], [0.22, 0.24, 0.12], [0.3, 0.26, 0.16]],    // moss
  [[0.26, 0.38, 0.37], [0.66, 0.68, 0.58], [0.12, 0.2, 0.22], [0.5, 0.44, 0.34]],     // teal
  [[0.58, 0.46, 0.3], [0.84, 0.76, 0.6], [0.34, 0.22, 0.14], [0.36, 0.28, 0.2]],      // sand
  [[0.4, 0.34, 0.36], [0.72, 0.67, 0.62], [0.22, 0.17, 0.2], [0.5, 0.42, 0.36]],      // dusk
];

class Rig {
  constructor() { this.bones = []; this.prims = []; this.legs = []; this.eyes = []; this.fans = []; }
  bone(name, parent, at) { this.bones.push({ name, parent, at }); return this.bones.length - 1; }
  // a soft rounded shape from a to b, on bone `b`. tag: 0 skin, 1 belly, 2 marking, 3 plate. flat: how squashed in y; wide: in x
  prim(bone, a, b, ra, rb, tag = 0, o = {}) { this.prims.push({ bone, a, b, ra, rb, tag, flat: o.flat || 1, wide: o.wide || 1, k: o.k ?? 0.35 }); }
  chain(name, parent, pts, radii, tag = 0, o = {}) {      // a run of bones with a shape along each
    const ids = []; let p = parent;
    for (let i = 0; i < pts.length - 1; i++) { const id = this.bone(name + i, p, pts[i]); this.prim(id, pts[i], pts[i + 1], radii[i], radii[i + 1], tag, o); ids.push(id); p = id; }
    const end = this.bone(name + 'End', p, pts[pts.length - 1]); ids.push(end);
    return ids;
  }
  // a leg, both sides: side = ±1. Returns nothing; registers two legs. pole: which way the joint bends (+1 forward).
  legPair(parent, t, o) {
    for (const side of [-1, 1]) {
      const hip = [side * o.x, o.hipY, t], knee = [side * (o.x + o.splay * 0.5), o.hipY * o.kneeY, t + o.pole * o.bend], ankle = [side * (o.x + o.splay), o.ankle, t - o.pole * o.bend * 0.25], toe = [side * (o.x + o.splay), o.footR * 0.75, t + o.footL];
      const th = this.bone('thigh', parent, hip); this.prim(th, hip, knee, o.r0, o.r1, 0, { k: o.k ?? 0.3 });
      const sh = this.bone('shin', th, knee); this.prim(sh, knee, ankle, o.r1, o.r2, 0, { k: 0.1 });
      const ft = this.bone('foot', sh, ankle); this.prim(ft, ankle, toe, o.r2, o.footR, 2, { k: 0.06, wide: o.footW || 1.25, flat: 0.8 });
      this.legs.push({ thigh: th, shin: sh, foot: ft, side, phase: 0, len0: Math.hypot(knee[0] - hip[0], knee[1] - hip[1], knee[2] - hip[2]), len1: Math.hypot(ankle[0] - knee[0], ankle[1] - knee[1], ankle[2] - knee[2]), rest: [ankle[0], ankle[2]], ankle: o.ankle, pole: o.pole });
    }
  }
  eye(bone, at, r) { for (const s of [-1, 1]) this.eyes.push({ bone, at: [s * at[0], at[1], at[2]], r }); }
}

// A heavy or a medium beast on four or six legs
function beast(rng, o) {
  const R = new Rig(), H = o.H, L = o.L, g = o.girth;
  const root = R.bone('root', -1, [0, H, 0]);
  const pelvis = R.bone('pelvis', root, [0, H, -L * 0.42]), mid = R.bone('mid', pelvis, [0, H + g * 0.1, 0]), chest = R.bone('chest', mid, [0, H + (o.shoulder || 0), L * 0.42]);
  R.prim(pelvis, [0, H, -L * 0.45], [0, H + g * 0.1, 0], g * 0.86, g, 0, { k: 0.5 });
  R.prim(mid, [0, H + g * 0.1, 0], [0, H + (o.shoulder || 0), L * 0.42], g, g * 0.9, 0, { k: 0.5 });
  R.prim(mid, [0, H - g * 0.32, -L * 0.2], [0, H - g * 0.3, L * 0.3], g * 0.72, g * 0.72, 1, { k: 0.45 });     // belly
  // neck, head
  const nb = [0, H + (o.shoulder || 0) + g * 0.2, L * 0.46], nt = [0, H + o.neckUp, L * 0.46 + o.neckOut], nm = [0, H + o.neckUp * 0.62, L * 0.46 + o.neckOut * 0.45];
  const neck = R.chain('neck', chest, [nb, nm, nt], [g * o.neckR, g * o.neckR * 0.8, g * o.neckR * 0.62], 0, { k: 0.3 });
  const hr = o.head, head = neck[neck.length - 1];
  R.prim(head, nt, [0, nt[1] - hr * 0.1, nt[2] + hr * 1.1], hr * 0.92, hr * 0.62, 0, { k: 0.2, wide: o.headWide || 1 });     // skull to muzzle
  R.prim(head, [0, nt[1] - hr * 0.4, nt[2] + hr * 0.5], [0, nt[1] - hr * 0.44, nt[2] + hr * 1.15], hr * 0.45, hr * 0.42, 1, { k: 0.14, wide: o.headWide || 1 });     // pale jaw
  R.eye(head, [hr * (o.headWide || 1) * 0.68, nt[1] + hr * 0.26, nt[2] + hr * 0.42], hr * o.eye);
  // tail
  const tb = [0, H + g * 0.15, -L * 0.48], tt = [0, H + o.tailUp, -L * 0.48 - o.tail]; const tm = (a, b, f) => a.map((v, i) => v + (b[i] - v) * f);
  const tail = R.chain('tail', pelvis, [tb, tm(tb, tt, 0.33), tm(tb, tt, 0.66), tt], [g * 0.42, g * 0.3, g * 0.2, g * 0.09], 0, { k: 0.25 });
  // legs
  const leg = { x: g * 0.72, hipY: H - g * 0.05, kneeY: 0.56, ankle: o.ankle ?? H * 0.09, splay: g * 0.18, bend: H * 0.14, r0: o.legR * 1.5, r1: o.legR, r2: o.legR * 0.72, footR: o.legR * 0.95, footL: o.legR * 1.5, footW: 1.4, k: 0.35 };
  const parents = o.legs === 6 ? [[pelvis, -L * 0.36, -1], [mid, 0, 1], [chest, L * 0.34, 1]] : [[pelvis, -L * 0.36, -1], [chest, L * 0.34, 1]];
  for (const [p, t, pole] of parents) R.legPair(p, t, { ...leg, pole });
  // gait: opposite legs alternate; six legs walk as tripods; four as a walk
  R.legs.forEach((l, i) => { const pair = Math.floor(i / 2), s = i % 2; l.phase = o.legs === 6 ? ((pair + s) % 2) * 0.5 : (pair === 0 ? 0 : 0.25) + s * 0.5; });
  return { R, head, neck, tail, pelvis, chest, mid, root, nt, hr };
}

const PLANS = {
  // Trundler: a low, broad, six-legged grazer with blunt plates down its back and a soft fringe under its chin. Slow, calm, and it won't be pushed around.
  trundler(rng, size) {
    const H = size * 0.66, L = size * 1.18, g = size * 0.33, B = beast(rng, { H, L, girth: g, legs: 6, neckUp: size * 0.1, neckOut: size * 0.34, neckR: 0.78, head: size * 0.17, headWide: rng.range(1.15, 1.4), eye: 0.3, tail: size * 0.5, tailUp: -size * 0.16, legR: size * 0.06, shoulder: size * 0.09 });
    const R = B.R, n = rng.int(4, 7);
    for (let i = 0; i < n; i++) { const t = -L * 0.42 + (i + 0.5) / n * L * 0.86, h = size * rng.range(0.12, 0.2) * Math.sin((i + 0.5) / n * Math.PI), y = H + g * 0.85 + size * 0.03, bone = t < -L * 0.1 ? B.pelvis : t > L * 0.25 ? B.chest : B.mid; R.prim(bone, [0, y, t - size * 0.1], [0, y + h, t + size * 0.02], size * 0.1, size * 0.03, 3, { k: 0.1, wide: 1.9, flat: 1 }); }
    for (const s of [-0.16, -0.05, 0.05, 0.16]) R.prim(B.head, [s * size, B.nt[1] - B.hr * 0.7, B.nt[2] + B.hr * 0.9], [s * size * 1.1, B.nt[1] - B.hr * 1.6, B.nt[2] + B.hr * 0.95], size * 0.03, size * 0.012, 2, { k: 0.05 });     // chin fringe
    return { ...B, plan: 'trundler', stride: size * 0.75, speed: [0.7, 3.4], ears: [] };
  },
  // Rooter: pig-sized, six short legs, a long bendy nose it snuffles the ground with, big spoon ears. Shy.
  rooter(rng, size) {
    const H = size * 0.5, L = size * 0.86, g = size * 0.22, B = beast(rng, { H, L, girth: g, legs: 6, neckUp: size * 0.06, neckOut: size * 0.2, neckR: 0.76, head: size * 0.17, eye: 0.34, tail: size * 0.3, tailUp: size * 0.2, legR: size * 0.042 });
    const R = B.R, nt = B.nt, hr = B.hr, tr = R.chain('trunk', B.head, [[0, nt[1] - hr * 0.1, nt[2] + hr * 1.1], [0, nt[1] - hr * 0.28, nt[2] + hr * 1.9], [0, nt[1] - hr * 0.7, nt[2] + hr * 2.6], [0, nt[1] - hr * 1.3, nt[2] + hr * 3.0]], [hr * 0.42, hr * 0.32, hr * 0.26, hr * 0.26], 0, { k: 0.12 });
    const ears = []; for (const s of [-1, 1]) { const a = [s * hr * 0.6, nt[1] + hr * 0.55, nt[2] - hr * 0.1], b = [s * hr * 1.9, nt[1] + hr * 1.15, nt[2] - hr * 0.5], e = R.bone('ear', B.head, a); R.prim(e, a, b, hr * 0.22, hr * 0.48, 1, { k: 0.08, flat: 0.28 }); ears.push({ bone: e, side: s }); }
    return { ...B, plan: 'rooter', stride: size * 0.55, speed: [0.9, 4.8], ears, trunk: tr };
  },
  // Stilter: a small round body very high on four long legs, a swan neck and a fan on the head. Browses the tops of things.
  stilter(rng, size) {
    const H = size * 0.72, L = size * 0.34, g = size * 0.16, B = beast(rng, { H, L, girth: g, legs: 4, neckUp: size * 0.34, neckOut: size * 0.2, neckR: 0.42, head: size * 0.06, eye: 0.44, tail: size * 0.14, tailUp: -size * 0.1, legR: size * 0.02, ankle: H * 0.05 });
    const R = B.R, nt = B.nt, hr = B.hr, n = rng.int(3, 5);
    for (let i = 0; i < n; i++) { const a = (i / (n - 1) - 0.5) * 1.6, tip = [Math.sin(a) * hr * 2.8, nt[1] + Math.cos(a) * hr * 2.4 + hr * 0.3, nt[2] - hr * 0.8]; R.prim(B.head, [Math.sin(a) * hr * 0.3, nt[1] + hr * 0.3, nt[2] - hr * 0.1], tip, hr * 0.14, hr * 0.26, 2, { k: 0.1, flat: 0.5 }); }
    return { ...B, plan: 'stilter', stride: size * 0.5, speed: [0.9, 6.5], ears: [] };
  },
  // Strider: runs on two strong legs with the body level and a long stiff tail behind for balance; small fore-limbs folded; a crest it raises when alarmed.
  strider(rng, size) {
    const R = new Rig(), H = size * 0.62, L = size * 0.5, g = size * 0.17;
    const root = R.bone('root', -1, [0, H, 0]), pelvis = R.bone('pelvis', root, [0, H, -L * 0.3]), mid = R.bone('mid', pelvis, [0, H + g * 0.1, L * 0.1]), chest = R.bone('chest', mid, [0, H + g * 0.3, L * 0.45]);
    R.prim(pelvis, [0, H, -L * 0.34], [0, H + g * 0.1, L * 0.1], g * 0.95, g, 0, { k: 0.4 }); R.prim(mid, [0, H + g * 0.1, L * 0.1], [0, H + g * 0.3, L * 0.48], g, g * 0.82, 0, { k: 0.4 }); R.prim(mid, [0, H - g * 0.3, -L * 0.1], [0, H - g * 0.15, L * 0.4], g * 0.62, g * 0.6, 1, { k: 0.35 });
    const nb = [0, H + g * 0.5, L * 0.5], nt = [0, H + size * 0.46, L * 0.5 + size * 0.2], nm = [0, H + size * 0.28, L * 0.5 + size * 0.06];
    const neck = R.chain('neck', chest, [nb, nm, nt], [g * 0.5, g * 0.38, g * 0.3], 0, { k: 0.22 }), head = neck[neck.length - 1], hr = size * 0.075;
    R.prim(head, nt, [0, nt[1] - hr * 0.1, nt[2] + hr * 1.5], hr * 0.95, hr * 0.5, 0, { k: 0.15 }); R.prim(head, [0, nt[1] - hr * 0.42, nt[2] + hr * 0.5], [0, nt[1] - hr * 0.4, nt[2] + hr * 1.4], hr * 0.42, hr * 0.32, 1, { k: 0.1 });
    R.eye(head, [hr * 0.76, nt[1] + hr * 0.26, nt[2] + hr * 0.42], hr * 0.4);
    const crest = R.bone('crest', head, [0, nt[1] + hr * 0.7, nt[2]]), cl = rng.int(2, 4);
    for (let i = 0; i < cl; i++) { const q = i / cl; R.prim(crest, [0, nt[1] + hr * 0.7, nt[2] + hr * 0.3 - q * hr], [0, nt[1] + hr * (2.2 - q * 0.8), nt[2] - hr * (0.9 + q * 1.4)], hr * 0.2, hr * 0.32, 2, { k: 0.1, wide: 0.5 }); }
    const tb = [0, H + g * 0.1, -L * 0.34], tt = [0, H + size * 0.08, -L * 0.34 - size * 0.78], tm = f => tb.map((v, i) => v + (tt[i] - v) * f), tail = R.chain('tail', pelvis, [tb, tm(0.33), tm(0.66), tt], [g * 0.5, g * 0.32, g * 0.18, g * 0.06], 0, { k: 0.2 });
    for (const s of [-1, 1]) { const a = [s * g * 0.75, H + g * 0.1, L * 0.42], b = [s * g * 0.95, H - g * 0.5, L * 0.52], c = [s * g * 0.82, H - g * 0.4, L * 0.72], e = R.bone('arm', chest, a), f = R.bone('hand', e, b); R.prim(e, a, b, g * 0.2, g * 0.13, 0, { k: 0.12 }); R.prim(f, b, c, g * 0.13, g * 0.09, 2, { k: 0.06 }); }
    R.legPair(pelvis, -L * 0.2, { x: g * 0.62, hipY: H - g * 0.05, kneeY: 0.52, ankle: H * 0.16, splay: g * 0.05, bend: H * 0.22, pole: 1, r0: g * 0.5, r1: g * 0.22, r2: g * 0.13, footR: g * 0.15, footL: size * 0.13, footW: 1.6 });
    R.legs.forEach((l, i) => { l.phase = i * 0.5; });
    return { R, root, pelvis, mid, chest, neck, head, tail, plan: 'strider', stride: size * 0.68, speed: [1.2, 9], ears: [], nt, hr, crest };
  },
  // Hopper: knee-high, big ears, soft plume of a tail; goes in bounds. Nosy, then gone.
  hopper(rng, size) {
    const R = new Rig(), H = size * 0.46, g = size * 0.22;
    const root = R.bone('root', -1, [0, H, 0]), pelvis = R.bone('pelvis', root, [0, H, -g * 0.6]), chest = R.bone('chest', pelvis, [0, H + g * 0.7, g * 0.5]);
    R.prim(pelvis, [0, H, -g * 0.6], [0, H + g * 0.6, g * 0.3], g, g * 0.74, 0, { k: 0.4 }); R.prim(chest, [0, H - g * 0.2, -g * 0.2], [0, H + g * 0.4, g * 0.55], g * 0.72, g * 0.52, 1, { k: 0.3 });
    const nb = [0, H + g * 0.9, g * 0.5], nt = [0, H + g * 1.5, g * 0.7], neck = R.chain('neck', chest, [nb, nt], [g * 0.42, g * 0.4], 0, { k: 0.2 }), head = neck[neck.length - 1], hr = g * 0.64;
    R.prim(head, nt, [0, nt[1] - hr * 0.1, nt[2] + hr * 0.75], hr, hr * 0.62, 0, { k: 0.2, wide: 1.05 }); R.prim(head, [0, nt[1] - hr * 0.4, nt[2] + hr * 0.45], [0, nt[1] - hr * 0.4, nt[2] + hr * 0.85], hr * 0.4, hr * 0.32, 1, { k: 0.1 });
    R.eye(head, [hr * 0.68, nt[1] + hr * 0.22, nt[2] + hr * 0.42], hr * 0.42);
    const ears = []; for (const s of [-1, 1]) { const a = [s * hr * 0.5, nt[1] + hr * 0.7, nt[2] - hr * 0.2], b = [s * hr * 1.5, nt[1] + hr * 2.4, nt[2] - hr * 0.8], e = R.bone('ear', head, a); R.prim(e, a, b, hr * 0.22, hr * 0.42, 1, { k: 0.08, flat: 0.32 }); ears.push({ bone: e, side: s }); }
    const tb = [0, H + g * 0.1, -g * 1.3], tt = [0, H + g * 1.4, -g * 2.8], tm = tb.map((v, i) => (v + tt[i]) / 2), tail = R.chain('tail', pelvis, [tb, tm, tt], [g * 0.3, g * 0.52, g * 0.28], 2, { k: 0.15 });
    for (const s of [-1, 1]) { const a = [s * g * 0.5, H + g * 0.4, g * 0.6], b = [s * g * 0.55, H - g * 0.2, g * 0.95], e = R.bone('arm', chest, a); R.prim(e, a, b, g * 0.14, g * 0.1, 0, { k: 0.1 }); }
    R.legPair(pelvis, -g * 0.5, { x: g * 0.58, hipY: H - g * 0.15, kneeY: 0.6, ankle: H * 0.13, splay: g * 0.08, bend: H * 0.3, pole: 1, r0: g * 0.5, r1: g * 0.2, r2: g * 0.13, footR: g * 0.16, footL: g * 0.8, footW: 1.3 });
    R.legs.forEach(l => { l.phase = 0; });
    return { R, root, pelvis, chest, mid: chest, neck, head, tail, plan: 'hopper', stride: size * 0.8, speed: [1.2, 8], ears, nt, hr, hop: true };
  },
  // Glider: four long soft wings and a streamer of a tail, circling above the trees. It only ever comes down to roost.
  glider(rng, size) {
    const R = new Rig(), g = size * 0.1, y = size * 0.3;
    const root = R.bone('root', -1, [0, y, 0]), pelvis = R.bone('pelvis', root, [0, y, -g]), chest = R.bone('chest', pelvis, [0, y, g * 0.9]);
    R.prim(pelvis, [0, y, -g * 1.2], [0, y, g * 0.8], g * 0.7, g, 0, { k: 0.3 }); R.prim(chest, [0, y, 0], [0, y + g * 0.1, g * 1.5], g, g * 0.65, 1, { k: 0.3 });
    const nt = [0, y + g * 0.3, g * 2.4], neck = R.chain('neck', chest, [[0, y + g * 0.1, g * 1.4], nt], [g * 0.5, g * 0.42], 0, { k: 0.2 }), head = neck[neck.length - 1], hr = g * 0.62;
    R.prim(head, nt, [0, nt[1] - hr * 0.1, nt[2] + hr * 1.3], hr, hr * 0.42, 0, { k: 0.15 });
    R.eye(head, [hr * 0.72, nt[1] + hr * 0.22, nt[2] + hr * 0.4], hr * 0.4);
    const tb = [0, y, -g * 1.1], tail = R.chain('tail', pelvis, [tb, [0, y, -g * 3], [0, y, -g * 5], [0, y, -g * 7.5]], [g * 0.4, g * 0.22, g * 0.13, g * 0.2], 2, { k: 0.12 });
    const wings = [];
    for (const [z, span, cord, parent] of [[g * 0.7, size * 0.72, size * 0.2, chest], [-g * 0.8, size * 0.5, size * 0.16, pelvis]]) for (const s of [-1, 1]) {
      const a = [s * g * 0.7, y + g * 0.2, z], b = [s * (g + span * 0.5), y + g * 0.2, z], c = [s * (g + span), y + g * 0.1, z - cord * 0.3];
      const w0 = R.bone('wing', parent, a), w1 = R.bone('wing2', w0, b), w2 = R.bone('wingEnd', w1, c); wings.push({ w0, w1, side: s, front: z > 0 });
      R.fans.push({ pts: [a, b, c], bones: [w0, w1, w2], cord, side: s });
      R.prim(w0, a, b, g * 0.2, g * 0.09, 2, { k: 0.1 }); R.prim(w1, b, c, g * 0.09, g * 0.04, 2, { k: 0.05 });
    }
    return { R, root, pelvis, chest, mid: chest, neck, head, tail, plan: 'glider', stride: 1, speed: [6, 14], ears: [], wings, nt, hr, flies: true };
  },
};

// Where each lives, how big, how it takes you. size: length-scale in metres. flock: how many together. fear: how close you can come. bold: fights back if hurt.
const KINDS = {
  trundler: { sizes: [2.2, 3.6], flock: [3, 7], fear: 7, bold: true, hp: 90, lands: { meadow: 1, moor: 1, marsh: 0.7, karst: 0.6, forest: 0.25 } },
  rooter:   { sizes: [0.8, 1.2], flock: [3, 8], fear: 14, bold: false, hp: 22, lands: { forest: 1.4, karst: 0.5, marsh: 0.4, meadow: 0.3 } },
  stilter:  { sizes: [3.4, 5.2], flock: [2, 5], fear: 26, bold: false, hp: 50, lands: { forest: 0.9, meadow: 0.5, karst: 0.6, marsh: 0.4 } },
  strider:  { sizes: [1.8, 2.6], flock: [3, 9], fear: 22, bold: false, hp: 35, lands: { badlands: 1.2, dunes: 0.8, saltpan: 0.6, rockfield: 0.8, moor: 0.5, meadow: 0.4, lava: 0.3 } },
  hopper:   { sizes: [0.5, 0.8], flock: [2, 6], fear: 9, bold: false, hp: 10, lands: { forest: 1.3, meadow: 0.9, karst: 0.7, moor: 0.5, rockfield: 0.4 } },
  glider:   { sizes: [1.6, 2.8], flock: [3, 8], fear: 0, bold: false, hp: 12, lands: { forest: 1, karst: 1, meadow: 0.6, marsh: 0.8, badlands: 0.4, moor: 0.5 } },
};
const SYL = [['Bar', 'Tol', 'Nes', 'Vor', 'Ka', 'Ool', 'Ren', 'Mu', 'Sha', 'Dra', 'Pel', 'Gri'], ['u', 'a', 'o', 'i', 'e', 'ai'], ['ma', 'th', 'n', 'rl', 'sk', 'ba', 'dor', 'lim', 'ri', 'vex']];

const memo = new WeakMap();
export function speciesOf(planet) {
  let list = memo.get(planet); if (list) return list;
  list = [];
  for (const plan of Object.keys(PLANS)) {
    const rng = new Rng(derive(planet.seed, 'fauna', [plan.length, plan.charCodeAt(1)])), K = KINDS[plan], size = rng.range(...K.sizes), coat = COATS[rng.int(0, COATS.length - 1)], name = rng.pick(SYL[0]) + rng.pick(SYL[1]) + rng.pick(SYL[2]);
    list.push({ id: plan, plan, name, size, coat, pattern: rng.int(0, 3), patternSeed: rng.int(0, 99999), skin: plan === 'trundler' ? 'hide' : plan === 'strider' ? 'scales' : 'pelt', rig: null, K, seed: rng.int(0, 2 ** 30), height: size });
  }
  memo.set(planet, list);
  return list;
}
export function rigOf(S) {
  if (!S.rig) S.rig = PLANS[S.plan](new Rng([S.seed, S.seed ^ 0x51]), S.size);
  return S.rig;
}

// Herds: at most one to a square of 380 m, kept to the land it likes. Where it's "home" is all that's fixed; once you're near, sim/fauna.js lets it wander from there.
export const HERD_TILE = 380;
export function herdInTile(planet, ti, tj) {
  const r = k => hashInts(planet.seed[0] ^ 0xfa07, [ti, tj, k]) / 4294967296, x = (ti + 0.1 + 0.8 * r(1)) * HERD_TILE, z = (tj + 0.1 + 0.8 * r(2)) * HERD_TILE;
  let land = null, bw = 0; for (const { c, w } of landAt(planet, x, z)) if (w > bw) { bw = w; land = c; }
  const sps = speciesOf(planet); let tot = 0; const W = sps.map(S => { const v = S.K.lands[land.kind] || 0; tot += v; return v; });
  if (r(3) > Math.min(0.85, tot * 0.32)) return null;
  const s = surfaceAt(planet, x, z); if (s.h < planet.seaLevel + 2 || s.town > 0.02) return null;
  let q = r(4) * tot, sp = null; for (let i = 0; i < sps.length; i++) { q -= W[i]; if (q < 0) { sp = sps[i]; break; } } sp = sp || sps[0];
  const n = sp.K.flock[0] + Math.floor(r(5) * (sp.K.flock[1] - sp.K.flock[0] + 1));
  return { id: `h${ti},${tj}`, sp, x, z, n, seed: hashInts(planet.seed[1], [ti, tj]) };
}
