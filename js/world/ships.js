// Ships as they are now: generated on their pads (gen/ships.js), with what has happened
// laid over — bought, stolen, flown, landed somewhere else, ramp raised or forced.
// `ship/<id>` = { at?: { c: [x, y, z] ground point under the centre, facing }, flying?,
//                 owner?, ownerName?, forSale?, ramp?: 'up'|'down', forced? }
import { shipsAt, shipPlan, SHIP_PRICE, PRICES, tripOf } from '../gen/ships.js';
import { within, solarHour } from '../sim/clock.js';
import { surfaceHeight } from '../gen/surface.js';

export const shipKey = id => `ship/${id}`;
// With t, a firm's ship carries `trip` (gen/ships.js tripOf): it is off its pad while on a cargo run.
export function shipsIn(store, planet, s, t = null) {
  return shipsAt(planet, s).map(sh => {
    const d = store.getDelta(shipKey(sh.id)), cur = d ? { ...sh, ...d } : sh;
    if (t !== null && cur.owner?.startsWith('firm:') && !cur.flying) cur.trip = tripOf(planet, cur, t, centreOf(s, cur), cur.skip);
    return cur;
  });
}
export const onRun = sh => !!sh.trip && sh.trip.phase !== 'pad';
// You're aboard when its run is due: it stays on the pad today.
export function holdRun(store, sh) { store.patchDelta(shipKey(sh.id), { skip: sh.trip.D }); }
export const shipIsYours = (sh, player) => sh.owner === 'you:' + player.id;

// Ramp: yours or for sale — down unless you raised it. A firm's — down while its crew
// works (06:00–18:00), raised and locked otherwise. Forced open stays open.
export function rampDown(sh, planet, t, player) {
  if (sh.forced) return true;
  if (sh.ramp) return sh.ramp === 'down';
  if (sh.forSale || shipIsYours(sh, player)) return true;
  return within([6, 18], solarHour(planet, t));
}
export const rampLocked = (sh, player) => !sh.forSale && !shipIsYours(sh, player) && !sh.forced;
export function setRamp(store, sh, down) { store.patchDelta(shipKey(sh.id), { ramp: down ? 'down' : 'up' }); }

// The ship's frame in settlement space: on its pad, or wherever it last landed.
export function frameOf(s, sh) {
  const L = shipPlan(sh.model).layout;
  if (!sh.at) return { O: sh.O, ex: sh.ex, ez: sh.ez, base: s.h + 0.12 };
  const [cx, cy, cz] = sh.at.c, f = sh.at.facing;
  const [u0, v0] = s.toLocal(cx, cz), [u1, v1] = s.toLocal(cx + Math.sin(f), cz + Math.cos(f));
  const ez = [u1 - u0, v1 - v0], ex = [ez[1], -ez[0]];
  return { O: [u0 - ex[0] * L.W / 2 - ez[0] * L.D / 2, v0 - ex[1] * L.W / 2 - ez[1] * L.D / 2], ex, ez, base: cy };
}
// A landed ship as a structure for the collision world, furniture and rooms (building-shaped).
// Given the planet, the ramp reaches down to the ground actually under its foot (a ship
// resting on uneven ground stands on its highest foot, so the stern may be above the grass).
export function structureOf(s, sh, doorPassable, planet = null) {
  let plan = shipPlan(sh.model);
  const fr = frameOf(s, sh), { W, D } = plan.layout;
  if (planet) {
    const R = plan.layout.ramp, lx = (R.x0 + R.x1) / 2, lz = R.z0, u = fr.O[0] + fr.ex[0] * lx + fr.ez[0] * lz, v = fr.O[1] + fr.ex[1] * lx + fr.ez[1] * lz;
    const [x, z] = s.toWorld(u, v), drop = Math.min(3, Math.max(0, fr.base - surfaceHeight(planet, x, z)));
    if (drop > 0.05) plan = { ...plan, ramps: plan.ramps.map(r => ({ ...r, y0: -drop })) };
  }
  const cs = [[0, 0], [W, 0], [0, D], [W, D]].map(([x, z]) => [fr.O[0] + fr.ex[0] * x + fr.ez[0] * z, fr.O[1] + fr.ex[1] * x + fr.ez[1] * z]);
  const rect = [Math.min(...cs.map(c => c[0])), Math.min(...cs.map(c => c[1])), Math.max(...cs.map(c => c[0])), Math.max(...cs.map(c => c[1]))];
  return { key: sh.id, n: -1, type: 'ship', owner: sh.ownerName, ship: sh, plan, O: fr.O, ex: fr.ex, ez: fr.ez, w: W, d: D, rect, base: fr.base, doorPassable };
}
// World-space centre (ground point) and heading of a landed ship.
export function centreOf(s, sh) {
  if (sh.at) return { c: sh.at.c.slice(), facing: sh.at.facing };
  const L = shipPlan(sh.model).layout, fr = frameOf(s, sh);
  const u = fr.O[0] + fr.ex[0] * L.W / 2 + fr.ez[0] * L.D / 2, v = fr.O[1] + fr.ex[1] * L.W / 2 + fr.ez[1] * L.D / 2;
  const [x, z] = s.toWorld(u, v), [x1, z1] = s.toWorld(u + fr.ez[0], v + fr.ez[1]);
  return { c: [x, fr.base, z], facing: Math.atan2(x1 - x, z1 - z) };
}

export function buyShip(store, sh, t) {
  const p = store.player;
  if (!sh.forSale) return { ok: false, why: 'It isn\'t for sale' };
  const price = PRICES[sh.model] || SHIP_PRICE;
  if ((p.credits ?? 0) < price) return { ok: false, why: `It costs ${price} cr; you have ${p.credits ?? 0}` };
  p.credits -= price; store.touchPlayer();
  store.patchDelta(shipKey(sh.id), { owner: 'you:' + p.id, ownerName: 'you', forSale: false });
  store.log({ t, type: 'ship_bought', who: p.id, whoName: p.name, ship: sh.name, price });
  return { ok: true };
}
export function stealShip(store, s, sh, t, witnesses) {
  const p = store.player;
  store.patchDelta(shipKey(sh.id), { owner: 'you:' + p.id, ownerName: 'you', forSale: false, stolenFrom: sh.ownerName });
  return store.log({ t, type: 'theft', building: sh.firmB || sh.id, buildingType: 'hangar', owner: sh.ownerName, settlement: s.key, settlementName: s.name,
    by: p.id, byName: p.name, value: PRICES[sh.model] || SHIP_PRICE, items: [{ id: 'ship', n: 1 }], ship: sh.id, witnesses, shop: false, status: 'unresolved' });
}
export function launch(store, sh) { store.patchDelta(shipKey(sh.id), { flying: true, forced: undefined }); }
export function land(store, sh, c, facing) { store.patchDelta(shipKey(sh.id), { flying: undefined, at: { c: c.slice(), facing } }); }
export function forceRamp(store, sh) { store.patchDelta(shipKey(sh.id), { forced: true }); }
