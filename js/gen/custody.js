// The holding cell in a town's security office: a ground-floor room with a single
// interior door and, preferably, no furniture anyone works or sits at. Chosen from the
// floor plan's logical data (rooms, doors, anchors) — never from geometry. Every door of
// the room locks while someone is held; nobody is given a desk in it (population.js).
import { buildingPlan } from './building.js';
import { buildingToWorld } from './place.js';

const cache = new Map();
export function holdingCell(planet, s, polity) {
  const ck = planet.universeSeed.join(':') + '|' + polity.security;
  if (cache.has(ck)) return cache.get(ck);
  const b = s.buildings.find(x => x.key === polity.security);
  if (!b) return null;
  const plan = buildingPlan(planet, s, b), ent = plan.doors[plan.entrance];
  const used = new Map();   // furniture per room: an empty room makes the best cell
  for (const pr of plan.props) if (pr.k === 0) used.set(pr.room, (used.get(pr.room) || 0) + 1);
  const cand = plan.rooms.filter(r => r.k === 0 && r.i !== ent.rooms[0] && r.doors.length === 1 && plan.doors[r.doors[0]].kind === 'interior')
    .sort((a, c) => ((used.get(a.i) || 0) - (used.get(c.i) || 0)) || area(a) - area(c));
  const room = cand[0] || plan.rooms.find(r => r.k === 0 && r.i !== ent.rooms[0]);
  if (!room) return null;
  const doors = room.doors.map(i => plan.doors[i]);
  const lx = (room.rect[0] + room.rect[2]) / 2, lz = (room.rect[1] + room.rect[3]) / 2;
  const cell = { b, plan, room, doors, pos: buildingToWorld(s, b, lx, 0, lz), spot: { k: 0, room: room.i, x: lx, z: lz } };
  cache.set(ck, cell);
  return cell;
}
const area = r => (r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1]);
