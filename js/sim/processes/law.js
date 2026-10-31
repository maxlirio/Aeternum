// Law and order as dormant-tier jobs. An incident (event) becomes a case (delta) through
// reports — from witnesses, or from whoever discovers the damage — then an
// investigation that either identifies the suspect and fines them, or goes cold.
// Every decision is a hash of (incident, person), every step a scheduled job, so the
// outcome is the same whether you watch it happen or come back days later.
import { hash01, hashStr } from '../../core/hash.js';
import { dayIndex, dayPlan } from '../../gen/schedule.js';
import { offenceFor } from '../../gen/polity.js';

const MIN = 60, HOUR = 3600;
const caseKey = id => `case/${id}`;
const roll = (ctx, ...parts) => hash01(ctx.planet.universeSeed, parts.map(p => typeof p === 'number' ? p : hashStr(7, String(p))));

// Earliest time after t when someone who lives or works in the building is in it.
export function firstPresence(pop, bKey, t) {
  const who = pop.people.filter(p => p.homeB === bKey || (p.job && pop.jobById.get(p.job).b === bKey));
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
    if (officer) { store.schedule({ at: inc.t + 20, kind: 'law.report', target: caseKey(inc.id), data: { incident: inc.id, witness: w.id, officer: true } }); reports++; continue; }
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

function knowsYou(ctx, witnessId, player) {
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

  sched.on('law.charge', (job, ctx) => {
    const inc = incident(ctx, job.data.incident); if (!inc) return;
    const law = ctx.polity.laws[offenceFor(inc)];
    const k = caseKey(inc.id);
    ctx.store.patchDelta(k, { status: 'closed', closed: job.at, fine: law.fine });
    const pl = ctx.store.player;
    if (pl && pl.id === inc.by) {
      pl.credits = (pl.credits ?? 0) - law.fine;
      pl.record = [...(pl.record || []), { t: job.at, offence: law.label, fine: law.fine, incident: inc.id, authority: ctx.polity.securityName }];
      ctx.store.touchPlayer();
    }
    ctx.store.log({ t: job.at, type: 'fined', incident: inc.id, who: inc.by, whoName: inc.byName, offence: law.label, amount: law.fine, currency: ctx.polity.currency, authority: ctx.polity.securityName });
  });
}
