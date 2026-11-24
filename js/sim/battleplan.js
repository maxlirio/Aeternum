// The battle on a line as a battle (sim/infantry.js has the men, sim/armor.js the armour): somebody commands each side, and it goes
// by turns. The side whose turn it is forms up while its guns work over the objective it wants; the guns lift and it goes in, armour
// leading, everyone it has; the other side holds what it's being attacked on. Taken, the attackers dig in on it and the turn passes:
// the counter-attack comes for the same ground. Failed, they fall back to their walls and the turn passes anyway. Each side has what
// stands on the line and a reserve brought up in parties; every man down is one out of it. A side with no reserve and hardly anyone
// left breaks and runs, and the line is the other's. Your side's orders are said as they're given (events), so there's always a job.
// Pure: no three.js. hooks.blast({ p, R, by }) lands a shell.
export const T = { prep: 20, assault: 95, dig: 12, back: 10 }, RESERVE = 70, PARTY = 5, BREAK_AT = 4;
const other = s => s === 'ours' ? 'theirs' : 'ours';

export class BattlePlan {
  constructor(I, { blast = null, reserve = null, first = null } = {}) {
    this.I = I; this.blast = blast; this.events = []; this.res = reserve || { ours: RESERVE, theirs: Math.round(RESERVE * (I.press?.men || 1)) };
    this.lost = { ours: 0, theirs: 0 }; this.turns = 0; this.over = null; this.party = { ours: 8, theirs: 8 }; this.shell = 0;
    I.plan = this; I.orders = { ours: { mode: 'form', O: null }, theirs: { mode: 'form', O: null } };
    this.turn(first || (Math.random() < 0.6 ? 'ours' : 'theirs'));
  }
  // the objective a side goes for: the nearest to its own line that isn't its own (the centre before the far one)
  targetFor(side) { const sg = side === 'ours' ? 1 : -1, O = this.I.obj.filter(o => o.owner !== side).sort((p, q) => (p.a - q.a) * sg || Math.abs(p.s) - Math.abs(q.s))[0]; return O || null; }
  alive(side) { let n = 0; for (const M of this.I.men) if (M.hp > 0 && M.side === side && !M.gone) n++; return n; }
  say(type, x = {}) { this.events.push({ type, A: this.A, O: this.O, ...x }); }
  turn(side) {
    const O = this.targetFor(side); this.A = side; this.D = other(side); this.O = O; this.turns++;
    if (!O) { this.finish(side); return; }
    this.phase = 'prep'; this.t = 0; this.shell = 1.5;
    this.I.orders[side] = { mode: 'form', O }; this.I.orders[this.D] = { mode: 'shelter', O };      // (the defenders get back off it while the shells are coming down)
    this.say('prep');
  }
  // a man of `side` has come onto the line from the reserve (sim/infantry.js spawn) / gone down
  spent(side) { if (this.started) this.res[side] = Math.max(0, this.res[side] - 1); }
  down(side) { this.lost[side]++; }
  left(side) { return this.res[side]; }
  finish(winner) { if (this.over) return; this.over = winner; this.phase = 'over'; const L = other(winner); this.I.orders[L] = { mode: 'rout', O: null }; this.I.orders[winner] = { mode: 'attack', O: this.targetFor(winner) || this.I.obj[1] }; this.events.push({ type: 'broken', side: L, winner }); }
  step(dt) {
    const I = this.I; if (!I.F || this.phase === 'over') { if (this.phase === 'over' && I.F) { const O = this.targetFor(this.over); if (O) I.orders[this.over] = { mode: 'attack', O }; } return; }
    this.started = true; this.t += dt; const A = this.A, D = this.D, O = this.O;
    // the reserves come up in parties, to whoever's short (the attackers a little oftener)
    for (const side of ['ours', 'theirs']) { if ((this.party[side] -= dt) > 0) continue; this.party[side] = side === A ? 16 : 21;
      const have = this.alive(side), want = Math.round(16 * (side === 'theirs' ? I.press?.men || 1 : 1)), n = Math.min(PARTY, want - have, this.res[side]);
      if (n > 0) { for (let k = 0; k < n; k++) I.spawn(side); this.events.push({ type: 'party', side, n, left: this.res[side] }); } }
    // a side with nothing behind it and hardly anyone standing breaks
    for (const side of ['ours', 'theirs']) if (this.res[side] <= 0 && this.alive(side) <= BREAK_AT) { this.finish(other(side)); return; }
    if (I.obj.every(o => o.owner === 'ours')) { this.finish('ours'); return; } if (I.obj.every(o => o.owner === 'theirs')) { this.finish('theirs'); return; }
    const sg = A === 'ours' ? 1 : -1;      // (which way the attack goes, across the line)
    const shell = (a, s, R) => { const p = I.at(a, s); this.blast?.({ p, R, by: A === 'ours' ? 'our guns' : 'their guns' }); };
    if (this.phase === 'prep') {
      // the guns on the objective and the ground behind it
      if ((this.shell -= dt) <= 0) { this.shell = 0.8 + Math.random() * 0.8; shell(O.a + (Math.random() - 0.5) * 34, O.s + (Math.random() - 0.5) * 76, 6); }
      if (this.t >= T.prep) { this.phase = 'assault'; this.t = 0; I.orders[A] = { mode: 'attack', O }; I.orders[D] = { mode: 'defend', O }; this.say('assault'); }
    } else if (this.phase === 'assault') {
      // the barrage lifts onto their line behind it for the first of it, to keep their reserves off the point
      if (this.t < 14 && (this.shell -= dt) <= 0) { this.shell = 1 + Math.random(); shell(sg * (I.LINE - 6 + Math.random() * 30), O.s + (Math.random() - 0.5) * 160, 6); }
      if (O.owner === A) { this.phase = 'dig'; this.t = 0; I.orders[A] = { mode: 'defend', O }; this.say('taken'); }
      else if (this.t >= T.assault || this.alive(A) <= BREAK_AT) { this.phase = 'back'; this.t = 0; I.orders[A] = { mode: 'form', O }; this.say('failed'); }
    } else if (this.phase === 'dig') { if (this.t >= T.dig) this.turn(D); }
    else if (this.phase === 'back') { if (this.t >= T.back) this.turn(D); }
  }
  // how it stands, for whoever shows it
  get state() { return { phase: this.phase, A: this.A, O: this.O, left: this.phase === 'prep' ? T.prep - this.t : this.phase === 'assault' ? T.assault - this.t : 0, ours: this.alive('ours'), theirs: this.alive('theirs'), res: this.res, over: this.over }; }
  drain() { const e = this.events; this.events = []; return e; }
}
