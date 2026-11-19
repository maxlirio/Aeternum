// A life is one life. When you die you stay dead: the universe goes on, it keeps what you did (the dead on the
// field, the wrecks, the trees you flattened, every deed in the log) and remembers you by name; the next of your
// line, or a stranger, takes it up from there. Pure: no three.js, no store, no DOM.
//
// When going down kills you (the rules are few and plain, so a death is never a coin toss you can't read):
//  - overkill: a hit that goes well past what you had left (a blast at your feet, a crash at speed, a brewed-up tank)
//  - left on the field: down on the line with the enemy close and none of your own near enough to drag you back
//  - worn out: every time you go down and live you carry the wound after (a little less to give); at MAX_WOUNDS more, the next one's the last
// Otherwise you go down and come round, as before, with one more wound.

export const OVERKILL = 30, MAX_WOUNDS = 4, WOUND_HP = 10, FOE_R = 25, FRIEND_R = 15;

// the most health you can heal back to, with the wounds you carry
export const hpCap = P => Math.max(50, 100 - WOUND_HP * (P?.wounds || 0));

// hp: what you had before the hit; dmg: the hit; ctx: { line, foesNear, friendsNear, arrested }
export function fate(P, hp, dmg, ctx = {}) {
  if (ctx.arrested) return { dead: false };      // (the law shoots to stop you, and wants you in its cell alive)
  if (dmg - hp >= OVERKILL) return { dead: true, why: 'overkill' };
  if (ctx.line && ctx.foesNear > 0 && !ctx.friendsNear) return { dead: true, why: 'left' };
  if ((P.wounds || 0) >= MAX_WOUNDS) return { dead: true, why: 'wounds' };
  return { dead: false };
}

// how the dead are remembered: one line for the stone and the record
export function epitaph(P, { t, cause, why, place, planetName, days }) {
  const S = P.soldier, how = why === 'left' ? `left on the field, ${cause}` : why === 'wounds' ? `worn down by old wounds, finished by ${cause}` : cause;
  return {
    serial: P.serial, id: P.id, name: P.name, given: P.given, surname: P.surname, age: P.age, born: P.created ?? 0, died: t, days: Math.max(0, Math.round(days)),
    cause: how, place, planet: planetName, household: P.family?.household ?? null,
    rank: S ? S.rank : null, kills: S ? S.kills || 0 : 0, credits: Math.round(P.credits ?? 0), wounds: P.wounds || 0, worlds: (P.worlds || []).length || 1,
    heir: P.heirOf ?? null,
  };
}

// what the next of the line gets: the estate less the death duty and the burial, the gun that was in their hands,
// and a share of what they'd learnt that went past their schooling (they talked about it at home)
export const DUTY = 0.35;
export function estate(P, start = null) {
  const credits = Math.max(0, Math.round((P.credits ?? 0) * (1 - DUTY) / 10) * 10);
  const heirloom = P.weapon && (P.inventory || []).some(x => x.id === P.weapon) ? P.weapon : null;
  const skills = {}; for (const [k, v] of Object.entries(P.skills || {})) { const gain = v - (start?.[k] ?? v * 0.5); if (gain > 0) skills[k] = Math.round(gain * 0.25 * 100) / 100; }
  return { credits, heirloom, skills, from: P.serial, name: P.name, surname: P.surname, household: P.family?.household ?? null, soldier: P.soldier ? { nation: P.soldier.nation, rank: Math.max(0, (P.soldier.rank || 0) - 1) } : null };
}

// the heir, given the new character: who they were to the dead, and what's handed on (mutates C)
export function inherit(C, E) {
  if (!E) return C;
  C.credits = (C.credits ?? 0) + E.credits; C.heirOf = E.from;
  for (const [k, v] of Object.entries(E.skills)) C.skills[k] = Math.min(1, Math.round(((C.skills[k] || 0) + v) * 100) / 100);
  if (E.heirloom) { C.inventory = C.inventory || []; if (!C.inventory.some(x => x.id === E.heirloom)) C.inventory.push({ id: E.heirloom, n: 1, heirloom: E.name }); C.weapon = E.heirloom; }
  if (E.soldier) C.soldier = { nation: E.soldier.nation, rank: E.soldier.rank, kills: 0, since: C.created ?? 0, legacy: E.name };     // (the regiment takes the family back; a rank lower than they died at)
  return C;
}

// how hard the war's gone: every life it's taken from your line, and every ten days it's gone on
export function warStage(lineage, days) { return Math.min(6, (lineage?.length || 0) + Math.floor(Math.max(0, days) / 10)); }
// what that does on the line: their numbers, their armour, how well they shoot
export function pressOf(stage) { return { men: 1 + 0.15 * stage, tanks: stage >= 2 ? 1 : 0, aim: 1 + 0.06 * stage }; }
