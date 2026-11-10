// A world with no ground: a gas giant's upper air, a sea of cloud far below, and its people living on floating platforms.
// Each town is a cluster: the main deck carrying the town, satellite decks around it at other heights (gardens, docks,
// spires, markets), joined to it by long ramped bridges. The megacity is one enormous deck. Everything else is open air
// down to the clouds. This is the ground as everything reads it (gen/terrain.js rawHeight asks here on such a world),
// so walking, grading, plants and ships all just work, and walking off an edge is a long fall. Pure: from the planet's
// seed and the towns' own seeds. The decks' undersides, spires and the cloud sea are render/skyisles.js.
import { Rng } from '../core/prng.js';
import { derive, hash01 } from '../core/hash.js';

// The planet's clouds: where the cloud tops lie, how far below them the air is still breathable (you fall through it), and
// the colours of its bands. From the genome (gen/genome.js `cloud`).
export const cloudOf = planet => planet.genome?.cloud || null;
export const isCloudWorld = planet => !!planet.genome?.noGround;
export const abyssOf = planet => cloudOf(planet).deck - 2600;

// A town's altitude: high above the clouds, each town its own height.
export function townAltitude(planet, rx, rz) {
  const C = cloudOf(planet), u = hash01(planet.seed, [rx, rz, 4111]);
  return C.deck + 520 + (rx === 0 && rz === 0 ? 0.35 : u) * 900;
}

// The decks of one town: [{ kind, x, z, r, lobes, phase, h }] and the bridges between them [{ a: [x, z, h], b: [x, z, h], w }].
// `town` is the settlement (its centre, radius and altitude); the plan is cached on it.
export function skyPlan(planet, town) {
  if (town.sky) return town.sky;
  const rng = new Rng(derive(town.seed, 'sky')), R = town.R + 70, decks = [], bridges = [];
  decks.push({ kind: 'main', x: town.cx, z: town.cz, r: R, lobes: rng.int(3, 6), phase: rng.range(0, 6.28), wob: 0.05, h: town.h });
  const n = rng.int(4, 7), a0 = rng.range(0, 6.28), kinds = ['dock', 'garden', 'spire', 'market', 'garden', 'dock', 'tower'];
  for (let i = 0; i < n; i++) {
    const kind = kinds[i % kinds.length], r = kind === 'dock' ? rng.range(72, 105) : kind === 'spire' ? rng.range(34, 52) : rng.range(46, 85);
    const dh = kind === 'dock' ? rng.range(-45, -10) : rng.range(-70, 85), gap = Math.max(46, Math.abs(dh) * 3.3 + rng.range(0, 30));
    const a = a0 + i * 6.2832 / n + rng.range(-0.25, 0.25), d = R + gap + r;
    if (d + r > 690) continue;                                   // (stays inside its own region of the planet: settlementNear only looks there)
    const D = { kind, x: town.cx + Math.cos(a) * d, z: town.cz + Math.sin(a) * d, r, lobes: rng.int(2, 5), phase: rng.range(0, 6.28), wob: 0.08, h: town.h + dh, a };
    decks.push(D);
    // the bridge: from the main deck's edge straight out to this one's, ramping evenly between their heights
    const ux = Math.cos(a), uz = Math.sin(a);
    const e0 = deckEdge(decks[0], a) - 2, e1 = deckEdge(D, a + Math.PI) - 2;      // (each end on the deck's own lobed edge, so the deck and the bridge meet at the same height)
    bridges.push({ a: [town.cx + ux * e0, town.cz + uz * e0, town.h], b: [D.x - ux * e1, D.z - uz * e1, D.h], w: kind === 'dock' ? 14 : 8 });
  }
  // a few satellites are also joined to their neighbours, so you can walk a ring round the town
  for (let i = 1; i < decks.length; i++) {
    const A = decks[i], B = decks[i + 1 < decks.length ? i + 1 : 1]; if (A === B) continue;
    const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), gap = L - A.r - B.r;
    if (gap < 20 || gap > 260 || Math.abs(B.h - A.h) > gap * 0.3 || rng.chance(0.4)) continue;
    const ux = dx / L, uz = dz / L, f = Math.max(0, Math.min(1, ((town.cx - A.x) * ux + (town.cz - A.z) * uz) / L)), mx = A.x + dx * f - town.cx, mz = A.z + dz * f - town.cz;
    if (Math.hypot(mx, mz) < R * 1.08 + 12) continue;          // (never across the main deck: it would meet the town's level in mid-span)
    if (decks.some(E => E !== A && E !== B && E.kind !== 'main' && (() => { const g = Math.max(0, Math.min(1, ((E.x - A.x) * ux + (E.z - A.z) * uz) / L)); return Math.hypot(A.x + dx * g - E.x, A.z + dz * g - E.z) < E.r * 1.1 + 6; })())) continue;
    const ea = deckEdge(A, Math.atan2(uz, ux)) - 2, eb = deckEdge(B, Math.atan2(-uz, -ux)) - 2;
    bridges.push({ a: [A.x + ux * ea, A.z + uz * ea, A.h], b: [B.x - ux * eb, B.z - uz * eb, B.h], w: 6 });
  }
  town.sky = { decks, bridges };
  return town.sky;
}
// The edge of a deck at angle th: a circle with gentle lobes.
export const deckEdge = (D, th) => D.r * (1 + D.wob * Math.sin(D.lobes * th + D.phase));
function onDeck(D, x, z) {
  const dx = x - D.x, dz = z - D.z, d = Math.hypot(dx, dz); if (d > D.r * (1 + D.wob)) return false;
  return d <= deckEdge(D, Math.atan2(dz, dx));
}
// Height of a plan's walkable surface at (x, z), or null if there's only air here.
export function planHeight(P, x, z) {
  for (const D of P.decks) if (onDeck(D, x, z)) return D.h;
  for (const B of P.bridges) {
    const ex = B.b[0] - B.a[0], ez = B.b[1] - B.a[1], L2 = ex * ex + ez * ez, t = Math.max(0, Math.min(1, ((x - B.a[0]) * ex + (z - B.a[1]) * ez) / L2));
    const px = B.a[0] + ex * t - x, pz = B.a[1] + ez * t - z; if (px * px + pz * pz < B.w * B.w / 4) return B.a[2] + (B.b[2] - B.a[2]) * t;
  }
  return null;
}

// The megacity's deck: one great disc (gen/city.js places the city; this is its ground).
export function cityDeck(city) { return { kind: 'city', x: city.cx, z: city.cz, r: city.R * 1.04, lobes: 7, phase: 0.4, wob: 0.025, h: city.h }; }

// The ground of a cloud world at (x, z): a deck, a bridge, or the long fall.
let getSettlementFn = null, regionOfFn = null, getCityFn = null;
export const bindSky = (gs, ro, gc) => { getSettlementFn = gs; regionOfFn = ro; getCityFn = gc; };
export function skyHeight(planet, x, z) {
  const city = getCityFn(planet), cd = cityDeck(city); if (onDeck(cd, x, z)) return cd.h;
  const [rx, rz] = regionOfFn(x, z), s = getSettlementFn(planet, rx, rz);
  if (s) { const h = planHeight(skyPlan(planet, s), x, z); if (h !== null) return h; }
  return abyssOf(planet);
}
