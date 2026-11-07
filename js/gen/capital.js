// The fleet: a few ships a kilometre long, standing over the home city. Logical data like any ship: where each one is, the decks inside it
// (a layout the collision world walks), and the solid shapes it has for anything flying near. The models come from tools/assets/capital_kit.py.
import { hashStr } from '../core/hash.js';

// Solid shapes in ship coordinates (x across, y up, z stern to bow): boxes [x0, y0, z0, x1, y1, z1] and rings [z, R, r] about the z axis. They leave the way into the dock open.
const dockGap = (mx, my, mz, hw = 19) => [[-200, -200, -1000, 200, 200, mz - hw], [-200, -200, mz + hw, 200, 200, 1000]];
// A solid hull as boxes, with the way into the dock left open (mouth at x = mx, decks running in 100 m). X, Y: half-width and half-height.
const cut = (X, Y, z0, z1, mx, my, mz) => [[-X, -Y, z0, X, Y, mz - 19], [-X, -Y, mz + 19, X, Y, z1], [-X, -Y, mz - 19, X, my - 7, mz + 19], [-X, my + 11, mz - 19, X, Y, mz + 19], [-X, my - 7, mz - 19, mx - 100, my + 11, mz + 19]];
export const FLEET = {
  bastion: { name: 'Bastion', length: 860, dock: [99.5, 12, -30],
    solid: [[-92, -60, -500, 92, 60, -49], [-92, -60, -11, 92, 60, 430], [-92, -60, -49, 92, 5, -11], [-92, 23, -49, 92, 60, -11], [-92, 10, -49, 2, 23, -11], [32, 58, -240, 68, 132, -40]] },
  meridian: { name: 'Meridian', length: 1310, dock: [112, -20, -300],
    solid: [[-40, -40, -660, 40, 40, 340], [-75, -75, 340, 75, 75, 650], [-360, -3, -520, 360, 3, -264], [16, -30, -319, 112, -23, -281], [16, -8, -319, 112, -1, -281]], rings: [[-170, 210, 18], [60, 240, 18], [260, 190, 18]] },
  longshore: { name: 'Longshore', length: 1570, dock: [58, -18, 650],
    solid: [[-85, -85, -640, 85, 85, 600], [-42, -40, 600, 42, 40, 631], [-42, -40, 669, 42, 40, 742], [-42, -7, 631, 42, 40, 669], [-42, -40, 631, 42, -25, 669], [-42, -20, 631, -38, -7, 669], [-65, -65, -830, 65, 65, -640]] },
  halcyon: { name: 'Halcyon', length: 840, sleek: true, dock: [73, -8, -60],
    solid: [[-72, -48, -432, 72, 48, -79], [-72, -48, -41, 72, 48, 404], [-72, -48, -79, 72, -12, -41], [-72, 3, -79, 72, 48, -41], [-72, -12, -79, -24, 3, -41], [-335, -16, -372, 335, -2, -60]] },
  // the great ones
  anvil: { name: 'Anvil', length: 3500, livery: 0, decks: 'bastion', dock: [441, -6, -330], solid: [...cut(440, 215, -1800, 1100, 441, -6, -330), [-120, -60, 1100, 120, 40, 1700], [-340, 150, -1450, 340, 350, 860], [-80, 350, -1080, 80, 553, -40]] },
  vesper: { name: 'Vesper', length: 5300, livery: 1, decks: 'meridian', dock: [761, -4, -280], solid: [...cut(760, 150, -2730, 1500, 761, -4, -280), [-300, -80, 1500, 300, 100, 2600], [-640, 134, -2150, 640, 300, 1400], [-260, 134, -460, 260, 1200, 60]] },
  tiller: { name: 'Tiller', length: 4260, livery: 2, decks: 'longshore', dock: [214, -14, 1760], solid: [[-310, -170, -2060, 310, 170, 1500], [-130, -170, 1500, 130, 170, 1460 + 40], ...cut(212, 180, 1460, 2100, 214, -14, 1760), [-150, 150, 1480, 150, 294, 2010]] },
  sable: { name: 'Sable', length: 1620, span: 2410, sleek: true, dark: true, decks: 'halcyon', dock: [204, -6, -60], solid: [...cut(200, 90, -640, 960, 204, -6, -60), [-1200, -10, -860, -200, 70, 400], [200, -10, -860, 1200, 70, 400]] },
};
const deckLen = { bastion: 96, meridian: 94, longshore: 92, halcyon: 94 };
const SPOTS = { halcyon: [-1300, 2900, 4300], bastion: [2100, 2300, 900], meridian: [-3200, 3900, -1400], longshore: [900, 5200, -5200], anvil: [7200, 3400, 3200], vesper: [-7600, 5200, 5600], tiller: [-5400, 4300, -8200], sable: [5200, 6400, -6400] };   // east, height above the sea, north of the city

export function fleetOf(planet, S) {
  const seed = hashStr(planet.universeSeed[0], 'fleet');
  return Object.keys(FLEET).map((model, i) => {
    const F = FLEET[model], [dx, h, dz] = SPOTS[model], yaw = ((seed >>> (i * 4)) % 628) / 100, x = S.cx + dx, z = S.cz + dz, y = planet.seaLevel + h;
    const c = Math.cos(yaw), s = Math.sin(yaw), [mx, my, mz] = F.dock, wx = x + mx * c + mz * s, wz = z - mx * s + mz * c, f = Math.atan2(-c, s);   // the decks run inward from the dock's mouth
    const D = deckLen[F.decks || model];
    return { model, name: F.name, x, y, z, yaw, colour: i, length: F.length, sleek: !!F.sleek, deckW: 34, deckD: D, dark: !!F.dark, livery: F.livery, ship: { id: `ship:${S.key}:fleet${i}`, model: (F.decks || model) + '_decks', name: F.name, at: { c: [wx + Math.sin(f) * D / 2, y + my, wz + Math.cos(f) * D / 2], facing: f }, field: true, fleet: true, colour: 4, owner: 'fleet', ownerName: 'the Fleet' } };
  });
}

// If (px, py, pz) is inside a ship's solid parts: the shortest way out of it, in world coordinates. Otherwise null.
export function fleetContact(list, px, py, pz, r = 3) {
  for (const C of list) {
    const dx = px - C.x, dz = pz - C.z; const reach = Math.max(1200, (FLEET[C.model].span || FLEET[C.model].length) * 0.7); if (dx * dx + dz * dz > reach * reach) continue;
    const c = Math.cos(C.yaw), s = Math.sin(C.yaw), lx = dx * c - dz * s, lz = dx * s + dz * c, ly = py - C.y, F = FLEET[C.model];
    const back = (ox, oy, oz) => [ox * c + oz * s, oy, -ox * s + oz * c];
    for (const b of F.solid) {
      const a0 = lx - b[0] + r, a1 = b[3] - lx + r, h0 = ly - b[1] + r, h1 = b[4] - ly + r, z0 = lz - b[2] + r, z1 = b[5] - lz + r;
      if (a0 > 0 && a1 > 0 && h0 > 0 && h1 > 0 && z0 > 0 && z1 > 0) { const m = Math.min(a0, a1, h0, h1, z0, z1); return m === a0 ? back(-a0, 0, 0) : m === a1 ? back(a1, 0, 0) : m === h0 ? back(0, -h0, 0) : m === h1 ? back(0, h1, 0) : m === z0 ? back(0, 0, -z0) : back(0, 0, z1); }
    }
    for (const [rz, R, t] of F.rings || []) { const q = Math.hypot(lx, ly) - R, w = lz - rz; if (Math.hypot(q, w) < t + r) { const d = Math.hypot(q, w) || 1, k = (t + r - d) / d, nl = Math.hypot(lx, ly) || 1; return back(q * k * lx / nl, q * k * ly / nl, w * k); } }
  }
  return null;
}
