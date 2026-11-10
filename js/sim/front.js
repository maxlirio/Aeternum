// War on the ground and in the air where two nations fight (gen/society.js): the front, and the battle along it.
// The front between your nation and an enemy is where their lands meet on the line between their capitals. Near it the war
// is going on whether you're there or not: fighters of both sides in waves, artillery falling on both sides of the line.
// As a soldier you're flown there in an issued fighter, paid for what you shoot down, promoted for it.
import { nationAt, nationsOf, relationOf } from '../gen/society.js';

// Where the border between nation a and nation b crosses the line between their capitals (bisection on whose land it is).
export function frontPoint(planet, a, b) {
  let lo = 0, hi = 1; const at = f => [a.cx + (b.cx - a.cx) * f, a.cz + (b.cz - a.cz) * f];
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2, [x, z] = at(m); if (nationAt(planet, x, z).nation === a) lo = m; else hi = m; }
  const [x, z] = at((lo + hi) / 2); return { x, z, a, b, dir: Math.atan2(b.cx - a.cx, b.cz - a.cz) };
}
// The fronts a nation has: one with each enemy it's at war (or in a border war) with.
export function frontsOf(planet, nat) {
  if (!nat) return []; const out = [];
  for (const o of nationsOf(planet)) { if (o === nat) continue; const r = relationOf(planet, nat, o); if (r && (r.state === 'war' || r.state === 'border war')) out.push({ ...frontPoint(planet, nat, o), state: r.state }); }
  return out;
}
export const RANKS = ['Private', 'Corporal', 'Sergeant', 'Lieutenant', 'Captain', 'Major'];

export class FrontBattle {
  // war: sim/aircombat.js AirWar; ground(x, z); hooks.blast({ p, R, by }); `us`: the nation whose side 'security' is
  constructor({ planet, war, ground, hooks }) { this.planet = planet; this.war = war; this.ground = ground; this.hooks = hooks; this.F = null; this.ours = []; this.theirs = []; this.wave = 0; this.shell = 0; this.events = []; }
  // the front you're near, if any (within 9 km), on your nation's side
  near(nat, x, z) { let best = null, bd = 9000; for (const F of frontsOf(this.planet, nat)) { const d = Math.hypot(x - F.x, z - F.z); if (d < bd) { bd = d; best = F; } } return best; }
  step(dt, nat, pos) {
    const F = nat ? this.near(nat, pos[0], pos[2]) : null;
    if (!F) { if (this.F) { this.end(); } return; }
    if (!this.F || this.F.b !== F.b) { this.end(); this.F = F; this.events.push({ type: 'front', F }); }
    const g = this.ground(F.x, F.z), ux = Math.sin(F.dir), uz = Math.cos(F.dir), px = -uz, pz = ux;
    // waves: both sides keep a few fighters up over the line
    this.ours = this.ours.filter(c => c.alive); this.theirs = this.theirs.filter(c => c.alive); this.wave -= dt;
    if (this.wave <= 0) {
      this.wave = 25;
      while (this.ours.length < 3) { const k = this.ours.length, c = this.war.spawn(['interceptor', 'striker', 'warden'][k % 3], 'security', [F.x - ux * 4000 + px * (k - 1) * 600, g + 900 + k * 80, F.z - uz * 4000 + pz * (k - 1) * 600], F.dir, 150); this.ours.push(c); }
      while (this.theirs.length < 3) { const k = this.theirs.length, c = this.war.spawn(['needle', 'shade', 'striker'][k % 3], 'raider', [F.x + ux * 4500 + px * (k - 1) * 600, g + 1000 + k * 80, F.z + uz * 4500 + pz * (k - 1) * 600], F.dir + Math.PI, 150); this.theirs.push(c); }
    }
    // the guns: shells landing either side of the line, mostly on their side of it (and on yours: they shoot back)
    this.shell -= dt;
    if (this.shell <= 0) {
      this.shell = 1.5 + Math.random() * 3; const theirSide = Math.random() < 0.6, d = (theirSide ? 1 : -1) * (300 + Math.random() * 1800), w = (Math.random() - 0.5) * 3000;
      const x = F.x + ux * d + px * w, z = F.z + uz * d + pz * w; this.hooks.blast?.({ p: [x, this.ground(x, z), z], R: 14, by: theirSide ? 'our guns' : 'their guns' });
    }
  }
  end() { for (const c of this.ours.concat(this.theirs)) if (c.alive) this.war.craft = this.war.craft.filter(x => x !== c); this.ours = []; this.theirs = []; if (this.F) this.events.push({ type: 'left' }); this.F = null; }
  drain() { const e = this.events; this.events = []; return e; }
}
