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

suites.roads = async () => {
  // roads out of town are routed around steep ground: the graded surface along every
  // road stays within the grade limit, and roads stay inside their region
  const { outRoutes, MAX_GRADE } = await import('../js/gen/highways.js');
  const { surfaceHeight } = await import('../js/gen/surface.js');
  const { REGION } = await import('../js/core/units.js');
  let worst = 0, total = 0, n = 0;
  for (let k = 0; k < 24; k++) {
    const p = makePlanet(uni(k), HOMEWORLD), s = getSettlement(p, 0, 0);
    for (const r of outRoutes(p, s)) {
      const hs = r.pts.map(([x, z]) => surfaceHeight(p, x, z));
      for (let i = 3; i < hs.length - 14; i++) worst = Math.max(worst, Math.abs(hs[i] - hs[i - 3]) / 12);
      check(r.pts.every(([x, z]) => x > s.rx * REGION + 30 && z > s.rz * REGION + 30 && x < (s.rx + 1) * REGION - 30 && z < (s.rz + 1) * REGION - 30), `seed ${k}: road ${r.id} leaves its region`);
      check(r.length > 600, `seed ${k}: road ${r.id} only ${r.length} m`);
      total += r.length; n++;
    }
  }
  check(worst <= MAX_GRADE + 0.005, `steepest graded road ${(worst * 100).toFixed(1)}% (limit ${MAX_GRADE * 100}%)`);
  console.log(`  ${n} roads, average ${(total / n).toFixed(0)} m, steepest ${(worst * 100).toFixed(1)}%`);
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
  const { registerLawJobs, lodgeIncident, payFines, issueWarrant, PAY_DAYS } = await import('../js/sim/processes/law.js');
  const { getPopulation } = await import('../js/gen/population.js');
  const { getPolity } = await import('../js/gen/polity.js');
  const { newCharacter } = await import('../js/gen/character.js');
  const { holdingCell } = await import('../js/gen/custody.js');
  const { doorKey } = await import('../js/world/doors.js');
  const { EPOCH } = await import('../js/sim/clock.js');
  const U = uni(7), p = makePlanet(U, HOMEWORLD), s = getSettlement(p, 0, 0), pop = getPopulation(p, s), polity = getPolity(p, s);
  check(polity.security && pop.people.some(x => x.job && pop.jobById.get(x.job).security), 'town has a staffed security office');
  const setup = () => {
    const st = new WorldStore(new MemoryBackend()); st.create(seedHex(U), EPOCH, 0);
    const pl = newCharacter(U, p, s, pop, 1, EPOCH); pl.pos = [0, 0, 0]; st.setPlayer(pl);
    const sc = new Scheduler(st); registerDoorJobs(sc); registerLawJobs(sc);
    return { st, sc, ctx: { store: st, sched: sc, planet: p, s, pop, polity, doorstepOf: () => [9, 9, 9] } };
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
    const T = EPOCH + 8 * p.dayLength;
    ctx.offline = { tFrom: EPOCH + 300, tTo: T, activity: 'idle' };          // the player is away the whole time
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
  const arrests = A.st.events.filter(e => e.type === 'arrested');
  check(A.st.events.some(e => e.type === 'warrant' && /seen by/.test(e.reason)), 'an officer who saw it issues a warrant at once');
  check(arrests.length >= 1 && arrests[0].t - A.e1.t < 7 * 3600, 'away, the warrant is served within hours');
  check(fined.every(e => e.due - e.t === PAY_DAYS * p.dayLength), 'fines are owed, due in ' + PAY_DAYS + ' days');
  check(A.st.player.credits === A.credits0 - arrests.reduce((n, e) => n + e.paid, 0), 'arrest takes the fines owed from your credits');
  check(arrests.reduce((n, e) => n + e.paid, 0) + A.st.player.fines.reduce((n, f) => n + f.amount, 0) === fined.reduce((n, e) => n + e.amount, 0), 'every fine is either paid at an arrest or still owed');
  check(A.st.player.record.length === fined.length, 'each fine is on your record');
  check(!A.st.player.custody && A.st.events.filter(e => e.type === 'released').length === arrests.length, 'released after each sentence');
  const cell = holdingCell(p, s, polity);
  check(cell && cell.doors.every(d => !A.st.getDelta(doorKey(cell.b.key, d.id))?.held), 'the cell door is unlocked again');
  check(!pop.people.some(x => x.job && pop.jobById.get(x.job).b === cell.b.key && pop.jobById.get(x.job).anchor !== undefined && buildingPlan(p, s, cell.b).anchors[pop.jobById.get(x.job).anchor].room === cell.room.i), 'nobody works in the holding cell');
  check(JSON.stringify(A.st.events) === JSON.stringify(B.st.events) && JSON.stringify([...A.st.deltas]) === JSON.stringify([...B.st.deltas]) && A.st.player.credits === B.st.player.credits,
    'law outcomes: one jump == half-hour steps');
  // paying at the office: clears fines and the warrant they caused; needs the money
  { const C = setup(), pl = C.st.player;
    const ev = forceDoor(C.st, C.sc, p, s, shops[3], buildingPlan(p, s, shops[3]).doors[buildingPlan(p, s, shops[3]).entrance], EPOCH + 10, pl, [{ id: officer.id, name: officer.name, dist: 3 }]);
    lodgeIncident(C.ctx, ev);
    C.sc.runDue(EPOCH + 600, C.ctx);                           // in game (no ctx.offline): owed, wanted, not yet arrested
    const owed = pl.fines.reduce((n, f) => n + f.amount, 0);
    check(owed > 0 && pl.warrant && !pl.custody, 'in game: fine owed and a warrant out, no abstract arrest');
    pl.credits = owed - 1; check(!payFines(C.ctx, EPOCH + 700).ok, "can't pay without the money");
    pl.credits = owed + 50; const r = payFines(C.ctx, EPOCH + 700);
    check(r.ok && pl.credits === 50 && !pl.fines.length && !pl.warrant, 'paying clears the fines and withdraws the warrant');
    C.sc.runDue(EPOCH + 10 * p.dayLength, C.ctx);
    check(!C.st.events.some(e => e.type === 'arrested' || (e.type === 'warrant' && e.t > EPOCH + 700)), 'nothing further happens once paid'); }
  console.log(`  ${polity.name}: ${fined.length}/3 crimes fined, ${arrests.length} arrest(s) (${arrests.map(e => e.hours + ' h').join(', ')}), case 2 ${c2?.status}, case 3 ${A.st.getDelta('case/' + A.e3.id)?.status || 'never reported'}`);
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
    // in a cell during a shift you can't keep your routine
    { const sh2 = pl.shift; pl.custodyLog = [{ from: sh2.t0, to: sh2.t1 }];
      catchUp(A.ctx, sh2.t0 - 10, sh2.t1 + 10, 'work');
      const e = A.st.events.filter(x => x.type.startsWith('shift_')).at(-1);
      check(e.type === 'shift_missed' && e.pay === 0, 'a shift spent in custody is not worked'); pl.custodyLog = []; }
    // stop going: dismissed after three missed shifts, key returned
    catchUp(A.ctx, sh.t1, sh.t1 + 6 * p.dayLength, 'rest');
    check(A.st.events.some(e => e.type === 'dismissed') && !pl.job, 'missing shifts gets you dismissed');
    check(!pl.keys.includes(clerk.b) && A.st.getDelta('job/' + clerk.id)?.holder === null, 'key returned, position open again');
    check(pl.career.length === 1 && pl.career[0].why === 'dismissed', 'career history records it');
  }
  console.log(`  ${clerk.title} at ${clerk.employer}: ${W.A.st.events.filter(e => e.type === 'shift_worked').length} shifts, +${W.pl.credits - W.c0} cr`);
};

suites.pursuit = async () => {
  const { CollisionWorld } = await import('../js/player/collision.js');
  const { Pursuit } = await import('../js/sim/pursuit.js');
  const { getPopulation } = await import('../js/gen/population.js');
  const { getPolity } = await import('../js/gen/polity.js');
  const { whereAt } = await import('../js/gen/schedule.js');
  const { tripPoints } = await import('../js/gen/paths.js');
  const { doorstep } = await import('../js/gen/place.js');
  const { EPOCH } = await import('../js/sim/clock.js');
  const p = makePlanet(uni(4), HOMEWORLD), s = getSettlement(p, 0, 0), pop = getPopulation(p, s), polity = getPolity(p, s);
  const world = new CollisionWorld(p, s, () => true);
  const t0 = EPOCH + p.dayLength * (10.2 - 7.2) / 24;           // mid-morning: day shift on
  const officer = pop.people.find(x => x.job && pop.jobById.get(x.job).security && ['on duty', 'on patrol'].includes(whereAt(pop, x, t0).activity));
  if (!check(officer, 'an officer on duty mid-morning')) return;
  const hq = pop.buildingByKey.get(polity.security);
  // the player's path: from near the HQ to a far building, along the streets
  const far = s.buildings.slice().sort((a, b) => Math.hypot(b.O[0] - hq.O[0], b.O[1] - hq.O[1]) - Math.hypot(a.O[0] - hq.O[0], a.O[1] - hq.O[1]))[0];
  const ds = doorstep(s, hq, buildingPlan(p, s, hq));
  const path = (() => { const plan = buildingPlan(p, s, far), q = tripPoints(p, s, { street: s.toLocal(ds.pos[0], ds.pos[2]), road: hq.road }, { b: far, plan, spot: { k: 0, room: plan.doors[plan.entrance].rooms[0], x: plan.doors[plan.entrance].x, z: 2 } }); return q.filter(v => v[1] < s.h + 0.5); })();
  const along = d => { let acc = 0; for (let i = 1; i < path.length; i++) { const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][2] - path[i - 1][2]); if (acc + l >= d) { const f = (d - acc) / l; return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * f, s.h, path[i - 1][2] + (path[i][2] - path[i - 1][2]) * f]; } acc += l; } return path.at(-1).slice(); };
  const run = (speed, head = 0) => {
    const P = new Pursuit(pop, officer, t0, 'test');
    let t = t0, d = 0, ev = null, jump = 0, prev = P.pos.slice(), chased = false;
    for (let i = 0; i < 20 * 400 && !['caught', 'lost'].includes(ev); i++) {
      // the player waits by the doorstep until the officer is within 8 m, then (maybe) runs
      const near = Math.hypot(P.pos[0] - along(d)[0], P.pos[2] - along(d)[2]) < 8;
      if (speed && (near || d > 0)) d += speed * 0.05;
      ev = P.update(t, 0.05, { pos: along(d), speed: speed && d > 0 ? speed : 0 }, world, s);
      if (ev === 'chase') chased = true;
      jump = Math.max(jump, Math.hypot(P.pos[0] - prev[0], P.pos[2] - prev[2]) / 0.05); prev = P.pos.slice(); t += 0.05;
    }
    return { ev, secs: t - t0, jump, chased, resisted: P.resisted, ran: d };
  };
  const still = run(0), fast = run(6.2), slow = run(3.6);
  check(still.ev === 'caught' && !still.resisted, `standing still: arrested quietly (${still.ev} after ${still.secs.toFixed(0)} s)`);
  check(fast.ev === 'lost' && fast.chased, `running at 6.2 m/s: chased, then lost (${fast.ev}, ran ${fast.ran.toFixed(0)} m)`);
  check(slow.ev === 'caught' && slow.resisted, `running at 3.6 m/s: caught, and it counts as running (${slow.ev})`);
  check(Math.max(still.jump, fast.jump, slow.jump) < 6, 'the officer never moves faster than a run (' + Math.max(still.jump, fast.jump, slow.jump).toFixed(1) + ' m/s)');
  console.log(`  ${officer.name}: quiet arrest in ${still.secs.toFixed(0)} s; caught a slow runner in ${slow.secs.toFixed(0)} s; lost a fast one after ${fast.ran.toFixed(0)} m`);
};

suites.life = async () => {
  const { WorldStore } = await import('../js/world/store.js');
  const { MemoryBackend } = await import('../js/world/store-mem.js');
  const { Scheduler } = await import('../js/sim/scheduler.js');
  const { registerWorkJobs, applyFor } = await import('../js/sim/processes/work.js');
  const { registerLifeJobs, scheduleLife } = await import('../js/sim/processes/life.js');
  const { livePopulation, refreshLife, bedSlots, lifeKey } = await import('../js/world/town.js');
  const { vacancies, weekOf } = await import('../js/gen/careers.js');
  const { getPolity } = await import('../js/gen/polity.js');
  const { newCharacter } = await import('../js/gen/character.js');
  const { getPopulation } = await import('../js/gen/population.js');
  const { whereAt } = await import('../js/gen/schedule.js');
  const { EPOCH } = await import('../js/sim/clock.js');
  const U = uni(5), p = makePlanet(U, HOMEWORLD), s = getSettlement(p, 0, 0), polity = getPolity(p, s);
  const setup = () => {
    const st = new WorldStore(new MemoryBackend()); st.create(seedHex(U), EPOCH, 0);
    const pop = livePopulation(p, s, st, EPOCH);
    const pl = newCharacter(U, p, s, pop, 1, EPOCH); pl.pos = [0, 0, 0]; st.setPlayer(pl); refreshLife(pop, st, EPOCH);
    const sc = new Scheduler(st); registerWorkJobs(sc); registerLifeJobs(sc); scheduleLife(st, p, s, EPOCH);
    return { st, sc, pop, pl, ctx: { store: st, sched: sc, planet: p, s, pop, polity } };
  };
  const YEAR = p.yearLength, days = YEAR / p.dayLength;
  // ten years, one jump
  const A = setup(), n0 = A.pop.people.length, hh0 = A.pop.households.length, gen = getPopulation(p, s);
  const sizes = []; let at4 = null;
  for (let y = 1; y <= 10; y++) { A.sc.runDue(EPOCH + y * YEAR, A.ctx); sizes.push(A.pop.people.length); if (y === 4) at4 = { life: digest(A.st.getDelta(lifeKey(s))), ev: digest(A.st.events.map(e => [e.t, e.type, e.who])) }; }
  const kinds = {};
  for (const e of A.st.events) kinds[e.type] = (kinds[e.type] || 0) + 1;
  for (const k of ['died', 'born', 'resident_hired', 'resident_quit', 'resident_retired', 'left_home', 'household_moved', 'household_left', 'household_arrived'])
    check(kinds[k] > 0, `ten years with no "${k}"`);
  check(Math.min(...sizes) > 0.7 * n0 && Math.max(...sizes) < 1.35 * n0, `population stays a town: ${n0} → ${sizes.join(', ')}`);
  check(gen.people.length === n0 && gen.people.every(x => !x.gone), 'the generated population is untouched');
  // invariants on the town as it now stands
  const pop = A.pop, units = new Map();
  for (const h of pop.households) { check(!units.has(h.unit), `two households in ${h.unit}`); units.set(h.unit, h.id); check(h.members.length > 0, 'empty household ' + h.id); }
  const seenIn = new Set();
  for (const h of pop.households) for (const id of h.members) { check(!seenIn.has(id), id + ' in two households'); seenIn.add(id); }
  check(pop.people.every(x => seenIn.has(x.id)) && seenIn.size === pop.people.length, 'everyone in town belongs to exactly one household');
  let beds = 0;
  for (const h of pop.households) { const u = pop.unitByKey.get(h.unit); check(h.members.length + (u.player ? 1 : 0) <= bedSlots(u).length + (u.player ? 1 : 0), `${h.unit}: more people than beds`); beds += bedSlots(u).length; }
  const holders = pop.jobs.filter(j => j.holder && j.holder !== A.pl.id).map(j => j.holder);
  check(new Set(holders).size === holders.length, 'nobody holds two jobs');
  check(holders.every(id => pop.byId.get(id) && !pop.byId.get(id).gone), 'every job holder still lives in town');
  check(pop.people.every(x => !x.job || (x.age >= 18 && x.age < 67)), 'workers are 18–66');
  const old = gen.people.find(x => !pop.byId.get(x.id).gone);
  check(old && pop.byId.get(old.id).age >= old.age + 9, `people age: ${old?.age} → ${pop.byId.get(old?.id)?.age}`);
  let bad = 0; for (const x of pop.people.slice(0, 120)) { const w = whereAt(pop, x, EPOCH + 10 * YEAR + 0.5 * p.dayLength); if (!w || !w.pos.every(Number.isFinite)) bad++; }
  check(bad === 0, `${bad} residents with no place in the day`);
  const added = pop.people.filter(x => /\/n\d+$/.test(x.id)).length;
  console.log(`  10 years: ${n0} → ${pop.people.length} people (${added} born or arrived), ${hh0} → ${pop.households.length} households; ` + Object.entries(kinds).filter(([k]) => !/shift|life_began/.test(k)).map(([k, v]) => `${k} ${v}`).join(', '));
  // the same years lived in 61 uneven slices end identically
  const B = setup();
  for (let i = 1; i <= 61; i++) B.sc.runDue(EPOCH + 4 * YEAR * Math.pow(i / 61, 1.7), B.ctx);
  check(digest(B.st.getDelta(lifeKey(s))) === at4.life, 'four years in yearly jumps == in 61 uneven slices (lives)');
  check(digest(B.st.events.map(e => [e.t, e.type, e.who])) === at4.ev, 'same events either way');
  // a save reloads to the same town
  const C = new WorldStore(new MemoryBackend()); await C.importJSON(A.st.exportJSON());
  const popC = livePopulation(p, s, C, EPOCH + 10 * YEAR);
  check(digest(popC.people.map(x => [x.id, x.home, x.job, x.age])) === digest(pop.people.map(x => [x.id, x.home, x.job, x.age])), 'reloaded save gives the same people, homes and jobs');
  // residents compete for the postings: a job you applied for can go to someone else first
  const D = setup(); let lost = null;
  for (let d = 0; d < 400 && !lost; d++) {
    const t0 = EPOCH + d * p.dayLength + 0.1;
    const post = vacancies(D.pop, D.st, t0).find(j => !D.st.player.applications.some(a => a.job === j.id));
    D.st.player.skills = { admin: 0.99, trade: 0.99, tech: 0.99 }; D.st.player.fitness = 0.99; D.st.player.applications = []; D.st.player.job = null;
    if (post) applyFor(D.ctx, post, t0);
    D.sc.runDue(t0 + p.dayLength, D.ctx);
    lost = D.st.events.find(e => e.type === 'application_rejected' && /filled/.test(e.why));
  }
  check(lost, 'a resident took a posted job before the player\'s application was read');
  if (lost) { const e = D.st.events.find(x => x.type === 'resident_hired' && x.title === lost.title && x.employer === lost.employer && x.t <= lost.t); check(e, 'and the hire is in the log: ' + (e ? e.whoName : 'missing')); }
  // a week's postings are stable: taking one strikes it off without another taking its place
  const E = setup(); let stable = true;
  for (let d = 0; d < 120; d++) {
    const t = EPOCH + d * p.dayLength + 1, before = vacancies(E.pop, E.st, t).map(j => j.id);
    E.sc.runDue(t + p.dayLength - 2, E.ctx);
    const after = vacancies(E.pop, E.st, t + p.dayLength - 2).map(j => j.id);
    const sameWeek = weekOf(p, t) === weekOf(p, t + p.dayLength - 2);
    if (sameWeek && after.some(id => !before.includes(id))) stable = false;
  }
  check(stable, 'nothing appears on a week\'s board mid-week');
};

suites.climb = async () => {
  const { CollisionWorld } = await import('../js/player/collision.js');
  const { Controller } = await import('../js/player/controller.js');
  const { laddersIn } = await import('../js/gen/climb.js');
  const { buildingPlan } = await import('../js/gen/building.js');
  const { buildingToWorld } = await import('../js/gen/place.js');
  const { surfaceHeight } = await import('../js/gen/surface.js');
  const p = makePlanet(uni(4), HOMEWORLD), s = getSettlement(p, 0, 0), world = new CollisionWorld(p, s, () => false);
  const run = (c, input, secs) => { for (let t = 0; t < secs; t += 1 / 120) c.step(1 / 120, { fwd: 0, right: 0, run: false, jump: false, yaw: c.facing, ...input }); };
  // ladders: one per non-house building that has a clear spot; up onto the roof and back down
  const ls = laddersIn(p, s), cands = s.buildings.filter(b => b.type !== 'house').length;
  check(ls.length >= 0.8 * cands, `${ls.length}/${cands} buildings have a fire ladder`);
  let up = 0, down = 0;
  for (const l of ls.slice(0, 12)) {
    const c = new Controller(world, l.foot); run(c, {}, 0.3);
    c.grabLadder(l); run(c, { fwd: 1 }, 40);
    const w = world.locate(...c.pos);
    if (c.mode === 'walk' && w?.roof && Math.abs(c.pos[1] - l.roof[1]) < 0.3) up++;
    c.grabLadder(l); run(c, { fwd: -1 }, 40);
    if (c.mode === 'walk' && Math.abs(c.pos[1] - surfaceHeight(p, c.pos[0], c.pos[2])) < 0.3) down++;
  }
  check(up === Math.min(12, ls.length), `climbed onto the roof ${up}/${Math.min(12, ls.length)} times`);
  check(down === Math.min(12, ls.length), `climbed back down ${down}/${Math.min(12, ls.length)} times`);
  // pulling yourself onto furniture: walk at a solid prop 0.6–1.2 m high and press Space
  let tried = 0, onto = 0, jumpedOnly = 0;
  for (const b of s.buildings) {
    if (tried >= 10) break;
    const plan = buildingPlan(p, s, b);
    for (const pr of plan.props) {
      if (pr.soft || pr.h < 0.6 || pr.h > 1.2 || pr.y > 0.1 || tried >= 10) continue;
      const room = plan.rooms.find(r => r.k === 0 && pr.x0 > r.rect[0] + 1.2 && pr.x1 < r.rect[2] - 1.2 && pr.z0 > r.rect[1] + 1.2 && pr.z1 < r.rect[3] - 1.2);
      if (!room || pr.x1 - pr.x0 < 0.6 || pr.z1 - pr.z0 < 0.6) continue;
      const cx = (pr.x0 + pr.x1) / 2, start = buildingToWorld(s, b, cx, 0, pr.z0 - 0.75), target = buildingToWorld(s, b, cx, 0, pr.z0 + 0.3);
      const c = new Controller(world, start); run(c, {}, 0.3);
      c.facing = Math.atan2(target[0] - start[0], target[2] - start[2]);
      if (world.ledgeAhead(...c.pos, c.facing) === null) continue;
      tried++;
      c.step(1 / 120, { fwd: 1, right: 0, run: false, jump: true, yaw: c.facing }); run(c, { fwd: 0 }, 3);
      const top = start[1] + pr.y + pr.h;
      if (Math.abs(c.pos[1] - top) < 0.08) onto++; else jumpedOnly++;
    }
  }
  check(tried >= 5 && onto === tried, `pulled up onto furniture ${onto}/${tried}`);
  // a slope too steep to walk can be scrambled up, slowly; exhausted, you can't
  let found = null;
  for (let k = 0; k < 4000 && !found; k++) {
    const a = k * 2.39996, r = s.R + 400 + (k % 400) * 3, x = s.cx + Math.cos(a) * r, z = s.cz + Math.sin(a) * r;
    for (let q = 0; q < 8; q++) { const th = q * Math.PI / 4, dx = Math.sin(th), dz = Math.cos(th), h0 = surfaceHeight(p, x, z), h1 = surfaceHeight(p, x + dx, z + dz), h2 = surfaceHeight(p, x + 6 * dx, z + 6 * dz);
      if ((h1 - h0) > 1.4 && (h2 - h0) / 6 > 1.3) { found = { x, z, facing: th }; break; } }
  }
  check(found, 'found a slope steeper than 52°');
  if (found) {
    const climb = tired => { const c = new Controller(world, [found.x, surfaceHeight(p, found.x, found.z), found.z]); c.facing = found.facing; run(c, {}, 0.3); const y0 = c.pos[1]; run(c, { fwd: 1, yaw: found.facing, tired }, 4); return { rise: c.pos[1] - y0, speed: Math.hypot(c.pos[0] - found.x, c.pos[2] - found.z) / 4 }; };
    const fresh = climb(false), tired = climb(true);
    check(fresh.rise > 1 && fresh.speed < 1.0, `scrambled up ${fresh.rise.toFixed(1)} m in 4 s (${fresh.speed.toFixed(2)} m/s along the ground)`);
    check(tired.rise < 0.3, `exhausted: can't climb it (${tired.rise.toFixed(2)} m)`);
  }
  console.log(`  ${ls.length} ladders; ${onto} furniture climbs`);
};

suites.items = async () => {
  const { WorldStore } = await import('../js/world/store.js');
  const { MemoryBackend } = await import('../js/world/store-mem.js');
  const { Scheduler } = await import('../js/sim/scheduler.js');
  const { registerLawJobs, lodgeIncident } = await import('../js/sim/processes/law.js');
  const U2 = await import('../js/sim/processes/use.js');
  const { ITEMS, massOf } = await import('../js/gen/items.js');
  const { getPopulation } = await import('../js/gen/population.js');
  const { getPolity } = await import('../js/gen/polity.js');
  const { newCharacter } = await import('../js/gen/character.js');
  const { advanceBody } = await import('../js/sim/processes/character.js');
  const { catchUp } = await import('../js/sim/offline.js');
  const { EPOCH, solarHour } = await import('../js/sim/clock.js');
  const U = uni(7), p = makePlanet(U, HOMEWORLD), s = getSettlement(p, 0, 0), pop = getPopulation(p, s), polity = getPolity(p, s);
  const setup = () => {
    const st = new WorldStore(new MemoryBackend()); st.create(seedHex(U), EPOCH, 0);
    const pl = newCharacter(U, p, s, pop, 1, EPOCH); pl.pos = [0, 0, 0]; pl.credits = 500; pl.inventory = []; st.setPlayer(pl);
    const sc = new Scheduler(st); registerLawJobs(sc); U2.registerUseJobs(sc);
    return { st, sc, ctx: { store: st, sched: sc, planet: p, s, pop, polity, doorstepOf: () => [9, 9, 9] } };
  };
  // every building offers things to do; count verbs across the town
  const verbs = {}; let props = 0, used = 0;
  for (const b of s.buildings) { const pl = buildingPlan(p, s, b); props += pl.props.length; for (const u of U2.usablesOf(p, s, b)) { used++; for (const v of u.verbs) verbs[v] = (verbs[v] || 0) + 1; } }
  check(used / props > 0.95, `${used}/${props} pieces of furniture can be used`);
  for (const v of ['sleep', 'sit', 'open', 'cook', 'buy', 'sell', 'terminal', 'fabricate', 'assemble', 'wash', 'water']) check(verbs[v] > 0, `someone can ${v} (${verbs[v] || 0})`);
  const find = (pred, from = s.buildings) => { for (const b of from) for (const u of U2.usablesOf(p, s, b)) if (pred(b, u)) return { b, u }; return null; };
  // generated contents are a pure function: same box, same week → same things
  const A = setup(), t0 = EPOCH + 0.4 * p.dayLength;
  const fr = find((b, u) => u.pr.kind === 'fridge' && U2.ownership(b, u.room, A.st.player).yours) || find((b, u) => u.pr.kind === 'fridge');
  check(JSON.stringify(U2.contents(A.st, p, fr.b, fr.u, t0)) === JSON.stringify(U2.contents(setup().st, p, fr.b, fr.u, t0)), 'contents are deterministic');
  // your own home: taking isn't theft. A neighbour's: it is.
  const mine = find((b, u) => u.box && !u.box.shop && U2.ownership(b, u.room, A.st.player).yours && U2.contents(A.st, p, b, u, t0).length);
  const theirs = find((b, u) => u.box && !u.box.shop && (b.type === 'house' || b.type === 'hab') && !U2.ownership(b, u.room, A.st.player).yours && !U2.ownership(b, u.room, A.st.player).communal && U2.contents(A.st, p, b, u, t0).length);
  check(mine && theirs, 'found a container at home and one in someone else\'s home');
  const r1 = U2.take(A.ctx, mine.b, mine.u, 0, 1, t0), r2 = U2.take(A.ctx, theirs.b, theirs.u, 0, 1, t0);
  check(r1.ok && !r1.stolen, `took ${r1.id} from home — not theft`);
  check(r2.ok && r2.stolen > 0, `took ${r2.id} from ${theirs.b.owner}'s — theft worth ${r2.stolen} cr`);
  check(A.st.player.inventory.length === 2 - (r1.id === r2.id), 'both are in your inventory');
  // what you take is gone from the box; what you leave there stays yours
  const left = U2.contents(A.st, p, mine.b, mine.u, t0);
  U2.put(A.ctx, mine.b, mine.u, 0, 1, t0);
  check(U2.contents(A.st, p, mine.b, mine.u, t0).some(x => x.own), 'the thing you put back is marked as yours');
  // carry limit
  const heavy = setup(); heavy.st.player.inventory = [{ id: 'plate', n: 20 }];
  check(!U2.take(heavy.ctx, mine.b, mine.u, 0, 1, t0).ok || massOf(heavy.st.player.inventory) <= U2.carryLimit(heavy.st.player) + 1e-9, 'you can\'t carry past your limit');
  // theft: seen by an officer → warrant straight away; unseen → found later, case opened
  const officer = pop.people.find(x => x.job && pop.jobById.get(x.job).security);
  const inc = U2.reportTheft(A.ctx, theirs.b, theirs.u.room, r2.stolen, [{ id: r2.id, n: 1 }], t0, [{ id: officer.id, name: officer.name, dist: 4 }]);
  lodgeIncident(A.ctx, inc);
  check(A.st.player.warrant && /stealing/.test(A.st.player.warrant.reason), `officer saw it: warrant — ${A.st.player.warrant?.reason}`);
  const Bq = setup(); U2.take(Bq.ctx, theirs.b, theirs.u, 0, 1, t0);
  const inc2 = U2.reportTheft(Bq.ctx, theirs.b, theirs.u.room, r2.stolen, [{ id: r2.id, n: 1 }], t0, []); lodgeIncident(Bq.ctx, inc2);
  Bq.sc.runDue(t0 + 3 * p.dayLength, Bq.ctx);
  check(Bq.st.events.some(e => e.type === 'theft_discovered') && Bq.st.events.some(e => e.type === 'case_opened' && e.what === 'theft'), 'unseen theft is noticed and reported');
  // shops: buy while open, not when closed; shelves restock weekly
  const shelf = find((b, u) => u.box?.shop);
  const tOpen = (() => { for (let t = t0; ; t += 600) if (U2.shopOpen(p, shelf.b, t)) return t; })();
  const tShut = (() => { for (let t = t0; ; t += 600) if (!U2.shopOpen(p, shelf.b, t)) return t; })();
  const S = setup(), stock = U2.contents(S.st, p, shelf.b, shelf.u, tOpen), cr = S.st.player.credits;
  const bought = U2.buy(S.ctx, shelf.b, shelf.u, 0, 2, tOpen);
  check(bought.ok && S.st.player.credits === cr - bought.cost && bought.cost > 0, `bought 2 ${bought.id} for ${bought.cost} cr`);
  check(U2.contents(S.st, p, shelf.b, shelf.u, tOpen)[0]?.n !== stock[0].n || stock[0].n === 2, 'the shelf has fewer');
  check(!U2.buy(S.ctx, shelf.b, shelf.u, 0, 1, tShut).ok, `closed at ${solarHour(p, tShut).toFixed(1)} h: can't buy`);
  const tNext = tOpen + 7 * p.dayLength;
  check(JSON.stringify(U2.contents(S.st, p, shelf.b, shelf.u, tNext)) !== JSON.stringify(U2.contents(S.st, p, shelf.b, shelf.u, tOpen)), 'restocked a week later');
  const sold = U2.sell(S.ctx, shelf.b, S.st.player.inventory.findIndex(x => x.id === bought.id), 1, tOpen);
  check(sold.ok && sold.pay < bought.cost / 2 + 1, `sold one back for ${sold.pay} cr`);
  // cooking is a timed job: the meal appears in the kitchen, yours, even if you're away
  const kitchen = find((b, u) => u.verbs.includes('cook'));
  const cook = (stepped) => {
    const C = setup(); C.st.player.inventory = [{ id: 'protein', n: 1 }, { id: 'vegetables', n: 1 }];
    const r = U2.startWork(C.ctx, kitchen.b, kitchen.u, 'cook', U2.RECIPES.cook.find(x => x.out === 'stew'), t0);
    check(r.ok && C.st.player.inventory.length === 0, 'ingredients used');
    check(!U2.startWork(C.ctx, kitchen.b, kitchen.u, 'cook', U2.RECIPES.cook[0], t0 + 10).ok, 'can\'t start a second dish on a busy hob');
    if (stepped) for (let t = t0; t < t0 + 3600; t += 37) C.sc.runDue(t, C.ctx); else catchUp(C.ctx, t0, t0 + 3600, 'idle');
    const out = U2.contents(C.st, p, kitchen.b, kitchen.u, t0 + 3600).find(x => x.id === 'stew' && x.own);
    return { C, out };
  };
  const k1 = cook(false), k2 = cook(true);
  check(k1.out && k2.out, 'the stew is waiting in the kitchen (offline and stepped)');
  const idx = U2.contents(k1.C.st, p, kitchen.b, kitchen.u, t0 + 3600).findIndex(x => x.id === 'stew');
  const got = U2.take(k1.C.ctx, kitchen.b, kitchen.u, idx, 1, t0 + 3600);
  check(got.ok && !got.stolen, 'taking your own cooking is not theft, wherever it was cooked');
  k1.C.st.player.hunger = 0.9;
  check(U2.consume(k1.C.st.player, k1.C.st.player.inventory.findIndex(x => x.id === 'stew')).ok && Math.abs(k1.C.st.player.hunger - 0.3) < 1e-9, 'eating the stew: hunger 0.9 → 0.3');
  // tools gate recipes
  const bench = find((b, u) => u.verbs.includes('assemble'));
  const T = setup(); T.st.player.inventory = [{ id: 'circuit', n: 2 }, { id: 'wiring', n: 1 }, { id: 'cell', n: 1 }];
  check(!U2.startWork(T.ctx, bench.b, bench.u, 'assemble', U2.RECIPES.assemble.find(r => r.out === 'scanner'), t0).ok, 'no multitool: can\'t build a scanner');
  T.st.player.inventory.push({ id: 'multitool', n: 1 });
  check(U2.startWork(T.ctx, bench.b, bench.u, 'assemble', U2.RECIPES.assemble.find(r => r.out === 'scanner'), t0).ok && T.st.player.inventory.some(x => x.id === 'multitool'), 'with one: started, and the tool is kept');
  // hunger is closed-form: one jump equals many small steps
  const a = { fatigue: 0.3, fitness: 0.5, hunger: 0.2 }, b2 = { ...a };
  advanceBody(a, 'idle', 5 * 3600, p); for (let i = 0; i < 500; i++) advanceBody(b2, 'idle', 36, p);
  check(Math.abs(a.hunger - b2.hunger) < 1e-9 && a.hunger > 0.2, `hunger after 5 h awake: ${a.hunger.toFixed(3)} either way`);
  const h = { fatigue: 0.3, fitness: 0.5, hunger: 0.9 }; advanceBody(h, 'home', 3 * p.dayLength, p);
  check(h.hunger < 0.35, 'days at home: you eat (hunger settles)');
  // lights switch and stay switched
  const L = setup(), room = kitchen.u.room;
  check(U2.lightOn(L.st, kitchen.b.key, room.k, room.i) && !U2.toggleLight(L.st, kitchen.b.key, room.k, room.i) && !U2.lightOn(L.st, kitchen.b.key, room.k, room.i), 'a light switched off stays off');
  // persistence: what you moved survives a save and reload
  const json = A.st.exportJSON(), R = new WorldStore(new MemoryBackend()); await R.importJSON(json);
  check(JSON.stringify(U2.contents(R, p, mine.b, mine.u, t0)) === JSON.stringify(U2.contents(A.st, p, mine.b, mine.u, t0)) && R.player.inventory.length === A.st.player.inventory.length, 'containers and inventory survive reload');
  console.log(`  ${used} usable props · verbs ${JSON.stringify(verbs)}`);
};

suites.vehicles = async () => {
  const { CollisionWorld } = await import('../js/player/collision.js');
  const { Ride } = await import('../js/player/ride.js');
  const { parkedVehicles, SPEEDER } = await import('../js/gen/vehicles.js');
  const { vehiclesIn, park, buyVehicle, stealVehicle, isYours } = await import('../js/world/vehicles.js');
  const { WorldStore } = await import('../js/world/store.js');
  const { MemoryBackend } = await import('../js/world/store-mem.js');
  const { newCharacter } = await import('../js/gen/character.js');
  const { getPopulation } = await import('../js/gen/population.js');
  const { outRoutes } = await import('../js/gen/highways.js');
  const { EPOCH } = await import('../js/sim/clock.js');
  const U = uni(4), p = makePlanet(U, HOMEWORLD), s = getSettlement(p, 0, 0), world = new CollisionWorld(p, s, () => false), pop = getPopulation(p, s);
  const vs = parkedVehicles(p, s);
  check(JSON.stringify(vs) === JSON.stringify(parkedVehicles(makePlanet(U, HOMEWORLD), getSettlement(makePlanet(U, HOMEWORLD), 0, 0))), 'parked bikes are deterministic');
  const forSale = vs.filter(v => v.forSale), owned = vs.filter(v => !v.forSale);
  check(owned.length > pop.households.length * 0.2 && forSale.length >= 3, `${owned.length} household bikes, ${forSale.length} for sale`);
  // nobody parks inside a wall
  let clear = 0;
  for (const v of vs) { const [x, z] = world.resolve(v.pos[0], v.pos[2], s.h + 0.3, 0.5, 1.0); if (Math.hypot(x - v.pos[0], z - v.pos[2]) < 0.01) clear++; }
  check(clear === vs.length, `${clear}/${vs.length} parked clear of walls`);
  const run = (r, input, secs) => { for (let t = 0; t < secs; t += 1 / 60) r.step(1 / 60, input); };
  // out along a road: steer toward points ahead; it follows the road profile, fast
  const road = outRoutes(p, s)[0];
  const r = new Ride(world, p, { pos: [road.pts[2][0], 0, road.pts[2][1]], facing: Math.atan2(road.pts[6][0] - road.pts[2][0], road.pts[6][1] - road.pts[2][1]) });
  let maxGap = 0, top = 0, i = 2;
  let secs = 0;
  for (let t = 0; t < 90; t += 1 / 60) {
    secs = t;
    while (i < road.pts.length - 1 && Math.hypot(road.pts[i][0] - r.pos[0], road.pts[i][1] - r.pos[2]) < 14) i++;
    const want = Math.atan2(road.pts[i][0] - r.pos[0], road.pts[i][1] - r.pos[2]); let d = want - r.facing; d = Math.atan2(Math.sin(d), Math.cos(d));
    r.step(1 / 60, { fwd: Math.abs(d) > 0.35 && r.speed > 12 ? -1 : 1, right: Math.max(-1, Math.min(1, -d * 3)), boost: false });   // brake for the bends
    const g = Math.max(world.groundAt(r.pos[0], r.pos[2], r.pos[1] + 1).h, p.seaLevel);
    maxGap = Math.max(maxGap, Math.abs(r.pos[1] - g)); top = Math.max(top, r.speed);
    if (i >= road.pts.length - 2) break;
  }
  const along = i * 4;
  check(along > Math.min(1200, road.pts.length * 4 - 20), `rode ${along} of ${road.pts.length * 4} m along the road in 90 s (top ${top.toFixed(1)} m/s)`);
  check(maxGap < 1.5, `stays on the ground line (worst gap ${maxGap.toFixed(2)} m)`);
  // straight at a building: stopped by the wall, never inside it
  const { buildingToWorld } = await import('../js/gen/place.js');
  let a0, a1, b;      // a clear 10 m run-up to a building's front wall, away from its door
  for (const q of s.buildings) { const pl = buildingPlan(p, s, q), dx = pl.doors[pl.entrance].x, x = dx > q.w / 2 ? 1.2 : q.w - 1.2;
    const st = buildingToWorld(s, q, x, 0, -10), path = [2, 4, 6, 8].every(k => !world.locate(...buildingToWorld(s, q, x, 0.3, -k)));
    if (!world.locate(...st) && path && Math.abs(x - dx) > 3) { b = q; a0 = st; a1 = buildingToWorld(s, q, x, 0, q.d / 2); break; } }
  const w = new Ride(world, p, { pos: a0, facing: Math.atan2(a1[0] - a0[0], a1[2] - a0[2]) });
  let hit = 0; for (let t = 0; t < 8; t += 1 / 60) { w.step(1 / 60, { fwd: 1, right: 0 }); hit = Math.max(hit, w.impact); }
  check(world.locate(...w.pos)?.room === undefined && hit > 3, `rode into a wall at ${hit.toFixed(1)} m/s and stopped outside`);
  // over water it hovers on the surface
  let wet = null;
  for (let k = 0; k < 6000 && !wet; k++) { const a = k * 2.4, rr = 200 + k * 2, x = s.cx + Math.cos(a) * rr, z = s.cz + Math.sin(a) * rr; if (surfaceHeight(p, x, z) < p.seaLevel - 2) wet = [x, z]; }
  if (wet) { const h = new Ride(world, p, { pos: [wet[0], p.seaLevel + 3, wet[1]], facing: 0 }); run(h, { fwd: 0, right: 0 }, 3); check(Math.abs(h.pos[1] - p.seaLevel) < 0.05, 'hovers on water'); }
  // a slope too steep to climb stops it
  let steep = null;
  for (let k = 0; k < 6000 && !steep; k++) { const a = k * 2.39996, rr = s.R + 300 + (k % 500) * 3, x = s.cx + Math.cos(a) * rr, z = s.cz + Math.sin(a) * rr;
    for (let q = 0; q < 8; q++) { const th = q * Math.PI / 4, dx = Math.sin(th), dz = Math.cos(th); if ((surfaceHeight(p, x + 4 * dx, z + 4 * dz) - surfaceHeight(p, x, z)) / 4 > 1.0 && (surfaceHeight(p, x + 12 * dx, z + 12 * dz) - surfaceHeight(p, x, z)) / 12 > 0.9) { steep = { x, z, th }; break; } } }
  if (check(steep, 'found a cliff')) { const c = new Ride(world, p, { pos: [steep.x - Math.sin(steep.th) * 3, 0, steep.z - Math.cos(steep.th) * 3], facing: steep.th }); const y0 = c.pos[1]; run(c, { fwd: 1, right: 0 }, 6); check(c.pos[1] - y0 < 6, `can't ride up a cliff (rose ${(c.pos[1] - y0).toFixed(1)} m)`); }
  // ownership: buy from the dealer, steal a neighbour's, park; it all persists
  const st = new WorldStore(new MemoryBackend()); st.create(seedHex(U), EPOCH, 0);
  const pl2 = newCharacter(U, p, s, pop, 1, EPOCH); pl2.credits = 2000; st.setPlayer(pl2);
  const sale = vehiclesIn(st, p, s).find(v => v.forSale);
  check(buyVehicle(st, sale, EPOCH).ok && pl2.credits === 200 && isYours(vehiclesIn(st, p, s).find(v => v.id === sale.id), pl2), 'bought a bike from the dealer');
  check(!buyVehicle(st, vehiclesIn(st, p, s).find(v => v.forSale), EPOCH).ok, 'can\'t afford a second');
  const other = vehiclesIn(st, p, s).find(v => !v.forSale && !isYours(v, pl2));
  const inc = stealVehicle(st, s, other, EPOCH + 5, []);
  check(inc.type === 'theft' && inc.value === SPEEDER.price && isYours(vehiclesIn(st, p, s).find(v => v.id === other.id), pl2), 'stole one: it\'s yours now, and it\'s a theft');
  park(st, other, [1, 2, 3], 0.5);
  const R = new WorldStore(new MemoryBackend()); await R.importJSON(st.exportJSON());
  const back = vehiclesIn(R, p, s).find(v => v.id === other.id);
  check(back.pos.join() === '1,2,3' && back.facing === 0.5 && isYours(back, pl2), 'where you left it, after reloading');
};

suites.ships = async () => {
  const { CollisionWorld } = await import('../js/player/collision.js');
  const { Controller } = await import('../js/player/controller.js');
  const { Flight } = await import('../js/player/flight.js');
  const { shipsAt, shipPlan, SHIP_PRICE } = await import('../js/gen/ships.js');
  const S = await import('../js/world/ships.js');
  const { usablesOf } = await import('../js/sim/processes/use.js');
  const { buildingToWorld } = await import('../js/gen/place.js');
  const { WorldStore } = await import('../js/world/store.js');
  const { MemoryBackend } = await import('../js/world/store-mem.js');
  const { newCharacter } = await import('../js/gen/character.js');
  const { getPopulation } = await import('../js/gen/population.js');
  const { EPOCH } = await import('../js/sim/clock.js');
  const U = uni(4), p = makePlanet(U, HOMEWORLD), s = getSettlement(p, 0, 0), pop = getPopulation(p, s);
  const ships = shipsAt(p, s);
  check(ships.length === s.pads.length && ships.length >= 2 && ships.some(x => x.forSale), `${ships.length} ships on ${s.pads.length} pads, one for sale`);
  const st = new WorldStore(new MemoryBackend()); st.create(seedHex(U), EPOCH, 0);
  const pl = newCharacter(U, p, s, pop, 1, EPOCH); pl.credits = 20000; st.setPlayer(pl);
  const world = new CollisionWorld(p, s, () => false);
  let down = true;
  const sh = S.shipsIn(st, p, s).find(x => x.forSale), b = S.structureOf(s, sh, id => id !== 0 || down);
  world.addStructure(b);
  const run = (c, input, secs) => { for (let t = 0; t < secs; t += 1 / 120) c.step(1 / 120, { fwd: 0, right: 0, run: false, jump: false, yaw: c.facing, ...input }); };
  const L = shipPlan().layout, toW = (x, y, z) => buildingToWorld(s, b, x, y, z);
  const walkTo = (c, x, z, secs = 12) => { for (let t = 0; t < secs; t += 1 / 120) { const w = toW(x, 0, z), d = Math.hypot(w[0] - c.pos[0], w[2] - c.pos[2]); if (d < 0.3) break; const yaw = Math.atan2(w[0] - c.pos[0], w[2] - c.pos[2]); c.step(1 / 120, { fwd: 1, right: 0, run: false, jump: false, yaw }); } };
  // walk up the ramp, through the hold and the cabin, into the cockpit
  const c = new Controller(world, toW(5, 0, -1.5)); run(c, {}, 0.3);
  walkTo(c, 5, 6.5); const inHold = world.locate(...c.pos)?.room?.purpose;
  walkTo(c, 5, 13); walkTo(c, 5, 16.2);
  const at = world.locate(...c.pos);
  check(inHold === 'hold' && at?.b === b && at.room?.purpose === 'cockpit', `walked up the ramp into the hold and on to the cockpit (${inHold} → ${at?.room?.purpose})`);
  check(Math.abs(c.pos[1] - (b.base + L.deck)) < 0.05, 'standing on the deck');
  // ramp raised: you can't get in
  down = false;
  const c2 = new Controller(world, toW(5, 0, -1.5)); run(c2, {}, 0.3); walkTo(c2, 5, 7, 8);
  check(!world.locate(...c2.pos)?.room, 'ramp up: can\'t get in');
  down = true;
  // what you can do aboard
  const verbs = new Set(usablesOf(p, s, b).flatMap(u => u.verbs));
  check(['fly', 'sleep', 'open', 'cook', 'terminal'].every(v => verbs.has(v)), 'aboard: ' + [...verbs].join(', '));
  // fly: lift off, climb, cruise, come down somewhere level and land
  world.removeStructure(b);
  const { c: c0, facing } = S.centreOf(s, sh), fl = new Flight(world, p, sh, c0, facing);
  const fly = (input, secs) => { for (let t = 0; t < secs; t += 1 / 60) fl.step(1 / 60, { fwd: 0, right: 0, up: false, down: false, boost: false, ...input }); };
  fly({ up: true }, 4); const alt = fl.altitude();
  check(alt > 30, `lifted off: ${alt.toFixed(0)} m up`);
  fly({ up: true }, 14); fly({ fwd: 1 }, 25);
  check(fl.speed > 120, `cruising at ${Math.round(fl.speed * 3.6)} km/h`);
  const away = Math.hypot(fl.pos[0] - c0[0], fl.pos[2] - c0[2]);
  check(away > 2000, `${Math.round(away)} m from the pad`);
  // find level ground ahead and set down on it
  let spot = null;
  for (let k = 0; k < 4000 && !spot; k++) { const a = k * 2.39996, r = 50 + k * 4, x = fl.pos[0] + Math.cos(a) * r, z = fl.pos[2] + Math.sin(a) * r; const ft = fl.feet(x, z); if (Math.max(...ft) - Math.min(...ft) < 0.5 && Math.min(...ft) > p.seaLevel + 1) spot = [x, z]; }
  if (check(spot, 'found level ground')) {
    fl.pos = [spot[0], fl.pos[1], spot[1]]; fl.vel = [0, 0, 0]; fl.onGround = false;
    for (let t = 0; t < 300 && !fl.onGround; t += 1 / 60) fl.step(1 / 60, { fwd: 0, right: 0, up: false, down: fl.vel[1] > (fl.altitude() > 40 ? -30 : -3), boost: false });
    fly({}, 1);
    check(fl.onGround && fl.landingProblem() === null && fl.impact === 0, `touched down gently, can land (${fl.landingProblem()})`);
    S.land(st, sh, fl.pos, fl.facing);
    const sh2 = S.shipsIn(st, p, s).find(x => x.id === sh.id), b2 = S.structureOf(s, sh2, () => true);
    world.addStructure(b2);
    const c3 = new Controller(world, buildingToWorld(s, b2, 5, L.deck, 13)); run(c3, {}, 0.3);
    check(world.locate(...c3.pos)?.room?.purpose === 'studio', 'aboard at the landing site');
    for (let t = 0; t < 14; t += 1 / 120) { const w = buildingToWorld(s, b2, 5, 0, -3); c3.step(1 / 120, { fwd: 1, right: 0, run: false, jump: false, yaw: Math.atan2(w[0] - c3.pos[0], w[2] - c3.pos[2]) }); }
    const out = world.locate(...c3.pos), gnd = world.groundAt(c3.pos[0], c3.pos[2], c3.pos[1]).h;
    check(!out?.room && Math.abs(c3.pos[1] - gnd) < 0.2, 'walked down the ramp onto the ground');
  }
  // a steep hillside: you can't land
  const fl2 = new Flight(world, p, sh, c0, 0);
  let slope = null;
  for (let k = 0; k < 6000 && !slope; k++) { const a = k * 2.39996, r = s.R + 300 + k * 2, x = s.cx + Math.cos(a) * r, z = s.cz + Math.sin(a) * r; const ft = fl2.feet(x, z); if (Math.max(...ft) - Math.min(...ft) > 4) slope = [x, z]; }
  if (slope) { fl2.pos = [slope[0], 2000, slope[1]]; fl2.vel = [0, 0, 0]; fl2.onGround = false; for (let t = 0; t < 600 && !fl2.onGround; t += 1 / 60) fl2.step(1 / 60, { fwd: 0, right: 0, up: false, down: fl2.vel[1] > (fl2.altitude() > 40 ? -30 : -3), boost: false }); for (let t = 0; t < 1; t += 1 / 60) fl2.step(1 / 60, {}); check(/level/.test(fl2.landingProblem() || ''), 'on a hillside: ' + fl2.landingProblem()); }
  // owning one: buy it; steal another; it all persists
  check(S.buyShip(st, sh, EPOCH).ok && pl.credits === 20000 - SHIP_PRICE && S.shipIsYours(S.shipsIn(st, p, s).find(x => x.id === sh.id), pl), `bought the ${sh.name} for ${SHIP_PRICE} cr`);
  const firm = S.shipsIn(st, p, s).find(x => !x.forSale && !S.shipIsYours(x, pl));
  check(S.rampLocked(firm, pl), `${firm.ownerName}'s ship is locked to you`);
  S.forceRamp(st, firm); check(S.rampDown(S.shipsIn(st, p, s).find(x => x.id === firm.id), p, EPOCH + 0.9 * p.dayLength, pl), 'forced ramp stays open');
  const inc = S.stealShip(st, s, firm, EPOCH + 10, []);
  const { offenceFor, getPolity } = await import('../js/gen/polity.js');
  check(offenceFor(inc) === 'ship_theft' && getPolity(p, s).laws.ship_theft.fine >= 3000, `stealing it: ${getPolity(p, s).laws.ship_theft.label}, ${getPolity(p, s).laws.ship_theft.fine} cr`);
  const R = new WorldStore(new MemoryBackend()); await R.importJSON(st.exportJSON());
  const back = S.shipsIn(R, p, s).find(x => x.id === sh.id);
  check(back.at && Math.hypot(back.at.c[0] - fl.pos[0], back.at.c[2] - fl.pos[2]) < 0.01 && S.shipIsYours(back, pl), 'landed where you left it, after reloading');
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
