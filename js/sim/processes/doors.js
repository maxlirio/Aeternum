// Door processes (dormant-tier jobs): auto-close, and owners repairing forced doors.
import { doorKey } from '../../world/doors.js';
import { hash01 } from '../../core/hash.js';

export const AUTO_CLOSE = 90;                         // s an opened door stays open

export function registerDoorJobs(sched) {
  sched.on('door.close', (job, ctx) => {
    const d = ctx.store.getDelta(job.target);
    if (d?.open) ctx.store.patchDelta(job.target, { open: undefined });
  });
  sched.on('door.repair', (job, ctx) => {
    const d = ctx.store.getDelta(job.target);
    if (!d?.broken) return;
    ctx.store.patchDelta(job.target, { broken: undefined, brokenAt: undefined, open: undefined });
    ctx.store.log({ t: job.at, type: 'door_repaired', where: job.target, owner: job.data.owner, settlement: job.data.settlement });
  });
}

export function openDoor(store, sched, bKey, door, t) {
  const k = doorKey(bKey, door.id);
  store.patchDelta(k, { open: true });
  store.cancelJobs(j => j.kind === 'door.close' && j.target === k);
  store.schedule({ at: t + AUTO_CLOSE, kind: 'door.close', target: k });
}
export function closeDoor(store, bKey, door) {
  const k = doorKey(bKey, door.id);
  store.patchDelta(k, { open: undefined });
  store.cancelJobs(j => j.kind === 'door.close' && j.target === k);
}

// Forcing a lock: the door is broken (stays unlockable) until the owner repairs it,
// and an incident is recorded for the authorities system that will consume it.
export function forceDoor(store, sched, planet, s, b, door, t, who) {
  const k = doorKey(b.key, door.id);
  store.patchDelta(k, { broken: true, brokenAt: t, open: true });
  const delayH = 4 + 26 * hash01(planet.universeSeed, [b.n, door.id, Math.floor(t)]);
  store.schedule({ at: t + delayH * planet.dayLength / 24, kind: 'door.repair', target: k, data: { owner: b.owner, settlement: s.key } });
  store.schedule({ at: t + AUTO_CLOSE, kind: 'door.close', target: k });
  return store.log({ t, type: 'forced_entry', where: k, building: b.key, buildingType: b.type, owner: b.owner, settlement: s.key, settlementName: s.name, by: who.id, byName: who.name, access: door.access, status: 'unresolved' });
}
