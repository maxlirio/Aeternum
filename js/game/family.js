// The game over the world: your family is the save, each life is a run, and every run adds to the family's name.
// You choose where to put the one you're playing (an area: the sky, the line, a job of work outside the law, the law
// itself, or just a life), they live until they die, and what they did there is told as a deed and counted as renown.
// The family's renown only ever grows; its standing (TIERS) is what the world calls it. Pure: no three.js, no store, no DOM.

export const TIERS = [
  { at: 0, name: 'Unknown', say: 'Nobody outside the street knows the name.' },
  { at: 100, name: 'Noted', say: 'The name comes up, now and then.' },
  { at: 400, name: 'Respected', say: 'People know the name, and what it did.' },
  { at: 1200, name: 'Renowned', say: 'The name is known across the world.' },
  { at: 3000, name: 'Famed', say: 'Songs, and arguments, about the name.' },
  { at: 8000, name: 'Legendary', say: 'The name will outlast the people who carry it.' },
];

// the areas you can go into; ready false: not open yet (it says what it will be)
export const AREAS = [
  { key: 'sky', name: 'Sky battles', say: 'Take a fighter up against raiders coming for the town. Waves of them, worse each time.', ready: true },
  { key: 'ground', name: 'Ground battles', say: 'Onto the line where your nation is at war: hold ours, take theirs.', ready: true },
  { key: 'heist', name: 'Heists', say: 'Plan it, break in, get out with it, lose the law.', ready: false },
  { key: 'law', name: 'Law enforcement', say: 'The other side of a heist: answer the call, give chase, bring them in.', ready: false },
  { key: 'life', name: 'A life', say: 'No orders. Work, family, trouble: the world as it is.', ready: true },
];
export const areaOf = k => AREAS.find(a => a.key === k) || null;

export function tierOf(renown = 0) {
  let i = 0; while (i + 1 < TIERS.length && renown >= TIERS[i + 1].at) i++;
  const T = TIERS[i], N = TIERS[i + 1] || null;
  return { i, ...T, next: N, toNext: N ? N.at - renown : 0, frac: N ? (renown - T.at) / (N.at - T.at) : 1 };
}

// the family on the save (made the first time it's asked for, named for the first of the line)
export function familyOf(meta, surname = null) {
  if (!meta.family) meta.family = { name: surname || 'Nameless', renown: 0, deeds: [], runs: 0 };
  if (surname && meta.family.name === 'Nameless') meta.family.name = surname;
  return meta.family;
}

// a deed: { t, who, area, what, renown } — added to the family; says whether it raised the family's standing
export function addDeed(meta, deed) {
  const F = familyOf(meta), before = tierOf(F.renown);
  F.renown += Math.max(0, Math.round(deed.renown || 0)); F.runs++;
  F.deeds = [{ ...deed, renown: Math.round(deed.renown || 0) }, ...F.deeds].slice(0, 80);
  const after = tierOf(F.renown);
  return { before, after, rose: after.i > before.i };
}

// what a sortie is worth: each kill, each wave seen off, the town kept whole, coming home; an ace (five in one sortie) is remembered
export function skyRenown(S) {
  const kills = S.kills || 0, waves = S.cleared || 0, hits = S.strikes || 0;
  const parts = [[`${kills} shot down`, kills * 12], [`${waves} wave${waves === 1 ? '' : 's'} seen off`, waves * 30]];
  if (S.won) parts.push(['the town kept safe', Math.max(0, 80 - hits * 20)]);
  if (kills >= 5) parts.push(['an ace in one sortie', 60]);
  if (S.end === 'home') parts.push(['brought the fighter home', 25]);
  if (S.end === 'ejected') parts.push(['shot down, and lived', 5]);
  const total = parts.reduce((n, p) => n + p[1], 0);
  return { parts: parts.filter(p => p[1] > 0), total };
}
// and a spell on the line
export function groundRenown(S) {
  const parts = [[`${S.kills || 0} of theirs put down`, (S.kills || 0) * 10], [`${S.taken || 0} objective${S.taken === 1 ? '' : 's'} taken`, (S.taken || 0) * 40]];
  return { parts: parts.filter(p => p[1] > 0), total: parts.reduce((n, p) => n + p[1], 0) };
}

// how the deed's told, in one line
export function deedLine(D) {
  return `${D.who}: ${D.what}`;
}
