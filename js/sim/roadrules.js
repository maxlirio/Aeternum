// The law on the road: lights, limits, which side. Everyone else keeps to it (gen/roadrules.js drives the traffic); YOU don't have to. Following it at
// speed is near impossible and it isn't fun, so nothing you do on the road is an offence (the owner's call, 2026-11-09). The limit is still read, for the HUD.
// `enforce: true` brings the cameras and fines back (kept for the tests and in case a mode ever wants them).
import { townRedAhead, cityRedAhead, speedLimit, wrongSideTown } from '../gen/roadrules.js';
const COOL = { red: 10, speed: 20, side: 15 }, BASE = { red: 120, speed: 40, side: 60 }, HEAT = { red: 0.4, speed: 0.2, side: 0.25 };
export class RoadRules {
  constructor({ planet, store, signalAt, say, enforce = false }) { this.enforce = enforce; this.planet = planet; this.store = store; this.signalAt = signalAt; this.say = say; this.last = {}; this.over = 0; this.side = 0; this.red = null; this.limit = null; this.tick = 0; }
  // Each frame you're driving. Returns the limit here (for the HUD).
  step(dt, t, ride, town, city, mayhem, ctl = {}) {
    if (!ride || ride.air || (ride.v?.fly && ride.pos[1] > (city?.h ?? 0) + 6 && !ride.onRoad)) { this.over = 0; this.side = 0; this.red = null; this.limit = null; return null; }
    const [x, , z] = ride.pos, fx = Math.sin(ride.facing), fz = Math.cos(ride.facing), sp = Math.abs(ride.speed), kmh = sp * 3.6, back = ride.speed < 0 ? -1 : 1;
    if ((this.tick += dt) > 0.3 || this.limit === undefined) { this.tick = 0; this.limit = speedLimit(this.planet, x, z); }
    const inCity = city && Math.hypot(x - city.cx, z - city.cz) < city.R, inTown = town && Math.hypot(x - town.cx, z - town.cz) < (town.R || 300);
    // through a red light: you were up to its line and now you're past it, and it never turned green
    if (this.red) { const now = this.red.now(x, z); if (!this.red.red(t)) this.red = null; else if (now < -1.2) { if (sp > 2.5 && this.red.was < 8) this.offence('red', t, ride, mayhem, 'Ran a red light'); this.red = null; } else if (now > 70) this.red = null; else this.red.was = now; }
    if (!this.red) { const R = inCity ? cityRedAhead(city, this.signalAt, x, z, fx * back, fz * back, t) : inTown ? townRedAhead(town, x, z, fx * back, fz * back, t) : null; if (R) { R.was = R.d; this.red = R; } }
    // too fast, for more than a moment, where someone's watching the road
    if (this.limit && kmh > this.limit + 8) { this.over += dt; if (this.over > 2 && (inCity || inTown)) { const by = Math.round(kmh - this.limit); this.offence('speed', t, ride, mayhem, `Speeding: ${Math.round(kmh)} in a ${this.limit}`, Math.min(4, 1 + by / 20)); this.over = 0; } } else this.over = 0;
    // on the wrong side of the street
    if (inTown && !inCity && sp > 4 && wrongSideTown(town, x, z, fx * back, fz * back)) { this.side += dt; if (this.side > 2.5) { this.offence('side', t, ride, mayhem, 'Driving on the wrong side of the road'); this.side = 0; } } else this.side = 0;
    return this.limit;
  }
  offence(kind, t, ride, mayhem, what, scale = 1) {
    if (!this.enforce) return;
    if (t - (this.last[kind] ?? -1e9) < COOL[kind]) return; this.last[kind] = t;
    const P = this.store.player, fine = Math.round(BASE[kind] * scale);
    if (mayhem && mayhem.heat(t) > 3) return;      // (already wanted for worse: nobody's writing tickets)
    P.credits = (P.credits ?? 0) - fine; this.store.touchPlayer();
    this.store.log({ t, type: 'traffic_offence', kind, what, fine, by: P.id, at: [Math.round(ride.pos[0]), Math.round(ride.pos[2])] });
    mayhem?.crime(t, what.toLowerCase(), HEAT[kind], ride.pos);
    this.say?.(`<b>${what}.</b> Fined ${fine} cr.`);
  }
}
