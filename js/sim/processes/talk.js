// Talking to people. Everything a resident says comes from the simulation: their job and
// shift (gen/careers), their home, who they live with, what has happened in town lately
// (the event log), the weather, what they're doing right now. Meeting someone is a
// delta, `know/<person>` = { met, talks }, and it matters: a witness who knows you is
// more likely to recognise you (sim/processes/law.js knowsYou).
import { homeName, relationTo } from './life.js';
import { formatHour } from '../clock.js';
import { hashInts, hashStr } from '../../core/hash.js';
import { doorstep } from '../../gen/place.js';
import { buildingPlan } from '../../gen/building.js';
import { address } from '../../gen/settlement.js';

export const knowKey = id => `know/${id}`;
export const known = (store, id) => !!store.getDelta(knowKey(id));
export function introduce(store, p, t) {
  const k = store.getDelta(knowKey(p.id));
  store.patchDelta(knowKey(p.id), { met: k?.met ?? t, talks: (k?.talks || 0) + 1 });
  store.log({ t, type: 'met', who: store.player.id, whomName: p.name, whom: p.id });
}
export function talked(store, p) { const k = store.getDelta(knowKey(p.id)); if (k) store.patchDelta(knowKey(p.id), { talks: (k.talks || 0) + 1 }); }

// a stable pick from a list, per person and topic
const pick = (p, topic, list, n = 0) => list[hashInts(hashStr(5, p.id), [hashStr(9, topic), n]) % list.length];

export function workLine(pop, p) {
  if (p.job) {
    const j = pop.jobById.get(p.job), b = pop.buildingByKey.get(j.b);
    return `I'm ${/^[aeiou]/i.test(j.title) ? 'an' : 'a'} ${j.title.toLowerCase()} at ${j.employer}, ${b ? address(pop.s, b) : 'in town'}. ${pick(p, 'shift', ['My shift is', 'I work', "I'm on"])} ${formatHour(j.hours[0])} to ${formatHour(j.hours[1])}.`;
  }
  if (p.age < 6) return '(They are too young to tell you much.)';
  if (p.age < 18) return pick(p, 'school', ["I'm still at school.", "School. Same as every day.", "I'm a student."]);
  if (p.age >= 67) return pick(p, 'retired', ["I'm retired now. Worked long enough.", "Retired. I keep busy.", "Not any more — I'm retired."]);
  return pick(p, 'jobless', ["Nothing at the moment. I keep an eye on the board at the civic office.", "I'm between jobs.", "Looking. The postings change every week."]);
}
export function homeLine(pop, p) {
  return pick(p, 'home', ['I live at', 'Home is', "I'm at"]) + ` ${homeName(pop, p.home)}.`;
}
export function familyLine(pop, p) {
  const others = pop.people.filter(q => q.household === p.household && q.id !== p.id);
  if (!others.length) return pick(p, 'alone', ['I live on my own.', 'Just me.', "It's only me at home."]);
  const kids = others.filter(q => q.age < 18), adults = others.filter(q => q.age >= 18);
  const parts = [];
  if (adults.length) parts.push(`${adults.map(q => q.given).join(' and ')}`);
  if (kids.length) parts.push(`${kids.length === 1 ? 'our child' : 'the children'} ${kids.map(q => `${q.given} (${q.age})`).join(', ')}`);
  return `I live with ${parts.join(', and ')}.`;
}
// small talk: today's weather, something that happened lately, how their day is going
export function smallTalk(pop, store, p, t, weather, activity, n) {
  const planet = pop.planet, recent = store.events.filter(e => e.t > t - 5 * planet.dayLength && ['died', 'born', 'household_arrived', 'case_opened', 'theft_discovered', 'fined'].includes(e.type));
  const lines = [];
  const w = weather?.label;
  if (w) lines.push({ rain: "Wet one, isn't it.", drizzle: "Can't decide whether to rain, can it.", overcast: 'Grey again.', cloudy: 'Clouds coming in.', fair: 'Not a bad day.', clear: 'Clear as anything today.' }[w] || 'Strange weather.');
  for (const e of recent.slice(-4)) {
    if (e.type === 'died') lines.push(`Did you hear ${e.whoName} died? ${e.age} — ${e.age > 75 ? 'a good long life' : 'too young'}.`);
    if (e.type === 'born') lines.push(`The ${e.parents?.[0]?.split(' ').at(-1) || ''} family had a baby. ${e.whoName}.`);
    if (e.type === 'household_arrived') lines.push(`There's a new family in town — the ${e.surname}s.`);
    if (e.type === 'case_opened' || e.type === 'theft_discovered') lines.push(`Someone's been ${e.what === 'theft' || e.type === 'theft_discovered' ? 'taking things' : 'breaking in'} round here. ${e.owner}'s, I heard.`);
    if (e.type === 'fined' && e.whoName) lines.push(`${e.whoName} got fined — ${e.offence.toLowerCase()}.`);
  }
  if (activity === 'working' || activity === 'on duty') lines.push("I'm working, so — not long.");
  if (activity === 'shopping') lines.push('Just picking up a few things.');
  if (activity === 'commuting' || activity === 'going to work') lines.push("Can't stop, I'll be late.");
  return lines.length ? lines[n % lines.length] : pick(p, 'nothing', ['Quiet week.', 'Nothing much to tell.', 'Same as ever.']);
}
// where they'll point you
export function directionsFrom(pop, polity, player, p) {
  const s = pop.s, out = [], at = b => b && doorstep(s, b, buildingPlan(pop.planet, s, b)).pos;
  const sec = pop.buildingByKey.get(polity.security); if (sec) out.push({ label: `${polity.securityName} (civic office)`, pos: at(sec) });
  const stores = s.buildings.filter(b => b.type === 'store');
  if (stores.length) { const near = stores.slice().sort((a, b) => Math.hypot(a.O[0] - 0, a.O[1]) - Math.hypot(b.O[0], b.O[1]))[0]; out.push({ label: `a shop — ${near.owner}`, pos: at(near) }); }
  const hangar = s.buildings.find(b => b.type === 'hangar'); if (hangar) out.push({ label: `the speeder dealer — ${hangar.owner}`, pos: at(hangar) });
  if (p.job) { const j = pop.jobById.get(p.job), b = pop.buildingByKey.get(j.b); if (b) out.push({ label: `where they work — ${j.employer}`, pos: at(b) }); }
  const myHome = pop.buildingByKey.get(player.home); if (myHome) out.push({ label: 'your home', pos: at(myHome) });
  return out;
}
export { relationTo };
