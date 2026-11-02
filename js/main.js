// ORBIS — boot and game loop. Wires the modules together; owns no game rules itself.
//   core/  seeds, noise, addresses       gen/   pure world generation
//   world/ persistent changes            sim/   time, scheduler, processes
//   render/ three.js views of gen data   player/ motion, camera, collision
import * as THREE from 'three';
import { seedHex, seedFromHex, makeSeed } from './core/hash.js';
import { HOMEWORLD } from './core/address.js';
import { makePlanet } from './gen/planet.js';
import { getSettlement, address } from './gen/settlement.js';
import { buildingPlan } from './gen/building.js';
import { newCharacter } from './gen/character.js';
import { occupation } from './gen/population.js';
import { livePopulation, refreshLife } from './world/town.js';
import { registerLifeJobs, scheduleLife, LIFE_EVENTS } from './sim/processes/life.js';
import { Residents } from './sim/residents.js';
import { CrowdView } from './render/crowd.js';
import { doorstep, nearestRoadPoint, buildingToWorld } from './gen/place.js';
import { WorldStore, GEN_VERSION } from './world/store.js';
import { IDBBackend } from './world/store-idb.js';
import { MemoryBackend } from './world/store-mem.js';
import { canOpen, doorState } from './world/doors.js';
import { GameClock, EPOCH, solarHour, within, dayNumber, formatHour } from './sim/clock.js';
import { Scheduler, TIER } from './sim/scheduler.js';
import { registerDoorJobs, openDoor, closeDoor, forceDoor } from './sim/processes/doors.js';
import { registerLawJobs, lodgeIncident, arrest, payFines, finesOwed, PAY_DAYS } from './sim/processes/law.js';
import { Pursuit } from './sim/pursuit.js';
import { holdingCell } from './gen/custody.js';
import { doorKey } from './world/doors.js';
import { registerWorkJobs, applyFor, leaveJob, attend, onShiftNow } from './sim/processes/work.js';
import { vacancies, openings, titleOf } from './gen/careers.js';
import { startingSkills } from './gen/character.js';
import { getPolity } from './gen/polity.js';
import { advanceBody, moveSpeedFactor } from './sim/processes/character.js';
import { catchUp } from './sim/offline.js';
import { whereAt } from './gen/schedule.js';
import { TerrainStreamer } from './render/terrain.js';
import { SkySystem } from './render/sky.js';
import { buildSettlementMesh, poolMaterial } from './render/settlement-mesh.js';
import { DoorView } from './render/doors.js';
import { loadPropLibrary, PropView } from './render/props.js';
import { materials, occupancy, WINDOW_TYPES, loadSurfaces } from './render/materials.js';
import { CollisionWorld } from './player/collision.js';
import { Controller } from './player/controller.js';
import { FollowCamera } from './player/camera.js';
import { createPlaceholderAvatar } from './player/avatar.js';
import { laddersIn } from './gen/climb.js';
import { SPEEDER } from './gen/vehicles.js';
import { vehiclesIn, park, buyVehicle, stealVehicle, isYours } from './world/vehicles.js';
import { Ride } from './player/ride.js';
import { VehicleView } from './render/vehicles.js';
import { SHIP_PRICE } from './gen/ships.js';
import { shipsIn, shipIsYours, rampDown, rampLocked, setRamp, structureOf, centreOf, buyShip, stealShip, launch, land, forceRamp, shipKey } from './world/ships.js';
import { Flight } from './player/flight.js';
import { ShipView } from './render/ships.js';
import { UI, describeEvent } from './ui/ui.js';
import './ui/use-ui.js';
import { ITEMS, buyPrice, sellPrice } from './gen/items.js';
import { usablesOf, ownership, contents, take, put, buy, sell, consume, startWork, useState, RECIPES, water, thirst, WATER_DAYS,
  lightOn, toggleLight, reportTheft, registerUseJobs, carryLimit, shopOpen, inventoryOf, giveItem } from './sim/processes/use.js';

const params = new URLSearchParams(location.search);
const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ui = new UI();
const backend = params.get('store') === 'mem' ? new MemoryBackend() : new IDBBackend(params.get('slot') || 'main');
const store = new WorldStore(backend);
window.ORBIS = { store, ready: false };

boot().catch(e => { console.error(e); ui.panel(`<h2>Something broke</h2><pre>${String(e.stack || e)}</pre>`); document.title = 'ERROR ' + e.message; });

async function boot() {
  const has = await store.open();
  let choice = params.get('auto') || null;
  if (!choice) {
    const summary = has && store.player ? `${store.player.name} · ${store.player.birthplaceName}, ${store.player.planetName}` : '';
    choice = await ui.title({ hasSave: has && !!store.player, summary });
  }
  if (choice === 'restore') return restoreFlow();
  if (choice === 'new' || !has || !store.player) return start(newUniverse());
  return start(null);
}

function newUniverse() {
  const fixed = params.get('seed');
  const words = fixed ? null : crypto.getRandomValues(new Uint32Array(2));
  const hex = fixed ? seedHex(seedFromHex(fixed.padStart(16, '0').slice(0, 16))) : seedHex(makeSeed(words[0], words[1]));
  store.create(hex, EPOCH, Date.now());
  store.meta.nextCharacter = 1;
  return { fresh: true };
}

async function start(fresh) {
  ui.loading('Generating the world…', 0);
  const U = seedFromHex(store.meta.universe);
  const planet = makePlanet(U, HOMEWORLD);
  const s = getSettlement(planet, 0, 0);
  const sched = new Scheduler(store); registerDoorJobs(sched); registerLawJobs(sched); registerWorkJobs(sched); registerLifeJobs(sched); registerUseJobs(sched);
  ui.loading('Counting the townsfolk…', 0.01); await tick();
  // the town as it stands now: generated residents with their lives since laid over them
  const pop = livePopulation(planet, s, store, store.meta.gameTime), polity = getPolity(planet, s);
  const ctx = { store, sched, planet, s, pop, polity };
  ctx.doorstepOf = bKey => { const b = pop.buildingByKey.get(bKey); return doorstep(s, b, buildingPlan(planet, s, b)).pos; };
  { const pl = store.player; // saves from before careers / fines existed
    if (pl) { pl.inventory ??= []; pl.hunger ??= 0.25; pl.skills ??= startingSkills(U, pl.serial || 1, pl.age); pl.applications ??= []; pl.career ??= []; pl.job ??= null; pl.fines ??= []; pl.warrant ??= null; pl.custody ??= null; } }

  if (store.player) scheduleLife(store, planet, s, store.meta.gameTime);   // saves from before residents' lives moved on
  let report = null;
  if (fresh) {
    const serial = store.meta.nextCharacter++;
    ui.loading('Finding your family…', 0.02); await tick();
    const p = newCharacter(U, planet, s, pop, serial, EPOCH);
    const home = s.buildings.find(b => b.key === p.home);
    const ds = doorstep(s, home, buildingPlan(planet, s, home));
    p.pos = ds.pos; p.facing = ds.facing;
    p.inventory = []; p.hunger = 0.25; giveItem(p, 'ration', 2); giveItem(p, 'water', 1);
    store.setPlayer(p);
    refreshLife(pop, store, EPOCH); scheduleLife(store, planet, s, EPOCH);
    store.log({ t: EPOCH, type: 'life_began', name: p.name, place: s.name, character: p.id });
    await store.flush();
  } else {
    // offline catch-up: compute everything that happened since the last save
    const tFrom = store.meta.gameTime, tTo = tFrom + Math.max(0, (Date.now() - store.meta.realTime) / 1000);
    const home = s.buildings.find(b => b.key === store.player.home);
    ctx.homeDoorstep = doorstep(s, home, buildingPlan(planet, s, home)).pos;
    ctx.nearestRoadPoint = (x, z) => nearestRoadPoint(s, x, z);
    report = catchUp(ctx, tFrom, tTo, store.player.activity || 'idle');
    store.meta.gameTime = tTo; store.meta.realTime = Date.now();
    await store.flush();
  }
  const clock = new GameClock(store.meta.gameTime, Date.now());
  if (params.has('hour')) { // screenshot/dev hook: jump to a local hour (counted as real elapsed time)
    const want = Number(params.get('hour')), cur = solarHour(planet, clock.now());
    clock.advance(((want - cur + 24) % 24) / 24 * planet.dayLength);
  }

  // ---- renderer & scene
  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 60000);
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
  const root = new THREE.Group(); scene.add(root);   // world content; offset = floating origin
  const origin = [0, 0, 0];
  const toRender = (x, y, z) => [x - origin[0], y, z - origin[2]];
  await loadSurfaces(renderer.capabilities.getMaxAnisotropy());
  materials();
  ui.loading('Weathering the surface…', 0.05);
  await tick();

  const sky = new SkySystem(renderer, scene, planet);
  const terrain = new TerrainStreamer(planet, root);
  // furniture from the built asset library; the box furniture remains the fallback if it can't load
  const propLib = params.has('boxprops') ? null : await loadPropLibrary(undefined, renderer.capabilities.getMaxAnisotropy()).catch(e => { console.warn('prop library', e); return null; });
  const propView = propLib ? new PropView(propLib) : null;
  const vehView = new VehicleView(propLib); scene.add(vehView.group);
  const shipView = new ShipView(propLib); scene.add(shipView.group);
  const town = await buildSettlementMesh(planet, s, f => ui.loading(`Building ${s.name}…`, 0.1 + 0.6 * f), propView);
  root.add(town.group);
  const doorView = new DoorView(s, town.doors);
  town.group.add(doorView.mesh);
  const doorIndex = new Map(town.doors.map((d, i) => [d.b.key + '#' + d.door.id, i]));
  const world = new CollisionWorld(planet, s, (b, id) => doorView.isPassable(doorIndex.get(b.key + '#' + id)));
  const water = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x14303a, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.92 }));
  water.position.y = planet.seaLevel; scene.add(water);

  const player = store.player;
  player.credits ??= 500; player.record ??= [];        // saves from before money existed
  const ctrl = new Controller(world, player.pos);
  ctrl.facing = player.facing || 0;
  const avatar = createPlaceholderAvatar();
  scene.add(avatar.object);
  const cam = new FollowCamera(camera, world, renderer.domElement);
  cam.yaw = ctrl.facing;
  const roomLight = new THREE.PointLight(0xffe2c0, 0, 14, 1.6); scene.add(roomLight);
  // ---- residents
  ui.loading('Waking the town…', 0.68); await tick();
  const residents = new Residents(pop);
  residents.refresh(clock.now(), ctrl.pos, null);
  const crowd = new CrowdView(scene);
  const relation = id => player.family.parents.includes(id) ? 'your parent' : player.family.siblings.includes(id) ? 'your sibling' : null;
  let agents = [];
  // ---- arrest in person: a warrant served while you're here sends an officer for you
  let pursuit = null;
  const isOfficer = p => !!(p?.job && pop.jobById.get(p.job).security);
  const startPursuit = (officer, why) => {
    if (pursuit || player.custody || !officer) return;
    pursuit = new Pursuit(pop, officer, clock.now(), why);
    ui.toast(`<b>${officer.name}</b> of ${polity.securityName} is coming to arrest you — ${why}. <small>Stand still to go quietly, or run.</small>`, 'bad', 10000);
  };
  const nearestOfficerOnDuty = t => {
    let best = null, bd = Infinity;
    for (const p of pop.people) {
      if (!isOfficer(p)) continue;
      const w = whereAt(pop, p, t);
      if (!['on duty', 'on patrol'].includes(w.activity)) continue;
      const d = Math.hypot(w.pos[0] - ctrl.pos[0], w.pos[2] - ctrl.pos[2]);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };
  ctx.onServe = t => startPursuit(nearestOfficerOnDuty(t), player.warrant?.reason || 'a warrant');

  // warm up the terrain around the player before revealing the world
  for (let i = 0; terrain.pending || i === 0; i++) {
    terrain.update(player.pos[0], player.pos[2], 40);
    ui.loading('Streaming terrain…', 0.7 + 0.3 * Math.min(1, i / 40));
    await tick();
    if (i > 400) break;
  }

  // ---- processes
  const near = () => { // NEAR tier, 1 Hz
    const t = clock.now();
    doorView.refresh(store, planet, t);
    const day = sky.state.day ?? 1, h = solarHour(planet, t), dark = 1 - day;
    const occ = { hab: h >= 17 || h < 0.5 ? 0.6 : h < 6 ? 0.08 : 0.25, house: h >= 17 || h < 0.5 ? 0.55 : h < 6 ? 0.06 : 0.2,
      office: within([8, 18], h) ? 0.85 : 0.06, store: within([7, 21], h) ? 0.95 : 0.1, workshop: within([6, 16], h) ? 0.7 : 0.05, hangar: 0.3 };
    WINDOW_TYPES.forEach((k, i) => { occupancy.value[i] = occ[k] * Math.min(1, dark * 1.15); });
    materials().lamp.emissiveIntensity = dark * 6;
    poolMaterial().opacity = Math.min(1, dark * 1.3) * 0.55;
  };
  sched.add(TIER.NEAR, { update: near });
  // tell the player when the world does something to them
  let seenEvents = store.events.length;
  sched.add(TIER.NEAR, { update: () => {
    for (const e of store.events.slice(seenEvents)) {
      if (e.type === 'fined' && e.who === player.id) ui.toast(`${polity.securityName} fined you <b>${e.amount} ${e.currency}</b> — ${e.offence.toLowerCase()}. Pay at their office within ${PAY_DAYS} days.`, 'bad', 9000);
      if (e.type === 'case_opened') ui.toast(`${e.reporter} reported a break-in to ${e.authority}.`, 'warn', 6000);
      if (e.type === 'case_cold') ui.toast(`${e.authority} closed a break-in case unsolved.`, '', 6000);
      if (LIFE_EVENTS.includes(e.type) && e.rel) ui.toast(describeEvent(e, planet).replace(/<span class="when">.*?<\/span>\s*/, ''), e.type === 'died' ? 'bad' : '', 10000);
      if (e.who !== player.id) continue;
      if (e.type === 'hired') ui.toast(`<b>${e.employer}</b> hired you as ${e.title.toLowerCase()}. ${player.shift ? `First shift: day ${dayNumber(planet, player.shift.t0)}, ${formatHour(solarHour(planet, player.shift.t0))}.` : ''} <small>J — details</small>`, '', 10000);
      if (e.type === 'application_rejected') ui.toast(`${e.employer} turned you down — ${e.why}.`, 'warn', 9000);
      if (e.type === 'shift_worked') ui.toast(`Shift over at ${e.employer}: paid <b>${e.pay} cr</b>.`, '', 6000);
      if (e.type === 'shift_missed') ui.toast(`You missed your shift at ${e.employer}${e.missed > 1 ? ` — ${e.missed} in a row` : ''}.${e.pay ? ` Paid ${e.pay} cr for the time you were there.` : ''}`, 'warn', 8000);
      if (e.type === 'promoted') ui.toast(`Promoted: <b>${e.title}</b> — ${e.wage} cr/h.`, '', 9000);
      if (e.type === 'dismissed') ui.toast(`${e.employer} let you go — ${e.why}.`, 'bad', 10000);
      if (e.type === 'warrant' && !pursuit) ui.toast(`${e.authority} has issued a warrant for you — ${e.reason}.`, 'bad', 9000);
      if (e.type === 'released') ui.toast(`You're free to go. The cell door is open.`, '', 8000);
    }
    seenEvents = store.events.length;
  } });
  if (propView) sched.add(TIER.NEAR, { update: () => propView.update(ctrl.pos[0] - s.cx, ctrl.pos[1], ctrl.pos[2] - s.cz) });
  sched.add(TIER.NEAR, { update: () => residents.refresh(clock.now(), ctrl.pos, world.locate(...ctrl.pos)?.b?.key) });
  sched.add(TIER.NEAR, { update: () => { // a patrolling or on-duty officer who sees a wanted person acts on it
    if (!player.warrant || pursuit || player.custody) return;
    const here = world.locate(...ctrl.pos), space = here?.b ? here.b.key + ':' + here.k : 'out';
    for (const a of agents) {
      if (!isOfficer(a.person) || !['on duty', 'on patrol'].includes(a.activity)) continue;
      const d = Math.hypot(a.pos[0] - ctrl.pos[0], a.pos[2] - ctrl.pos[2]);
      if (d < 20 && (a.bKey ? a.bKey + ':' + a.k : 'out') === space) { startPursuit(a.person, 'you are wanted'); break; }
    }
  } });
  let atWork = false, shiftNoticed = null;
  sched.add(TIER.NEAR, { update: dt => { // shift attendance: being inside the workplace while the shift runs
    const t = clock.now();
    atWork = attend(ctx, t, dt, world.locate(...ctrl.pos)?.b?.key || null);
    if (onShiftNow(player, t) && !atWork && shiftNoticed !== player.shift.t0) { shiftNoticed = player.shift.t0; ui.toast(`Your shift at <b>${player.job.employer}</b> has started (${address(s, pop.buildingByKey.get(player.job.b))}).`, 'warn', 8000); }
    if (atWork) shiftNoticed = player.shift.t0;
  } });
  sched.add(TIER.NEAR, { update: dt => { advanceBody(player, ctrl.mode === 'seat' ? (ctrl.seat.pose === 'lie' ? 'rest' : 'sit') : 'idle', dt, planet); store.touchPlayer(); } });
  sched.add(TIER.ACTIVE, { update: dt => doorView.update(dt) });

  // ---- input
  const keys = new Set();
  let paused = false, forceHold = 0, jumpQueued = false, lastSave = performance.now();
  addEventListener('keydown', e => {
    if (paused) return;
    keys.add(e.code);
    if (e.code === 'Space' && !flight) jumpQueued = true;
    if (e.code === 'KeyE') interact();
    if (e.code === 'KeyI') showInventory();
    if (e.code === 'KeyL') switchLight();
    if (e.code === 'Escape') openMenu();
    if (e.code === 'F3') { ui.toggleDebug(); e.preventDefault(); }
    if (e.code === 'KeyC') showCharacter();
    if (e.code === 'KeyJ') showWork();
    if (e.code === 'KeyT' && e.shiftKey) { clock.advance(planet.dayLength / 24); ui.toast('Skipped one hour <small>(developer time-skip — scheduled events still run in order)</small>'); }
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  renderer.domElement.addEventListener('click', () => { if (!paused) renderer.domElement.requestPointerLock?.(); });
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && !paused && window.ORBIS.ready && !params.has('cam')) openMenu(); });

  const save = async () => {
    if (ride) { park(store, ride.v, ride.pos, ride.facing); player.pos = ride.dismountSpot(); }
    else if (flight) { store.patchDelta(shipKey(flight.ship.id), { flying: true, at: { c: flight.pos.slice(), facing: flight.facing } }); player.piloting = flight.ship.id; player.pos = flight.pos.slice(); }
    else player.pos = ctrl.pos.slice();
    if (!flight) player.piloting = null;
    player.facing = ctrl.facing;
    store.meta.gameTime = clock.now(); store.meta.realTime = Date.now();
    store.touchPlayer(); store.dirty.meta = true;
    await store.flush();
  };
  addEventListener('pagehide', () => { save(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

  // nearest door in reach on the player's level
  let doorDist = Infinity;
  const nearestDoor = () => {
    let best = -1, bd = 2.2; doorDist = Infinity;
    const [px, py, pz] = ctrl.pos;
    for (let i = 0; i < town.doors.length; i++) {
      const c = doorView.centre(i), wx = c[0] + s.cx, wz = c[2] + s.cz;
      if (Math.abs(wx - px) > 4 || Math.abs(wz - pz) > 4) continue;
      if (Math.abs(c[1] - town.doors[i].door.height / 2 - py) > 1.2) continue;
      const d = Math.hypot(wx - px, wz - pz) - town.doors[i].door.width / 2 + 0.5;
      if (d < bd) { bd = d; best = i; }
    }
    doorDist = bd;
    return best;
  };
  const insideBuilding = b => { const loc = world.locate(...ctrl.pos); return loc?.b === b; };
  // ladders: at the foot, or on the roof by the top
  const ladders = laddersIn(planet, s);
  const nearLadder = () => {
    if (ctrl.mode !== 'walk') return null;
    const [x, y, z] = ctrl.pos;
    return ladders.find(l => (Math.hypot(l.foot[0] - x, l.foot[2] - z) < 1.1 && Math.abs(y - l.foot[1]) < 1.2)
      || (Math.hypot(l.roof[0] - x, l.roof[2] - z) < 1.3 && Math.abs(y - l.roof[1]) < 0.6)) || null;
  };
  function interact() {
    const lad = nearLadder();
    if (lad) { ctrl.grabLadder(lad); return; }
    if (ride) { getOff(); return; }
    if (flight) { setDown(); return; }
    const rp = nearRamp();
    if (rp) { rampFlow(rp); return; }
    if (ctrl.mode === 'seat') { if (ctrl.seat.pose === 'lie') sleepFlow(); else ctrl.standUp(); return; }
    const bike = nearVehicle();
    if (bike) { bikeFlow(bike); return; }
    const i = nearestDoor(), u = usableAhead();
    if (u && (i < 0 || u.d < doorDist)) { useThing(u); return; }
    if (i < 0) return;
    const { b, door } = town.doors[i], t = clock.now();
    const st = doorState(store, planet, b, door, t);
    if (st.open) { closeDoor(store, b.key, door); doorView.refresh(store, planet, t); return; }
    const res = canOpen(store, planet, player, b, door, t);
    const egress = door.kind !== 'interior' && insideBuilding(b);
    if (res.ok || egress) {
      openDoor(store, sched, b.key, door, t);
      if (res.key) ui.toast('Unlocked with your key.');
      doorView.refresh(store, planet, t);
    } else ui.toast(`${res.why}. <small>Hold F to force it.</small>`, 'warn');
  }

  // ---- using things (sim/processes/use.js): furniture in reach, ahead of you on your floor
  const KIND_LABEL = { bed: 'Bed', sofa: 'Sofa', chair: 'Chair', table: 'Table', desk: 'Desk', planter: 'Planter', fridge: 'Fridge', console: 'Flight console' };
  const VERB = { sleep: 'Lie down', sit: 'Sit down', open: 'Look inside', cook: 'Cook', buy: 'Browse the shelves', sell: 'Sell things at the till', terminal: 'Use the terminal',
    fabricate: 'Run the fabricator', assemble: 'Build something', wash: 'Run a wash', water: 'Water the plant', fly: 'Take the helm' };
  const labelOf = u => u.box && !['bench', 'counter', 'machine'].includes(u.pr.kind) ? u.box.label : KIND_LABEL[u.pr.kind]
    || (u.pr.kind === 'machine' ? (u.verbs.includes('wash') ? 'Washing machine' : 'Fabricator') : u.pr.kind === 'bench' ? (u.verbs.includes('assemble') ? 'Workbench' : 'Bench')
      : u.verbs.includes('cook') ? 'Kitchen counter' : u.verbs.includes('sell') ? 'Shop counter' : 'Counter');
  const usableAhead = () => {
    if (ctrl.mode !== 'walk') return null;
    const loc = world.locate(...ctrl.pos); if (!loc?.plan) return null;
    const [ax, az] = world.toB(loc.b, ctrl.pos[0] + Math.sin(ctrl.facing), ctrl.pos[2] + Math.cos(ctrl.facing));
    const fx = ax - loc.lx, fz = az - loc.lz;           // your facing, in the building's frame
    let best = null, bs = Infinity;
    for (const u of usablesOf(planet, s, loc.b)) {
      const pr = u.pr; if (pr.k !== loc.k) continue;
      const nx = Math.max(pr.x0, Math.min(loc.lx, pr.x1)), nz = Math.max(pr.z0, Math.min(loc.lz, pr.z1));
      const d = Math.hypot(nx - loc.lx, nz - loc.lz); if (d > 1.0) continue;
      const cx = (pr.x0 + pr.x1) / 2 - loc.lx, cz = (pr.z0 + pr.z1) / 2 - loc.lz, dot = (cx * fx + cz * fz) / (Math.hypot(cx, cz) || 1);
      if (dot < -0.1 && d > 0.3) continue;
      const score = d - 0.5 * dot;
      if (score < bs) { bs = score; best = { b: loc.b, u, d, loc }; }
    }
    return best;
  };
  const toWorldDir = (b, a) => { const p0 = buildingToWorld(s, b, 0, 0, 0), p1 = buildingToWorld(s, b, Math.sin(a), 0, Math.cos(a)); return Math.atan2(p1[0] - p0[0], p1[2] - p0[2]); };
  const witnessesHere = () => { const here = world.locate(...ctrl.pos); return residents.witnesses(clock.now(), ctrl.pos, here?.b?.key || null, here?.k ?? null); };
  async function modal(fn) {
    if (paused) return; paused = true; keys.clear(); document.exitPointerLock?.();
    try { await fn(); } finally { ui.closePanel(); paused = false; }
  }
  const mins = sec => sec < 90 ? `${Math.max(1, Math.round(sec))} s` : `${Math.round(sec / 60)} min`;
  function statusOf(b, u, t) {
    const run = useState(store, b, u, t);
    if (run) return run.verb === 'wash' ? `washing — ${mins(run.until - t)} left` : `${ITEMS[run.out].name.toLowerCase()} ready in ${mins(run.until - t)}`;
    if (u.verbs.includes('water')) { const d = thirst(store, planet, b, u, t); return d > WATER_DAYS ? 'wilting — it needs water' : ''; }
    if (u.verbs.includes('buy') || u.verbs.includes('sell')) return shopOpen(planet, b, t) ? '' : 'closed';
    return '';
  }
  async function useThing({ b, u }) {
    let verb = u.verbs[0];
    if (u.verbs.length > 1) {
      let pick = null;
      await modal(async () => { pick = await ui.choose({ title: labelOf(u), sub: statusOf(b, u, clock.now()), options: u.verbs.map(v => ({ a: v, label: VERB[v] })) }); });
      if (!pick || pick.a === 'close') return;
      verb = pick.a;
    }
    const t = clock.now();
    if (verb === 'sit' || verb === 'sleep') {
      const away = q => { const w = buildingToWorld(s, b, q.x, q.y, q.z); return Math.hypot(w[0] - ctrl.pos[0], w[2] - ctrl.pos[2]); };
      const a = u.seats.slice().sort((p, q) => away(p) - away(q))[0]; if (!a) return;
      ctrl.seatAt(buildingToWorld(s, b, a.x, a.y, a.z), toWorldDir(b, a.facing), a.pose, ctrl.pos);
      if (verb === 'sleep') sleepFlow();
      return;
    }
    if (verb === 'water') { water(store, b, u, t); ui.toast('You water the plant.'); return; }
    if (verb === 'wash') { const r = startWork(ctx, b, u, 'wash', null, t); ui.toast(r.ok ? `The wash will take ${mins(r.until - t)}.` : r.why, r.ok ? '' : 'warn'); return; }
    if (verb === 'cook' || verb === 'fabricate' || verb === 'assemble') return workFlow(b, u, verb);
    if (verb === 'terminal') return terminalFlow(b);
    if (verb === 'fly') return flyFlow(b);
    if (verb === 'open') return stashFlow(b, u, 'take');
    if (verb === 'buy') return stashFlow(b, u, shopOpen(planet, b, t) ? 'buy' : 'take');
    if (verb === 'sell') return sellFlow(b);
  }
  async function workFlow(b, u, verb) {
    const t = clock.now(), run = useState(store, b, u, t);
    if (run) { ui.toast(`It's busy: ${statusOf(b, u, t)}.`, 'warn'); return; }
    const has = (need) => Object.entries(need).every(([id, n]) => inventoryOf(player).filter(x => x.id === id).reduce((a, x) => a + x.n, 0) >= n);
    let pick = null;
    await modal(async () => {
      pick = await ui.choose({ title: { cook: 'Cook', fabricate: 'Fabricator', assemble: 'Workbench' }[verb], sub: 'Uses what you carry. What you make is left here for you to collect, even if you walk away.',
        options: RECIPES[verb].map((r, i) => ({ a: 'make', v: String(i), label: `${ITEMS[r.out].name} — ${r.min} min`, disabled: !has(r.in) || (r.tool && !has({ [r.tool]: 1 })),
          note: Object.entries(r.in).map(([id, n]) => `${n} × ${ITEMS[id].name.toLowerCase()}`).join(', ') + (r.tool ? ` · needs a ${ITEMS[r.tool].name.toLowerCase()}` : '') })) });
    });
    if (!pick || pick.a !== 'make') return;
    const r = startWork(ctx, b, u, verb, RECIPES[verb][+pick.v], clock.now());
    ui.toast(r.ok ? `${ITEMS[RECIPES[verb][+pick.v].out].name} will be ready in ${mins(r.until - clock.now())}.` : r.why, r.ok ? '' : 'warn', 6000);
  }
  async function stashFlow(b, u, mode) {
    const own = ownership(b, u.room, player), stolen = [];
    let value = 0, warn = '';
    await modal(async () => {
      for (;;) {
        const t = clock.now(), items = contents(store, planet, b, u, t);
        const whose = own.yours ? 'Yours.' : own.communal ? 'Shared by the residents — help yourself.' : mode === 'buy' ? `${b.owner} · open until ${formatHour(b.hours[1])}` : `This belongs to ${own.owner}. <b>Taking anything is theft.</b>`;
        const r = await ui.stash({ title: u.box.label, note: whose, warn,
          box: { title: u.box.label, items, act: mode, label: mode === 'buy' ? 'Buy' : 'Take', price: mode === 'buy' ? id => buyPrice(id) : null },
          you: { items: inventoryOf(player), act: mode === 'buy' ? null : 'put', label: 'Put', limit: carryLimit(player) } });
        warn = '';
        if (r.a === 'close') break;
        const all = r.a === 'takeall' ? items.map((it, i) => [items.length - 1 - i, items[items.length - 1 - i].n]) : [[r.idx, r.n]];
        for (const [idx, n] of all) {
          const res = r.a === 'put' ? put(ctx, b, u, idx, n, t) : r.a === 'buy' ? buy(ctx, b, u, idx, n, t) : take(ctx, b, u, idx, n, t);
          if (!res.ok) { warn = res.why || ''; break; }
          if (res.stolen) { value += res.stolen; stolen.push({ id: res.id, n: res.n }); }
        }
      }
    });
    if (value) {
      const t = clock.now(), seen = witnessesHere();
      const inc = reportTheft(ctx, b, u.room, value, stolen, t, seen);
      lodgeIncident(ctx, inc);
      const cop = seen.find(w => isOfficer(pop.byId.get(w.id)));
      if (cop) startPursuit(pop.byId.get(cop.id), 'you were seen stealing');
      ui.toast(`You took ${value} cr worth of ${own.owner}'s things. ${seen.length ? `<b>${seen.length} ${seen.length === 1 ? 'person' : 'people'} saw you</b> (${seen.slice(0, 3).map(w => w.name).join(', ')}).` : 'Nobody saw you.'}`, 'bad', 8000);
    }
  }
  async function sellFlow(b) {
    let warn = '';
    await modal(async () => {
      for (;;) {
        const r = await ui.stash({ title: `Sell to ${b.owner}`, note: shopOpen(planet, b, clock.now()) ? 'The till pays half what things are worth.' : 'The shop is closed.', warn,
          box: null, you: { items: inventoryOf(player), act: 'sell', label: 'Sell', price: id => sellPrice(id), limit: carryLimit(player) } });
        if (r.a === 'close') break;
        const res = sell(ctx, b, r.idx, r.n, clock.now());
        warn = res.ok ? `Sold ${res.n} × ${ITEMS[res.id].name.toLowerCase()} for ${res.pay} cr.` : res.why || '';
      }
    });
  }
  async function terminalFlow(b) {
    const t = clock.now(), mine = store.events.filter(e => e.who === player.id).slice(-8).reverse();
    const NEWS = ['died', 'born', 'household_arrived', 'household_left', 'case_opened', 'case_cold', 'fined', 'theft_discovered', 'break_in_discovered', 'resident_hired', 'door_repaired'];
    const news = store.events.filter(e => NEWS.includes(e.type)).slice(-10).reverse();
    const owed = (player.fines || []).reduce((n, f) => n + f.amount, 0);
    const list = es => `<ul class="events">${es.map(e => `<li>${describeEvent(e, planet)}</li>`).join('') || '<li class="none">Nothing yet.</li>'}</ul>`;
    await modal(() => ui.terminal({ title: `${b.owner} — terminal`, sections: [
      { h: 'Your account', html: `<p>${player.credits ?? 0} cr${owed ? ` · <b class="late">${owed} cr in fines</b>` : ''}${player.job ? ` · ${esc(player.job.employer)}, ${player.job.wage} cr/h` : ''}</p>` },
      { h: 'Messages', html: list(mine) }, { h: `${s.name} news`, html: list(news) },
      { h: 'Time', html: `<p>Day ${dayNumber(planet, t)}, ${formatHour(solarHour(planet, t))} · ${planet.name}, a ${(planet.dayLength / 3600).toFixed(1)}-hour day</p>` }] }));
  }
  async function sleepFlow() {
    const t = clock.now(), h = solarHour(planet, t), toMorning = ((7 - h + 24) % 24 || 24) / 24 * planet.dayLength;
    let pick = null;
    await modal(async () => { pick = await ui.choose({ title: 'Sleep', sub: `Fatigue ${Math.round(player.fatigue * 100)}%. Time passes; everything else carries on.`,
      options: [{ a: 'z', v: String(planet.dayLength / 24), label: 'One hour' }, { a: 'z', v: String(planet.dayLength / 6), label: 'Four hours' }, { a: 'z', v: String(toMorning), label: `Until morning (07:00) — ${(toMorning / planet.dayLength * 24).toFixed(1)} h` }, { a: 'stay', label: 'Just lie here' }] }); });
    if (pick?.a !== 'z') return;
    const sec = +pick.v;
    clock.advance(sec); advanceBody(player, 'rest', sec, planet); store.touchPlayer();
    ui.toast(`You slept ${(sec / planet.dayLength * 24).toFixed(1)} hours. Fatigue ${Math.round(player.fatigue * 100)}%, hunger ${Math.round(player.hunger * 100)}%.`, '', 7000);
  }
  async function showInventory() {
    await modal(async () => {
      for (;;) {
        const r = await ui.inventory({ player, limit: carryLimit(player) });
        if (r.a !== 'eat') break;
        const it = inventoryOf(player)[r.idx], res = consume(player, r.idx); store.touchPlayer();
        if (res.ok) ui.toast(`${ITEMS[it.id].cat === 'drink' ? 'Drank' : ITEMS[it.id].cat === 'medicine' ? 'Took' : 'Ate'} the ${ITEMS[it.id].name.toLowerCase()}. Hunger ${Math.round(player.hunger * 100)}%.`);
      }
    });
  }
  function switchLight() {
    const loc = world.locate(...ctrl.pos); if (!loc?.room) return;
    ui.toast(toggleLight(store, loc.b.key, loc.k, loc.room.i) ? 'Light on.' : 'Light off.');
  }

  // ---- speeder bikes (gen/vehicles.js, world/vehicles.js, player/ride.js)
  let vehicles = vehiclesIn(store, planet, s), ride = null, camDist = cam.dist, hotwire = 0;
  sched.add(TIER.NEAR, { update: () => { vehicles = vehiclesIn(store, planet, s); } });
  const nearVehicle = () => {
    if (ride || ctrl.mode !== 'walk') return null;
    let best = null, bd = 2.2;
    for (const v of vehicles) { const d = Math.hypot(v.pos[0] - ctrl.pos[0], v.pos[2] - ctrl.pos[2]); if (d < bd && Math.abs(v.pos[1] - ctrl.pos[1]) < 1.6) { bd = d; best = v; } }
    return best;
  };
  function mount(v) {
    ride = new Ride(world, planet, v); ctrl.mode = 'ride'; camDist = cam.dist; cam.dist = Math.max(cam.dist, 6.5);
    ui.toast(`<kbd>W</kbd>/<kbd>S</kbd> throttle and brake · <kbd>A</kbd>/<kbd>D</kbd> steer · <kbd>Shift</kbd> boost · <kbd>E</kbd> get off when slow`, '', 6000);
  }
  function getOff() {
    if (Math.abs(ride.speed) > 4) { ui.toast('Slow down first.', 'warn', 2000); return; }
    park(store, ride.v, ride.pos, ride.facing);
    ctrl.pos = ride.dismountSpot(); ctrl.vel = [0, 0, 0]; ctrl.mode = 'walk'; ctrl.facing = ride.facing;
    ride = null; cam.dist = camDist; vehicles = vehiclesIn(store, planet, s);
  }
  async function bikeFlow(v) {
    if (isYours(v, player)) return mount(v);
    if (v.forSale) {
      let pick = null;
      await modal(async () => { pick = await ui.choose({ title: 'Speeder bike', sub: `For sale at ${esc(v.ownerName)}. Single seat, about 110 km/h, boost to 150. Hovers over ground and water.`,
        options: [{ a: 'buy', label: `Buy it — ${SPEEDER.price} cr`, note: `You have ${player.credits ?? 0} cr`, disabled: (player.credits ?? 0) < SPEEDER.price }] }); });
      if (pick?.a !== 'buy') return;
      const r = buyVehicle(store, v, clock.now());
      ui.toast(r.ok ? 'It\'s yours. <kbd>E</kbd> to ride.' : r.why, r.ok ? '' : 'warn'); vehicles = vehiclesIn(store, planet, s);
      return;
    }
    ui.toast(`This belongs to ${esc(v.ownerName)}. Hold <kbd>F</kbd> to hotwire it.`, 'warn');
  }
  function hotwired(v) {
    const t = clock.now(), seen = witnessesHere();
    const inc = stealVehicle(store, s, v, t, seen); lodgeIncident(ctx, inc);
    const cop = seen.find(w => isOfficer(pop.byId.get(w.id)));
    if (cop) startPursuit(pop.byId.get(cop.id), 'you were seen stealing a bike');
    ui.toast(`You hotwired ${esc(v.ownerName)}'s bike. ${seen.length ? `<b>${seen.length} ${seen.length === 1 ? 'person' : 'people'} saw you.</b>` : 'Nobody saw you.'}`, 'bad', 8000);
    vehicles = vehiclesIn(store, planet, s); mount(vehicles.find(x => x.id === v.id));
  }
  // ---- ships (gen/ships.js, world/ships.js, player/flight.js). A landed ship is a
  // structure in the collision world, like a building; a flying one is a Flight.
  let ships = shipsIn(store, planet, s), flight = null, rampHold = 0;
  const placed = new Map();          // ship id → structure in the collision world
  const shipById = id => ships.find(x => x.id === id);
  function syncShips() {
    ships = shipsIn(store, planet, s);
    for (const sh of ships) {
      const want = !sh.flying && !(flight && flight.ship.id === sh.id), have = placed.get(sh.id);
      const sig = JSON.stringify([sh.at, sh.O]);
      if (have && (!want || have.sig !== sig)) { world.removeStructure(have); placed.delete(sh.id); }
      if (want && !placed.has(sh.id)) {
        const b = structureOf(s, sh, id => id !== 0 || (rampDown(shipById(sh.id) || sh, planet, clock.now(), player) && shipView.rampOpen(sh.id)));
        b.sig = sig; world.addStructure(b); placed.set(sh.id, b);
      }
    }
  }
  syncShips();
  sched.add(TIER.NEAR, { update: syncShips });
  const nearRamp = () => {
    if (ctrl.mode !== 'walk') return null;
    for (const [id, b] of placed) {
      const L = b.plan.layout, mx = (L.ramp.x0 + L.ramp.x1) / 2;
      const foot = buildingToWorld(s, b, mx, 0, L.ramp.z0 - 0.4), top = buildingToWorld(s, b, mx, L.deck, L.ramp.z1 + 0.6);
      for (const q of [foot, top]) if (Math.hypot(q[0] - ctrl.pos[0], q[2] - ctrl.pos[2]) < 1.6 && Math.abs(q[1] - ctrl.pos[1]) < 1.2) {
        const sh = shipById(id); return { sh, b, down: rampDown(sh, planet, clock.now(), player), locked: rampLocked(sh, player), inside: q === top };
      }
    }
    return null;
  };
  function rampFlow(rp) {
    if (shipIsYours(rp.sh, player)) { setRamp(store, rp.sh, !rp.down); syncShips(); ui.toast(rp.down ? 'Ramp up.' : 'Ramp down.'); return; }
    ui.toast(rp.down ? `The ${esc(rp.sh.name)} — ${esc(rp.sh.ownerName)}${rp.sh.forSale ? `, for sale: ${SHIP_PRICE} cr. Have a look inside.` : '.'}` : 'The ramp is up and locked.', rp.down ? '' : 'warn');
  }
  async function flyFlow(b) {
    const sh = shipById(b.ship.id), t = clock.now(), opts = [];
    if (shipIsYours(sh, player)) opts.push({ a: 'launch', label: 'Take off', note: 'Space climb · Q descend · W/S thrust · A/D turn · Shift boost · E lands when you\'re down and slow' });
    else {
      if (sh.forSale) opts.push({ a: 'buy', label: `Buy the ${sh.name} — ${SHIP_PRICE} cr`, note: `You have ${player.credits ?? 0} cr`, disabled: (player.credits ?? 0) < SHIP_PRICE });
      opts.push({ a: 'steal', label: 'Override the lockout and take off', note: `It belongs to ${esc(sh.ownerName)}. <b>That's stealing a ship.</b>` });
    }
    let pick = null;
    await modal(async () => { pick = await ui.choose({ title: `${sh.name} — helm`, sub: `${shipIsYours(sh, player) ? 'Your ship.' : esc(sh.ownerName) + '\'s ship.'} A short-range shuttle: a cargo hold, a bunk and a galley.`, options: opts }); });
    if (!pick || pick.a === 'close') return;
    if (pick.a === 'buy') { const r = buyShip(store, sh, t); ui.toast(r.ok ? `The ${esc(sh.name)} is yours. Sit at the helm again to take off.` : r.why, r.ok ? '' : 'warn'); syncShips(); return; }
    if (pick.a === 'steal') {
      const seen = witnessesHere(), inc = stealShip(store, s, sh, t, seen); lodgeIncident(ctx, inc);
      ui.toast(`You overrode the ${esc(sh.name)}'s lockout. ${seen.length ? `<b>${seen.length} ${seen.length === 1 ? 'person' : 'people'} saw you.</b>` : 'Nobody saw you.'}`, 'bad', 8000);
    }
    takeOff(shipsIn(store, planet, s).find(x => x.id === sh.id));
  }
  function takeOff(sh) {
    const b = placed.get(sh.id); if (b) { world.removeStructure(b); placed.delete(sh.id); }
    const { c, facing } = centreOf(s, sh);
    launch(store, sh); setRamp(store, sh, false);
    ships = shipsIn(store, planet, s);
    flight = new Flight(world, planet, shipById(sh.id), c, facing);
    ctrl.mode = 'pilot'; camDist = cam.dist; cam.dist = 30; cam.pitch = 0.25;
    ui.toast(`<kbd>Space</kbd> climb · <kbd>Q</kbd> descend · <kbd>W</kbd>/<kbd>S</kbd> thrust · <kbd>A</kbd>/<kbd>D</kbd> turn · <kbd>Shift</kbd> boost`, '', 8000);
  }
  function setDown() {
    const why = flight.landingProblem();
    if (why) { ui.toast(`Can't land: ${why}.`, 'warn', 2500); return; }
    const sh = flight.ship;
    land(store, sh, flight.pos, flight.facing); setRamp(store, sh, false);
    flight = null; cam.dist = camDist; syncShips();
    const b = placed.get(sh.id), a = b.plan.anchors.find(x => x.kind === 'pilot');
    ctrl.mode = 'walk'; ctrl.seatAt(buildingToWorld(s, b, a.x, a.y, a.z), toWorldDir(b, a.facing), 'sit', buildingToWorld(s, b, a.x, b.plan.layout.deck, a.z - 0.8));
    ui.toast('Landed. Get up, and <kbd>E</kbd> at the top of the ramp to lower it.', '', 6000);
  }
  if (player.piloting) { // you were flying when you left: you're still at the helm
    const sh = shipById(player.piloting);
    if (sh?.flying && sh.at) { const b = placed.get(sh.id); if (b) { world.removeStructure(b); placed.delete(sh.id); } flight = new Flight(world, planet, sh, sh.at.c, sh.at.facing); flight.onGround = false; ctrl.mode = 'pilot'; cam.dist = 30; }
  }
  async function showCharacter() {
    if (paused) return;
    paused = true; keys.clear(); document.exitPointerLock?.();
    await ui.character(player, pop, planet, s, polity);
    ui.closePanel(); paused = false;
  }
  async function showWork() {
    if (paused) return;
    paused = true; keys.clear(); document.exitPointerLock?.();
    for (;;) {
      const t = clock.now(), here = world.locate(...ctrl.pos)?.b || null;
      let listing = null;
      if (here?.key === polity.security) listing = { title: `Job board — ${polity.name}`, note: 'Every opening posted in town this week. Postings change weekly.', jobs: vacancies(pop, store, t) };
      else if (here && pop.jobs.some(j => j.b === here.key)) listing = { title: `Openings at ${here.owner}`, note: 'What this workplace is hiring for this week.', jobs: openings(pop, store, here.key, t) };
      const sec = pop.buildingByKey.get(polity.security);
      const r = await ui.work({ player, pop, planet, s, polity, t, listing, civic: here?.key === polity.security, register: store.events.filter(e => LIFE_EVENTS.includes(e.type)), boardAt: sec ? `the ${polity.securityName} office, ${address(s, sec)}` : 'the civic office' });
      if (r.a === 'ok') break;
      if (r.a === 'resign') leaveJob(ctx, t, 'resigned', 'resigned');
      if (r.a === 'pay') { const res = payFines(ctx, t); ui.toast(res.ok ? `Paid ${res.total} cr.${res.cleared ? ' The warrant is withdrawn.' : ''}` : res.why, res.ok ? '' : 'warn', 7000); }
      if (r.a === 'apply') {
        const res = applyFor(ctx, pop.jobById.get(r.job), t);
        ui.toast(res.ok ? `Application in. ${res.reviewer} will look at it — you'll hear by ${formatHour(solarHour(planet, res.at))}${res.at - t > planet.dayLength / 2 ? ' tomorrow' : ''}.` : res.why, res.ok ? '' : 'warn', 7000);
      }
    }
    ui.closePanel(); paused = false;
  }
  async function openMenu() {
    if (paused) return;
    paused = true; keys.clear(); document.exitPointerLock?.();
    ui.showHud(false);
    for (;;) {
      const a = await ui.menu();
      if (a === 'resume') break;
      if (a === 'backup') { await save(); download(`orbis-${store.meta.universe}-${new Date().toISOString().slice(0, 10)}.json`, store.exportJSON()); continue; }
      if (a === 'restore') { const ok = await restoreFlow(true); if (ok) return; continue; }
      if (a === 'log') { await ui.log(store.events, planet); continue; }
      if (a === 'leave') {
        const act = await ui.leave(player);
        if (act === 'cancel') continue;
        player.activity = act; await save();
        running = false; ui.left(player, act); return;
      }
    }
    ui.closePanel(); ui.showHud(true); paused = false;
  }

  // ---- screenshot / test hooks (?cam=...)
  const shot = params.get('cam');
  if (shot) applyShot(shot, { s, planet, ctrl, cam, town, doorView, store, sched, clock, world, pop });

  // ---- loop
  ui.closePanel(); ui.showHud(true);
  if (report && (report.elapsed > 60 || report.events.length)) { paused = true; await ui.away(report, planet); paused = false; }
  if (!fresh && store.meta.gen !== GEN_VERSION) ui.toast(`This save was made with world generator v${store.meta.gen}; this build is v${GEN_VERSION}. Changes you made may not line up with the regenerated world.`, 'warn', 12000);
  if (fresh) {
    const par = player.family.parents.map(id => pop.byId.get(id));
    ui.toast(`You are <b>${player.name}</b>, ${player.age}, born in ${s.name} on ${planet.name}. ${player.withParents ? 'You still live with' : 'You live alone; your'} ${par.length ? (player.withParents ? '' : 'parent' + (par.length > 1 ? 's' : '') + ' ') + par.map(x => x.given).join(' and ') : 'family'}${player.withParents ? '' : ' live across town'}. Your home is behind you. <small>C — your background.</small>`, '', 11000);
  }
  let running = true, last = performance.now(), frames = 0, fpsT = last, fps = 0;
  near();
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = clock.now();
    if (!paused && !shot) {
      const input = {
        fwd: (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0),
        right: (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
        run: keys.has('ShiftLeft') || keys.has('ShiftRight'), jump: jumpQueued, yaw: cam.yaw, tired: player.fatigue > 0.92,
      };
      jumpQueued = false;
      if (flight) {
        flight.step(dt, { fwd: input.fwd, right: input.right, up: keys.has('Space'), down: keys.has('KeyQ'), boost: input.run });
        ctrl.pos = [flight.pos[0], flight.pos[1] + 2.4, flight.pos[2]]; ctrl.facing = flight.facing; ctrl.speed = 0;
        if (flight.impact > 15) { player.fatigue = Math.min(1, player.fatigue + 0.1); ui.toast(`Impact at ${Math.round(flight.impact * 3.6)} km/h.`, 'bad', 3000); }
        cam.yaw += Math.atan2(Math.sin(flight.facing - cam.yaw), Math.cos(flight.facing - cam.yaw)) * Math.min(1, dt * (flight.speed > 5 ? 1.5 : 0));
      } else if (ride) {
        for (let sub = 0, n = Math.ceil(dt / (1 / 120)); sub < n; sub++) ride.step(dt / n, { fwd: input.fwd, right: input.right, boost: input.run });
        ctrl.pos = ride.pos.slice(); ctrl.facing = ride.facing; ctrl.speed = Math.abs(ride.speed);
        if (ride.impact > 12) { player.fatigue = Math.min(1, player.fatigue + 0.08); ui.toast(`You hit something at ${Math.round(ride.impact * 3.6)} km/h.`, 'bad', 3000); }
        cam.yaw += Math.atan2(Math.sin(ride.facing - cam.yaw), Math.cos(ride.facing - cam.yaw)) * Math.min(1, dt * (ride.speed > 2 ? 2.5 : 0));   // the camera swings in behind
      } else for (let sub = 0, n = Math.ceil(dt / (1 / 120)); sub < n; sub++) ctrl.step(dt / n, input, moveSpeedFactor(player));
      // force a locked ramp by holding F at it
      const rq = keys.has('KeyF') && !flight && !ride ? nearRamp() : null;
      if (rq && rq.locked && !rq.down) {
        rampHold += dt; ui.showPrompt(`Forcing the ramp lock… <i class="meter"><b style="width:${Math.min(100, rampHold / 4 * 100)}%"></b></i>`);
        if (rampHold > 4) {
          rampHold = 0; forceRamp(store, rq.sh); syncShips();
          const seen = witnessesHere(), t2 = clock.now();
          const inc = store.log({ t: t2, type: 'forced_entry', where: shipKey(rq.sh.id), building: rq.sh.firmB || rq.sh.id, buildingType: 'hangar', owner: rq.sh.ownerName, settlement: s.key, settlementName: s.name,
            by: player.id, byName: player.name, access: 'staff', doorKind: 'exterior', witnesses: seen, status: 'unresolved' });
          lodgeIncident(ctx, inc);
          const cop = seen.find(w => isOfficer(pop.byId.get(w.id))); if (cop) startPursuit(pop.byId.get(cop.id), 'you were seen breaking into a ship');
          ui.toast(`You forced the ${esc(rq.sh.name)}'s ramp. ${seen.length ? `<b>${seen.length} saw you.</b>` : 'Nobody saw you.'}`, 'bad', 8000);
        }
      } else rampHold = 0;
      // hotwire someone's bike by holding F next to it
      const nv = keys.has('KeyF') && !ride && !flight ? nearVehicle() : null;
      if (nv && !isYours(nv, player) && !nv.forSale) {
        hotwire += dt; ui.showPrompt(`Hotwiring… <i class="meter"><b style="width:${Math.min(100, hotwire / 3 * 100)}%"></b></i>`);
        if (hotwire > 3) { hotwire = 0; hotwired(nv); }
      } else hotwire = 0;
      if (ctrl.climbing) advanceBody(player, 'train', dt * 8, planet);     // climbing is hard work (and trains you)
      // force a locked door by holding F
      const di = keys.has('KeyF') ? nearestDoor() : -1;
      if (di >= 0) {
        const { b, door } = town.doors[di], st = doorState(store, planet, b, door, t);
        if (st.held) ui.showPrompt('A reinforced cell door — it won\'t give.');
        else if (st.locked && !st.broken) {
          forceHold += dt;
          ui.showPrompt(`Forcing the lock… <i class="meter"><b style="width:${Math.min(100, forceHold / 1.8 * 100)}%"></b></i>`);
          if (forceHold > 1.8) {
            forceHold = 0;
            const here = world.locate(...ctrl.pos);
            const seen = residents.witnesses(t, ctrl.pos, here?.b?.key || null, here?.k ?? null);
            const inc = forceDoor(store, sched, planet, s, b, door, t, player, seen);
            lodgeIncident(ctx, inc);
            const cop = seen.find(w => { const q = pop.byId.get(w.id); return q?.job && pop.jobById.get(q.job).security; });
            if (cop) startPursuit(pop.byId.get(cop.id), 'you were seen breaking in');
            doorView.refresh(store, planet, t);
            ui.toast(`You broke the lock. ${seen.length ? `<b>${seen.length} ${seen.length === 1 ? 'person' : 'people'} saw you</b> (${seen.slice(0, 3).map(w => w.name).join(', ')}${seen.length > 3 ? '…' : ''}).` : 'Nobody saw you.'}`, 'bad', 8000);
          }
        }
      } else forceHold = 0;
    }
    // floating origin
    if (Math.abs(ctrl.pos[0] - origin[0]) > 3000 || Math.abs(ctrl.pos[2] - origin[2]) > 3000) {
      origin[0] = Math.round(ctrl.pos[0]); origin[2] = Math.round(ctrl.pos[2]);
      root.position.set(-origin[0], 0, -origin[2]);
    }
    const rp = toRender(...ctrl.pos);
    avatar.object.position.set(rp[0], rp[1], rp[2]);
    avatar.object.rotation.y = ctrl.facing;
    if (ctrl.mode === 'seat') { // same placement as the crowd's sitters and sleepers (render/crowd.js)
      const fx = Math.sin(ctrl.facing), fz = Math.cos(ctrl.facing);
      if (ctrl.seat.pose === 'lie') avatar.object.position.set(rp[0] + fx * 0.87, rp[1] + 0.14, rp[2] + fz * 0.87);
      else avatar.object.position.set(rp[0] - fx * 0.12, rp[1], rp[2] - fz * 0.12);
    }
    const climbPose = ctrl.mode === 'ladder' ? { moving: ctrl.climbing, lean: 0 } : ctrl.mode === 'mantle' ? { moving: true, lean: 0.5 } : ctrl.climbing ? { moving: true, lean: 0.6 } : null;
    if (ride) { // astride the saddle: the seat is ~0.45 m behind the bike's centre
      const fx = Math.sin(ride.facing), fz = Math.cos(ride.facing), back = -0.42;
      avatar.object.position.set(rp[0] + fx * back, rp[1] + SPEEDER.seat - 0.5 + Math.sin(ride.pitch) * back, rp[2] + fz * back);
      avatar.object.rotation.set(0, ride.facing, 0);
    }
    avatar.update(dt, ride ? 0 : ctrl.speed, ctrl.grounded, ride ? null : climbPose, ride ? 'sit' : ctrl.mode === 'seat' ? ctrl.seat.pose : null);
    avatar.object.visible = !flight;
    shipView.update(ships.map(sh => {
      if (flight && flight.ship.id === sh.id) return { id: sh.id, c: toRender(...flight.pos), facing: flight.facing, pitch: flight.pitch, roll: flight.roll, colour: sh.colour, rampDown: false };
      if (sh.flying) return null;
      const { c, facing } = centreOf(s, sh);
      return Math.abs(c[0] - ctrl.pos[0]) < 3000 && Math.abs(c[2] - ctrl.pos[2]) < 3000 ? { id: sh.id, c: toRender(...c), facing, colour: sh.colour, rampDown: rampDown(sh, planet, t, player) } : null;
    }).filter(Boolean), dt);
    vehView.update(vehicles.filter(v => (!ride || v.id !== ride.v.id) && Math.abs(v.pos[0] - ctrl.pos[0]) < 400 && Math.abs(v.pos[2] - ctrl.pos[2]) < 400).map(v => ({ ...v, pos: toRender(...v.pos) }))
      .concat(ride ? [{ pos: toRender(...ride.pos), facing: ride.facing, pitch: ride.pitch, roll: ride.roll, colour: ride.v.colour }] : []));
    avatar.setOpacity?.(Math.min(1, Math.max(0, (cam.cur - 0.6) / 0.9)));
    // residents (ACTIVE tier): positions are a pure function of time
    agents = residents.agents(t, dt, ctrl.pos, world);
    if (pursuit) {
      const ev = paused ? null : pursuit.update(t, dt, { pos: ctrl.pos, speed: ctrl.speed }, world, s);
      if (ev === 'chase') ui.toast(`You ran. <b>${pursuit.person.name}</b> is chasing you.`, 'bad', 6000);
      if (ev === 'caught') {
        const cell = arrest(ctx, t, { resisted: pursuit.resisted, by: pursuit.person.name });
        ctrl.pos = cell.pos.slice(); ctrl.vel = [0, 0, 0];
        const e = store.events.at(-1);
        ui.toast(`<b>${pursuit.person.name}</b> arrested you.${e.paid ? ` ${e.paid} cr in fines taken from your account.` : ''} You're held in the cell for ${e.hours} planet-hour${e.hours === 1 ? '' : 's'}${pursuit.resisted ? ' — longer, for running' : ''}.`, 'bad', 12000);
        doorView.refresh(store, planet, t);
      }
      if (ev === 'lost') ui.toast(`You lost <b>${pursuit.person.name}</b>. The warrant stands.`, 'warn', 8000);
      if (ev === 'done') pursuit = null;
      if (pursuit) agents = agents.filter(a => a.id !== pursuit.person.id).concat(pursuit.agent());
    }
    for (const a of ride || flight ? [] : agents) { // people are solid to the player (not the other way round yet)
      if (a.pose === 'lie' || Math.abs(a.pos[1] - ctrl.pos[1]) > 1.2) continue;
      const dx = ctrl.pos[0] - a.pos[0], dz = ctrl.pos[2] - a.pos[2], d = Math.hypot(dx, dz);
      if (d < 0.6) { // exactly on top of each other: step back the way they came
        const ux = d > 1e-4 ? dx / d : -Math.sin(a.facing), uz = d > 1e-4 ? dz / d : -Math.cos(a.facing);
        ctrl.pos[0] = a.pos[0] + ux * 0.6; ctrl.pos[2] = a.pos[2] + uz * 0.6;
      }
    }
    crowd.update(agents.map(a => ({ ...a, pos: toRender(...a.pos), uniform: !!(a.person.job && pop.jobById.get(a.person.job).security) })), dt);
    const inUse = [...residents.doorsInUse(agents)].filter(k => { const [bk, id] = k.split('#'); return !store.getDelta(doorKey(bk, id))?.held; });
    doorView.transient = new Set(inUse.map(k => doorIndex.get(k)).filter(i => i !== undefined));
    if (!shot) cam.update(dt, ctrl.pos, toRender);
    sched.tick(dt, t, ctx);
    terrain.update(ctrl.pos[0], ctrl.pos[2], 5);
    const camW = [camera.position.x + origin[0], camera.position.y, camera.position.z + origin[2]];
    sky.update(t, new THREE.Vector3(rp[0], rp[1], rp[2]), camera.position);
    water.position.set(camera.position.x, planet.seaLevel, camera.position.z);
    // interior lighting follows the room you are in
    const loc = world.locate(...ctrl.pos);
    if (loc?.room) {
      const r = loc.room.rect, c = buildingToWorld(s, loc.b, (r[0] + r[2]) / 2, (loc.k + 1) * loc.plan.H - 0.5, (r[1] + r[3]) / 2);
      const lp = toRender(...c); roomLight.position.set(lp[0], lp[1], lp[2]);
      roomLight.intensity = lightOn(store, loc.b.key, loc.k, loc.room.i) ? 6 + 10 * (1 - (sky.state.day ?? 1)) : 0;
    } else roomLight.intensity = 0;
    if (!paused) {
      const di = nearestDoor(), lad = nearLadder();
      const ua = forceHold === 0 && ctrl.mode === 'walk' && !lad ? usableAhead() : null;
      const nv = !ride && !ua && hotwire === 0 ? nearVehicle() : null;
      const rpn = !ride && !flight && !ua ? nearRamp() : null;
      if (flight) { const why = flight.onGround ? flight.landingProblem() : null; ui.showPrompt(`<b>${Math.round(flight.speed * 3.6)} km/h</b> · ${Math.round(flight.altitude())} m up · <kbd>Space</kbd>/<kbd>Q</kbd> climb/descend${flight.onGround ? (why ? ` · can't land: ${why}` : ' · <kbd>E</kbd> land') : ''}`); }
      else if (rampHold > 0) {}
      else if (rpn) ui.showPrompt(shipIsYours(rpn.sh, player) ? `<kbd>E</kbd> ${rpn.down ? 'Raise' : 'Lower'} the ramp — the ${esc(rpn.sh.name)}` : rpn.down ? `The ${esc(rpn.sh.name)} · ${esc(rpn.sh.ownerName)}${rpn.sh.forSale ? ` · for sale, ${SHIP_PRICE} cr` : ''}` : `The ${esc(rpn.sh.name)} · ramp locked · hold <kbd>F</kbd> force`);
      else if (ride) ui.showPrompt(`<b>${Math.round(Math.abs(ride.speed) * 3.6)} km/h</b> · <kbd>Shift</kbd> boost · ${Math.abs(ride.speed) > 4 ? 'slow down to get off' : '<kbd>E</kbd> get off'}`);
      else if (hotwire > 0) {}
      else if (nv && (di < 0 || Math.hypot(nv.pos[0] - ctrl.pos[0], nv.pos[2] - ctrl.pos[2]) < doorDist)) ui.showPrompt(isYours(nv, player) ? '<kbd>E</kbd> Ride your speeder' : nv.forSale ? `<kbd>E</kbd> Speeder for sale — ${SPEEDER.price} cr` : `${esc(nv.ownerName)}'s speeder · hold <kbd>F</kbd> hotwire`);
      else if (ctrl.mode === 'seat') ui.showPrompt(ctrl.seat.pose === 'lie' ? '<kbd>E</kbd> Sleep · <kbd>W</kbd> get up' : '<kbd>W</kbd> / <kbd>E</kbd> get up');
      else if (ua && (di < 0 || ua.d < doorDist)) {
        const st = statusOf(ua.b, ua.u, t), own = ownership(ua.b, ua.u.room, player);
        ui.showPrompt(`<kbd>E</kbd> ${labelOf(ua.u)} <small>— ${ua.u.verbs.map(v => VERB[v].toLowerCase()).join(' · ')}${st ? ` · <b>${st}</b>` : ''}${ua.u.box && !own.yours && !own.communal && !ua.u.box.shop ? ` · ${esc(own.owner)}'s` : ''}</small>`);
      }
      else if (ctrl.mode === 'ladder') ui.showPrompt(`<kbd>W</kbd>/<kbd>S</kbd> climb · <kbd>Space</kbd> let go${player.fatigue > 0.92 ? ' <small>— you\'re exhausted</small>' : ''}`);
      else if (lad && forceHold === 0) ui.showPrompt(`<kbd>E</kbd> ${ctrl.pos[1] > lad.foot[1] + 1.5 ? 'Climb down the ladder' : 'Climb the fire ladder'}`);
      else if (di >= 0 && forceHold === 0) {
        const { b, door } = town.doors[di], st = doorState(store, planet, b, door, t);
        const res = canOpen(store, planet, player, b, door, t);
        const what = door.kind === 'interior' ? 'door' : door.kind === 'core' ? (door.access === 'unit' ? `apartment ${door.unit}` : 'door') : `${b.owner} · ${address(s, b)}`;
        ui.showPrompt(st.held ? `Holding cell — locked until your release${player.custody ? ' at ' + formatHour(solarHour(planet, player.custody.until)) : ''}` : st.open ? `<kbd>E</kbd> Close ${what}` : st.broken ? `<kbd>E</kbd> Open ${what} <small>(lock broken)</small>`
          : res.ok || (door.kind !== 'interior' && insideBuilding(b)) ? `<kbd>E</kbd> Open ${what}${res.key ? ' <small>(your key)</small>' : ''}` : `${res.why} · <kbd>E</kbd> try · hold <kbd>F</kbd> force`);
      } else if (forceHold === 0) {
        // the person in front of you
        let best = null, bd = 2.6;
        for (const a of agents) {
          const dx = a.pos[0] - ctrl.pos[0], dz = a.pos[2] - ctrl.pos[2], d = Math.hypot(dx, dz);
          if (d < bd && Math.abs(a.pos[1] - ctrl.pos[1]) < 1.5 && (dx * Math.sin(ctrl.facing) + dz * Math.cos(ctrl.facing)) / (d || 1) > 0.2) { bd = d; best = a; }
        }
        if (best) {
          const rel = relation(best.id), p = best.person;
          ui.showPrompt(`<b>${p.name}</b>${rel ? ` — ${rel}` : ''} · ${p.age} · ${occupation(pop, p)} <small>· ${best.activity}</small>`);
        } else ui.showPrompt(null);
      }
    }
    ui.updateHud({ planet, s, player, t, located: loc, atWork, cell: holdingCell(planet, s, polity) });
    frames++;
    if (now - fpsT > 1000) {
      fps = frames; frames = 0; fpsT = now;
      const info = renderer.info.render;
      ui.debug(`${fps} fps · ${info.calls} calls · ${(info.triangles / 1e3).toFixed(0)}k tris · tiles ${terrain.count} (+${terrain.pending}) · pos ${camW.map(v => v.toFixed(0)).join(',')} · jobs ${store.jobs.length} · deltas ${store.deltas.size}`);
    }
    if (performance.now() - lastSave > 10000) { lastSave = performance.now(); save(); }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
  window.ORBIS = { ladders, store, planet, s, ctrl, cam, clock, world, town, doorView, scene, renderer, ready: false, save, pop, residents, crowd, getAgents: () => agents, ctx, polity, showWork, getPursuit: () => pursuit, startPursuit, cell: holdingCell(planet, s, polity), ui, propView, use: { usableAhead, useThing, statusOf, labelOf }, showInventory, getRide: () => ride, getVehicles: () => vehicles, getFlight: () => flight, getShips: () => ships, syncShips };
  // let a few frames settle (shadows, env map) before declaring ready for screenshots
  setTimeout(() => { window.ORBIS.ready = true; document.title = 'READY'; }, 1500);
}

function applyShot(kind, g) {
  const { s, planet, ctrl, cam, town, store, clock } = g;
  const camera = cam.camera;
  const W = (u, v) => s.toWorld(u, v);
  if (kind === 'aerial') {
    const [x, z] = W(-s.R * 0.9, -s.R * 0.9);
    camera.position.set(x, s.h + 170, z); camera.lookAt(s.cx, s.h, s.cz);
  } else if (kind === 'far') {
    camera.position.set(s.cx, s.h + 40, s.cz); camera.lookAt(s.cx + 3000, s.h + 80, s.cz + 1500);
  } else if (kind === 'people' || kind === 'work' || kind === 'sleep' || kind === 'patrol') {
    // find someone doing the thing, and stand nearby looking at them
    const t = clock.now();
    const want = kind === 'patrol' ? (w => w.activity === 'on patrol' && !w.moving) : kind === 'people' ? (w => w.moving && !w.bKey && w.pos[1] < s.h + 1) : kind === 'work' ? (w => w.activity === 'working' && w.pose === 'sit') : (w => w.activity === 'sleeping');
    let pick = null;
    for (const p of g.pop.people) { const w = whereAt(g.pop, p, t); if (want(w)) { pick = w; break; } }
    if (pick) {
      const { world } = g, fx = Math.sin(pick.facing), fz = Math.cos(pick.facing);
      if (kind === 'people' || kind === 'patrol') ctrl.pos = [pick.pos[0] + fx * (kind === 'patrol' ? 4 : 7) + fz * 1.5, s.h, pick.pos[2] + fz * 7 - fx * 1.5];
      else {
        const floor = world.groundAt(pick.pos[0], pick.pos[2], pick.pos[1] - (pick.pose === 'lie' ? 0.4 : 0)).h;
        const [x, z] = world.resolve(pick.pos[0] + fx * 1.7 + fz * 0.6, pick.pos[2] + fz * 1.7 - fx * 0.6, floor);
        ctrl.pos = [x, floor, z];
      }
      ctrl.facing = Math.atan2(pick.pos[0] - ctrl.pos[0], pick.pos[2] - ctrl.pos[2]);
      cam.yaw = ctrl.facing - 0.35; cam.pitch = kind === 'sleep' ? 0.5 : 0.15; cam.dist = kind === 'people' ? 4 : 2.4;
      const toR = (x, y, z) => [x, y, z];
      const keep = () => { cam.update(0.05, ctrl.pos, toR); requestAnimationFrame(keep); }; requestAnimationFrame(keep);
    } else console.warn('no one found for shot', kind);
  } else if (kind === 'street' || kind === 'door' || kind === 'interior' || kind === 'stairs') {
    const pick = kind === 'interior' ? town.doors.find(d => d.b.type === 'office' && d.door.kind === 'exterior')
      : kind === 'stairs' ? town.doors.find(d => d.door.kind === 'core' && d.door.k === 0 && d.b.type === 'hab')
        : town.doors.find(d => d.b.type === 'store' && d.door.kind === 'exterior');
    const { b, plan } = pick;
    if (kind === 'street') {
      const ds = doorstep(s, b, plan);
      const back = [ds.pos[0] - Math.sin(ds.facing) * 14, ds.pos[1], ds.pos[2] - Math.cos(ds.facing) * 14];
      const [rx, , rz] = nearestRoadPoint(s, back[0], back[2]);
      ctrl.pos = [rx, s.h, rz]; ctrl.facing = Math.atan2(ds.pos[0] - rx, ds.pos[2] - rz) + 0.5;
      cam.yaw = ctrl.facing; cam.pitch = 0.12; cam.dist = 5;
    } else if (kind === 'door') {
      const ds = doorstep(s, b, plan);
      ctrl.pos = ds.pos; ctrl.facing = ds.facing; cam.yaw = ds.facing + 0.35; cam.pitch = 0.1; cam.dist = 4;
    } else if (kind === 'stairs') {
      const dr = pick.door;
      const p = buildingToWorld(s, b, dr.x + 0.9, 0, dr.z - 0.2);
      ctrl.pos = p; ctrl.facing = Math.atan2(b.ez[0] * s.cos - b.ez[1] * s.sin, b.ez[0] * s.sin + b.ez[1] * s.cos);
      cam.yaw = ctrl.facing; cam.pitch = 0.05; cam.dist = 2.5;
    } else {
      const room = plan.rooms.find(r => r.k === pick.door.k && r.i === pick.door.rooms[0]);
      const r = room.rect;
      const p = buildingToWorld(s, b, (r[0] + r[2]) / 2, room.k * plan.H, r[1] + 1.2);
      ctrl.pos = p; ctrl.facing = Math.atan2(b.ez[0] * s.cos - b.ez[1] * s.sin, b.ez[0] * s.sin + b.ez[1] * s.cos);
      cam.yaw = ctrl.facing + (kind === 'stairs' ? 1.2 : 0); cam.pitch = 0.18; cam.dist = 3.2;
    }
    ctrl.step(0.016, { fwd: 0, right: 0, run: false, jump: false, yaw: cam.yaw });
    // camera follows normally in these shots
    const toR = (x, y, z) => [x, y, z];
    setTimeout(() => { for (let i = 0; i < 90; i++) cam.update(0.05, ctrl.pos, toR); }, 0);
    const keep = () => { cam.update(0.05, ctrl.pos, toR); requestAnimationFrame(keep); }; requestAnimationFrame(keep);
  }
}

function tick() { return new Promise(r => setTimeout(r, 0)); }

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function restoreFlow(inGame) {
  return new Promise(res => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return res(false);
      try { await store.importJSON(await f.text()); location.reload(); res(true); }
      catch (e) { alert('Could not restore: ' + e.message); res(false); if (!inGame) location.reload(); }
    };
    inp.click();
  });
}
