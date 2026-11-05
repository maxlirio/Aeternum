// Simulation tiers. Every process belongs to one:
//   ACTIVE  — per frame, only near the player (door swings, the player body)
//   NEAR    — ~1 Hz, the loaded settlement (lights, door auto-close checks)
//   FAR     — ~once per game minute, aggregates for loaded-but-distant places (none yet)
//   DORMANT — never ticked: timed jobs in the WorldStore, run in time order when due,
//             plus closed-form functions of time. This tier is what makes offline time
//             and unloaded regions work: catch-up = run due jobs in order.
// Rule for every process: its effect over an interval must not depend on how the
// interval is sliced (tests/offline asserts this).

export const TIER = { ACTIVE: 0, NEAR: 1, FAR: 2, DORMANT: 3 };

export class Scheduler {
  constructor(store) {
    this.store = store;
    this.handlers = new Map();               // job kind -> (job, ctx) => void
    this.ticking = [[], [], []];              // per tier: { update(dt, t) }
    this.acc = [0, 0, 0];
  }
  on(kind, fn) { this.handlers.set(kind, fn); }
  add(tier, proc) { this.ticking[tier].push(proc); return () => { const a = this.ticking[tier]; a.splice(a.indexOf(proc), 1); }; }

  // Run every due job up to time t in (at, id) order. Returns the jobs that ran.
  runDue(t, ctx) {
    const ran = [];
    let j;
    while ((j = this.store.popDue(t))) {
      const h = this.handlers.get(j.kind);
      if (!h) console.warn('no handler for job', j.kind);
      else {   // something set going in another town runs there: its people, its law, and anything it sets going in turn
        const was = this.store.jobTown; this.store.jobTown = j.town || null;
        try { h(j, j.town && this.ctxFor ? this.ctxFor(j.town, ctx) : ctx); } finally { this.store.jobTown = was; }
      }
      ran.push(j);
    }
    return ran;
  }

  tick(dt, t, ctx) {
    this.runDue(t, ctx);
    for (const p of this.ticking[TIER.ACTIVE]) p.update(dt, t);
    const periods = [0, 1, 60];
    for (const tier of [TIER.NEAR, TIER.FAR]) {
      this.acc[tier] += dt;
      if (this.acc[tier] >= periods[tier]) { for (const p of this.ticking[tier]) p.update(this.acc[tier], t); this.acc[tier] = 0; }
    }
  }
}
