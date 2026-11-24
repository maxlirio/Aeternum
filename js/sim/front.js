// War on the ground and in the air where two nations fight (gen/society.js): the front, and the battle along it.
// The front between your nation and an enemy is where their lands meet on the line between their capitals. Near it the war
// is going on whether you're there or not: fighters of both sides in waves, artillery falling on both sides of the line.
// As a soldier you're flown there in an issued fighter, paid for what you shoot down, promoted for it.
import { nationAt, nationsOf, relationOf } from '../gen/society.js';

// Where the border between nation a and nation b crosses the line between their capitals (bisection on whose land it is);
// w: the same on a line that far to one side of it (metres), so a point further along the same border.
export function frontPoint(planet, a, b, w = 0) {
  const L = Math.hypot(b.cx - a.cx, b.cz - a.cz) || 1, px = -(b.cz - a.cz) / L * w, pz = (b.cx - a.cx) / L * w;
  let lo = 0, hi = 1; const at = f => [a.cx + (b.cx - a.cx) * f + px, a.cz + (b.cz - a.cz) * f + pz];
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2, [x, z] = at(m); if (nationAt(planet, x, z).nation === a) lo = m; else hi = m; }
  const [x, z] = at((lo + hi) / 2); return { x, z, a, b, dir: Math.atan2(b.cx - a.cx, b.cz - a.cz) };
}
// what makes a place on the border fit to fight over on foot (set by the game, which knows the ground: dry land both sides). With it set,
// a front that would lie over water is found further along the same border, where there's land, if there is any within 30 km.
let fit = null; export function setFrontFit(fn) { fit = fn; memo = new WeakMap(); }
let memo = new WeakMap();
function frontOfPair(planet, a, b) {
  let M = memo.get(planet); if (!M) memo.set(planet, M = new Map()); const k = a.id + ':' + b.id; let F = M.get(k); if (F) return F;
  F = frontPoint(planet, a, b);
  if (fit && !fit(planet, F)) for (let i = 1; i <= 20; i++) { const P = frontPoint(planet, a, b, 1500 * i), Q = fit(planet, P) ? P : frontPoint(planet, a, b, -1500 * i); if (Q === P || fit(planet, Q)) { if (nationAt(planet, Q.x - Math.sin(Q.dir) * 200, Q.z - Math.cos(Q.dir) * 200).nation === a) { F = Q; break; } } }
  M.set(k, F); return F;
}
// The fronts a nation has: one with each enemy it's at war (or in a border war) with.
export function frontsOf(planet, nat) {
  if (!nat) return []; const out = [];
  for (const o of nationsOf(planet)) { if (o === nat) continue; const r = relationOf(planet, nat, o); if (r && (r.state === 'war' || r.state === 'border war')) out.push({ ...frontOfPair(planet, nat, o), state: r.state }); }
  return out;
}
export const RANKS = ['Private', 'Corporal', 'Sergeant', 'Lieutenant', 'Captain', 'Major'];

export class FrontBattle {
  // war: sim/aircombat.js AirWar; ground(x, z); hooks.blast({ p, R, by }); `us`: the nation whose side 'security' is
  constructor({ planet, war, ground, hooks }) { this.planet = planet; this.war = war; this.ground = ground; this.hooks = hooks; this.F = null; this.ours = []; this.theirs = []; this.guns = { ours: [], theirs: [] }; this.gunT = { ours: 20, theirs: 30 }; this.air = null; this.sky = null; this.wave = 0; this.shell = 0; this.events = []; }
  // an aircraft of `side` out of its reserve (this.air: { ours, theirs }, the battle's, game/campaign.js; none set: there's always another)
  take(side) { if (!this.air) return true; if (this.air[side] <= 0) return false; this.air[side]--; return true; }
  up(side) { return (side === 'ours' ? this.ours : this.theirs).filter(c => c.alive).length + this.guns[side].filter(c => c.alive).length; }
  // the front you're near, if any (within 9 km), on your nation's side
  near(nat, x, z) { let best = null, bd = 9000; for (const F of frontsOf(this.planet, nat)) { const d = Math.hypot(x - F.x, z - F.z); if (d < bd) { bd = d; best = F; } } return best; }
  step(dt, nat, pos) {
    const F = nat ? this.near(nat, pos[0], pos[2]) : null;
    if (!F) { if (this.F) { this.end(); } return; }
    if (!this.F || this.F.b !== F.b) { this.end(); this.F = F; this.wave = 1; this.events.push({ type: 'front', F }); return; }      // (whoever's listening gives it the battle's aircraft before the first goes up)
    const g = this.ground(F.x, F.z), ux = Math.sin(F.dir), uz = Math.cos(F.dir), px = -uz, pz = ux;
    // the air over it: each side keeps three fighters up while it has them, one more sent up at a time as they're lost; and sends a gunship
    // over the other's men, to work along their positions until it's shot down or its time on station is up. Every one comes out of that
    // side's aircraft for this battle; a side with none left and none up has lost the sky, and the other's gunships have it to themselves.
    this.ours = this.ours.filter(c => c.alive); this.theirs = this.theirs.filter(c => c.alive); this.wave -= dt;
    for (const side of ['ours', 'theirs']) { const L = this.guns[side]; for (const c of L) if (c.alive && this.war.t - c.since > 75) { c.gone = true; this.war.craft = this.war.craft.filter(x => x !== c); if (this.air) this.air[side]++; }      // (home again: back in the reserve)
      this.guns[side] = L.filter(c => c.alive && !c.gone); this.gunT[side] -= dt; }
    if (this.wave <= 0) {
      this.wave = 12;
      if (this.ours.length < 3 && this.take('ours')) { const k = this.ours.length, c = this.war.spawn(['interceptor', 'striker', 'warden'][k % 3], 'security', [F.x - ux * 4000 + px * (k - 1) * 600, g + 900 + k * 80, F.z - uz * 4000 + pz * (k - 1) * 600], F.dir, 150); this.ours.push(c); }
      if (this.theirs.length < 3 && this.take('theirs')) { const k = this.theirs.length, c = this.war.spawn(['needle', 'shade', 'striker'][k % 3], 'raider', [F.x + ux * 4500 + px * (k - 1) * 600, g + 1000 + k * 80, F.z + uz * 4500 + pz * (k - 1) * 600], F.dir + Math.PI, 150); this.theirs.push(c); }
      for (const side of ['ours', 'theirs']) { const sg = side === 'ours' ? -1 : 1, owns = this.sky === side;
        if (this.sky && !owns || this.guns[side].length >= (owns ? 2 : 1) || this.gunT[side] > 0 || !(owns || this.take(side))) continue;
        const w = (Math.random() - 0.5) * 240, tx = F.x - ux * sg * 34 + px * w, tz = F.z - uz * sg * 34 + pz * w;      // (over the other side's forward positions)
        const c = this.war.spawn(side === 'ours' ? 'gunship0' : 'gunship1', side === 'ours' ? 'security' : 'raider', [F.x + ux * sg * 4200 + px * w, g + 700, F.z + uz * sg * 4200 + pz * w], side === 'ours' ? F.dir : F.dir + Math.PI, 130);
        c.bomber = true; c.groundTarget = [tx, this.ground(tx, tz), tz]; c.since = this.war.t; c.line = true; this.guns[side].push(c); this.gunT[side] = 40 + Math.random() * 25; this.events.push({ type: 'gunship', side }); }
    }
    if (this.air && !this.sky) for (const side of ['ours', 'theirs']) if (this.air[side] <= 0 && !this.up(side)) { this.sky = side === 'ours' ? 'theirs' : 'ours'; this.events.push({ type: 'sky', winner: this.sky }); break; }
    // the guns: shells landing either side of the line, mostly on their side of it (and on yours: they shoot back)
    this.shell -= dt;
    if (this.shell <= 0) {
      this.shell = 1.5 + Math.random() * 3; const theirSide = Math.random() < 0.6, d = (theirSide ? 1 : -1) * (300 + Math.random() * 1800), w = (Math.random() - 0.5) * 3000;
      const x = F.x + ux * d + px * w, z = F.z + uz * d + pz * w; this.hooks.blast?.({ p: [x, this.ground(x, z), z], R: 14, by: theirSide ? 'our guns' : 'their guns' });
    }
  }
  end() { for (const side of ['ours', 'theirs']) for (const c of (side === 'ours' ? this.ours : this.theirs).concat(this.guns[side])) if (c.alive && !c.gone) { this.war.craft = this.war.craft.filter(x => x !== c); if (this.air) this.air[side]++; }      // (what's still up goes back into the reserve: the battle's still on)
    this.ours = []; this.theirs = []; this.guns = { ours: [], theirs: [] }; this.air = null; this.sky = null; if (this.F) this.events.push({ type: 'left' }); this.F = null; }
  drain() { const e = this.events; this.events = []; return e; }
}
