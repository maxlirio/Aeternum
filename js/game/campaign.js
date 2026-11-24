// The war as a campaign: the one thing every fight is for. Each enemy your nation's at war with is a front, and each front has a
// hold: how much of that border is ours (0 to 100, begun even). You choose a zone (a front, a town a dreadnought's making for, the
// skies over home) and how you go in (a fighter, or on foot), and what you do there moves the hold. Nobody holding it, it slips: the
// enemy presses whether you're there or not. Push it to the top and they're thrown back over the border (and come again, harder);
// let it reach the bottom and the line breaks, and their dreadnoughts come through. Kept in the save's meta. Pure.

export const START = 50, PRESSURE = 1 / 300;      // (a point lost every five minutes nobody's pushing; more as the war goes on)
export const KINDS = { air: { name: 'Fighter', say: 'Issued a fighter, with two wingmen.' }, foot: { name: 'Infantry', say: 'Set down behind the sandbags with a carbine and a squad.' } };

export function campaignOf(meta, planetKey) { meta.campaign ??= {}; return meta.campaign[planetKey] ??= { fronts: {} }; }
export function frontOf(C, enemyId, now = 0) { return C.fronts[enemyId] ??= { hold: START, level: 0, t: now, won: 0, lost: 0 }; }

// the enemy's pressure since it was last looked at (never more than 15 points in one go: a long absence isn't a rout)
export function pressure(F, now) { F.t = now; return F; }      // (the line slips by the battles lost on it while you're elsewhere: battleNow, below)

// ---- the battle on a front: one, always, whether you're at it or not. What each side has left on the ground (men in reserve) and in the
// air (aircraft), who holds the three objectives, whose turn it is to attack. At it, the fight itself moves these (sim/battleplan.js,
// sim/front.js); away, it's fought on by the clock, a little against you. A side out of men has lost it: the line moves, there's a lull,
// and the next one begins.
export const G_RES = 70, AIR_RES = 12, AWAY_STEP = 30, LULL = 240, WON = 10, AWAY_WON = 6;
export function newBattle(F, at) {
  F.n = (F.n || 0) + 1;
  return F.battle = { n: F.n, t: at, g: { ours: G_RES, theirs: Math.round(G_RES * (1 + 0.1 * F.level)) }, air: { ours: AIR_RES, theirs: AIR_RES + 2 * F.level }, obj: [1, 0, -1], turn: null, sky: null };
}
// it's been decided (at it: the fight said so; away: battleNow): the line moves, and the next begins after a lull. → apply()'s result
export function decide(F, winner, now, by = WON) { const r = apply(F, winner === 'ours' ? by : -by, now); newBattle(F, now + LULL); return { ...r, winner }; }
// the battle as it stands now, fought on by the clock since it was last looked at. → { B, results: [{ winner, before, after, turn }] }
export function battleNow(F, now, rnd = Math.random) {
  const results = []; let B = F.battle || newBattle(F, now);
  for (let guard = 0; guard < 6; guard++) {
    let steps = Math.min(400, Math.floor((now - B.t) / AWAY_STEP)); if (steps <= 0) break;
    let winner = null;
    B.tilt ??= (rnd() - 0.42) * 0.5;      // (how this one's going for us while nobody's looking: some go our way, rather more don't)
    while (steps-- > 0 && !winner) { B.t += AWAY_STEP;
      B.g.ours = Math.max(0, B.g.ours - (0.45 + rnd() * 0.9) * (1 + B.tilt)); B.g.theirs = Math.max(0, B.g.theirs - (0.45 + rnd() * 0.9) * (1 - B.tilt));      // (about three quarters of an hour of it; theirs lose a little slower: without you the line gives)
      for (const s of ['ours', 'theirs']) if (B.air[s] > 0 && rnd() < 0.1) B.air[s]--;
      if (!B.sky && (B.air.ours <= 0 || B.air.theirs <= 0)) B.sky = B.air.ours > 0 ? 'ours' : 'theirs';
      if (B.sky) B.g[B.sky === 'ours' ? 'theirs' : 'ours'] = Math.max(0, B.g[B.sky === 'ours' ? 'theirs' : 'ours'] - 0.25);      // (whoever has the sky has gunships over the other's men)
      if (rnd() < 0.08) { const up = B.g.ours + rnd() * 30 > B.g.theirs + rnd() * 30 ? 1 : -1, i = up > 0 ? B.obj.findIndex(o => o < 1) : B.obj.length - 1 - [...B.obj].reverse().findIndex(o => o > -1); if (i >= 0 && i < 3) B.obj[i] = Math.max(-1, Math.min(1, B.obj[i] + up)); }
      if (B.g.ours <= 0 || B.g.theirs <= 0) winner = B.g.ours > 0 ? 'ours' : 'theirs';
      else if (B.obj.every(o => o === 1)) winner = 'ours'; else if (B.obj.every(o => o === -1)) winner = 'theirs'; }
    if (!winner) break;
    results.push(decide(F, winner, B.t, AWAY_WON)); B = F.battle;
  }
  B.g.ours = Math.round(B.g.ours); B.g.theirs = Math.round(B.g.theirs);
  return { B, results };
}
// how a battle's told in a line
export const battleSay = (B, now) => now < B.t ? 'A lull: both sides are bringing men up' : `Battle ${B.n}: ours ${B.g.ours} men and ${B.air.ours} aircraft in reserve, theirs ${B.g.theirs} and ${B.air.theirs}${B.sky ? ` · the sky is ${B.sky}` : ''}`;

// what a fight was worth to the front: → { parts: [[what, points]], total } (points of hold; can be less than nothing)
export function gainOf(kind, st) {
  const parts = [];
  if (kind === 'sky') {
    if (st.cleared) parts.push([`${st.cleared} wave${st.cleared === 1 ? '' : 's'} seen off`, st.cleared * 1.5]);
    if (st.kills) parts.push([`${st.kills} shot down`, st.kills * 0.3]);
    if (st.won) parts.push(['the sky kept', 4]);
    if (st.strikes) parts.push([`hit ${st.strikes} time${st.strikes === 1 ? '' : 's'} from the air`, -st.strikes * 1.5]);
  } else if (kind === 'ground') {
    if (st.taken) parts.push([`${st.taken} objective${st.taken === 1 ? '' : 's'} taken`, st.taken * 2]);
    if (st.kills) parts.push([`${st.kills} of theirs put down`, Math.min(6, st.kills * 0.3)]);      // (your own part in it; the battle itself moves the line when it's decided: decide)
  } else if (kind === 'air') {
    if (st.kills) parts.push([`${st.kills} shot down`, Math.min(6, st.kills * 0.5)]);
    if (st.strafed) parts.push([`${st.strafed} of theirs hit from the air`, Math.min(4, st.strafed * 0.2)]);
  } else if (kind === 'dread') {
    if (st.down) parts.push(['a dreadnought brought down', 10]);
    if (st.down && st.saved) parts.push(['the town saved', 8]);
    if (st.burnt) parts.push(['a town burnt', -8]);
  }
  return { parts, total: Math.round(parts.reduce((n, p) => n + p[1], 0) * 10) / 10 };
}

// the front after it: → { before, after, turn } (turn: 'won' — thrown back over the border; 'lost' — the line broken; else null)
export function apply(F, delta, now) {
  pressure(F, now); const before = F.hold; let hold = Math.max(0, Math.min(100, F.hold + delta)), turn = null;
  if (hold >= 100) { turn = 'won'; F.won++; F.level++; F.hold = 40; }
  else if (hold <= 0) { turn = 'lost'; F.lost++; F.hold = 30; }
  else F.hold = hold;
  return { before, after: turn ? hold : F.hold, turn };
}

// the waves a sortie over a front meets: the base ones, sharper and with one more fighter for each time they've been thrown back
export function wavesFor(level, WAVES) {
  if (!level) return WAVES; const extra = ['needle', 'shade', 'interceptor'];
  return WAVES.map((W, i) => ({ ...W, aim: Math.min(1.25, W.aim + 0.08 * level), fighters: W.fighters.concat(extra.slice(0, Math.min(3, level)).map((m, k) => extra[(i + k) % 3])) }));
}
// how often their dreadnoughts come (seconds, [from, to]), by the weakest of your fronts
export const strikeEvery = hold => hold < 25 ? [300, 540] : hold < 50 ? [480, 900] : hold < 75 ? [720, 1200] : [1200, 2100];
// how the hold's told
export const holdSay = h => h >= 80 ? 'nearly over the border' : h >= 60 ? 'pushing them back' : h >= 40 ? 'holding' : h >= 20 ? 'being pushed back' : 'close to breaking';
