// Node test suites. `node tools/test.mjs [suite...]`. Exit code 1 on any failure.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { seedFromString, hashStr, seedHex } from '../js/core/hash.js';
import { HOMEWORLD, Address } from '../js/core/address.js';
import { Rng } from '../js/core/prng.js';
import { makePlanet } from '../js/gen/planet.js';
import { rawHeight } from '../js/gen/terrain.js';
import { surfaceHeight } from '../js/gen/surface.js';
import { getSettlement, roadRect, rectsOverlap } from '../js/gen/settlement.js';
import { buildingPlan, roomGraph } from '../js/gen/building.js';

const suites = {};
let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.log('  FAIL', msg); } return cond; };
const digest = obj => seedHex([hashStr(1, JSON.stringify(obj)), hashStr(2, JSON.stringify(obj))]);

const uni = n => seedFromString('test-universe-' + n);

suites.determinism = () => {
  // Same address + seed → identical content; different seeds → different content.
  const a = makePlanet(uni(1), HOMEWORLD), b = makePlanet(uni(1), HOMEWORLD), c = makePlanet(uni(2), HOMEWORLD);
  const sample = p => { const out = []; for (let i = 0; i < 64; i++) out.push(rawHeight(p, i * 137.5 - 4000, i * 91.25 + 300)); return out; };
  check(digest(sample(a)) === digest(sample(b)), 'terrain repeatable');
  check(digest(sample(a)) !== digest(sample(c)), 'terrain differs by universe');
  check(Address.parse(HOMEWORLD.child('surface', 2, -3, 4, 0).key).key === HOMEWORLD.child('surface', 2, -3, 4, 0).key, 'address round-trip');
  // Golden values pin the generator: if this changes, saved worlds would regenerate differently.
  const s = getSettlement(a, 0, 0);
  const plan = buildingPlan(a, s, s.buildings[0]);
  const golden = { rng: new Rng(uni(1)).u32(), terrain: digest(sample(a)), town: digest({ n: s.name, b: s.buildings.map(x => [x.type, x.O, x.w, x.d, x.floors]) }), plan: digest({ w: plan.walls.length, d: plan.doors, p: plan.props.length }) };
  const gp = new URL('./golden.json', import.meta.url);
  if (!existsSync(gp)) { writeFileSync(gp, JSON.stringify(golden, null, 1)); console.log('  (wrote golden.json)'); }
  else { const g = JSON.parse(readFileSync(gp)); for (const k in golden) check(g[k] === golden[k], `golden ${k}: ${g[k]} vs ${golden[k]}`); }
};

suites.settlements = () => {
  let towns = 0, buildings = 0, maxRooms = 0;
  for (let n = 0; n < 200; n++) {
    const p = makePlanet(uni(n), HOMEWORLD);
    const s = getSettlement(p, 0, 0);
    if (!check(s, `seed ${n}: spawn region has no settlement`)) continue;
    towns++;
    const tag = `seed ${n} ${s.name}`;
    check(s.buildings.length >= 12, `${tag}: only ${s.buildings.length} buildings`);
    // road graph connected
    const adj = new Map();
    for (const r of s.roads) { (adj.get(r.na) || adj.set(r.na, []).get(r.na)).push(r.nb); (adj.get(r.nb) || adj.set(r.nb, []).get(r.nb)).push(r.na); }
    const start = s.roads[0].na, seen = new Set([start]), st = [start];
    while (st.length) for (const k of adj.get(st.pop())) if (!seen.has(k)) { seen.add(k); st.push(k); }
    check(seen.size === adj.size, `${tag}: road graph disconnected ${seen.size}/${adj.size}`);
    const rr = s.roads.map(roadRect);
    const lots = [...s.buildings, ...s.pads];
    for (const b of lots) {
      for (const r of rr) check(!rectsOverlap(b.rect, r), `${tag}: lot overlaps road`);
      for (const o of lots) if (o !== b) check(!rectsOverlap(b.rect, o.rect, 1.5), `${tag}: lots overlap`);
      // the lot's front edge faces its road within setback distance
      const road = s.roads[b.road], alongU = road.a[1] === road.b[1];
      const c = alongU ? road.a[1] : road.a[0], f = alongU ? b.O[1] : b.O[0];
      check(Math.abs(f - c) <= road.w / 2 + 5.01, `${tag}: entrance not on its road`);
      // flat ground under every corner
      const hs = [[b.rect[0], b.rect[1]], [b.rect[2], b.rect[3]], [b.rect[0], b.rect[3]], [b.rect[2], b.rect[1]]].map(([u, v]) => surfaceHeight(p, ...s.toWorld(u, v)));
      check(Math.max(...hs) - Math.min(...hs) < 0.05, `${tag}: lot not flat (${(Math.max(...hs) - Math.min(...hs)).toFixed(2)} m)`);
    }
    for (const b of s.buildings) {
      buildings++;
      let plan;
      try { plan = buildingPlan(p, s, b); } catch (e) { check(false, `${tag} ${b.type}: ${e.message}`); continue; }
      maxRooms = Math.max(maxRooms, plan.rooms.length);
      const g = roomGraph(plan);
      const seenR = new Set(['outside']), q = ['outside'];
      while (q.length) for (const k of g.get(q.pop()) || []) if (!seenR.has(k)) { seenR.add(k); q.push(k); }
      for (const r of plan.rooms) check(seenR.has(`${r.k}:${r.i}`), `${tag} ${b.type}#${b.n}: room ${r.k}:${r.i} unreachable`);
      if (plan.F > 1) check(seenR.has('core'), `${tag}: core unreachable`);
      for (const d of plan.doors) check(d.rooms[0] !== -1, `${tag} ${b.type}: core door with no room`);
      for (const pr of plan.props) check(pr.x0 >= 0 && pr.x1 <= plan.w && pr.z0 >= 0 && pr.z1 <= plan.d, `${tag}: prop outside building`);
    }
  }
  console.log(`  ${towns} towns, ${buildings} buildings, max rooms/building ${maxRooms}`);
};

suites.seams = () => {
  // Neighbouring chunks sample the ground at identical coordinates → identical edges.
  const p = makePlanet(uni(3), HOMEWORLD);
  for (const size of [64, 512, 4096]) {
    const step = size / 32;
    for (let k = 0; k <= 32; k++) {
      const x = 3 * size, z = -2 * size + k * step;     // shared edge of chunk (2,-2) and (3,-2)
      const left = surfaceHeight(p, 2 * size + 32 * step, z), right = surfaceHeight(p, x, z);
      if (!check(left === right, `seam mismatch size ${size} k ${k}`)) break;
    }
  }
};

suites.persistence = async () => {
  const { WorldStore } = await import('../js/world/store.js');
  const { MemoryBackend } = await import('../js/world/store-mem.js');
  const { Scheduler } = await import('../js/sim/scheduler.js');
  const { registerDoorJobs, forceDoor, openDoor } = await import('../js/sim/processes/doors.js');
  const { doorKey, doorState } = await import('../js/world/doors.js');
  const U = uni(5), p = makePlanet(U, HOMEWORLD), s = getSettlement(p, 0, 0);
  const be = new MemoryBackend(), st = new WorldStore(be);
  st.create(seedHex(U), 1000, Date.now());
  st.setPlayer({ id: 'c1', name: 'Test', keys: [], pos: [0, 0, 0], fatigue: 0.2, fitness: 0.3 });
  const sched = new Scheduler(st); registerDoorJobs(sched);
  await st.flush();
  const base = be.bytes();
  // exploring regenerates content but must not grow the save
  for (let rx = -2; rx <= 2; rx++) for (let rz = -2; rz <= 2; rz++) { const t = getSettlement(p, rx, rz); if (t) for (const b of t.buildings.slice(0, 20)) buildingPlan(p, t, b); }
  await st.flush();
  check(be.bytes() === base, `save grew while only exploring (${base} → ${be.bytes()})`);
  // mutate: open one door, force another
  const b = s.buildings.find(x => x.access === 'residents'), plan = buildingPlan(p, s, b);
  const door = plan.doors[plan.entrance];
  check(doorState(st, p, b, door, 1000).locked, 'residents door starts locked');
  forceDoor(st, sched, p, s, b, door, 1000, st.player);
  const b2 = s.buildings[0], plan2 = buildingPlan(p, s, b2);
  openDoor(st, sched, b2.key, plan2.doors[0], 1000);
  st.player.pos = [12.5, 3, -7]; st.touchPlayer();
  await st.flush();
  // a fresh store over the same backend sees everything
  const st2 = new WorldStore(be); check(await st2.open(), 'reopen');
  check(JSON.stringify([...st2.deltas]) === JSON.stringify([...st.deltas]), 'deltas survive reload');
  check(st2.events.length === 1 && st2.events[0].type === 'forced_entry', 'incident survives reload');
  check(st2.jobs.length === st.jobs.length && st2.jobs.length === 3, 'jobs survive reload ' + st2.jobs.length);
  check(st2.player.pos.join() === '12.5,3,-7', 'player survives reload');
  const ds = doorState(st2, p, b, door, 1000);
  check(ds.broken && !ds.locked, 'forced door still broken after reload');
  // backup → restore into a new backend is lossless
  const be3 = new MemoryBackend(), st3 = new WorldStore(be3);
  await st3.importJSON(st2.exportJSON());
  const st4 = new WorldStore(be3); await st4.open();
  check(st4.exportJSON() === st2.exportJSON(), 'backup/restore round-trip');
};

suites.offline = async () => {
  const { WorldStore } = await import('../js/world/store.js');
  const { MemoryBackend } = await import('../js/world/store-mem.js');
  const { Scheduler } = await import('../js/sim/scheduler.js');
  const { registerDoorJobs, forceDoor } = await import('../js/sim/processes/doors.js');
  const { advanceBody } = await import('../js/sim/processes/character.js');
  const U = uni(6), p = makePlanet(U, HOMEWORLD), s = getSettlement(p, 0, 0);
  const mk = () => {
    const st = new WorldStore(new MemoryBackend()); st.create(seedHex(U), 0, 0);
    st.setPlayer({ id: 'c', name: 'n', keys: [], pos: [0, 0, 0], fatigue: 0.5, fitness: 0.2 });
    const sc = new Scheduler(st); registerDoorJobs(sc);
    s.buildings.slice(0, 8).forEach((b, i) => { const pl = buildingPlan(p, s, b); forceDoor(st, sc, p, s, b, pl.doors[pl.entrance], 100 + i * 977, st.player); });
    return { st, sc, ctx: { store: st, sched: sc, planet: p } };
  };
  const A = mk(), B = mk(), T = 3 * 86400;
  A.sc.runDue(T, A.ctx);
  for (let t = 0; t <= T; t += 3600) B.sc.runDue(t, B.ctx);
  check(JSON.stringify([...A.st.deltas]) === JSON.stringify([...B.st.deltas]), 'deltas: one jump == hourly steps');
  check(JSON.stringify(A.st.events) === JSON.stringify(B.st.events), 'events: one jump == hourly steps');
  check(A.st.events.filter(e => e.type === 'door_repaired').length === 8, 'all forced doors repaired within 3 days');
  for (const act of ['rest', 'train', 'idle']) {
    const one = advanceBody({ fatigue: 0.6, fitness: 0.3 }, act, T, p), many = { fatigue: 0.6, fitness: 0.3 };
    for (let i = 0; i < 72; i++) advanceBody(many, act, 3600, p);
    check(Math.abs(one.fatigue - many.fatigue) < 1e-9 && Math.abs(one.fitness - many.fitness) < 1e-9, `body ${act}: closed form == stepped`);
  }
};

suites.people = async () => {
  const { getPopulation, occupation } = await import('../js/gen/population.js');
  const { whereAt, dayPlan, dayIndex } = await import('../js/gen/schedule.js');
  const { EPOCH } = await import('../js/sim/clock.js');
  let worst = 0, people = 0, employed = 0, routeFails = 0;
  for (let n = 0; n < 6; n++) {
    const p = makePlanet(uni(n), HOMEWORLD), s = getSettlement(p, 0, 0);
    const t0 = performance.now();
    const pop = getPopulation(p, s);
    people += pop.people.length; employed += pop.people.filter(x => x.job).length;
    check(pop.people.length > 150, `seed ${n}: only ${pop.people.length} residents`);
    for (const x of pop.people) {
      const bedOwners = pop.people.filter(y => y.home === x.home && y.bed.anchor === x.bed.anchor && y.bed.slot === x.bed.slot);
      if (bedOwners.length !== 1) { check(false, `${x.id} shares a bed slot`); break; }
    }
    for (const j of pop.jobs) if (j.holder) check(pop.byId.get(j.holder).job === j.id, 'job/holder mismatch');
    // continuity: over two days, nobody teleports (≤ 2.5 m per simulated second, sampled each 7 s)
    const D = dayIndex(p, EPOCH) + 1, T = (D - 0.3) * p.dayLength;
    const sample = pop.people.filter((_, i) => i % 3 === 0);
    for (const x of sample) {
      for (const d of [0, 1]) for (const sg of dayPlan(pop, x, D + d).segs) if (sg.type === 'move' && !sg.route) routeFails++;
      let prev = whereAt(pop, x, T);
      for (let t = T + 7; t < T + 2 * p.dayLength; t += 7) {
        const w = whereAt(pop, x, t);
        const jump = Math.hypot(w.pos[0] - prev.pos[0], w.pos[2] - prev.pos[2]) / 7;
        if (jump > worst) worst = jump;
        if (jump > 2.5) { check(false, `${x.name} (${occupation(pop, x)}) jumped ${jump.toFixed(1)} m/s at ${w.activity}/${prev.activity}`); break; }
        prev = w;
      }
    }
    // at 12:30, people whose shift covers it and who aren't on a day off are at work
    const tn = (D - 0.3 + 12.5 / 24) * p.dayLength;
    const due = pop.people.filter(x => { if (!x.job || x.offDays.includes(D % 7)) return false; const h = pop.jobById.get(x.job).hours; return h[0] <= 12 && h[1] >= 13.5; });
    const atWork = due.filter(x => ['working', 'on duty', 'on patrol'].includes(whereAt(pop, x, tn).activity)).length;
    check(atWork >= 0.85 * due.length, `seed ${n}: only ${atWork}/${due.length} on-shift workers at work at 12:30`);
    const asleep = pop.people.filter(x => whereAt(pop, x, (D - 0.3 + 2.5 / 24) * p.dayLength).activity === 'sleeping').length;
    check(asleep === pop.people.length, `seed ${n}: ${pop.people.length - asleep} awake at 2:30`);
    const officers = pop.people.filter(x => x.job && pop.jobById.get(x.job).security).length;
    check(officers >= 2, `seed ${n}: only ${officers} security staff`);
    if (n === 0) console.log(`  seed 0: ${officers} security staff,`);
    if (n === 0) console.log(`  seed 0: ${pop.people.length} people in ${pop.households.length} households, ${pop.jobs.length} jobs, built in ${(performance.now() - t0).toFixed(0)} ms`);
  }
  check(routeFails === 0, routeFails + ' unroutable trips');
  console.log(`  ${people} people, ${(employed / people * 100).toFixed(0)}% employed, max speed ${worst.toFixed(2)} m/s`);
};

suites.law = async () => {
  const { WorldStore } = await import('../js/world/store.js');
  const { MemoryBackend } = await import('../js/world/store-mem.js');
  const { Scheduler } = await import('../js/sim/scheduler.js');
  const { registerDoorJobs, forceDoor } = await import('../js/sim/processes/doors.js');
  const { registerLawJobs, lodgeIncident } = await import('../js/sim/processes/law.js');
  const { getPopulation } = await import('../js/gen/population.js');
  const { getPolity } = await import('../js/gen/polity.js');
  const { newCharacter } = await import('../js/gen/character.js');
  const { EPOCH } = await import('../js/sim/clock.js');
  const U = uni(7), p = makePlanet(U, HOMEWORLD), s = getSettlement(p, 0, 0), pop = getPopulation(p, s), polity = getPolity(p, s);
  check(polity.security && pop.people.some(x => x.job && pop.jobById.get(x.job).security), 'town has a staffed security office');
  const setup = () => {
    const st = new WorldStore(new MemoryBackend()); st.create(seedHex(U), EPOCH, 0);
    const pl = newCharacter(U, p, s, pop, 1, EPOCH); pl.pos = [0, 0, 0]; st.setPlayer(pl);
    const sc = new Scheduler(st); registerDoorJobs(sc); registerLawJobs(sc);
    return { st, sc, ctx: { store: st, sched: sc, planet: p, s, pop, polity } };
  };
  const shops = s.buildings.filter(b => b.type === 'store');
  const officer = pop.people.find(x => x.job && pop.jobById.get(x.job).security);
  const stranger = pop.people.find(x => x.age > 30 && x.home !== undefined);
  const scenario = (A, steps) => {
    const { st, sc, ctx } = A, credits0 = st.player.credits;
    const crime = (b, t, wit) => { const pl = buildingPlan(p, s, b); const ev = forceDoor(st, sc, p, s, b, pl.doors[pl.entrance], t, st.player, wit); lodgeIncident(ctx, ev); return ev; };
    const e1 = crime(shops[0], EPOCH + 100, [{ id: officer.id, name: officer.name, dist: 5 }]);
    const e2 = crime(shops[1], EPOCH + 200, []);
    const e3 = crime(shops[2], EPOCH + 300, [{ id: stranger.id, name: stranger.name, dist: 8 }]);
    const T = EPOCH + 4 * p.dayLength;
    if (steps) for (let t = EPOCH; t <= T; t += 1800) sc.runDue(t, ctx); else sc.runDue(T, ctx);
    return { st, e1, e2, e3, credits0 };
  };
  const A = scenario(setup(), false), B = scenario(setup(), true);
  const fined = A.st.events.filter(e => e.type === 'fined');
  check(fined.some(e => e.incident === A.e1.id), 'an officer who saw it gets you fined');
  check(fined.find(e => e.incident === A.e1.id)?.t - A.e1.t < 600, 'caught in the act: fined within minutes');
  check(A.st.events.some(e => e.type === 'break_in_discovered' && e.incident === A.e2.id), 'an unwitnessed break-in is discovered by someone who works there');
  const c2 = A.st.getDelta('case/' + A.e2.id);
  check(c2 && (c2.status === 'cold' || c2.status === 'closed'), 'the unwitnessed case is resolved one way or the other (' + c2?.status + ')');
  check(A.st.player.credits === A.credits0 - fined.reduce((n, e) => n + e.amount, 0), 'fines come out of your credits');
  check(A.st.player.record.length === fined.length, 'each fine is on your record');
  check(JSON.stringify(A.st.events) === JSON.stringify(B.st.events) && JSON.stringify([...A.st.deltas]) === JSON.stringify([...B.st.deltas]) && A.st.player.credits === B.st.player.credits,
    'law outcomes: one jump == half-hour steps');
  console.log(`  ${polity.name}: ${fined.length}/3 crimes fined, case 2 ${c2?.status}, case 3 ${A.st.getDelta('case/' + A.e3.id)?.status || 'never reported'}`);
};

suites.careers = async () => {
  const { WorldStore } = await import('../js/world/store.js');
  const { MemoryBackend } = await import('../js/world/store-mem.js');
  const { Scheduler } = await import('../js/sim/scheduler.js');
  const { registerDoorJobs } = await import('../js/sim/processes/doors.js');
  const { registerLawJobs } = await import('../js/sim/processes/law.js');
  const { registerWorkJobs, applyFor, leaveJob, attend } = await import('../js/sim/processes/work.js');
  const { vacancies, openings, shiftOn, roleFor, assess } = await import('../js/gen/careers.js');
  const { catchUp } = await import('../js/sim/offline.js');
  const { getPopulation } = await import('../js/gen/population.js');
  const { getPolity } = await import('../js/gen/polity.js');
  const { newCharacter } = await import('../js/gen/character.js');
  const { EPOCH } = await import('../js/sim/clock.js');
  const { dayIndex } = await import('../js/gen/schedule.js');
  // every town posts some openings each week, none of them already held
  let weeksWithout = 0, total = 0, unstaffed = 0, places = 0;
  for (let n = 0; n < 30; n++) {
    const p = makePlanet(uni(n), HOMEWORLD), s = getSettlement(p, 0, 0), pop = getPopulation(p, s), none = { getDelta: () => null };
    for (let w = 0; w < 4; w++) {
      const v = vacancies(pop, none, EPOCH + w * 7 * p.dayLength);
      total += v.length; if (!v.length) weeksWithout++;
      check(v.every(j => !j.holder && roleFor(j)), `seed ${n}: listed job already held`);
    }
    places += new Set(pop.jobs.map(j => j.b)).size;
    unstaffed += pop.s.buildings.filter(b => pop.jobs.some(j => j.b === b.key)).filter(b => !pop.jobs.some(j => j.b === b.key && j.holder)).length;
  }
  check(weeksWithout === 0, weeksWithout + ' town-weeks with no openings');
  check(unstaffed <= 0.02 * places, `${unstaffed}/${places} workplaces with nobody working`);
  console.log(`  ${(total / 120).toFixed(1)} openings per town-week, ${unstaffed}/${places} workplaces unstaffed (towns short of adults)`);

  const U = uni(3), p = makePlanet(U, HOMEWORLD), s = getSettlement(p, 0, 0), pop = getPopulation(p, s), polity = getPolity(p, s);
  const setup = skills => {
    const st = new WorldStore(new MemoryBackend()); st.create(seedHex(U), EPOCH, 0);
    const pl = newCharacter(U, p, s, pop, 1, EPOCH); pl.pos = [0, 0, 0]; if (skills) pl.skills = skills; st.setPlayer(pl);
    const sc = new Scheduler(st); registerDoorJobs(sc); registerLawJobs(sc); registerWorkJobs(sc);
    return { st, sc, ctx: { store: st, sched: sc, planet: p, s, pop, polity, homeDoorstep: [1, 2, 3], doorstepOf: () => [4, 5, 6] } };
  };
  const clerk = vacancies(pop, { getDelta: () => null }, EPOCH).find(j => j.title === 'Clerk') || vacancies(pop, { getDelta: () => null }, EPOCH)[0];
  // unqualified: turned down with the reason, deterministically
  { const A = setup({ admin: 0.05, trade: 0.05, tech: 0.05 });
    check(assess(pop, polity, A.st.player, clerk).chance === 0, 'no skill → no chance');
    const r = applyFor(A.ctx, clerk, EPOCH + 60); check(r.ok, 'application accepted for review');
    check(!applyFor(A.ctx, clerk, EPOCH + 120).ok, 'cannot apply twice');
    A.sc.runDue(EPOCH + 2 * p.dayLength, A.ctx);
    const ev = A.st.events.find(e => e.type === 'application_rejected');
    check(ev && /needs/.test(ev.why), 'rejected, with the requirement as the reason: ' + ev?.why);
    check(ev && ev.t >= r.at - 1, 'decided when the reviewer gets to it'); }
  // qualified: hired, keys, shifts; a working week offline pays, and slicing does not matter
  const week = (steps) => {
    const A = setup({ admin: 0.95, trade: 0.95, tech: 0.95 }); A.st.player.fitness = 0.9;
    applyFor(A.ctx, clerk, EPOCH + 60);
    A.sc.runDue(EPOCH + 2 * p.dayLength, A.ctx);
    const pl = A.st.player, hiredAt = EPOCH + 2 * p.dayLength;
    if (!pl.job) return { A, pl };
    const c0 = pl.credits, T = hiredAt + 7 * p.dayLength;
    if (steps) { let t = hiredAt; while (t < T) { const nx = Math.min(T, t + 7777); pl.activity = 'work'; catchUp(A.ctx, t, nx, 'work'); t = nx; } }
    else catchUp(A.ctx, hiredAt, T, 'work');
    return { A, pl, c0, hiredAt, T };
  };
  const W = week(false), V = week(true);
  check(W.pl.job?.id === clerk.id, 'a qualified applicant is hired (' + (W.A.st.events.find(e => e.type === 'application_rejected')?.why || '') + ')');
  if (W.pl.job) {
    check(W.pl.keys.includes(clerk.b), 'staff key for the workplace');
    check(W.A.st.getDelta('job/' + clerk.id)?.holder === W.pl.id, 'the position is a delta, no longer listed');
    check(!vacancies(pop, W.A.st, EPOCH).some(j => j.id === clerk.id), 'not listed once taken');
    const worked = W.A.st.events.filter(e => e.type === 'shift_worked' && e.t > W.hiredAt);
    let expect = 0; for (let D = dayIndex(p, W.hiredAt) - 1; D <= dayIndex(p, W.T); D++) { const sh = shiftOn(p, W.pl.job, D); if (sh && sh.t0 >= W.hiredAt && sh.t1 <= W.T) expect++; }
    check(worked.length === expect && expect >= 4, `worked every shift in the week (${worked.length}/${expect})`);
    check(W.pl.credits - W.c0 === W.A.st.events.filter(e => e.type.startsWith('shift_') && e.t > W.hiredAt).reduce((n, e) => n + e.pay, 0) && W.pl.credits > W.c0, 'wages paid into credits: +' + (W.pl.credits - W.c0) + ' vs ' + JSON.stringify(W.A.st.events.filter(e => e.t > W.hiredAt).map(e => [e.type, e.pay, e.frac])));
    check(JSON.stringify(W.A.st.events) === JSON.stringify(V.A.st.events) && W.pl.credits === V.pl.credits && JSON.stringify(W.pl.skills) === JSON.stringify(V.pl.skills),
      'a working week: one jump == 2-hour slices');
    // online attendance: present for half a shift → paid for half
    const A = W.A, pl = A.st.player;
    A.sc.runDue(pl.shift.t1, A.ctx);              // settle the shift the week ended in; start clean
    const sh = pl.shift;
    for (let t = sh.t0; t < (sh.t0 + sh.t1) / 2; t += 1) attend(A.ctx, t + 1, 1, pl.job.b);
    attend(A.ctx, sh.t1, 5, 'elsewhere');
    A.sc.runDue(sh.t1, A.ctx);
    const last = A.st.events.at(-1);
    check(last.type === 'shift_worked' && Math.abs(last.frac - 0.5) < 0.01, 'half a shift present online = half pay (' + last.frac + ')');
    // stop going: dismissed after three missed shifts, key returned
    catchUp(A.ctx, sh.t1, sh.t1 + 6 * p.dayLength, 'rest');
    check(A.st.events.some(e => e.type === 'dismissed') && !pl.job, 'missing shifts gets you dismissed');
    check(!pl.keys.includes(clerk.b) && A.st.getDelta('job/' + clerk.id)?.holder === null, 'key returned, position open again');
    check(pl.career.length === 1 && pl.career[0].why === 'dismissed', 'career history records it');
  }
  console.log(`  ${clerk.title} at ${clerk.employer}: ${W.A.st.events.filter(e => e.type === 'shift_worked').length} shifts, +${W.pl.credits - W.c0} cr`);
};

const want = process.argv.slice(2);
for (const [name, fn] of Object.entries(suites)) {
  if (want.length && !want.includes(name)) continue;
  const t = performance.now(); const before = failures;
  console.log(`[${name}]`);
  try { await fn(); } catch (e) { failures++; console.log('  THREW', e.stack); }
  console.log(`  ${failures === before ? 'ok' : 'FAILED'} (${(performance.now() - t).toFixed(0)} ms)`);
}
if (failures) { console.log(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall green');
