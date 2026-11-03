// Hurting people. Everyone has health (100); a hit takes some away, and they heal over a
// day or two. Hard enough and they go down for a while; to nothing and they die — through
// the same path as any other death in town (household, job, register, family). An attack
// is a crime: an `assault` incident with witnesses (the victim, if they live, is one),
// handled by the law process like a break-in, but weighed far more heavily.
//   hurt/<person> = { hp, t, downUntil? }       (health at time t; heals at HEAL per day)
import { lifeKey, refreshLife } from '../../world/town.js';
import { relationTo } from './life.js';

export const HEAL = 70;                            // hp per planet day
// weapon: damage per hit, reach (m), seconds between hits, ranged?
export const WEAPONS = {
  fists:   { name: 'Fists', dmg: 9, reach: 1.4, every: 0.55, ranged: false },
  knife:   { name: 'Combat knife', dmg: 34, reach: 1.6, every: 0.5, ranged: false },
  baton:   { name: 'Shock baton', dmg: 24, reach: 1.9, every: 0.7, ranged: false, stun: 8 },
  pistol:  { name: 'Slug pistol', dmg: 46, reach: 60, every: 0.35, ranged: true, spread: 0.012 },
  carbine: { name: 'Pulse carbine', dmg: 62, reach: 140, every: 0.12, ranged: true, spread: 0.02 },
};
export const hurtKey = id => `hurt/${id}`;
export function healthOf(store, planet, id, t) {
  const h = store.getDelta(hurtKey(id));
  if (!h) return 100;
  return Math.min(100, h.hp + Math.max(0, t - h.t) / planet.dayLength * HEAL);
}
export const isDown = (store, id, t) => (store.getDelta(hurtKey(id))?.downUntil ?? -1) > t;

// A hit on resident p for dmg at time t. → { hp, down, killed }
export function strike(ctx, p, weapon, t, witnesses = []) {
  const { store, planet, pop, s } = ctx, W = WEAPONS[weapon] || WEAPONS.fists;
  const before = healthOf(store, planet, p.id, t), hp = Math.max(0, before - W.dmg);
  const down = hp > 0 && (hp < 35 || !!W.stun);
  store.patchDelta(hurtKey(p.id), { hp, t, downUntil: down ? t + (W.stun ? W.stun * 6 : 60 + 240 * (1 - hp / 35)) : undefined });
  const killed = hp <= 0;
  if (killed) kill(ctx, p, t, weapon);
  // one incident per victim per few minutes (a flurry of blows is one assault)
  const recent = store.events.findLast?.(e => e.type === 'assault' && e.victim === p.id && e.by === store.player.id && t - e.t < 300);
  if (recent) { if (killed && !recent.killed) recent.killed = true; recent.hits = (recent.hits || 1) + 1; store.dirty.meta = true; return { hp, down, killed, incident: null }; }
  const w = witnesses.filter(x => x.id !== p.id);
  if (!killed) w.push({ id: p.id, name: p.name, dist: 0, victim: true });
  const inc = store.log({ t, type: 'assault', victim: p.id, victimName: p.name, killed, weapon, building: null, buildingType: 'street', owner: p.name, settlement: s.key, settlementName: s.name,
    by: store.player.id, byName: store.player.name, witnesses: w, status: 'unresolved', rel: relationTo(store.player, p) });
  return { hp, down, killed, incident: inc };
}

// The death of a resident, now: like a death in liveDay, but by your hand.
export function kill(ctx, p, t, weapon) {
  const { store, pop } = ctx, L = store.getDelta(lifeKey(pop.s)) || {};
  L.people ??= {}; L.hh ??= {}; L.added ??= []; L.serial ??= 0; L.nextHH ??= pop.base.households.length;
  L.people[p.id] = { id: p.id, ...L.people[p.id], gone: { t, why: 'killed' } };
  const h = L.hh[p.household] ??= JSON.parse(JSON.stringify(pop.householdById.get(p.household)));
  h.members = h.members.filter(id => id !== p.id);
  if (p.job) store.patchDelta(`job/${p.job}`, { holder: null, since: undefined, vacatedAt: t });
  store.patchDelta(lifeKey(pop.s), L);
  store.log({ t, type: 'died', who: p.id, whoName: p.name, age: p.age, b: p.homeB, cause: 'killed', weapon, rel: relationTo(store.player, p) });
  refreshLife(pop, store, t);
}
