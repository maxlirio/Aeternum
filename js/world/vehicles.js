// Vehicles as they stand now: the generated parked bikes (gen/vehicles.js) with what has
// happened to them laid over — moved, bought, stolen. Only a bike that has changed is
// stored: `veh/<id>` = { pos, facing, owner?, ownerName?, forSale? }.
import { parkedVehicles, SPEEDER, typeOf } from '../gen/vehicles.js';

export const vehKey = id => `veh/${id}`;

export function vehiclesIn(store, planet, s) {
  return parkedVehicles(planet, s).map(v => {
    const d = store.getDelta(vehKey(v.id));
    return d ? { ...v, ...d } : v;
  });
}
export const isYours = (v, player) => v.owner === 'you:' + player.id;

// Leave a bike somewhere (after riding it).
export function park(store, v, pos, facing) { store.patchDelta(vehKey(v.id), { pos: pos.slice(), facing }); }

// Buy from a dealer: the bike becomes yours where it stands.
export function buyVehicle(store, v, t) {
  const p = store.player;
  if (!v.forSale) return { ok: false, why: 'It isn\'t for sale' };
  const price = typeOf(v).price;
  if ((p.credits ?? 0) < price) return { ok: false, why: `It costs ${price} cr; you have ${p.credits ?? 0}` };
  p.credits -= price; store.touchPlayer();
  store.patchDelta(vehKey(v.id), { owner: 'you:' + p.id, ownerName: 'you', forSale: false, boughtAt: t });
  store.log({ t, type: 'vehicle_bought', who: p.id, whoName: p.name, seller: v.ownerName, price, vehicleType: v.type });
  return { ok: true };
}

// Hotwire someone else's: it's theft (an incident, like taking from a cupboard).
export function stealVehicle(store, s, v, t, witnesses) {
  const p = store.player;
  store.patchDelta(vehKey(v.id), { owner: 'you:' + p.id, stolenFrom: v.ownerName, ownerName: 'you', forSale: false });
  return store.log({ t, type: 'theft', building: v.b, buildingType: v.forSale ? 'hangar' : 'house', owner: v.ownerName, settlement: s.key, settlementName: s.name,
    by: p.id, byName: p.name, value: typeOf(v).price, items: [{ id: v.type || 'speeder', n: 1 }], vehicle: v.id, witnesses, shop: false, status: 'unresolved' });
}
