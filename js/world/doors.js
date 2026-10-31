// Door state = generated rule (access + opening hours) overlaid with persistent deltas.
//   generated: a door's access ('open'|'hours'|'residents'|'staff') and hours
//   delta (key = building/door address): { open, broken, brokenAt }
import { solarHour, within } from '../sim/clock.js';

export const doorKey = (bKey, id) => `${bKey}/door:${id}`;

export function doorState(store, planet, b, door, t) {
  const d = store.getDelta(doorKey(b.key, door.id)) || {};
  let locked;
  switch (door.access) {
    case 'open': locked = false; break;
    case 'hours': locked = !within(door.hours || [8, 18], solarHour(planet, t)); break;
    default: locked = true;
  }
  if (d.broken) locked = false;                       // a forced lock no longer locks
  return { open: !!d.open, locked, broken: !!d.broken, access: door.access };
}

export function hasKey(player, b, door) {
  if (!player) return false;
  return door?.access === 'unit' ? player.keys.includes(`${b.key}#u${door.unit}`) : player.keys.includes(b.key);
}

// Can this character pass through right now, and if not, why?
export function canOpen(store, planet, player, b, door, t) {
  const st = doorState(store, planet, b, door, t);
  if (!st.locked) return { ok: true, st };
  if (hasKey(player, b, door)) return { ok: true, st, key: true };
  const why = door.access === 'hours' ? 'Closed — opening hours ' + door.hours.join(':00–') + ':00'
    : door.access === 'residents' ? 'Locked — residents only' : door.access === 'unit' ? 'Locked — private apartment' : 'Locked — staff only';
  return { ok: false, st, why };
}
