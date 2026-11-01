// What jobs ask for and pay, and when shifts happen. Pure data over the generated
// population: a vacancy is simply a generated job nobody holds (and that the player
// hasn't taken — that part is a delta, see sim/processes/work.js).
import { dayIndex, dayStart } from './schedule.js';
import { hash01, hashStr } from '../core/hash.js';

// Requirements are logical (skills, fitness, record) — never anything about bodies or meshes.
//   skill: which skill the work uses and trains; min: level needed to be considered
//   wage: credits per planet-hour on shift; senior: run the place (no promotion beyond)
export const ROLES = {
  'Clerk': { skill: 'admin', min: 0.25, wage: 22 },
  'Office manager': { skill: 'admin', min: 0.6, wage: 38, senior: true },
  'Shopkeeper': { skill: 'trade', min: 0.1, wage: 17 },
  'Fabricator': { skill: 'tech', min: 0.25, wage: 24 },
  'Machinist': { skill: 'tech', min: 0.45, wage: 29 },
  'Workshop foreman': { skill: 'tech', min: 0.65, wage: 40, senior: true },
  'Ground crew': { skill: 'tech', min: 0.12, fitness: 0.3, wage: 21 },
  'Hangar chief': { skill: 'tech', min: 0.6, wage: 42, senior: true },
  'Security officer': { skill: 'admin', min: 0.1, fitness: 0.4, clean: true, wage: 26 },
  'Security chief': { skill: 'admin', min: 0.5, fitness: 0.45, clean: true, wage: 45, senior: true },
  // 'Store owner' is not a role you can apply for: the owner owns the shop.
};
export const SKILLS = { admin: 'Administration', trade: 'Trade', tech: 'Technical' };
export const RANKS = ['', 'Senior ', 'Lead '];
// promotion to rank r needs this many good shifts and this much skill above the role's minimum
export const PROMOTE = [null, { shifts: 8, margin: 0.15 }, { shifts: 20, margin: 0.3 }];
export const SKILL_TAU = 200;                  // planet-hours on shift to close 63% of the skill gap

export const roleFor = job => ROLES[job.title] || null;
export const titleOf = pj => (ROLES[pj.title]?.senior ? '' : RANKS[pj.rank || 0]) + pj.title;
export const wageOf = (job, rank = 0) => Math.round(roleFor(job).wage * Math.pow(1.15, rank));

// Openings: a workplace doesn't advertise every empty desk. Each week it posts up to
// two of its unfilled positions (more often none) — the same ones for everyone who
// asks that week, and a fresh set the next. A running place with no head always looks
// for one. Who holds a post is generated, then overridden by deltas (job/<id>: the
// player, or a resident hired or gone since — sim/processes/life.js).
export const WEEK = 7;
export const weekOf = (planet, t) => Math.floor(dayIndex(planet, t) / WEEK);
export function openings(pop, store, bKey, t) {
  const W = weekOf(pop.planet, t), seed = pop.planet.universeSeed, ws = dayStart(pop.planet, W * WEEK);
  // the week's postings are the posts that were free when the week began: one filled since
  // keeps its place on the list (and is struck off), one that fell vacant waits for next week
  const freeAtStart = pop.jobs.filter(j => j.b === bKey && roleFor(j)).filter(j => {
    const d = store.getDelta(j.dk || (j.dk = `job/${j.id}`)), h = d && 'holder' in d ? d.holder : j.holder;
    if (d?.vacatedAt >= ws) return false;
    return !h || d?.takenAt >= ws;
  });
  if (!freeAtStart.length) return [];
  const head = freeAtStart.find(j => ROLES[j.title].senior);
  const rest = freeAtStart.filter(j => !ROLES[j.title].senior)
    .map(j => [j, hash01(seed, [hashStr(3, j.id), W])]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
  const r = hash01(seed, [hashStr(5, bKey), W]), n = r < 0.6 ? 0 : r < 0.9 ? 1 : 2;
  const isFree = j => { const d = store.getDelta(j.dk); return !(d && 'holder' in d ? d.holder : j.holder); };
  return [...(head ? [head] : []), ...rest.slice(0, n)].filter(isFree);
}
export function vacancies(pop, store, t, filter = () => true) {
  return pop.s.buildings.filter(b => pop.jobs.some(j => j.b === b.key)).flatMap(b => openings(pop, store, b.key, t)).filter(filter);
}

// The head of a workplace: whoever holds its first-listed (n = 0) job.
export function headOf(pop, bKey) {
  const head = pop.jobs.find(j => j.b === bKey && (ROLES[j.title]?.senior || j.title === 'Store owner'));
  return head?.holder ? pop.byId.get(head.holder) : null;
}

// Shifts of a held job (pj: { hours, offDays }) as absolute time windows.
export function shiftOn(planet, pj, D) {
  if (pj.offDays.includes(((D % 7) + 7) % 7)) return null;
  const HR = planet.dayLength / 24, T0 = dayStart(planet, D);
  const [a, b] = pj.hours;
  return { D, t0: T0 + a * HR, t1: T0 + (b > a ? b : b + 24) * HR };
}
// The first shift that ends after t (it may already be under way).
export function nextShift(planet, pj, t) {
  for (let D = dayIndex(planet, t) - 1; ; D++) { const s = shiftOn(planet, pj, D); if (s && s.t1 > t) return s; }
}
// Shifts that start at or after t (used when hired: you begin with a whole shift).
export function firstShiftAfter(planet, pj, t) {
  for (let D = dayIndex(planet, t); ; D++) { const s = shiftOn(planet, pj, D); if (s && s.t0 >= t) return s; }
}

// How a hiring manager weighs an applicant. Returns { chance, why } — why explains a 0.
export function assess(pop, polity, player, job, knows = 0) {
  const R = roleFor(job);
  if (!R) return { chance: 0, why: 'not a position anyone hires for' };
  const lvl = player.skills?.[R.skill] ?? 0;
  if (R.clean && player.record?.length) return { chance: 0, why: `${polity.securityName} does not hire people with a criminal record` };
  if (lvl < R.min) return { chance: 0, why: `needs ${SKILLS[R.skill].toLowerCase()} skill ${pct(R.min)} — you have ${pct(lvl)}` };
  if (R.fitness && player.fitness < R.fitness) return { chance: 0, why: `needs fitness ${pct(R.fitness)} — you have ${pct(player.fitness)}` };
  const record = (player.record?.length || 0) * 0.15;
  const chance = Math.max(0.08, Math.min(0.95, 0.45 + 2 * (lvl - R.min) - record + 0.2 * knows));
  return { chance, why: null };
}
const pct = v => Math.round(v * 100) + '%';
