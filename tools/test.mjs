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
