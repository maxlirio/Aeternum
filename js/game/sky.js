// Sky battles: a sortie over a town. Raiders come in waves, each worse than the last, from a different quarter; some
// are fighters that come for you and your wingmen, some are gunships that ignore you and go for the town. Clear a wave
// and you get a breather (missiles back, a patch on the hull); clear the last and the town's safe. It runs on the air
// war (sim/aircombat.js) as it stands: every craft in it flies the same airframe you do. Pure: no three.js, no DOM.
//
// step(dt) → reads the air war's events; drain() → [{ type: 'wave' | 'clear' | 'strike' | 'escaped' | 'done' | 'lost', … }]

export const WAVES = [
  { fighters: ['needle', 'racer0'], gunships: [], aim: 0.5 },
  { fighters: ['needle', 'racer1'], gunships: ['gunship0'], aim: 0.6 },
  { fighters: ['interceptor', 'shade', 'racer0'], gunships: ['gunship0'], aim: 0.75 },
  { fighters: ['shade', 'interceptor', 'needle'], gunships: ['gunship1', 'gunship0'], aim: 0.9 },
  { fighters: ['shade', 'interceptor', 'shade', 'racer1'], gunships: ['gunship1', 'gunship1'], aim: 1 },
];
export const LULL = 14, WAVE_TIME = 170, OUT = 6500, STRIKE_R = 380;

export class SkySortie {
  // town: [x, y, z] (the ground at its middle); bearing: where the first wave comes from (radians, as facing)
  constructor(war, { town, bearing = 0, wing = ['interceptor', 'striker'], waves = WAVES }) {
    this.war = war; this.town = town; this.bearing = bearing; this.wingModels = wing; this.waves = waves;
    this.t = 0; this.k = 0; this.phase = 'brief'; this.next = 0; this.cur = []; this.wing = []; this.me = null; this.out = [];
    this.kills = 0; this.assists = 0; this.cleared = 0; this.strikes = 0; this.escaped = 0; this.wingLost = 0; this.won = false; this._e = war.events.length;
  }
  // you're in the air (me: your craft in the war): your wingmen form up on you, and the first wave is on its way
  begin(me) {
    this.me = me; me.missilesMax ??= me.missiles; const f = me.f, l = f.left;
    this.wing = this.wingModels.map((m, i) => { const s = i ? -1 : 1, c = this.war.spawn(m, 'security', [f.pos[0] + l[0] * 60 * s - f.fwd[0] * 50, f.pos[1] + 10, f.pos[2] + l[2] * 60 * s - f.fwd[2] * 50], f.facing, Math.max(120, Math.hypot(f.vel[0], f.vel[2]))); c.wing = true; return c; });
    this.phase = 'lull'; this.next = this.t + 8;
  }
  wave() { return this.waves[Math.min(this.k, this.waves.length - 1)]; }
  get left() { return this.cur.filter(c => c.alive && !c.gone).length; }
  spawnWave() {
    const W = this.wave(), T = this.town, b = this.bearing + [0, 0.9, -0.9, 2.2, -2.2][this.k % 5], bx = Math.sin(b), bz = Math.cos(b), list = [];
    const all = W.fighters.map(m => ({ m, gun: false })).concat(W.gunships.map(m => ({ m, gun: true })));
    all.forEach(({ m, gun }, i) => {
      const side = (i - (all.length - 1) / 2) * 160, x = T[0] + bx * (OUT + (gun ? 900 : 0)) + bz * side, z = T[2] + bz * (OUT + (gun ? 900 : 0)) - bx * side;
      const c = this.war.spawn(m, 'raider', [x, T[1] + (gun ? 700 : 1100) + i * 50, z], b + Math.PI, 170);
      c.aim = W.aim; c.groundTarget = T.slice(); c.bomber = gun; c.sortie = true;      // (yours to fight: the great ships leave a sortie's raiders to you, sim/fleetwar.js)
       c.wave = this.k; c.strikeT = -1e9; list.push(c);
    });
    this.cur = list; this.phase = 'fight'; this.waveT = this.t;
    this.out.push({ type: 'wave', k: this.k, of: this.waves.length, n: list.length, gunships: W.gunships.length, from: b });
  }
  step(dt) {
    this.t += dt;
    const E = this.war.events; for (let i = this._e; i < E.length; i++) { const e = E[i]; if (e.type !== 'killed') continue;
      if (e.craft === this.me) { this.phase = 'done'; this.out.push({ type: 'lost' }); }
      else if (e.craft.wing) { this.wingLost++; this.out.push({ type: 'winglost', name: e.craft.name }); }
      else if (e.craft.side === 'raider' && this.cur.includes(e.craft)) { if (e.by === this.me) this.kills++; else if (e.by?.wing) this.assists++; this.out.push({ type: 'down', by: e.by === this.me ? 'you' : e.by?.wing ? 'wing' : null, craft: e.craft }); } }
    this._e = E.length;
    if (this.phase === 'done') return;
    // a gunship over the town is a strike on it (each one, once every 20 s, as it comes round again)
    const T = this.town;
    for (const c of this.cur) { if (!c.alive || c.gone || !c.bomber) continue; const d = Math.hypot(c.f.pos[0] - T[0], c.f.pos[2] - T[2]);
      if (d < STRIKE_R && c.f.pos[1] - T[1] < 900 && this.t - c.strikeT > 20) { c.strikeT = this.t; this.strikes++; this.out.push({ type: 'strike', at: [T[0] + (Math.random() - 0.5) * 160, T[1], T[2] + (Math.random() - 0.5) * 160], craft: c }); } }
    if (this.phase === 'lull' && this.t >= this.next) this.spawnWave();
    else if (this.phase === 'fight') {
      if (this.t - this.waveT > WAVE_TIME) for (const c of this.cur) if (c.alive && !c.gone) { c.gone = true; this.escaped++; this.war.craft = this.war.craft.filter(x => x !== c); this.out.push({ type: 'escaped', craft: c }); }      // (the ones still up when it's dragged on this long turn for home)
      if (!this.left) {
        this.cleared++; this.k++;
        if (this.k >= this.waves.length) { this.won = true; this.phase = 'done'; this.out.push({ type: 'done', won: true }); }
        else { this.phase = 'lull'; this.next = this.t + LULL; const me = this.me; if (me?.alive) { me.missiles = Math.max(me.missiles, me.missilesMax ?? 0); me.hp = Math.min(me.maxHp, me.hp + me.maxHp * 0.25); me.flares = Math.max(me.flares, 8); } this.out.push({ type: 'clear', k: this.k, of: this.waves.length }); }
      }
    }
  }
  // the craft still in it at the end, cleared away (your wingmen, whatever's left of a wave)
  end() { const gone = new Set([...this.wing, ...this.cur]); this.war.craft = this.war.craft.filter(c => !gone.has(c)); this.phase = 'done'; }
  drain() { const o = this.out; this.out = []; return o; }
  stats(end) { return { kills: this.kills, assists: this.assists, cleared: this.cleared, waves: this.waves.length, strikes: this.strikes, escaped: this.escaped, wingLost: this.wingLost, won: this.won, end }; }
}
