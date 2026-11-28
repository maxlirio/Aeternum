// The fleet: a few ships a kilometre long, standing over the home city. Logical data like any ship: where each one is, the decks inside it
// (a layout the collision world walks), and the solid shapes it has for anything flying near. The models come from tools/assets/capital_kit.py.
import { hashStr } from '../core/hash.js';
import CAPITAL from '../../assets/ships/capital.json' with { type: 'json' };

// Solid shapes in ship coordinates (x across, y up, z stern to bow): boxes [x0, y0, z0, x1, y1, z1] and rings [z, R, r] about the z axis. They leave the way into the dock open.
const dockGap = (mx, my, mz, hw = 19) => [[-200, -200, -1000, 200, 200, mz - hw], [-200, -200, mz + hw, 200, 200, 1000]];
// A solid hull as boxes, with the way into the dock left open (mouth at x = mx, decks running in 100 m). X, Y: half-width and half-height.
const cut = (X, Y, z0, z1, mx, my, mz) => [[-X, -Y, z0, X, Y, mz - 19], [-X, -Y, mz + 19, X, Y, z1], [-X, -Y, mz - 19, X, my - 7, mz + 19], [-X, my + 11, mz - 19, X, Y, mz + 19], [-X, my - 7, mz - 19, mx - 100, my + 11, mz + 19]];
export const FLEET = {
  bastion: { name: 'Bastion', length: 860, dock: [99.5, 12, -30],
    solid: [[-92, -60, -500, 92, 60, 430], [32, 58, -240, 68, 132, -40]] },
  meridian: { name: 'Meridian', length: 1310, dock: [112, -9, -55],
    solid: [[-40, -40, -660, 40, 40, 340], [-75, -75, 340, 75, 75, 650], [-360, -3, -520, 360, 3, -264]], rings: [[-170, 210, 26], [60, 240, 26], [260, 190, 26]] },
  longshore: { name: 'Longshore', length: 1570, dock: [58, -18, 650],
    solid: [[-85, -85, -640, 85, 85, 600], [-42, -40, 600, 42, 40, 742], [-65, -65, -830, 65, 65, -640]] },
  halcyon: { name: 'Halcyon', length: 840, sleek: true, dock: [73, -8, 10],
    solid: [[-72, -48, -432, 72, 48, 404], [-335, -16, -372, 335, -2, -60]] },
  // the great ones
  anvil: { name: 'Anvil', length: 3500, livery: 0, dock: [441, -6, -330], solid: [[-440, -215, -1800, 440, 215, 1100], [-120, -60, 1100, 120, 40, 1700], [-340, 150, -1450, 340, 350, 860], [-80, 350, -1080, 80, 553, -40]] },
  vesper: { name: 'Vesper', length: 5300, livery: 1, dock: [770, -4, -280], solid: [[-770, -118, -2740, 770, 118, 1700], [-620, -330, -2600, 620, -118, 1700], [-520, -300, 1700, 520, 118, 2300], [-160, -150, 2300, 160, 118, 2640]] },     // (above the deck the city is solid where its buildings are: world/vesper.js)
  tiller: { name: 'Tiller', length: 4260, livery: 2, dock: [214, -14, 1760], solid: [[-310, -170, -2060, 310, 170, 1500], [-212, -180, 1460, 212, 180, 2100], [-150, 150, 1480, 150, 294, 2010]] },
  sable: { name: 'Sable', length: 1620, span: 2410, sleek: true, dark: true, dock: [58, -108, -60], solid: [[-200, -90, -640, 200, 90, 960], [-1200, -10, -860, -200, 70, 400], [200, -10, -860, 1200, 70, 400]] },
};
// The enemy's dreadnought (sim/planetwar.js): not one of the fleet, and nothing like any of it. Two hulls with the lance slung in a drum between them
// on four arms (tools/assets/harrow_kit.py); its decks are its own (tools/gen-harrow.mjs), and only the bay itself is the open way in.
const twin = b => [b, [-b[3], b[1], b[2], -b[0], b[4], b[5]]];
export const HULLS = { ...FLEET,
  harrow: { name: 'Harrow', length: 3470, span: 1030, enemy: true, dock: [510, -6, 200], bay: 61, decks: [200, 592],
    solid: [[290, -200, -960, 510, 120, 181], [290, -200, 219, 510, 120, 1480], [290, -200, 181, 510, -13, 219], [290, 5, 181, 510, 120, 219], [290, -13, 181, 449, 5, 219], [-510, -200, -960, -290, 120, 1480],
      ...twin([380, -200, 1480, 420, 110, 1700]), ...twin([385, -272, -700, 415, -200, 1150]), ...twin([328, 120, -650, 472, 156, 1100]), ...twin([112, -34, 110, 290, 24, 150]), ...twin([112, -34, 250, 290, 24, 290]),
      [-512, -190, -1670, 512, 150, -905], [-450, -120, -1790, 450, 80, -1670], [-170, 150, -1520, 170, 228, -1040], [-100, 228, -1440, 100, 312, -1090],
      [-125, -200, 75, 125, 120, 325], [-100, 120, 100, 100, 178, 300], [-70, -308, 130, 70, -200, 270], [-110, -22, 455, 110, 12, 482], [-110, -22, -82, 110, 12, -55], ...twin([150, -22, 362, 232, 12, 420]), ...twin([150, -22, -20, 232, 12, 38])] },
};
// The bay of each, from its decks' own layout (tools/gen-capital.mjs): how wide and high its mouth is, how deep and wide and high the hangar behind
// it, and the whole block the decks are built in (W across the mouth, D inward, H high). The Harrow's is as it was built: a slot, and a bay behind.
const bays = new Map();
export function bayOf(model) {
  let B = bays.get(model); if (B) return B;
  const L = CAPITAL[model + '_decks'], F = HULLS[model];
  B = L?.hangar ? { hw: L.hangar.mouthW / 2, lo: L.deck, hi: L.deck + L.hangar.mouthH, depth: L.hangar.depth + 1, bw: L.W / 2 - 2, floor: L.deck, top: L.hangar.height, W: L.W, D: L.D, H: L.ceiling + 3, block: true }
    : { hw: 19, lo: -7, hi: 11, depth: (F.bay || 100) + 4, bw: 19, floor: -7, top: 11, W: F.decks?.[0] || 34, D: F.decks?.[1] || 100, H: 14, block: false };
  bays.set(model, B); return B;
}
const SPOTS = { halcyon: [-1300, 2900, 4300], bastion: [2100, 2300, 900], meridian: [-3200, 3900, -1400], longshore: [900, 5200, -5200], anvil: [7200, 3400, 3200], vesper: [-7600, 5200, 5600], tiller: [-5400, 4300, -8200], sable: [5200, 6400, -6400] };   // east, height above the sea, north of the city

export function fleetOf(planet, S) {
  const seed = hashStr(planet.universeSeed[0], 'fleet');
  return Object.keys(FLEET).map((model, i) => {
    const F = FLEET[model], [dx, h, dz] = SPOTS[model], yaw = ((seed >>> (i * 4)) % 628) / 100, x = S.cx + dx, z = S.cz + dz, y = planet.seaLevel + h;
    const B = bayOf(model);
    return seatDecks({ model, name: F.name, x, y, z, yaw, colour: i, length: F.length, span: F.span, sleek: !!F.sleek, deckW: B.W, deckD: B.D, dark: !!F.dark, livery: F.livery, ship: { id: `ship:${S.key}:fleet${i}`, model: model + '_decks', name: F.name, at: null, field: true, fleet: true, colour: 4, owner: 'fleet', ownerName: 'the Fleet' } });
  });
}
// where a ship's decks are, from where the ship is (they run inward from the dock's mouth): set again whenever it moves (gen/voyages.js)
export function seatDecks(C) {
  const F = HULLS[C.model], c = Math.cos(C.yaw), s = Math.sin(C.yaw), [mx, my, mz] = F.dock, wx = C.x + mx * c + mz * s, wz = C.z - mx * s + mz * c, f = Math.atan2(-c, s), D = C.deckD;
  C.ship.at = { c: [wx + Math.sin(f) * D / 2, C.y + my, wz + Math.cos(f) * D / 2], facing: f }; return C;
}

// How sheltered a point is by a great ship's bay: 1 inside its decks and doors, easing to 0 over the first 150 m out past the mouth (the weather doesn't blow in a hangar).
export function bayShelter(list, px, py, pz) {
  let best = 0;
  for (const C of list) {
    if (C.off) continue; const F = HULLS[C.model], dx = px - C.x, dz = pz - C.z; if (dx * dx + dz * dz > (F.length * 0.8) ** 2) continue;
    const c = Math.cos(C.yaw), s = Math.sin(C.yaw), lx = dx * c - dz * s, lz = dx * s + dz * c, ly = py - C.y, [mx, my, mz] = F.dock, o = Math.max(0, lx - mx), B = bayOf(C.model);
    if (lx < mx - B.D - 2 || o > 150 || ly < my + B.lo - 1 - o * 0.35 || ly > my + (o ? B.hi : B.H) + 1 + o * 0.6 || Math.abs(lz - mz) > (o ? B.hw : B.W / 2) + 1 + o * 0.6) continue;
    best = Math.max(best, 1 - o / 150);
  }
  return best;
}
// If (px, py, pz) is inside a ship's solid parts: the shortest way out of it, in world coordinates. Otherwise null.
export function fleetContact(list, px, py, pz, r = 3) {
  for (const C of list) {
    if (C.off) continue; const dx = px - C.x, dz = pz - C.z; const reach = Math.max(1200, Math.max(HULLS[C.model].span || 0, HULLS[C.model].length) * 0.7); if (dx * dx + dz * dz > reach * reach) continue;
    const c = Math.cos(C.yaw), s = Math.sin(C.yaw), lx = dx * c - dz * s, lz = dx * s + dz * c, ly = py - C.y, F = HULLS[C.model];
    const back = (ox, oy, oz) => [ox * c + oz * s, oy, -ox * s + oz * c];
    // the way in and out of the dock is never solid: from the back of its decks out past the mouth, as high and wide as its doors (a wing or a hull box
    // across it would let the ship fly itself in, then wreck you flying out)
    // (out past the mouth it opens into a funnel: a ship drifting a little on its way out is still on its way out)
    // (a ring is never in the way out, and never open: the Meridian's bay looks out between two of them)
    for (const [rz, R, t] of F.rings || []) { const q = Math.hypot(lx, ly) - R, w = lz - rz; if (Math.hypot(q, w) < t + r) { const d = Math.hypot(q, w) || 1, k = (t + r - d) / d, nl = Math.hypot(lx, ly) || 1; return back(q * k * lx / nl, q * k * ly / nl, w * k); } }
    const [mx, my, mz] = F.dock, B = bayOf(C.model), o = Math.max(0, lx - mx), og = Math.min(o, 90), wide = B.hw + og * 0.6, lo = my + B.lo - og * 0.35, hi = my + B.hi + Math.min(og, 20) * 0.6, m = Math.min(r * 0.3, 1.5);
    if (lx > mx - 2 && lx < mx + 900 && ly > lo + (o ? 0 : m) && ly < hi - (o ? 0 : m) && Math.abs(lz - mz) < wide - (o ? 0 : m)) continue;
    // in the hangar itself there's air to fly in, between its deck, its roof and its walls; further in are the decks people work on, and no way for a ship
    if (lx <= mx - 2 + 2.01 && lx > mx - B.depth - 0.5 && Math.abs(lz - mz) < B.bw + 1 && ly > my + B.floor - 1 && ly < my + B.top + 1) {
      if (!B.block) continue;
      const side = B.bw - Math.abs(lz - mz) - m, up = my + B.top - ly - m, dn = ly - (my + B.floor) + 0.4, inn = lx - (mx - B.depth) - m;
      const brow = lx > mx - 3 && (ly > my + B.hi - m || Math.abs(lz - mz) > B.hw - m);      // (behind the mouth's piers and its brow, coming at them from inside)
      if (side < 0) return back(0, 0, lz > mz ? side : -side); if (up < 0) return back(0, up, 0); if (dn < 0) return back(0, -dn, 0); if (inn < 0) return back(-inn, 0, 0); if (brow) return back(-(lx - (mx - 3)), 0, 0);
      continue;
    }
    if (B.block && lx < mx && lx > mx - B.D && Math.abs(lz - mz) < B.W / 2 && ly > my - 2 && ly < my + B.H) { const a1 = mx - lx + r, h1 = my + B.H - ly + r, h0 = ly - (my - 2) + r, z1 = B.W / 2 - Math.abs(lz - mz) + r, mm = Math.min(a1, h1, h0, z1); return mm === a1 ? back(a1, 0, 0) : mm === h1 ? back(0, h1, 0) : mm === h0 ? back(0, -h0, 0) : back(0, 0, lz > mz ? z1 : -z1); }
    for (const b of F.solid) {
      const a0 = lx - b[0] + r, a1 = b[3] - lx + r, h0 = ly - b[1] + r, h1 = b[4] - ly + r, z0 = lz - b[2] + r, z1 = b[5] - lz + r;
      if (a0 > 0 && a1 > 0 && h0 > 0 && h1 > 0 && z0 > 0 && z1 > 0) { const m = Math.min(a0, a1, h0, h1, z0, z1); return m === a0 ? back(-a0, 0, 0) : m === a1 ? back(a1, 0, 0) : m === h0 ? back(0, -h0, 0) : m === h1 ? back(0, h1, 0) : m === z0 ? back(0, 0, -z0) : back(0, 0, z1); }
    }
  }
  return null;
}
