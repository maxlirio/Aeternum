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
export function pressure(F, now) {
  const dt = Math.max(0, now - (F.t ?? now)); F.t = now;
  if (dt > 0) F.hold = Math.max(1, F.hold - Math.min(15, dt * PRESSURE * (1 + 0.25 * F.level)));      // (pressure alone never breaks a line: something has to happen there)
  return F;
}

// what a fight was worth to the front: → { parts: [[what, points]], total } (points of hold; can be less than nothing)
export function gainOf(kind, st) {
  const parts = [];
  if (kind === 'sky') {
    if (st.cleared) parts.push([`${st.cleared} wave${st.cleared === 1 ? '' : 's'} seen off`, st.cleared * 1.5]);
    if (st.kills) parts.push([`${st.kills} shot down`, st.kills * 0.3]);
    if (st.won) parts.push(['the sky kept', 4]);
    if (st.strikes) parts.push([`hit ${st.strikes} time${st.strikes === 1 ? '' : 's'} from the air`, -st.strikes * 1.5]);
  } else if (kind === 'ground') {
    if (st.taken) parts.push([`${st.taken} objective${st.taken === 1 ? '' : 's'} taken`, st.taken * 5]);
    if (st.kills) parts.push([`${st.kills} of theirs put down`, Math.min(8, st.kills * 0.4)]);
    if (st.won) parts.push(['all three objectives ours', 8]);
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
