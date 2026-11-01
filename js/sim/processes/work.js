// Work, as dormant-tier jobs. You apply; the workplace's head reviews it the next time
// they are actually at work (their closed-form schedule says when); you're hired or
// turned down for a stated reason. A held job is a chain of `work.shift` jobs, one per
// shift, each settled at the shift's end from how long you were really there:
//   online  — seconds the player stood inside the workplace during the shift (attend())
//   offline — the overlap of the shift with an absence spent on the 'work' activity
// Both are sums over time, so settling is the same however the time is sliced.
import { hash01, hashStr } from '../../core/hash.js';
import { planetHours } from '../clock.js';
import { roleFor, titleOf, wageOf, headOf, firstShiftAfter, nextShift, assess, PROMOTE, SKILL_TAU, ROLES } from '../../gen/careers.js';
import { firstPresence, knowsYou } from './law.js';
import { refreshLife } from '../../world/town.js';

const HOUR = 3600, DAY = 86400;
export const REAPPLY = 2 * DAY;               // s before you can apply to the same place again
export const MISS_LIMIT = 3;                  // consecutive missed shifts before you're let go
const roll = (ctx, ...parts) => hash01(ctx.planet.universeSeed, parts.map(p => typeof p === 'number' ? p : hashStr(11, String(p))));

export function applyFor(ctx, job, t) {
  const { store, pop } = ctx, pl = store.player;
  if (pl.job?.id === job.id) return { ok: false, why: 'You already work there.' };
  if (pl.applications.some(a => a.job === job.id && a.status === 'pending')) return { ok: false, why: 'Your application is already in.' };
  const last = pl.applications.filter(a => a.b === job.b).at(-1);
  if (last && t - last.t < REAPPLY) return { ok: false, why: 'You applied there recently — try again in a day or two.' };
  const head = headOf(pop, job.b);
  const seen = head && head.id !== pl.id ? firstPresence(pop, job.b, t + 10 * 60, [head]) : null;
  const at = seen ? seen.t + (0.3 + roll(ctx, job.id, t, 'read')) * HOUR : t + (6 + 14 * roll(ctx, job.id, t, 'owner')) * HOUR;
  const reviewer = seen ? head.name : pop.buildingByKey.get(job.b).owner;
  const app = { job: job.id, b: job.b, title: job.title, employer: job.employer, t, status: 'pending', reviewer, n: pl.applications.length };
  pl.applications = [...pl.applications, app];
  store.schedule({ at, kind: 'work.review', target: `job/${job.id}`, data: { job: job.id, n: app.n } });
  store.touchPlayer();
  return { ok: true, at, reviewer };
}

function takeJob(ctx, job, t) {
  const { store, planet } = ctx, pl = store.player;
  if (pl.job) leaveJob(ctx, t, 'took a job at ' + job.employer, 'resigned');
  const R = roleFor(job), seed = hash01(planet.universeSeed, [hashStr(13, job.id), hashStr(17, pl.id)]);
  const off1 = Math.floor(seed * 7), off2 = (off1 + 3 + Math.floor(seed * 1000) % 2) % 7;  // two days off a week
  pl.job = { id: job.id, b: job.b, employer: job.employer, title: job.title, hours: job.hours, offDays: [off1, off2], rank: 0, wage: wageOf(job, 0),
    skill: R.skill, since: t, good: 0, missed: 0, shifts: 0, worked: 0, earned: 0 };
  if (!pl.keys.includes(job.b)) { pl.keys = [...pl.keys, job.b]; pl.job.key = true; }   // staff keys, returned when you leave
  store.patchDelta(`job/${job.id}`, { holder: pl.id, since: t, takenAt: t, vacatedAt: undefined });
  scheduleShift(ctx, firstShiftAfter(planet, pl.job, t));
  if (ctx.pop?.base) refreshLife(ctx.pop, store, t);     // the town now sees the post as yours
  store.touchPlayer();
}

export function leaveJob(ctx, t, why, type = 'resigned') {
  const { store } = ctx, pl = store.player, pj = pl.job;
  if (!pj) return;
  store.cancelJobs(j => j.kind === 'work.shift');
  store.patchDelta(`job/${pj.id}`, { holder: null, since: undefined, vacatedAt: t });
  if (pj.key) pl.keys = pl.keys.filter(k => k !== pj.b);
  pl.career = [...(pl.career || []), { title: titleOf(pj), employer: pj.employer, from: pj.since, to: t, shifts: pj.shifts, why: type }];
  pl.job = null; pl.shift = null;
  if (ctx.pop?.base) refreshLife(ctx.pop, store, t);
  store.log({ t, type, who: pl.id, whoName: pl.name, title: titleOf(pj), employer: pj.employer, why });
  store.touchPlayer();
}

function scheduleShift(ctx, sh) {
  const pl = ctx.store.player;
  pl.shift = { t0: sh.t0, t1: sh.t1, present: 0 };
  ctx.store.schedule({ at: sh.t1, kind: 'work.shift', target: 'player/job', data: { job: pl.job.id, t0: sh.t0, t1: sh.t1 } });
}

// Online attendance (NEAR tier): the player is standing in building bKey at time t.
export function attend(ctx, t, dt, bKey) {
  const pl = ctx.store.player, sh = pl.shift;
  if (!sh || !pl.job || bKey !== pl.job.b) return false;
  const a = Math.max(sh.t0, t - dt), b = Math.min(sh.t1, t);
  if (b > a) { sh.present += b - a; ctx.store.touchPlayer(); }
  return t >= sh.t0 && t < sh.t1;
}
// Seconds of [a, b] spent in a holding cell — you can't keep your routine from there.
export const inCustody = (pl, a, b) => (pl.custodyLog || []).reduce((n, c) => n + Math.max(0, Math.min(b, c.to) - Math.max(a, c.from)), 0);
export const onShiftNow = (pl, t) => !!(pl.shift && t >= pl.shift.t0 && t < pl.shift.t1);

export function registerWorkJobs(sched) {
  sched.on('work.review', (job, ctx) => {
    const { store, pop, polity } = ctx, pl = store.player;
    const app = pl?.applications.find(a => a.n === job.data.n);
    if (!app || app.status !== 'pending') return;
    const gen = pop.jobById.get(job.data.job);
    const taken = store.getDelta(`job/${gen.id}`)?.holder;
    const head = headOf(pop, gen.b);
    const res = taken ? { chance: 0, why: 'the position was filled' } : assess(pop, polity, pl, gen, head ? knowsYou(ctx, head.id, pl) - 0.35 : 0);
    const hired = res.chance > 0 && roll(ctx, gen.id, pl.id, app.n, 'hire') < res.chance;
    app.status = hired ? 'hired' : 'rejected'; app.decided = job.at;
    app.why = hired ? null : res.why || 'they chose someone else';
    pl.applications = [...pl.applications];
    store.log({ t: job.at, type: hired ? 'hired' : 'application_rejected', who: pl.id, whoName: pl.name, title: gen.title, employer: gen.employer, b: gen.b, reviewer: app.reviewer, why: app.why });
    if (hired) takeJob(ctx, gen, job.at);
    store.touchPlayer();
  });

  sched.on('work.shift', (job, ctx) => {
    const { store, planet } = ctx, pl = store.player, pj = pl?.job;
    if (!pj || pj.id !== job.data.job) return;
    const { t0, t1 } = job.data, len = t1 - t0;
    let present = pl.shift?.t0 === t0 ? pl.shift.present : 0;
    const off = ctx.offline;
    if (off && off.activity === 'work') { const a = Math.max(t0, off.tFrom), b = Math.min(t1, off.tTo); if (b > a) present += b - a - inCustody(pl, a, b); }
    present = Math.min(len, present);
    const h = planetHours(planet, present), frac = present / len;
    const pay = Math.round(pj.wage * h);
    pj.shifts++; pj.worked += h; pj.earned += pay;
    if (pay) pl.credits = (pl.credits ?? 0) + pay;
    pl.skills[pj.skill] = 1 - (1 - pl.skills[pj.skill]) * Math.exp(-h / SKILL_TAU);
    if (frac >= 0.5) { pj.good++; pj.missed = 0; } else pj.missed++;
    store.log({ t: t1, type: frac >= 0.5 ? 'shift_worked' : 'shift_missed', who: pl.id, title: titleOf(pj), employer: pj.employer, pay, frac: Math.round(frac * 100) / 100, missed: pj.missed });
    store.touchPlayer();
    if (pj.missed >= MISS_LIMIT) return leaveJob(ctx, t1, `missed ${MISS_LIMIT} shifts in a row`, 'dismissed');
    // promotion: enough good shifts and enough skill above what the role asks
    const R = ROLES[pj.title], P = PROMOTE[pj.rank + 1];
    if (!R.senior && P && pj.good >= P.shifts && pl.skills[pj.skill] >= R.min + P.margin) {
      pj.rank++; pj.wage = wageOf({ title: pj.title }, pj.rank); pj.good = 0;
      store.log({ t: t1, type: 'promoted', who: pl.id, title: titleOf(pj), employer: pj.employer, wage: pj.wage });
    }
    scheduleShift(ctx, nextShift(planet, pj, t1 + 1));
  });
}
