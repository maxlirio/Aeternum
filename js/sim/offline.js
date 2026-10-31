// Offline time: when the player returns, everything that would have happened while
// they were gone is computed from the elapsed time — due jobs run in order, the body
// advances in closed form. Nothing ticks for the missing hours.
import { advanceBody } from './processes/character.js';

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
  } else advanceBody(p, activity === 'rest' ? 'rest' : activity === 'train' ? 'train' : 'idle', report.elapsed, planet);
  const jobs = sched.runDue(tTo, ctx);
  p.activity = null;
  store.touchPlayer();
  report.body = { fatigue: [before.fatigue, p.fatigue], fitness: [before.fitness, p.fitness] };
  report.moved = before.pos.join() !== p.pos.join();
  report.jobsRun = jobs.length;
  report.events = store.eventsBetween(tFrom, tTo);
  return report;
}
