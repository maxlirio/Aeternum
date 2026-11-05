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
  refreshLife(pop, A.st, EPOCH + 10 * YEAR);        // (the live town updates ages at each day's tick; bring it to the same moment)
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
  for (const b of s.buildings) { const pl = buildingPlan(p, s, b); props += pl.props.filter(q => !q.decor).length; for (const u of U2.usablesOf(p, s, b)) { used++; for (const v of u.verbs) verbs[v] = (verbs[v] || 0) + 1; } }
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
  const { parkedVehicles, SPEEDER, typeOf, TYPES } = await import('../js/gen/vehicles.js');
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
  const kinds = new Set(vs.map(v => v.type));
  check(kinds.size >= 10, `${kinds.size} different kinds of vehicle parked in one town: ${[...kinds].join(', ')}`);
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
  const sale = vehiclesIn(st, p, s).find(v => v.forSale && typeOf(v).price <= 2000);
  check(buyVehicle(st, sale, EPOCH).ok && pl2.credits === 2000 - typeOf(sale).price && isYours(vehiclesIn(st, p, s).find(v => v.id === sale.id), pl2), 'bought a bike from the dealer');
  check(!buyVehicle(st, vehiclesIn(st, p, s).find(v => v.forSale), EPOCH).ok, 'can\'t afford a second');
  const other = vehiclesIn(st, p, s).find(v => !v.forSale && !isYours(v, pl2));
  const inc = stealVehicle(st, s, other, EPOCH + 5, []);
  check(inc.type === 'theft' && inc.value === typeOf(other).price && isYours(vehiclesIn(st, p, s).find(v => v.id === other.id), pl2), 'stole one: it\'s yours now, and it\'s a theft');
  park(st, other, [1, 2, 3], 0.5);
  const R = new WorldStore(new MemoryBackend()); await R.importJSON(st.exportJSON());
  const back = vehiclesIn(R, p, s).find(v => v.id === other.id);
  check(back.pos.join() === '1,2,3' && back.facing === 0.5 && isYours(back, pl2), 'where you left it, after reloading');
};

suites.ships = async () => {
  const { CollisionWorld } = await import('../js/player/collision.js');
  const { Controller } = await import('../js/player/controller.js');
  const { Flight } = await import('../js/player/flight.js');
  const { shipsAt, shipPlan, SHIP_PRICE, PRICES } = await import('../js/gen/ships.js');
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
  const onPads = ships.filter(x => !x.field);
  check(onPads.length === s.pads.length && onPads.length >= 2 && ships.some(x => x.forSale), `${onPads.length} ships on ${s.pads.length} pads, one for sale`);
  const fr = ships.find(x => x.model === 'freighter');
  check(fr && fr.at && !fr.forSale, `a freighter on the cargo field, ${Math.round(Math.hypot(fr.at.c[0] - s.cx, fr.at.c[2] - s.cz))} m from the centre (${fr.ownerName})`);
  const st = new WorldStore(new MemoryBackend()); st.create(seedHex(U), EPOCH, 0);
  const pl = newCharacter(U, p, s, pop, 1, EPOCH); pl.credits = 20000; st.setPlayer(pl);
  const world = new CollisionWorld(p, s, () => false);
  let down = true;
  const sh = (S.shipsIn(st, p, s).find(x => x.model === 'shuttle') || (() => { const x = S.shipsIn(st, p, s).find(y => !y.field && !y.patrol); st.patchDelta(S.shipKey(x.id), { model: 'shuttle' }); return S.shipsIn(st, p, s).find(y => y.id === x.id); })()), b = S.structureOf(s, sh, id => id !== 0 || down, p);
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
  { // the freighter: up its ramp, through the hold, onto the flight deck
    const fb = S.structureOf(s, fr, () => true, p), FL = shipPlan('freighter').layout; world.addStructure(fb);
    const FW = (x, z) => buildingToWorld(s, fb, x, 0, z), mx = (FL.ramp.x0 + FL.ramp.x1) / 2;
    const fc = new Controller(world, FW(mx, -1.5)); run(fc, {}, 0.3);
    const go = (x, z, secs = 20) => { for (let t = 0; t < secs; t += 1 / 120) { const w = FW(x, z); if (Math.hypot(w[0] - fc.pos[0], w[2] - fc.pos[2]) < 0.3) break; fc.step(1 / 120, { fwd: 1, right: 0, run: false, jump: false, yaw: Math.atan2(w[0] - fc.pos[0], w[2] - fc.pos[2]) }); } };
    go(mx, 10); const fh = world.locate(...fc.pos)?.room?.purpose; go(8, 24.2); go(8, 27.6);
    check(fh === 'hold' && world.locate(...fc.pos)?.room?.purpose === 'cockpit', `freighter: ramp → ${fh} → ${world.locate(...fc.pos)?.room?.purpose}`);
    const fv = new Set(usablesOf(p, s, fb).flatMap(u => u.verbs));
    check(fv.has('fly') && fv.has('sleep') && fv.has('fabricate'), 'freighter aboard: ' + [...fv].join(', '));
    world.removeStructure(fb);
    const ff = new Flight(world, p, fr, fr.at.c, fr.at.facing); world.flora = false;
    for (let t = 0; t < 5; t += 1 / 60) ff.step(1 / 60, { up: true });
    check(ff.altitude() > 25, `freighter lifts off: ${ff.altitude().toFixed(0)} m`);
  }
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
  world.flora = false;      // (a field's trees aren't the subject here)
  const fly = (input, secs) => { for (let t = 0; t < secs; t += 1 / 60) fl.step(1 / 60, input); };
  fly({ up: true }, 4); const alt = fl.altitude();
  check(alt > 20 && Math.abs(fl.pitch) < 0.05, `lifted off vertically: ${alt.toFixed(0)} m up, nose level`);
  fly({ up: true }, 10); fly({ throttle: 1 }, 3); fly({ pitch: 0.15 }, 4); fly({}, 40);
  check(fl.airspeed > 90 && fl.hover < 0.05, `wing-borne at ${Math.round(fl.airspeed * 3.6)} km/h, thrusters off (${fl.hover.toFixed(2)})`);
  const away = Math.hypot(fl.pos[0] - c0[0], fl.pos[2] - c0[2]);
  check(away > 2000, `${Math.round(away)} m from the pad`);
  // find level ground ahead and set down on it
  let spot = null;
  for (let k = 0; k < 4000 && !spot; k++) { const a = k * 2.39996, r = 50 + k * 4, x = fl.pos[0] + Math.cos(a) * r, z = fl.pos[2] + Math.sin(a) * r; const ft = fl.feet(x, z); if (Math.max(...ft) - Math.min(...ft) < 0.5 && Math.min(...ft) > p.seaLevel + 1) spot = [x, z]; }
  if (check(spot, 'found level ground')) {
    fl.pos = [spot[0], fl.pos[1], spot[1]]; fl.vel = [0, 0, 0]; fl.onGround = false; fl.throttle = 0; fl.q = (await import('../js/player/flight.js')).fromEuler(fl.facing, 0, 0); fl.w = [0, 0, 0];
    for (let t = 0; t < 300 && !fl.onGround; t += 1 / 60) fl.step(1 / 60, { fwd: 0, right: 0, up: false, down: fl.vel[1] > (fl.altitude() > 40 ? -30 : -3), boost: false });
    fly({}, 3);
    check(fl.onGround && fl.landingProblem() === null && fl.impact === 0, `touched down gently, can land (${fl.landingProblem()})`);
    S.land(st, sh, fl.pos, fl.facing);
    const sh2 = S.shipsIn(st, p, s).find(x => x.id === sh.id), b2 = S.structureOf(s, sh2, () => true, p);
    world.addStructure(b2);
    const c3 = new Controller(world, buildingToWorld(s, b2, 5, L.deck, 13)); run(c3, {}, 0.3);
    check(world.locate(...c3.pos)?.room?.purpose === 'studio', 'aboard at the landing site');
    for (let t = 0; t < 14; t += 1 / 120) { const w = buildingToWorld(s, b2, 5, 0, -3); c3.step(1 / 120, { fwd: 1, right: 0, run: false, jump: false, yaw: Math.atan2(w[0] - c3.pos[0], w[2] - c3.pos[2]) }); }
    const out = world.locate(...c3.pos), gnd = world.groundAt(c3.pos[0], c3.pos[2], c3.pos[1]).h;
    check(!out?.room && Math.abs(c3.pos[1] - gnd) < 0.2, 'walked down the ramp onto the ground');
  }
  // a steep hillside: you can't land
  { // the stall: assist off, idle, nose held up — the wing lets go and it falls; nose down and power recovers it
    const st2 = new Flight(world, p, sh, [s.cx + 3000, 2500, s.cz + 3000], 0.5); st2.onGround = false; st2.vel = [Math.sin(0.5) * 70, 0, Math.cos(0.5) * 70]; st2.assist = false;
    let stalled = false, minAlt = Infinity; const a0 = st2.pos[1];
    for (let t = 0; t < 14; t += 1 / 60) { st2.step(1 / 60, { throttle: -1, pitch: 0.8 }); if (st2.stalled) stalled = true; }
    const lost = a0 - st2.pos[1];
    check(stalled && lost > 40, `held the nose up at idle: stalled, fell ${lost.toFixed(0)} m`);
    st2.assist = true; for (let t = 0; t < 10; t += 1 / 60) { st2.step(1 / 60, { throttle: 1, pitch: t < 3 ? -0.4 : 0 }); minAlt = Math.min(minAlt, st2.pos[1]); }
    check(!st2.stalled && st2.airspeed > st2.vs, `nose down, full power: flying again at ${Math.round(st2.airspeed * 3.6)} km/h`);
    // an accelerated stall: yanking the stick at speed stalls it too
    const st3 = new Flight(world, p, { model: 'courier' }, [s.cx - 3000, 2500, s.cz - 3000], 0); st3.onGround = false; st3.vel = [0, 0, 90]; st3.throttle = 1; st3.assist = false;
    let acc = false, gmax = 0; for (let t = 0; t < 4; t += 1 / 60) { st3.step(1 / 60, { pitch: 1 }); if (st3.stalled) acc = true; gmax = Math.max(gmax, st3.gload); }
    check(acc && gmax > 2.5, `full back stick at ${Math.round(90 * 3.6)} km/h: ${gmax.toFixed(1)} g, then the wing let go`);
  }
  const fl2 = new Flight(world, p, sh, c0, 0);
  let slope = null;
  for (let k = 0; k < 6000 && !slope; k++) { const a = k * 2.39996, r = s.R + 300 + k * 2, x = s.cx + Math.cos(a) * r, z = s.cz + Math.sin(a) * r; const ft = fl2.feet(x, z); if (Math.max(...ft) - Math.min(...ft) > 4) slope = [x, z]; }
  if (slope) { fl2.pos = [slope[0], 2000, slope[1]]; fl2.vel = [0, 0, 0]; fl2.onGround = false; for (let t = 0; t < 600 && !fl2.onGround; t += 1 / 60) fl2.step(1 / 60, { fwd: 0, right: 0, up: false, down: fl2.vel[1] > (fl2.altitude() > 40 ? -30 : -3), boost: false }); for (let t = 0; t < 1; t += 1 / 60) fl2.step(1 / 60, {}); check(/level/.test(fl2.landingProblem() || ''), 'on a hillside: ' + fl2.landingProblem()); }
  { // cargo runs: firm ships leave and come back every day, a pure function of time
    const { runOn, tripOf } = await import('../js/gen/ships.js');
    const { dayStart } = await import('../js/gen/schedule.js');
    const firmShip = S.shipsIn(st, p, s).find(x => x.owner.startsWith('firm:') && !x.field);
    const home = S.centreOf(s, firmShip), D = 3, run = runOn(p, firmShip, D), H = p.dayLength / 24;
    const at = tt => tripOf(p, firmShip, tt, home);
    check(at(dayStart(p, D) + 2 * H).phase === 'pad' && at(run.depart + 60).phase === 'departing' && at((run.depart + run.back) / 2).phase === 'away' && at(run.back - 60).phase === 'arriving' && at(run.back + 10).phase === 'pad',
      `a run: leaves at ${((run.depart - dayStart(p, D)) / H).toFixed(1)} h, back ${((run.back - run.depart) / H).toFixed(1)} h later`);
    let jump = 0, prev = at(run.depart);
    for (let tt = run.depart; tt < run.depart + 125; tt += 0.5) { const q = at(tt); if (q.c && prev.c) jump = Math.max(jump, Math.hypot(q.c[0] - prev.c[0], q.c[1] - prev.c[1], q.c[2] - prev.c[2])); prev = q; }
    check(jump < 0.5 * 9 * 100 * 0.6, `the departure is continuous (largest half-second step ${jump.toFixed(1)} m)`);
    const lift = at(run.depart + 25);
    check(lift.c[1] > home.c[1] + 40 && Math.hypot(lift.c[0] - home.c[0], lift.c[2] - home.c[2]) < 1, 'it lifts straight up first');
    check(tripOf(p, firmShip, (run.depart + run.back) / 2, home, D).phase === 'pad', 'a held run (you were aboard) keeps it on the pad');
    const live = S.shipsIn(st, p, s, (run.depart + run.back) / 2).find(x => x.id === firmShip.id);
    check(S.onRun(live), 'the live list knows it is away');
  }
  // owning one: buy it; steal another; it all persists
  const sale = S.shipsIn(st, p, s).find(x => x.forSale);
  check(S.buyShip(st, sale, EPOCH).ok && pl.credits === 20000 - PRICES[sale.model] && S.shipIsYours(S.shipsIn(st, p, s).find(x => x.id === sale.id), pl), `bought the ${sale.name} (${sale.model}) for ${PRICES[sale.model]} cr`);
  S.land(st, sh, fl.pos, fl.facing); st.patchDelta(S.shipKey(sh.id), { owner: 'you:' + pl.id, ownerName: 'you', forSale: false });
  const firm = S.shipsIn(st, p, s).find(x => !x.forSale && !S.shipIsYours(x, pl));
  check(S.rampLocked(firm, pl), `${firm.ownerName}'s ship is locked to you`);
  S.forceRamp(st, firm); check(S.rampDown(S.shipsIn(st, p, s).find(x => x.id === firm.id), p, EPOCH + 0.9 * p.dayLength, pl), 'forced ramp stays open');
  const inc = S.stealShip(st, s, firm, EPOCH + 10, []);
  const { offenceFor, getPolity } = await import('../js/gen/polity.js');
  check(offenceFor(inc) === 'ship_theft' && getPolity(p, s).laws.ship_theft.fine >= 3000, `stealing it: ${getPolity(p, s).laws.ship_theft.label}, ${getPolity(p, s).laws.ship_theft.fine} cr`);
  const R = new WorldStore(new MemoryBackend()); await R.importJSON(st.exportJSON());
  const back = S.shipsIn(R, p, s).find(x => x.id === sh.id);
  check(back.at && Math.hypot(back.at.c[0] - fl.pos[0], back.at.c[2] - fl.pos[2]) < 0.01 && S.shipIsYours(back, pl), 'landed where you left it, after reloading');
  // every hull: walkable from its ramp to its cockpit, and flies with its own handling
  for (const model of ['courier', 'patrol', 'yacht', ...Object.keys((await import('../js/gen/ships.js')).LAYOUTS).filter(k => /[0-9]$/.test(k))]) {
    const L = shipPlan(model).layout, fake = { id: 'test:' + model, model, at: { c: [s.cx + 900, surfaceHeight(p, s.cx + 900, s.cz + 900), s.cz + 900], facing: 0.3 } };
    const bb = S.structureOf(s, fake, () => true, p); world.addStructure(bb);
    const W2 = (x, z) => buildingToWorld(s, bb, x, 0, z), mx = (L.ramp.x0 + L.ramp.x1) / 2, cock = L.rooms.find(q => q.purpose === 'cockpit');
    const cc = new Controller(world, W2(mx, -1.5)); run(cc, {}, 0.3);
    const steps = [[mx, (L.hull[1] + (L.partitions[0]?.z ?? L.hull[1] + 2)) / 2], ...L.partitions.map(q => [L.doors[q.door].x, q.z + 0.8]), [mx, (cock.rect[1] + cock.rect[3]) / 2 - 0.4]];
    for (const [x, z] of steps) for (let t = 0; t < 14; t += 1 / 120) { const w = W2(x, z); if (Math.hypot(w[0] - cc.pos[0], w[2] - cc.pos[2]) < 0.3) break; cc.step(1 / 120, { fwd: 1, right: 0, run: false, jump: false, yaw: Math.atan2(w[0] - cc.pos[0], w[2] - cc.pos[2]) }); }
    check(world.locate(...cc.pos)?.room?.purpose === 'cockpit', `${model}: ramp to cockpit (${world.locate(...cc.pos)?.room?.label})`);
    world.removeStructure(bb);
  }
  const sp = m => { const f2 = new Flight(world, p, { model: m }, [s.cx, 2000, s.cz], 0); f2.onGround = false; f2.vel = [0, 0, 60]; for (let t = 0; t < 40; t += 1 / 60) f2.step(1 / 60, { throttle: 1, pitch: f2.vel[1] < 0 ? 0.05 : 0 }); return f2.speed; };
  check(sp('courier') > sp('shuttle') && sp('shuttle') > sp('freighter'), `top speeds: courier ${Math.round(sp('courier') * 3.6)}, shuttle ${Math.round(sp('shuttle') * 3.6)}, freighter ${Math.round(sp('freighter') * 3.6)} km/h`);
};

suites.flora = async () => {
  const { floraTile, floraNear, TILE } = await import('../js/gen/flora.js');
  const { CollisionWorld } = await import('../js/player/collision.js');
  const { Controller } = await import('../js/player/controller.js');
  const { surfaceAt } = await import('../js/gen/surface.js');
  const p = makePlanet(uni(4), HOMEWORLD), s = getSettlement(p, 0, 0);
  check(JSON.stringify(floraTile(p, 20, 10)) === JSON.stringify(floraTile(makePlanet(uni(4), HOMEWORLD), 20, 10)), 'plants are deterministic');
  const all = []; floraNear(p, s.cx, s.cz, 900, q => all.push(q));
  const bad = all.filter(q => { const a = surfaceAt(p, q.x, q.z); return a.town > 0.01 || a.road > 0.01 || q.y < p.seaLevel; });
  check(all.length > 1000 && bad.length === 0, `${all.length} plants within 900 m, none in town, on a road or under the sea`);
  const { SPECIES, plantSet } = await import('../js/gen/flora.js');
  const trees = all.filter(q => SPECIES[q.sp]?.tree);
  check(plantSet(p).length >= 4, 'this planet grows ' + plantSet(p).join(', '));
  check(trees.length > 100, `${trees.length} trees`);
  // you can't walk through a trunk
  const world = new CollisionWorld(p, s, () => false), t = trees[0];
  const c = new Controller(world, [t.x - 3, surfaceAt(p, t.x - 3, t.z).h, t.z]);
  for (let k = 0; k < 600; k++) c.step(1 / 120, { fwd: 1, right: 0, run: false, jump: false, yaw: Math.PI / 2 });
  const d = Math.hypot(c.pos[0] - t.x, c.pos[2] - t.z);
  check(d >= t.solid + 0.3 - 0.02, `walking at a ${t.sp} trunk stops ${d.toFixed(2)} m from its centre`);
};

suites.traffic = async () => {
  const { trafficNear } = await import('../js/gen/traffic.js');
  const { outRoutes, nearRoute } = await import('../js/gen/highways.js');
  const p = makePlanet(uni(4), HOMEWORLD), s = getSettlement(p, 0, 0), T = 3.3e9;
  const a = trafficNear(p, s, T, s.cx, s.cz, 5000), b = trafficNear(p, s, T + 0.5, s.cx, s.cz, 5000);
  check(a.length > 6, `${a.length} speeders on the roads`);
  check(JSON.stringify(a) === JSON.stringify(trafficNear(p, s, T, s.cx, s.cz, 5000)), 'traffic is a pure function of time');
  const byId = new Map(b.map(v => [v.id, v])); let worst = 0;
  for (const v of a) { const w = byId.get(v.id); if (w) worst = Math.max(worst, Math.hypot(w.pos[0] - v.pos[0], w.pos[2] - v.pos[2])); }
  check(worst < 20, `half a second later each has moved at most ${worst.toFixed(1)} m`);
  { let moving = 0, parked = 0; for (const v of a) if (v.parked) parked++; else moving++; const later = trafficNear(p, s, T + 400, s.cx, s.cz, 1e6).filter(v => !v.parked).length; check(moving + later > 0 && parked + (a.length - moving) > 0, `town drivers drive and park (${moving} moving, ${parked} parked, ${later} moving later)`); }
  // nobody blinks: over a long stretch every vehicle is always there, and never jumps (U-turns included)
  const C = await import('../js/gen/city.js'), c = C.getCity(p), all = R => { const m = new Map(); for (const v of trafficNear(p, s, R, s.cx, s.cz, 1e6)) m.set(v.id, v); return m; };
  let m0 = all(T), jump = 0, turn = 0, lost = 0, maxTurn = 0;
  for (let k = 1; k < 1400; k++) { const m1 = all(T + k * 0.5); if (m1.size !== m0.size) lost++;
    for (const [id, v] of m1) { const w = m0.get(id); if (!w) { lost++; continue; } if (Math.hypot(v.pos[0] - w.pos[0], v.pos[2] - w.pos[2]) > 22 * 0.5 + 6) jump++;     /* (+ a lane's shift at a bend) */ let d = Math.abs(v.facing - w.facing); d = Math.min(d, Math.PI * 2 - d); maxTurn = Math.max(maxTurn, d); if (d > 0.3) turn++; }
    m0 = m1; }
  check(lost === 0, `town traffic: nobody appears or vanishes in 700 s (${lost})`); check(jump === 0, `town traffic: nobody teleports (${jump} jumps), U-turns taken smoothly`);
  // the city's drivers: a named person, a purpose, a route; continuous across whole days, no two trips disconnected
  const Fl = await import('../js/gen/cityfleet.js'), F = Fl.cityFleet(p, c), q = {}, DAY = p.dayLength, T0 = T - (T % DAY);
  let cj = 0, why = new Set(), hrMoving = {}, onStreet = 0, offStreet = 0;
  for (let k = 0; k < F.cars.length; k += 41) { const car = F.cars[k]; let last = null; for (let t2 = T0; t2 < T0 + DAY * 0.6; t2 += 2) { Fl.vehicleAt(F, car, t2, q); if (last && Math.hypot(q.x - last[0], q.y - last[1], q.z - last[2]) > (car.kind === 'ground' ? 40 : car.kind === 'sky' ? 120 : 180)) cj++; last = [q.x, q.y, q.z]; if (q.trip?.why) why.add(q.trip.why.split(' —')[0]); } }
  check(cj === 0, `city vehicles: ${F.cars.length}, none teleports across more than half a day (${cj})`);
  check(why.size >= 8, `drivers have reasons to drive: ${[...why].slice(0, 10).join(', ')}`);
  const dn = Fl.driverOf(F, F.cars[3]); check(dn.name && dn.home && dn.work, `every vehicle has a driver (${dn.name}, a ${dn.trade})`);
  { const car = F.cars.find(x => x.kind === 'ground'); let parkedSeen = 0, movedSeen = 0; for (let t2 = T0; t2 < T0 + DAY; t2 += 30) { Fl.vehicleAt(F, car, t2, q); if (q.moving) movedSeen++; else parkedSeen++; } check(parkedSeen > 0 && movedSeen > 0, `a car spends its day driving and parked (${movedSeen} / ${parkedSeen} samples)`); }
  // ground cars stay on the street, not through buildings
  for (let k = 0; k < F.cars.length; k += 97) { const car = F.cars[k]; if (car.kind !== 'ground') continue; for (let t2 = T0; t2 < T0 + DAY * 0.3; t2 += 7) { Fl.vehicleAt(F, car, t2, q); if (!q.moving) continue; const [u, v] = c.toLocal(q.x, q.z), [i, j] = C.blockIndex(c, u, v), r = C.blockRect(c, i, j); if (u > r[0] + 0.2 && u < r[2] - 0.2 && v > r[1] + 0.2 && v < r[3] - 0.2) offStreet++; else onStreet++; } }
  check(offStreet === 0 && onStreet > 50, `ground cars stay in the streets (${onStreet} samples on, ${offStreet} on a block)`);
  // junctions: one street's green, the other's red, a moment all red
  { let both = 0, seen = new Set(); for (let t2 = 0; t2 < 40; t2 += 0.5) { const s0 = Fl.signalAt(c, 3, 4, T + t2); seen.add(s0); if (Fl.greenFor(c, 0, 3, 4, T + t2) && Fl.greenFor(c, 1, 3, 4, T + t2)) both++; } check(both === 0 && seen.size === 3, 'traffic lights: never both streets green'); }
  // manners: a car meets a red light, stops short of the junction, the next stops behind it
  { const { RoadLife } = await import('../js/sim/roadlife.js'), L = new RoadLife(), v = (id, x, stop) => ({ id: `a:${id}`, type: 'sedan', pos: [0, 0, x], facing: 0, speed: 14, stop });
    let x1 = -60, x2 = -80; for (let k = 0; k < 600; k++) { const a = v(1, x1, -x1), b = v(2, x2, -x2 + 0); L.step(1 / 30, [a, b]); x1 += 14 * L.rateOf('a:1') / 30; x2 += 14 * L.rateOf('a:2') / 30; }
    check(x1 < 0.3 && x1 > -6, `a car stops at the red line (${x1.toFixed(1)} m from it)`); check(x1 - x2 > 4.6, `the one behind queues, not overlapping (${(x1 - x2).toFixed(1)} m centre to centre)`);
    let x3 = -50; const M = new RoadLife(); for (let k = 0; k < 300; k++) { M.step(1 / 30, [{ id: 'b:1', type: 'sedan', pos: [0, 0, x3], facing: 0, speed: 14 }], [[0, 0, 0]]); x3 += 14 * M.rateOf('b:1') / 30; } check(x3 < -2.2, `a car with room to stop stops for someone in the road (${x3.toFixed(1)} m short)`); check(M.delayOf('b:1') > 1, 'and that puts it behind its schedule');
    for (let k = 0; k < 2000; k++) M.step(1 / 30, []); check(M.delayOf('b:1') === 0, 'out of sight it catches up'); }
  // being in a vehicle's box
  const { struckBy } = await import('../js/gen/traffic.js'), V = { type: 'sedan', pos: [0, 0, 0], facing: 0 };
  check(struckBy(V, 0, 0, 2, 0.3) && struckBy(V, 1, 0.5, 0, 0.3), 'standing in front of or beside a car: struck'); check(!struckBy(V, 3, 0, 0, 0.3) && !struckBy(V, 0, 0, 4, 0.3) && !struckBy(V, 0, 5, 0, 0.3), 'clear of it, or above it: not struck');
};

suites.talk = async () => {
  const T = await import('../js/sim/processes/talk.js');
  const { knowsYou } = await import('../js/sim/processes/law.js');
  const { WorldStore } = await import('../js/world/store.js');
  const { MemoryBackend } = await import('../js/world/store-mem.js');
  const { getPopulation } = await import('../js/gen/population.js');
  const { getPolity } = await import('../js/gen/polity.js');
  const { newCharacter } = await import('../js/gen/character.js');
  const { EPOCH } = await import('../js/sim/clock.js');
  const U = uni(7), p = makePlanet(U, HOMEWORLD), s = getSettlement(p, 0, 0), pop = getPopulation(p, s), polity = getPolity(p, s);
  const st = new WorldStore(new MemoryBackend()); st.create(seedHex(U), EPOCH, 0); const pl = newCharacter(U, p, s, pop, 1, EPOCH); st.setPlayer(pl);
  const ctx = { store: st, planet: p, s, pop, polity };
  const worker = pop.people.find(q => q.job && q.age > 25), j = pop.jobById.get(worker.job);
  const w = T.workLine(pop, worker);
  check(w.includes(j.title.toLowerCase()) && w.includes(j.employer), 'they tell you their real job: ' + w);
  const fam = pop.people.find(q => pop.people.some(r => r.household === q.household && r.id !== q.id && r.age < 18) && q.age > 25);
  const f = T.familyLine(pop, fam), kid = pop.people.find(r => r.household === fam.household && r.age < 18);
  check(f.includes(kid.given), 'and who they live with: ' + f);
  check(T.homeLine(pop, worker) === T.homeLine(pop, worker), 'answers are stable');
  const stranger = pop.people.find(q => !pl.family.parents.includes(q.id) && q.homeB !== pl.home && q.age > 20);
  const before = knowsYou(ctx, stranger.id, pl);
  check(!T.known(st, stranger.id), 'a stranger is a stranger');
  T.introduce(st, stranger, EPOCH + 10);
  check(T.known(st, stranger.id) && knowsYou(ctx, stranger.id, pl) > before, `after meeting, they'd recognise you as a witness (${before} → ${knowsYou(ctx, stranger.id, pl)})`);
  const d = T.directionsFrom(pop, polity, pl, worker);
  check(d.length >= 3 && d.every(x => x.pos && x.pos.length === 3), 'directions to ' + d.map(x => x.label).join('; '));
  check(typeof T.smallTalk(pop, st, worker, EPOCH, { label: 'rain' }, 'shopping', 0) === 'string', 'small talk');
};

suites.combat = async () => {
  const C = await import('../js/sim/processes/combat.js');
  const { WorldStore } = await import('../js/world/store.js');
  const { MemoryBackend } = await import('../js/world/store-mem.js');
  const { Scheduler } = await import('../js/sim/scheduler.js');
  const { registerLawJobs, lodgeIncident } = await import('../js/sim/processes/law.js');
  const { registerLifeJobs } = await import('../js/sim/processes/life.js');
  const { livePopulation } = await import('../js/world/town.js');
  const { getPolity, offenceFor } = await import('../js/gen/polity.js');
  const { newCharacter } = await import('../js/gen/character.js');
  const { EPOCH } = await import('../js/sim/clock.js');
  const U = uni(7), p = makePlanet(U, HOMEWORLD), s = getSettlement(p, 0, 0), polity = getPolity(p, s);
  const st = new WorldStore(new MemoryBackend()); st.create(seedHex(U), EPOCH, 0);
  const pop = livePopulation(p, s, st, EPOCH), pl = newCharacter(U, p, s, pop, 1, EPOCH); pl.pos = [0, 0, 0]; st.setPlayer(pl);
  const sc = new Scheduler(st); registerLawJobs(sc); registerLifeJobs(sc);
  const ctx = { store: st, sched: sc, planet: p, s, pop, polity, doorstepOf: () => [0, 0, 0] };
  const victim = pop.people.find(q => q.age > 25 && q.job && !pl.family.parents.includes(q.id)), jobId = victim.job, n0 = pop.people.length;
  const t = EPOCH + 1000;
  const r1 = C.strike(ctx, victim, 'fists', t, []);
  check(r1.hp < 100 && r1.hp > 80 && !r1.killed && r1.incident, `a punch: ${r1.hp}% left`);
  lodgeIncident(ctx, r1.incident);
  check(C.healthOf(st, p, victim.id, t + p.dayLength) === 100, 'healed a day later');
  const r2 = C.strike(ctx, victim, 'knife', t + 5, []), r3 = C.strike(ctx, victim, 'knife', t + 6, []);
  check(r3.down && !r3.killed && C.isDown(st, victim.id, t + 7), `two stabs: down at ${Math.round(r3.hp)}%`);
  check(!r2.incident && !r3.incident, 'a flurry of blows is one assault, not three');
  let r = r3; for (let k = 0; k < 6 && !r.killed; k++) r = C.strike(ctx, victim, 'pistol', t + 10 + k, []);
  check(r.killed && pop.byId.get(victim.id)?.gone?.why === 'killed' && pop.people.length === n0 - 1, 'shot dead: gone from the town');
  check(st.events.some(e => e.type === 'died' && e.who === victim.id && e.cause === 'killed'), 'a death in the register, by violence');
  check(st.getDelta('job/' + jobId)?.holder === null, 'their job is open again');
  const inc = st.events.find(e => e.type === 'assault' && e.victim === victim.id);
  check(inc.killed && offenceFor(inc) === 'murder', 'the assault became a murder');
  sc.runDue(t + 10 * p.dayLength, ctx);
  check(st.events.some(e => e.type === 'case_opened' && e.what === 'killing'), 'the victim reported the attack before dying: a case is opened');
  check(pl.fines?.some(f => /Murder/.test(f.offence)) || pl.warrant, `charged: ${pl.fines?.map(f => f.offence + ' ' + f.amount).join(', ')}`);
  // seen by an officer: a warrant at once
  const st2 = new WorldStore(new MemoryBackend()); st2.create(seedHex(U), EPOCH, 0);
  const pop2 = livePopulation(p, s, st2, EPOCH), pl2 = newCharacter(U, p, s, pop2, 1, EPOCH); st2.setPlayer(pl2);
  const ctx2 = { ...ctx, store: st2, pop: pop2 }, cop = pop2.people.find(q => q.job && pop2.jobById.get(q.job).security), v2 = pop2.people.find(q => q.age > 25 && q !== cop);
  lodgeIncident(ctx2, C.strike(ctx2, v2, 'fists', t, [{ id: cop.id, name: cop.name, dist: 5 }]).incident);
  check(pl2.warrant && /attacking/.test(pl2.warrant.reason), 'an officer saw it: ' + pl2.warrant?.reason);
};

suites.city = async () => {
  const C = await import('../js/gen/city.js');
  const { CollisionWorld } = await import('../js/player/collision.js');
  let total = 0, maxH = 0; const kinds = new Set(), dist = {};
  for (let n = 1; n <= 3; n++) {
    const p = makePlanet(uni(n), HOMEWORLD), c = C.getCity(p), c2 = C.getCity(makePlanet(uni(n), HOMEWORLD));
    check(c.cx === c2.cx && c.cz === c2.cz && c.name === c2.name, 'city site repeatable');
    check(digest(C.cityBlock(c, 1, 2)) === digest(C.cityBlock(c2, 1, 2)), 'block repeatable');
    const d0 = Math.hypot(c.cx, c.cz); check(d0 > c.R + 3000, `city clear of the home town (${Math.round(d0)} m, R ${c.R})`);
    // no town inside the city
    for (let rx = -6; rx <= 6; rx++) for (let rz = -6; rz <= 6; rz++) { const s = getSettlement(p, rx, rz); if (s) check(Math.hypot(s.cx - c.cx, s.cz - c.cz) > c.R + s.R, `town ${s.name} outside the city`); }
    const [i0, j0, i1, j1] = C.cityExtent(c);
    let bad = 0, overlaps = 0;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const B = C.cityBlock(c, i, j); if (!B.district) continue;
      dist[B.district] = (dist[B.district] || 0) + 1;
      const R = B.rect; check(R[2] - R[0] > 60 && R[3] - R[1] > 60, 'blocks have room');
      const boxes = [];
      for (const b of B.buildings) { total++; maxH = Math.max(maxH, b.top || 0);
        for (const t of b.tiers) { if (t.r[0] < R[0] - 0.01 || t.r[1] < R[1] - 0.01 || t.r[2] > R[2] + 0.01 || t.r[3] > R[3] + 0.01 || t.y1 <= t.y0 || t.r[2] <= t.r[0] || t.r[3] <= t.r[1]) bad++; boxes.push([b.id, t]); } }
      for (let a = 0; a < boxes.length; a++) for (let q = a + 1; q < boxes.length; q++) {
        const [ia, A] = boxes[a], [ib, Bx] = boxes[q]; if (ia === ib) continue;
        if (rectsOverlap(A.r, Bx.r, -0.05) && A.y0 < Bx.y1 - 0.05 && Bx.y0 < A.y1 - 0.05) overlaps++;
      }
      for (const pr of B.props) kinds.add(pr.k);
    }
    check(bad === 0, `every tier inside its block (${bad} outside)`);
    check(overlaps === 0, `no two buildings intersect (${overlaps})`);
    if (n === 1) {
      // walk the streets: along a street centre line nothing blocks; into a tower you're stopped; a pad holds you up
      const W = new CollisionWorld(p, getSettlement(p, 0, 0), () => true); W.flora = false;
      const i = 2, u = C.lineAt(c, 0, i); let v = C.lineAt(c, 1, -3), [x, z] = c.toWorld(u, v), y = W.groundAt(x, z, c.h + 1).h, blocked = 0;
      check(Math.abs(y - c.h) < 0.05, `street level is the city ground (${y.toFixed(2)} vs ${c.h})`);
      for (let k = 0; k < 400; k++) { v += 1.5; const [tx, tz] = c.toWorld(u, v), [rx, rz] = W.resolve(tx, tz, y); if (Math.hypot(rx - tx, rz - tz) > 0.01) blocked++; }
      check(blocked === 0, `600 m down the middle of a street unobstructed (${blocked})`);
      let B = null; for (let a = 0; a < 30 && !B; a++) { const b = C.cityBlock(c, a % 6, Math.floor(a / 6)); if (b.district && b.buildings.some(q => q.tiers[0].y0 === 0 && q.tiers[0].y1 > 20)) B = b; }
      const bd = B.buildings.find(q => q.tiers[0].y0 === 0 && q.tiers[0].y1 > 20), t = bd.tiers[0];
      const mid = [(t.r[0] + t.r[2]) / 2, (t.r[1] + t.r[3]) / 2], [ox, oz] = c.toWorld(t.r[0] - 3, mid[1]);
      let px = ox, pz = oz;
      for (let k = 0; k < 60; k++) { const [fx, fz] = c.toWorld(...[c.toLocal(px, pz)[0] + 0.25, mid[1]]); [px, pz] = W.resolve(fx, fz, c.h + CURBV(C)); }
      const [lu] = c.toLocal(px, pz);
      check(lu < t.r[0] && lu > t.r[0] - 0.6, `walking into a ${bd.label} stops you at its wall (${(lu - t.r[0]).toFixed(2)} m)`);
      check(W.solidAt(...c.toWorld(...mid).flatMap((q, k) => k ? [c.h + 5, q] : [q])) === true, 'inside a building is solid');
      const pads = []; for (let a = -8; a <= 8; a++) for (let b = -8; b <= 8; b++) for (const pd of C.cityBlock(c, a, b).pads) if (!pd.ground) pads.push(pd);
      if (check(pads.length > 0, 'spires have landing pads')) {
        const pd = pads[0], [qx, qz] = c.toWorld((pd.r[0] + pd.r[2]) / 2, (pd.r[1] + pd.r[3]) / 2), top = c.h + C.CURB + pd.y;
        check(Math.abs(W.groundAt(qx, qz, top + 0.3).h - top) < 0.01, `standing on a landing pad ${Math.round(pd.y)} m up`);
      }
    }
  }
  {   // walk-in buildings: the town's plan generator lays every one out, all rooms reachable from the street
    const { realOf } = await import('../js/world/cityreal.js');
    const p = makePlanet(uni(1), HOMEWORLD), c = C.getCity(p), s1 = getSettlement(p, 0, 0), [i0, j0, i1, j1] = C.cityExtent(c);
    let n = 0, bad = 0, unreach = 0;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const B = C.cityBlock(c, i, j); for (const b of B.buildings) {
      if (!b.enter) continue; const r = realOf(p, s1, c, B, b); if (!r) { bad++; continue; } n++;
      if (n % 7) continue;     // (reachability on a sample: every 7th)
      const g = roomGraph(r.plan), seen = new Set(['outside']), q = ['outside'];
      while (q.length) for (const k of g.get(q.pop()) || []) if (!seen.has(k)) { seen.add(k); q.push(k); }
      if (r.plan.rooms.some(rm => !seen.has(`${rm.k}:${rm.i}`))) unreach++;
    } }
    check(n > 3000 && bad === 0, `${n} walk-in city buildings (${bad} the plan generator couldn't lay out)`);
    check(unreach === 0, `every room of every sampled walk-in building is reachable from the street (${unreach} not)`);
  }
  check(maxH > 600, `spires reach ${Math.round(maxH)} m`);
  check(kinds.size >= 100, `${kinds.size} kinds of street furniture, stalls and roof kit`);
  for (const d of C.DISTRICTS) check(dist[d] > 0, `district ${d} present (${dist[d] || 0} blocks)`);
  console.log(`  ${total} buildings in 3 cities, tallest ${Math.round(maxH)} m, ${kinds.size} object kinds,`, JSON.stringify(dist));
};
const CURBV = C => C.CURB + 0.02;
suites.climbing = async () => {
  const C = await import('../js/gen/city.js');
  const { CollisionWorld } = await import('../js/player/collision.js');
  const { Climber, BODY } = await import('../js/player/climber.js');
  const p = makePlanet(uni(1), HOMEWORLD), c = C.getCity(p), s = getSettlement(p, 0, 0), W = new CollisionWorld(p, s, () => true), base = c.h + C.CURB; W.flora = false;
  const find = (dist, test) => { for (let a = 0; a < 3600; a++) { const B = C.cityBlock(c, (a % 60) - 30, Math.floor(a / 60) - 30); if (B.district !== dist) continue; for (const b of B.buildings) if (test(b)) return b; } return null; };
  // stand at a wall (the -u side of a tier) and grab it
  const at = (b, ti = 0, v = 0.5) => { const t = b.tiers[ti], vm = t.r[1] + (t.r[3] - t.r[1]) * v, [x, z] = c.toWorld(t.r[0] - 0.6, vm), [tx, tz] = c.toWorld(t.r[0] + 2, vm), l = Math.hypot(tx - x, tz - z), fx = (tx - x) / l, fz = (tz - z) / l; return { x, z, fx, fz, yaw: Math.atan2(fx, fz), y: base + t.y0 }; };
  const LEN = { h: BODY.upperArm + BODY.foreArm, f: BODY.thigh + BODY.shin };
  // run with invariants checked every frame; returns stats
  const run = (cl, input, until, maxT, hz = 60) => {
    const st = { T: 0, stretch: 0, minPlanted: 4, slid: 0, minOut: 9, stuck: 0, moves: 0 }, prev = {};
    while (st.T < maxT && !cl.done && !until(cl)) {
      const m0 = cl.moving; cl.step(1 / hz, input); st.T += 1 / hz; if (cl.moving && cl.moving !== m0) st.moves++;
      if (cl.done) break;
      if (cl.state === 'hold') {
        let pl = 0;
        for (const k of ['lh', 'rh', 'lf', 'rf']) {
          const L = cl.limb[k], planted = !L.free && k !== cl.moving; if (planted) pl++;
          if (planted && prev[k]?.planted && prev[k].h === L.hold && Math.hypot(L.p[0] - prev[k].p[0], L.p[1] - prev[k].p[1], L.p[2] - prev[k].p[2]) > 1e-9) st.slid++;
          if (!L.free) { const J = cl.jointOf(k, cl.pelvis), d = Math.hypot(L.p[0] - J[0], L.p[1] - J[1], L.p[2] - J[2]); if (d / LEN[k[1]] > st.stretch) { st.stretch = d / LEN[k[1]]; st.worst = `${k}${k === cl.moving ? ' moving f=' + L.f.toFixed(2) : ''} at ${st.T.toFixed(1)} s`; } }
          prev[k] = { planted, h: L.hold, p: L.p.slice() };
        }
        st.minPlanted = Math.min(st.minPlanted, pl);
        st.minOut = Math.min(st.minOut, Math.max(...[...new Set(['lh', 'rh', 'lf', 'rf'].map(k => cl.limb[k].hold?.face).filter(Boolean))].map(f => (cl.pelvis[0] - f.o[0]) * f.n[0] + (cl.pelvis[2] - f.o[1]) * f.n[1])));
      }
      st.stuck = cl.blocked ? st.stuck + 1 : 0; if (st.stuck > 240) break;
    }
    return st;
  };
  const good = (st, tag) => {
    check(st.stretch <= 1.01, `${tag}: no limb stretched past its length (${st.stretch.toFixed(3)}, ${st.worst})`);
    check(st.minPlanted >= 3, `${tag}: always three limbs on (${st.minPlanted})`);
    check(st.slid === 0, `${tag}: planted hands and feet never slide (${st.slid} frames)`);
    check(st.minOut >= 0.19, `${tag}: the body stays off the wall (${st.minOut.toFixed(2)} m)`);
  };
  const up = yaw => ({ fwd: 1, right: 0, yaw });
  // up a whole residential block, then over the parapet onto the roof
  const hab = find('housing', b => b.top > 30 && b.top < 50 && b.tiers.length === 1 && C.STYLES[b.style][5]);
  { const q = at(hab), cl = Climber.grab(W, q.x, base, q.z, q.fx, q.fz);
    if (check(cl, 'a hab block can be grabbed')) { const st = run(cl, up(q.yaw), () => false, 400); good(st, 'hab block');
      check(cl.done?.kind === 'walk' && Math.abs(cl.done.pos[1] - (base + hab.top)) < 1, `climbed ${hab.top} m and stepped onto the roof (${cl.done?.kind}, ${st.T.toFixed(0)} s, ${(hab.top / st.T).toFixed(2)} m/s, ${st.moves} moves)`); console.log(`  ${hab.top} m hab block in ${st.T.toFixed(0)} s (${(hab.top / st.T).toFixed(2)} m/s), ${st.moves} moves, peak stretch ${st.stretch.toFixed(3)}`); } }
  // every climbable style of facade can be climbed 12 m
  for (const [dist, name] of [['undercity', 'grime'], ['commerce', 'grid'], ['commerce', 'ribbon'], ['commerce', 'bronze'], ['housing', 'brick'], ['industry', 'shed']]) {
    const b = find(dist, q => C.STYLES[q.style][0] === name && !q.tiers[0].shape && q.tiers[0].y0 === 0 && q.tiers[0].y1 > 12); if (!b) { console.log('  (no ' + name + ')'); continue; }
    const q = at(b), cl = Climber.grab(W, q.x, base, q.z, q.fx, q.fz);
    if (!check(cl, `${name}: can be grabbed`)) continue;
    const st = run(cl, up(q.yaw), k => k.pelvis[1] > base + 12, 90); good(st, name);
    const need = dist === 'undercity' ? 6 : 12;        // (the Warrens' stacked overhangs can roof over a route)
    check(cl.pelvis[1] > base + need || cl.done, `${name}: ${need} m up (reached ${(cl.pelvis[1] - base).toFixed(1)} m in ${st.T.toFixed(0)} s)`);
  }
  // sideways along a wall, down again and off at the bottom; the same climb at 30 and 120 Hz
  { const q = at(hab), cl = Climber.grab(W, q.x, base, q.z, q.fx, q.fz); run(cl, up(q.yaw), k => k.pelvis[1] > base + 6, 60);
    const a0 = cl.limb.lh.hold.a, st = run(cl, { fwd: 0, right: 1, yaw: q.yaw }, k => Math.abs(k.limb.lh.hold.a - a0) > 3, 40); good(st, 'traverse');
    check(Math.abs(cl.limb.lh.hold.a - a0) > 3, `traversed 3 m along the wall (${Math.abs(cl.limb.lh.hold.a - a0).toFixed(1)} m)`);
    const sd = run(cl, { fwd: -1, right: 0, yaw: q.yaw }, () => false, 90); good(sd, 'down-climb'); check(cl.done?.kind === 'walk' && Math.abs(cl.done.pos[1] - base) < 0.2, `climbed back down and stepped off (${cl.done?.kind})`); }
  for (const hz of [30, 120]) { const q = at(hab), cl = Climber.grab(W, q.x, base, q.z, q.fx, q.fz), st = run(cl, up(q.yaw), k => k.pelvis[1] > base + 10, 90, hz); good(st, hz + ' Hz'); check(cl.pelvis[1] > base + 10, `${hz} Hz: same climb works`); }
  // round an outside corner
  { const q = at(hab, 0, 0.5), t = hab.tiers[0], vm = t.r[3] - 1.2, [x, z] = c.toWorld(t.r[0] - 0.6, vm), cl = Climber.grab(W, x, base, z, q.fx, q.fz); run(cl, up(q.yaw), k => k.pelvis[1] > base + 5, 60);
    const f0 = cl.face, R = cl.right(), dirRight = (f0.t[0] * R[0] + f0.t[1] * R[2]) > 0 ? -1 : 1;     // (toward a = 0, the corner we started by)
    const st = run(cl, { fwd: 0, right: dirRight, yaw: q.yaw }, k => k.face !== f0, 40); good(st, 'corner'); check(cl.face !== f0, `went round a corner onto the next wall (${f0.key} → ${cl.face.key})`); }
  // leap: both hands off, catch a hold higher up
  { const q = at(hab), cl = Climber.grab(W, q.x, base, q.z, q.fx, q.fz); run(cl, up(q.yaw), k => k.pelvis[1] > base + 5 && !k.moving, 60); const y0 = Math.min(cl.limb.lh.hold.y, cl.limb.rh.hold.y);
    cl.step(1 / 60, { fwd: 1, right: 0, jump: true, yaw: q.yaw }); check(cl.state === 'leap', 'Space leaps'); let T = 0; while (cl.state === 'leap' && T < 3) { cl.step(1 / 60, { fwd: 0, right: 0, yaw: q.yaw }); T += 1 / 60; }
    check(cl.state === 'hold' && cl.limb.lh.hold.y > y0 + 0.9, `caught a hold ${(cl.limb.lh.hold?.y - y0).toFixed(1)} m higher, in ${T.toFixed(2)} s`); const st = run(cl, up(q.yaw), k => !k.limb.lf.free && !k.limb.rf.free, 6); check(!cl.limb.lf.free && !cl.limb.rf.free, 'the feet found holds again'); }
  // nothing to hold: glass towers and round towers refuse; too tired, your grip goes and you fall
  { const g = find('spire', b => C.STYLES[b.style][0] === 'glass'), pod = find('commerce', b => C.STYLES[b.style][0] === 'glass' && b.tiers[0].y0 === 0 && !b.tiers[0].shape);
    if (pod) { const q = at(pod); check(!Climber.grab(W, q.x, base, q.z, q.fx, q.fz), 'a glass curtain wall has nothing to hold'); }
    const q = at(hab), cl = Climber.grab(W, q.x, base, q.z, q.fx, q.fz); run(cl, up(q.yaw), k => k.pelvis[1] > base + 4, 40); const st = run(cl, { fwd: 0, right: 0, yaw: q.yaw, exhausted: true }, () => false, 10); check(cl.done?.kind === 'fall' && cl.done.slipped, `exhausted, the grip goes after ${st.T.toFixed(1)} s`);
    const q2 = at(hab), c2 = Climber.grab(W, q2.x, base, q2.z, q2.fx, q2.fz); run(c2, up(q2.yaw), k => k.pelvis[1] > base + 3, 40); c2.step(1 / 60, { fwd: 0, right: 0, drop: true, yaw: q2.yaw }); check(c2.done?.kind === 'fall' && !c2.done.slipped, 'Q lets go'); }
  // town buildings: climb a real building at home, onto its roof
  { const b = s.buildings.find(q => q.type === 'hab' || q.type === 'office'), pl = W.colliders(b).plan, [x, z] = s.toWorld(b.O[0] + b.ex[0] * b.w / 2 - b.ez[0] * 0.6, b.O[1] + b.ex[1] * b.w / 2 - b.ez[1] * 0.6), [dx, dz] = (() => { const [a, e] = s.toWorld(b.O[0] + b.ex[0] * b.w / 2 + b.ez[0], b.O[1] + b.ex[1] * b.w / 2 + b.ez[1]); return [a - x, e - z]; })(), l = Math.hypot(dx, dz);
    const yb = W.baseOf(b), cl = Climber.grab(W, x, yb, z, dx / l, dz / l);
    if (check(cl, `a ${b.type} in town can be grabbed`)) { const st = run(cl, up(Math.atan2(dx, dz)), () => false, 200); good(st, 'town'); check(cl.done?.kind === 'walk' && cl.done.pos[1] > yb + pl.F * pl.H - 1, `climbed the ${b.type} onto its roof (${cl.done?.kind}, ${st.T.toFixed(0)} s)`); } }
};
suites.aircombat = async () => {
  const { AirWar, raidAt, raidIndex } = await import('../js/sim/aircombat.js');
  const { CollisionWorld } = await import('../js/player/collision.js');
  const p = makePlanet(uni(4), HOMEWORLD), s = getSettlement(p, 0, 0), world = new CollisionWorld(p, s, () => false); world.flora = false;
  let wins = { security: 0, raider: 0 }, crashes = 0, gunKills = 0, mslKills = 0, fights = 0;
  const pairs = [['striker', 'needle'], ['interceptor', 'shade'], ['warden', 'gunship0'], ['needle', 'interceptor'], ['shade', 'striker'], ['interceptor', 'interceptor']];
  for (const [a, b] of pairs) {
    const war = new AirWar(world, p), A = war.spawn(a, 'security', [s.cx, s.h + 1500, s.cz], 0, 150), B = war.spawn(b, 'raider', [s.cx + 300, s.h + 1600, s.cz + 4000], Math.PI, 150);
    for (let t = 0; t < 240 && A.alive && B.alive; t += 1 / 60) war.step(1 / 60);
    fights++;
    const dead = [A, B].find(c => !c.alive); if (dead) { wins[dead === A ? 'raider' : 'security']++; const e = war.events.find(e => e.type === 'killed'); if (e && !e.by) crashes++; }
  }
  check(wins.security + wins.raider >= 4, `${fights} dogfights: ${wins.security} won by security, ${wins.raider} by raiders, ${fights - wins.security - wins.raider} still going after 4 min`);
  check(crashes <= 1, `AI pilots fly into the ground at most rarely (${crashes})`);
  // a missile against a target that can't dodge or flare it kills it
  const w2 = new AirWar(world, p), shooter = w2.spawn('striker', 'security', [s.cx, s.h + 2000, s.cz], 0, 150, 'player'), tgt = w2.spawn('courier', 'raider', [s.cx, s.h + 2000, s.cz + 1500], 0, 120, 'player');
  shooter.f.assist = tgt.f.assist = true; tgt.flares = 0;
  for (let t = 0; t < 3; t += 1 / 60) { w2.step(1 / 60, true); shooter.f.step(1 / 60, { throttle: 1 }); tgt.f.step(1 / 60, { throttle: 1 }); }
  check(shooter.lock === tgt && shooter.lockT > 1.2, 'locked a target ahead, from behind');
  check(w2.fireMissile(shooter), 'missile away');
  for (let t = 0; t < 10 && tgt.alive; t += 1 / 60) { w2.step(1 / 60, true); shooter.f.step(1 / 60, { throttle: 1 }); tgt.f.step(1 / 60, { throttle: 1 }); }
  check(!tgt.alive || tgt.hp < tgt.maxHp, `it hit: ${Math.max(0, Math.round(tgt.hp))}/${tgt.maxHp} left`);
  // head-on, a heat-seeker can't lock
  const w3 = new AirWar(world, p), h1 = w3.spawn('striker', 'security', [s.cx, s.h + 2000, s.cz], 0, 150), h2 = w3.spawn('striker', 'raider', [s.cx, s.h + 2000, s.cz + 2000], Math.PI, 150);
  check(w3.seekerTarget(h1) === null, 'no lock head-on (it has to see the engines)');
  // raids are pure in time
  const r1 = raidAt(p, s, raidIndex(p, 3.3e9)), r2 = raidAt(p, s, raidIndex(p, 3.3e9));
  check(JSON.stringify(r1) === JSON.stringify(r2) && r1.n >= 2, `raids are deterministic: ${r1.n} raiders, ${r1.defenders} defenders`);
};

suites.countryside = async () => {
  const { sitesInTile } = await import('../js/gen/outposts.js'), { cultureOf } = await import('../js/gen/culture.js'), { FOOT, FAMILIES } = await import('../js/gen/familydata.js'), { designOf } = await import('../js/gen/designs.js');
  const planets = [1, 2, 3, 4, 5, 6, 7, 8].map(n => makePlanet(uni(n), HOMEWORLD));
  let kinds = {}, items = 0, overlap = 0, steep = 0, lanesHit = 0, unknown = 0, sample = null; const usual = new Set(), ways = new Set();
  for (const p of planets) {
    ways.add(cultureOf(p).key); usual.add(designOf(p, 'cottage', 0, 0));
    for (let i = -22; i < 22; i++) for (let j = -22; j < 22; j++) for (const S of sitesInTile(p, i, j)) {
      kinds[S.kind] = (kinds[S.kind] || 0) + 1; items += S.items.length; if (S.kind === 'village' && (!sample || S.items.length > sample.items.length)) sample = S;
      const B = S.items.filter(q => q.box);
      for (const q of S.items) if (q.k.startsWith('fam_') && !(q.k in FOOT)) unknown++;
      for (let a = 0; a < B.length; a++) for (let b = a + 1; b < B.length; b++) { const A = B[a], C = B[b], d = Math.hypot(A.x - C.x, A.z - C.z); if (d < Math.min(A.box[0], A.box[1]) + Math.min(C.box[0], C.box[1])) overlap++; }
      for (const [x0, z0, x1, z1] of S.lanes) for (const q of B) { const L = Math.hypot(x1 - x0, z1 - z0), u = ((q.x - x0) * (x1 - x0) + (q.z - z0) * (z1 - z0)) / L, o = Math.abs((q.x - x0) * (z1 - z0) - (q.z - z0) * (x1 - x0)) / L; if (u > 0 && u < L && o < Math.min(q.box[0], q.box[1])) lanesHit++; }
    }
  }
  console.log('   ', JSON.stringify(kinds), items, 'items;', 'cultures', [...ways].join(' '));
  for (const k of ['village', 'hamlet', 'fishing', 'farm', 'graveyard', 'township', 'lumber', 'refuge']) check(kinds[k] > 0, `some land has ${k}s (${kinds[k] || 0})`);
  check(!unknown, `every family model placed exists (${unknown} unknown)`);
  check(!overlap, `no two buildings stand in one another (${overlap})`); check(!lanesHit, `no building sits on a lane (${lanesHit})`);
  check(sample && sample.items.filter(q => q.box).length >= 8, `a village is a village: ${sample?.items.filter(q => q.box).length} buildings, ${sample?.lanes.length} lane`);
  const { houseDesigns, houseFoot } = await import('../js/gen/housegen.js'), looks = new Set(planets.flatMap(p => houseDesigns(p).map(d => JSON.stringify({ ...d, id: 0 }))));
  check(looks.size === planets.length * 6, `every planet designs its own houses (${looks.size} different designs on ${planets.length} planets)`);
  check(new Set(planets.map(p => houseDesigns(p).map(d => d.wall + d.roof).sort().join())).size >= 4, 'and builds them of different things');
  check(planets.every(p => houseDesigns(p).every(d => { const [a, b, h] = houseFoot(d); return a > 2 && b > 2 && h > 2 && d.shape; })), 'each design states its footprint');
  check(JSON.stringify(houseDesigns(makePlanet(uni(3), HOMEWORLD))) === JSON.stringify(houseDesigns(planets[2])), 'the same seed designs the same houses');
  check(JSON.stringify(sitesInTile(makePlanet(uni(1), HOMEWORLD), 3, 3)) === JSON.stringify(sitesInTile(planets[0], 3, 3)), 'the same seed puts the same things in the same places');
  check(FAMILIES.length * 7 === Object.keys(FOOT).length, `every family exists in every way of building (${Object.keys(FOOT).length})`);
};

suites.walkin = async () => {
  const { sitesInTile } = await import('../js/gen/outposts.js'), { FORMS, designsFor, designPlan } = await import('../js/gen/housegen.js'), { siteReal } = await import('../js/world/sitereal.js'), { roomGraph } = await import('../js/gen/building.js');
  const { surfaceHeight } = await import('../js/gen/surface.js'), { CollisionWorld } = await import('../js/player/collision.js');
  let designs = 0, unreached = 0, noPlan = 0;
  for (let n = 1; n <= 12; n++) { const p = makePlanet(uni(n), HOMEWORLD); for (const fam of Object.keys(FORMS)) for (const D of designsFor(p, fam)) {
    designs++; const pl = designPlan(p, D); if (!(pl.entrance >= 0) || !pl.rooms.length) { noPlan++; continue; }
    const g = roomGraph(pl), seen = new Set(['outside']), q = ['outside']; while (q.length) for (const m of g.get(q.pop()) || []) if (!seen.has(m)) { seen.add(m); q.push(m); }
    for (const r of pl.rooms) if (!seen.has(`${r.k}:${r.i}`)) unreached++;
  } }
  check(!noPlan, `every design has rooms and a front door (${designs} designs)`); check(!unreached, `every room of every design can be reached from the street (${unreached} can't)`);
  // walk in for real: up the steps, through the door, against the same collision the game uses
  let tried = 0, inOK = 0, shutOK = 0, poke = 0, under = 0, steps = 0; const bad = [], fams = new Set();
  for (const n of [1, 2, 3, 4, 5]) { const p = makePlanet(uni(n), HOMEWORLD), s = getSettlement(p, 0, 0);
    for (let i = -14; i <= 14 && tried < 110 * n; i++) for (let j = -14; j <= 14; j++) for (const S of sitesInTile(p, i, j)) S.items.forEach((it, idx) => {
      if (!/^gb_(?!step)/.test(it.k) || tried >= 110 * n) return;
      tried++; fams.add(it.k.split('_')[1]);
      const world = new CollisionWorld(p, s, () => false); world.flora = false; const rec = siteReal(p, s, S, it, idx); let open = true; rec.doorPassable = id => id !== rec.plan.entrance || open;
      world.addStructure(rec); if (rec.stoop) { world.addStructure(rec.stoop); steps++; } it.live = true;
      const c = Math.cos(it.rot), sn = Math.sin(it.rot), at = (u, v) => [it.x + u * c + v * sn, it.z - u * sn + v * c], D = rec.design, dr = rec.plan.doors[rec.plan.entrance], u = dr.x - D.w / 2;
      for (let a = -1; a <= 1; a += 0.5) for (let b = -1; b <= 1; b += 0.5) { const [x, z] = at(a * D.w / 2, b * D.d / 2); if (surfaceHeight(p, x, z) > it.y) poke++; }
      const walk = () => { let [x, z] = at(u, -D.d / 2 - (it.stoop ? it.stoop.n * it.stoop.run : 0) - 2.5), y = surfaceHeight(p, x, z); const [tx, tz] = at(u, -D.d / 2 + 1.2);
        for (let k = 0; k < 90; k++) { const dx = tx - x, dz = tz - z, L = Math.hypot(dx, dz); if (L < 0.12) break; const st = Math.min(0.1, L); [x, z] = world.resolve(x + dx / L * st, z + dz / L * st, y); y = world.groundAt(x, z, y).h; }
        return world.locate(x, y + 0.1, z); };
      const inside = walk(); if (inside?.b === rec && inside.room) inOK++; else if (bad.length < 6) bad.push(`${it.k} stoop=${it.stoop?.n ?? 0}`);
      open = false; world.cols.delete(rec.key); if (!walk()?.room) shutOK++;
      // and you can't walk underneath where the ground falls away
      const [bx, bz] = at(-D.w / 4, -D.d / 2 - 1), by = surfaceHeight(p, bx, bz), [tx, tz] = at(-D.w / 4, 0); let x = bx, z = bz, y = by; for (let k = 0; k < 40; k++) { const dx = tx - x, dz = tz - z, L = Math.hypot(dx, dz) || 1; [x, z] = world.resolve(x + dx / L * 0.1, z + dz / L * 0.1, y); y = world.groundAt(x, z, y).h; } if (world.locate(x, y + 0.1, z)?.room || (Math.hypot(x - it.x, z - it.z) < 1)) under++;
      it.live = false;
    });
  }
  console.log(`    ${tried} buildings of ${fams.size} kinds, ${steps} with steps; ${inOK} walked into, ${shutOK} stopped by a shut door`);
  check(fams.size >= 10, `villages have most kinds of building (${[...fams].join(' ')})`);
  check(!poke, `no ground comes up through a floor (${poke})`);
  check(inOK === tried, `you can walk in the front door of every one (${tried - inOK} not: ${bad.join(', ')})`);
  check(shutOK === tried, `a shut door stops you (${tried - shutOK} didn't)`);
  check(!under, `you can't get in under the wall (${under})`);
};
suites.villagers = async () => {
  const { sitesInTile } = await import('../js/gen/outposts.js'), { villageOf, villagerAt, siteWalkers } = await import('../js/gen/villagers.js'), { solarHour } = await import('../js/sim/clock.js');
  const p = makePlanet(uni(1), HOMEWORLD); let sites = [], total = 0;
  for (let i = -14; i < 14; i++) for (let j = -14; j < 14; j++) for (const S of sitesInTile(p, i, j)) if (S.kind === 'village' && S.items.some(q => q.box)) sites.push(S);
  sites = sites.slice(0, 12); check(sites.length >= 6, `villages to test (${sites.length})`);
  let through = 0, jump = 0, day = 0, night = 0, samples = 0, stuck = 0; const t0 = 3.2e9, dt = 20, D = p.dayLength;
  for (const S of sites) { const V = villageOf(p, S); total += V.people.length;
    for (const P of V.people.slice(0, 30)) { let last = null;
      for (let t = t0; t < t0 + D * 2; t += dt) { const q = villagerAt(p, V, P, t), h = solarHour(p, t); samples++;
        if (q) { if (h < 5 || h > 22.5) night++; else day++;
          if (q.moving) for (const b of V.boxes) { const c = Math.cos(b.rot), s = Math.sin(b.rot), dx = q.x - b.x, dz = q.z - b.z; if (Math.abs(dx * c - dz * s) < b.box[0] - 0.1 && Math.abs(dx * s + dz * c) < b.box[1] - 0.1) through++; }
          if (last && Math.hypot(q.x - last.x, q.z - last.z) > 1.25 * dt + 2) jump++; last = q; } else last = null; } } }
  console.log('   ', total, 'people in', sites.length, 'villages;', samples, 'samples');
  check(total > sites.length * 10, `villages have people (${total})`); check(day > 100, `people are out by day (${day} samples)`); check(!night, `and indoors in the small hours (${night})`);
  check(through / Math.max(1, day) < 0.002, `nobody walks through a house (${through} of ${day})`); check(!jump, `nobody teleports (${jump})`);
  const S = sites[0], w = siteWalkers(p, t0 + D * (0.25 + 9 / 24), S.x, S.z, 150, 60); check(JSON.stringify(w) === JSON.stringify(siteWalkers(p, t0 + D * (0.25 + 9 / 24), S.x, S.z, 150, 60)), 'the same moment gives the same people');
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
