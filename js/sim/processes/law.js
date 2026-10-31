// Law and order as dormant-tier jobs. An incident (event) becomes a case (delta) through
// reports — from witnesses, or from whoever discovers the damage — then an
// investigation that either identifies the suspect and fines them, or goes cold.
// A fine is owed, payable at the security office within PAY_DAYS. Unpaid, it becomes a
// warrant; a warrant is served by arrest — in person by an officer if you are in the
// game (render-side pursuit, main.js), or wherever you are if you are away. Arrest
// settles your fines from your credits and holds you in the cell for a few hours.
// Every decision is a hash of (incident, person), every step a scheduled job, so the
// outcome is the same whether you watch it happen or come back days later.
import { hash01, hashStr } from '../../core/hash.js';
import { dayIndex, dayPlan, whereAt } from '../../gen/schedule.js';
import { offenceFor } from '../../gen/polity.js';
import { leaveJob } from './work.js';
import { holdingCell } from '../../gen/custody.js';
import { doorKey } from '../../world/doors.js';

const MIN = 60, HOUR = 3600;
export const PAY_DAYS = 3;                     // planet days to pay a fine before it becomes a warrant
const caseKey = id => `case/${id}`;
const roll = (ctx, ...parts) => hash01(ctx.planet.universeSeed, parts.map(p => typeof p === 'number' ? p : hashStr(7, String(p))));

// Earliest time after t when someone who lives or works in the building (or one of
// `who`) is in it.
export function firstPresence(pop, bKey, t, who = pop.people.filter(p => p.homeB === bKey || (p.job && pop.jobById.get(p.job).b === bKey))) {
  let best = Infinity, by = null;
  const D0 = dayIndex(pop.planet, t);
  for (const p of who) for (let D = D0; D <= D0 + 2; D++) {
    const seg = dayPlan(pop, p, D).segs.find(g => g.type === 'at' && g.place.b?.key === bKey && g.t1 > t);
    if (seg) { const at = Math.max(seg.t0, t); if (at < best) { best = at; by = p; } break; }
  }
  return by ? { t: best, person: by } : null;
}

// Called right after a forced_entry incident is logged.
export function lodgeIncident(ctx, inc) {
  const { store, pop, polity } = ctx;
  let reports = 0;
  for (const w of inc.witnesses || []) {
    const p = pop.byId.get(w.id), officer = p?.job && pop.jobById.get(p.job).security;
    if (officer) {
      store.schedule({ at: inc.t + 20, kind: 'law.report', target: caseKey(inc.id), data: { incident: inc.id, witness: w.id, officer: true } }); reports++;
      if (store.player?.id === inc.by && !store.player.warrant) issueWarrant(ctx, inc.t, `seen by ${p.name} breaking in`, p.id);
      continue;
    }
    if (roll(ctx, inc.id, w.id, 'report') < polity.reportRate) {
      store.schedule({ at: inc.t + (3 + 37 * roll(ctx, inc.id, w.id, 'delay')) * MIN, kind: 'law.report', target: caseKey(inc.id), data: { incident: inc.id, witness: w.id } });
      reports++;
    }
  }
  if (!reports) { // nobody reported it: it is found when someone next comes in
    const f = firstPresence(pop, inc.building, inc.t + 60);
    store.schedule({ at: f ? f.t : inc.t + 24 * HOUR, kind: 'law.discover', target: caseKey(inc.id), data: { incident: inc.id, by: f?.person.id || null } });
  }
}

export function knowsYou(ctx, witnessId, player) {
  if (!player) return 0.35;
  const p = ctx.pop.byId.get(witnessId);
  if (player.family?.parents.includes(witnessId) || player.family?.siblings.includes(witnessId)) return 1;
  if (p && (p.homeB === player.home || p.home === player.homeUnit)) return 0.8;   // neighbours
  return 0.35;
}

function openCase(ctx, inc, t, reporter) {
  const { store, polity } = ctx;
  const k = caseKey(inc.id);
  if (store.getDelta(k)) return store.getDelta(k);
  store.log({ t, type: 'case_opened', incident: inc.id, authority: polity.securityName, reporter, settlementName: inc.settlementName, owner: inc.owner });
  store.schedule({ at: t + (24 + 24 * roll(ctx, inc.id, 'inv')) * HOUR, kind: 'law.investigate', target: k, data: { incident: inc.id } });
  return store.patchDelta(k, { status: 'open', opened: t, identified: false, reports: 0 });
}

function charge(ctx, inc, t, delay) {
  const k = caseKey(inc.id);
  const c = ctx.store.getDelta(k);
  if (c?.charged) return;
  ctx.store.patchDelta(k, { identified: true, charged: true });
  ctx.store.schedule({ at: t + delay, kind: 'law.charge', target: k, data: { incident: inc.id } });
}

export function registerLawJobs(sched) {
  const incident = (ctx, id) => ctx.store.events.find(e => e.id === id);

  sched.on('law.report', (job, ctx) => {
    const inc = incident(ctx, job.data.incident); if (!inc) return;
    const p = ctx.pop.byId.get(job.data.witness);
    const c = openCase(ctx, inc, job.at, p?.name || 'a witness');
    ctx.store.patchDelta(caseKey(inc.id), { reports: (c.reports || 0) + 1 });
    const you = ctx.store.player?.id === inc.by ? ctx.store.player : null;
    const identifies = job.data.officer || roll(ctx, inc.id, job.data.witness, 'id') < knowsYou(ctx, job.data.witness, you);
    if (identifies) charge(ctx, inc, job.at, job.data.officer ? 2 * MIN : (4 + 16 * roll(ctx, inc.id, 'charge')) * HOUR);
  });

  sched.on('law.discover', (job, ctx) => {
    const inc = incident(ctx, job.data.incident); if (!inc) return;
    const p = job.data.by ? ctx.pop.byId.get(job.data.by) : null;
    ctx.store.log({ t: job.at, type: 'break_in_discovered', incident: inc.id, by: p?.name || inc.owner, owner: inc.owner, settlementName: inc.settlementName });
    openCase(ctx, inc, job.at, p?.name || inc.owner);
  });

  sched.on('law.investigate', (job, ctx) => {
    const inc = incident(ctx, job.data.incident); if (!inc) return;
    const c = ctx.store.getDelta(caseKey(inc.id));
    if (!c || c.charged) return;
    if (roll(ctx, inc.id, 'evidence') < ctx.polity.evidenceRate) charge(ctx, inc, job.at, HOUR);
    else {
      ctx.store.patchDelta(caseKey(inc.id), { status: 'cold' });
      ctx.store.log({ t: job.at, type: 'case_cold', incident: inc.id, authority: ctx.polity.securityName, owner: inc.owner });
    }
  });

  sched.on('law.charge', (job, ctx) => { const inc = incident(ctx, job.data.incident); if (inc) applyCharge(ctx, inc, job.at); });

  sched.on('law.due', (job, ctx) => {
    const pl = ctx.store.player;
    if (pl?.fines?.some(f => f.incident === job.data.incident) && !pl.warrant && !pl.custody) issueWarrant(ctx, job.at, 'an unpaid fine');
  });

  sched.on('law.serve', (job, ctx) => {
    const pl = ctx.store.player;
    if (!pl?.warrant || pl.custody) return;
    if (ctx.offline) return arrest(ctx, job.at, { by: officerOnDuty(ctx, job.at)?.name });   // they find you wherever you are
    ctx.onServe?.(job.at);                                                                    // in game: an officer comes for you
    ctx.store.schedule({ at: job.at + 6 * HOUR, kind: 'law.serve', target: 'player/warrant', data: {} });
  });

  sched.on('law.release', (job, ctx) => {
    const pl = ctx.store.player;
    if (!pl?.custody) return;
    pl.custody = null;
    const cell = holdingCell(ctx.planet, ctx.s, ctx.polity);
    for (const d of cell.doors) ctx.store.patchDelta(doorKey(cell.b.key, d.id), { held: undefined, open: true });
    ctx.store.schedule({ at: job.at + 90, kind: 'door.close', target: doorKey(cell.b.key, cell.doors[0].id), data: {} });
    if (ctx.offline && ctx.doorstepOf) pl.pos = ctx.doorstepOf(cell.b.key).slice();
    ctx.store.log({ t: job.at, type: 'released', who: pl.id, whoName: pl.name, authority: ctx.polity.securityName });
    ctx.store.touchPlayer();
  });
}

// The case is proven: a fine to pay, and an entry on the record.
function applyCharge(ctx, inc, t) {
  const k = caseKey(inc.id), c = ctx.store.getDelta(k);
  if (c?.status === 'closed') return;
  const law = ctx.polity.laws[offenceFor(inc)];
  ctx.store.patchDelta(k, { status: 'closed', closed: t, fine: law.fine });
  const pl = ctx.store.player, you = pl?.id === inc.by;
  if (you) {
    const due = t + PAY_DAYS * ctx.planet.dayLength;
    pl.fines = [...(pl.fines || []), { incident: inc.id, amount: law.fine, offence: law.label, t, due }];
    pl.record = [...(pl.record || []), { t, offence: law.label, fine: law.fine, incident: inc.id, authority: ctx.polity.securityName }];
    ctx.store.schedule({ at: due, kind: 'law.due', target: k, data: { incident: inc.id } });
    ctx.store.touchPlayer();
  }
  ctx.store.log({ t, type: 'fined', incident: inc.id, who: inc.by, whoName: inc.byName, offence: law.label, amount: law.fine, currency: ctx.polity.currency, authority: ctx.polity.securityName, due: you ? t + PAY_DAYS * ctx.planet.dayLength : undefined });
  // employers hear about it: robbing your own workplace, or any conviction while in security, costs you the job
  const pj = you ? pl.job : null;
  if (pj && (inc.owner === pj.employer || pj.employer === 'Civic Security')) leaveJob(ctx, t, pj.employer === 'Civic Security' ? 'a criminal conviction' : `breaking into ${inc.owner}'s premises`, 'dismissed');
}

export function issueWarrant(ctx, t, reason, officer = null) {
  const pl = ctx.store.player;
  pl.warrant = { t, reason, officer };
  ctx.store.log({ t, type: 'warrant', who: pl.id, whoName: pl.name, reason, authority: ctx.polity.securityName });
  ctx.store.schedule({ at: t + (1 + 5 * roll(ctx, pl.id, t, 'serve')) * HOUR, kind: 'law.serve', target: 'player/warrant', data: {} });
  ctx.store.touchPlayer();
}

// An officer at work right now (for warrants served while you're away).
export function officerOnDuty(ctx, t) {
  const { pop } = ctx;
  return pop.people.find(p => p.job && pop.jobById.get(p.job).security && ['on duty', 'on patrol'].includes(whereAt(pop, p, t).activity)) || null;
}

export const finesOwed = pl => (pl.fines || []).reduce((n, f) => n + f.amount, 0);

// Paying at the security office clears your fines — and any warrant they caused.
export function payFines(ctx, t) {
  const pl = ctx.store.player, total = finesOwed(pl);
  if (!total) return { ok: false, why: 'You owe nothing.' };
  if ((pl.credits ?? 0) < total) return { ok: false, why: `You owe ${total} cr and have ${pl.credits} cr.` };
  pl.credits -= total; pl.fines = [];
  const cleared = !!pl.warrant; pl.warrant = null;
  ctx.store.log({ t, type: 'fines_paid', who: pl.id, whoName: pl.name, amount: total, authority: ctx.polity.securityName, cleared });
  ctx.store.touchPlayer();
  return { ok: true, total, cleared };
}

// Arrest: proven cases are charged on the spot, every fine is taken from your credits
// (into debt if need be), and you're held for a few planet-hours — longer if you ran.
export function arrest(ctx, t, { resisted = false, by = null } = {}) {
  const { store, planet, polity } = ctx, pl = store.player;
  for (const inc of store.events.filter(e => e.type === 'forced_entry' && e.by === pl.id)) {
    const c = store.getDelta(caseKey(inc.id));
    if (c?.charged && c.status !== 'closed') applyCharge(ctx, inc, t);
  }
  const total = finesOwed(pl);
  pl.credits = (pl.credits ?? 0) - total; pl.fines = [];
  if (resisted) pl.record = [...pl.record, { t, offence: 'Evading arrest', fine: 0, authority: polity.securityName }];
  const hours = Math.min(8, 1 + total / 500 + (resisted ? 2 : 0));
  const until = t + hours * planet.dayLength / 24;
  pl.custody = { from: t, until };
  pl.custodyLog = [...(pl.custodyLog || []), { from: t, to: until }];
  pl.warrant = null;
  const cell = holdingCell(planet, ctx.s, polity);
  for (const d of cell.doors) store.patchDelta(doorKey(cell.b.key, d.id), { held: true, open: undefined });
  store.cancelJobs(j => j.kind === 'law.release');
  store.schedule({ at: until, kind: 'law.release', target: 'player/custody', data: {} });
  pl.pos = cell.pos.slice();
  store.log({ t, type: 'arrested', who: pl.id, whoName: pl.name, by, paid: total, hours: Math.round(hours * 10) / 10, resisted, authority: polity.securityName });
  if (pl.job?.employer === 'Civic Security') leaveJob(ctx, t, 'a criminal conviction', 'dismissed');
  store.touchPlayer();
  return cell;
}
