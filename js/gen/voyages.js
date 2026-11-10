// The great ships don't only stand over the city (gen/capital.js puts them on station). The freighters, Longshore and Tiller,
// make cargo runs to other towns and back; the Anvil goes out on patrol round the country. Pure in time: where each is at t,
// on a cycle of standing on station, the run out, a stay over the far town (or the patrol's far point), and the run home.
// While it's away its decks can't be boarded and it can't be docked with; a run due while you're aboard is put off (`skip`).
import { hashStr } from '../core/hash.js';

export const VOYAGES = { longshore: { P: 1900, stay: 950, kind: 'run' }, tiller: { P: 2300, stay: 1150, kind: 'run' }, anvil: { P: 2600, stay: 1300, kind: 'patrol', R: 14000 } };
const ease = f => f * f * (3 - 2 * f);
const turn = (a, b, f) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * f;
// C: the ship (gen/capital.js fleetOf); home: where it stands on station { x, y, z, yaw }; dests: towns it runs to [{ x, z, name }];
// ground(x, z) for the height to fly at over the far end; skip: the cycles put off. → { away, x, y, z, yaw, k, phase, dest }
export function voyageAt(C, home, dests, ground, t, skip = null) {
  const V = VOYAGES[C.model]; if (!V) return null;
  const off = hashStr(11, C.model) % V.P, T = t + off, k = Math.floor(T / V.P), u = T - k * V.P;
  if (u < V.stay || skip?.has(k) || (V.kind === 'run' && !dests.length)) return { away: false, ...home, k, phase: 'station' };
  const leg = (V.P - V.stay) / 3, q = u - V.stay, h = hashStr(12 + k, C.model);
  let D;
  if (V.kind === 'run') D = dests[h % dests.length];
  else { const a = (h % 628) / 100; D = { x: home.x + Math.sin(a) * V.R, z: home.z + Math.cos(a) * V.R, name: 'patrol' }; }
  const lift = home.y - ground(home.x, home.z), dy = Math.max(ground(D.x, D.z), 0) + lift, head = Math.atan2(D.x - home.x, D.z - home.z), back = head + Math.PI;
  if (q < leg) { const f = ease(q / leg); return { away: true, x: home.x + (D.x - home.x) * f, z: home.z + (D.z - home.z) * f, y: home.y + (dy - home.y) * f + Math.sin(Math.PI * f) * 500, yaw: turn(home.yaw, head, Math.min(1, q / leg / 0.2)), k, phase: 'out', dest: D }; }
  if (q < 2 * leg) { const f = (q - leg) / leg, a = head + f * 1.2; return { away: true, x: D.x + Math.sin(a) * 600 - Math.sin(head) * 600, z: D.z + Math.cos(a) * 600 - Math.cos(head) * 600, y: dy, yaw: turn(head, a + Math.PI / 2, Math.min(1, f * 4)), k, phase: 'there', dest: D }; }
  const f = ease((q - 2 * leg) / leg), sx = D.x + Math.sin(head + 1.2) * 600 - Math.sin(head) * 600, sz = D.z + Math.cos(head + 1.2) * 600 - Math.cos(head) * 600;
  return { away: true, x: sx + (home.x - sx) * f, z: sz + (home.z - sz) * f, y: dy + (home.y - dy) * f + Math.sin(Math.PI * f) * 500, yaw: f > 0.8 ? turn(back, home.yaw, (f - 0.8) / 0.2) : turn(head + 1.2 + Math.PI / 2, back, Math.min(1, f / 0.15)), k, phase: 'back', dest: D };
}
