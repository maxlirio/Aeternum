// Offline time: when the player returns, everything that would have happened while
// they were gone is computed from the elapsed time — due jobs run in order, the body
// advances in closed form. Nothing ticks for the missing hours.
import { advanceBody } from './processes/character.js';
import { onShiftNow, inCustody } from './processes/work.js';

export function catchUp(ctx, tFrom, tTo, activity) {
  const { store, sched, planet } = ctx;
  const p = store.player;
  const before = { fatigue: p.fatigue, fitness: p.fitness, pos: p.pos.slice() };
  const report = { tFrom, tTo, elapsed: tTo - tFrom, activity, notes: [] };
  if (activity === 'travel' && ctx.homeDoorstep) {
    const [hx, hy, hz] = ctx.homeDoorstep;
    const dist = Math.hypot(hx - p.pos[0], hz - p.pos[2]);
    const travelTime = dist / 1.3;
    if (report.elapsed >= travelTime) {
      advanceBody(p, 'idle', travelTime, planet);
      advanceBody(p, 'rest', report.elapsed - travelTime, planet);
      p.pos = [hx, hy, hz];
      report.notes.push(`Walked ${Math.round(dist)} m home, then rested.`);
    } else {
      const f = report.elapsed / travelTime;
      advanceBody(p, 'idle', report.elapsed, planet);
      p.pos = ctx.nearestRoadPoint(p.pos[0] + (hx - p.pos[0]) * f, p.pos[2] + (hz - p.pos[2]) * f);
      report.notes.push(`Still on the way home — ${Math.round(dist * (1 - f))} m to go.`);
    }
  } else if (activity === 'work' && p.job) {
    advanceBody(p, 'routine', report.elapsed, planet);
  } else advanceBody(p, activity === 'rest' ? 'rest' : activity === 'train' ? 'train' : 'idle', report.elapsed, planet);
  // shifts that end during the absence are settled against it (sim/processes/work.js)
  ctx.offline = { tFrom, tTo, activity };
  const credits0 = p.credits;
  const jobs = sched.runDue(tTo, ctx);
  ctx.offline = null;
  // the shift still under way when you return keeps the part of it you already worked
  if (activity === 'work' && p.shift) { const a = Math.max(p.shift.t0, tFrom), b = Math.min(p.shift.t1, tTo); if (b > a) p.shift.present += b - a - inCustody(p, a, b); }
  if (p.custody) report.notes.push(`You are being held in the cell at ${ctx.polity.securityName}.`);
  else if (activity === 'work') { // where the routine leaves you: at work mid-shift, otherwise home
    const at = p.job && onShiftNow(p, tTo) ? ctx.doorstepOf?.(p.job.b) : ctx.homeDoorstep;
    if (at) p.pos = at.slice();
    report.notes.push(p.job ? (onShiftNow(p, tTo) ? `You're at work, mid-shift at ${p.job.employer}.` : 'You kept to your routine.') : 'You kept to your routine until you lost the job.');
  }
  report.earned = p.credits - credits0;
  p.activity = null;
  store.touchPlayer();
  report.body = { fatigue: [before.fatigue, p.fatigue], fitness: [before.fitness, p.fitness] };
  report.moved = before.pos.join() !== p.pos.join();
  report.jobsRun = jobs.length;
  report.events = store.eventsBetween(tFrom, tTo);
  return report;
}
