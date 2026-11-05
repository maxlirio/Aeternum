// ORBIS — boot and game loop. Wires the modules together; owns no game rules itself.
//   core/  seeds, noise, addresses       gen/   pure world generation
//   world/ persistent changes            sim/   time, scheduler, processes
//   render/ three.js views of gen data   player/ motion, camera, collision
import * as THREE from 'three';
import { seedHex, seedFromHex, makeSeed, hashStr } from './core/hash.js';
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
import { TerrainStreamer, terrainTime } from './render/terrain.js';
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
import { SPEEDER, typeOf } from './gen/vehicles.js';
import { vehiclesIn, park, buyVehicle, stealVehicle, isYours } from './world/vehicles.js';
import { Ride } from './player/ride.js';
import { VehicleView } from './render/vehicles.js';
import { SHIP_PRICE, PRICES, tripOf } from './gen/ships.js';
import { shipsIn, onRun, holdRun, shipIsYours, rampDown, rampLocked, setRamp, structureOf, centreOf, buyShip, stealShip, launch, land, forceRamp, shipKey } from './world/ships.js';
import { Flight } from './player/flight.js';
import { AirWar, raidAt, raidIndex } from './sim/aircombat.js';
import { CombatView } from './render/combat.js';
import { ShipView } from './render/ships.js';
import { FloraView } from './render/flora.js';
import { CityView } from './render/city.js';
import { surfaceHeight } from './gen/surface.js';
import { CityTrafficView } from './render/citytraffic.js';
import { CityInteriors } from './render/cityreal.js';
import { HoldsView } from './render/holds.js';
import { OutpostView } from './render/outposts.js';
import { buildingParts, setWindowGlow } from './render/housegen.js';
import { SiteInteriors } from './render/sitereal.js';
import { sitesNear } from './gen/outposts.js';
import { localTones } from './gen/culture.js';
import { Goods } from './render/goods.js';
import { Mayhem } from './sim/mayhem.js';
import { cityWalkers } from './gen/citytraffic.js';
import { siteWalkers, villagerSays } from './gen/villagers.js';
import { signalAt, driverOf, purposeOf } from './gen/cityfleet.js';
import { getCity, cityPlace, blocksNear, liftsOf, CURB as CITY_CURB } from './gen/city.js';
import { GrassField } from './render/grass.js';
import { WeatherView } from './render/weather.js';
import { makeSea } from './render/water.js';
import { trafficNear, airTraffic, struckBy } from './gen/traffic.js';
import { WEAPONS, strike, isDown, healthOf } from './sim/processes/combat.js';
import { known, introduce, talked, workLine, homeLine, familyLine, smallTalk, directionsFrom } from './sim/processes/talk.js';
import { weatherAt } from './gen/weather.js';
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
  const weatherView = new WeatherView(scene, planet);
  const terrain = new TerrainStreamer(planet, root);
  // furniture from the built asset library; the box furniture remains the fallback if it can't load
  const propLib = params.has('boxprops') ? null : await loadPropLibrary(undefined, renderer.capabilities.getMaxAnisotropy()).catch(e => { console.warn('prop library', e); return null; });
  const propView = propLib ? new PropView(propLib) : null;
  const vehView = new VehicleView(propLib); scene.add(vehView.group);
  const shipView = new ShipView(propLib); scene.add(shipView.group);
  const flora = new FloraView(propLib, planet, renderer); root.add(flora.group);      // (world coordinates, under the floating origin)
  const grass = new GrassField(planet); root.add(grass.group);
  const town = await buildSettlementMesh(planet, s, f => ui.loading(`Building ${s.name}…`, 0.1 + 0.6 * f), propView);
  root.add(town.group);
  const cityView = new CityView(planet, propLib); root.add(cityView.group);   // the megacity on the horizon (gen/city.js)
  const cityTraffic = new CityTrafficView(planet, cityView.city, propLib); scene.add(cityTraffic.group); root.add(cityTraffic.points);
  propLib?.setLocal(localTones(planet));
  let siteRooms = null;        // and walk-in country buildings
  let cityRooms = null;        // walk-in city buildings (made once the collision world exists)
  const holdsView = new HoldsView(); scene.add(holdsView.mesh);
  const outposts = new OutpostView(planet, propLib, k => k.startsWith('gb_') ? (propLib ? buildingParts(planet, k, propLib.wornSurface) : null) : cityView.kit(k)); root.add(outposts.group);
  let goods = null;
  let mayhem = null;           // what you can do to the city, and what it does back (made with the collision world)
  const doorView = new DoorView(s, town.doors);
  town.group.add(doorView.mesh);
  const doorIndex = new Map(town.doors.map((d, i) => [d.b.key + '#' + d.door.id, i]));
  const world = new CollisionWorld(planet, s, (b, id) => doorView.isPassable(doorIndex.get(b.key + '#' + id)));
  const sea = makeSea(planet); scene.add(sea);
  // where someone told you to go: a tall pale beam you can see over the rooftops
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 120, 12, 1, true).translate(0, 60, 0), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beam.visible = false; scene.add(beam);          // (not 'water': that's the plant-watering action)

  const player = store.player;
  player.credits ??= 500; player.record ??= [];        // saves from before money existed
  const ctrl = new Controller(world, player.pos);
  ctrl.facing = player.facing || 0;
  const avatar = createPlaceholderAvatar();
  avatar.lib = propLib; scene.add(avatar.object);
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
    if (pursuit || player.custody || !officer || isDown(store, officer.id, clock.now()) || bodies.some(b => b.id === officer.id) || officer.gone) return;   // (not someone you've just put on the ground)
    pursuit = new Pursuit(pop, officer, clock.now(), why);
    ui.toast(`<b>${officer.name}</b> of ${polity.securityName} is coming to arrest you — ${why}. `, 'bad', 10000);
  };
  const nearestOfficerOnDuty = t => {
    let best = null, bd = Infinity;
    for (const p of pop.people) {
      if (!isOfficer(p) || isDown(store, p.id, t)) continue;
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
  sched.add(TIER.NEAR, { update: dt => { player.hp = Math.min(100, (player.hp ?? 100) + 80 * dt / planet.dayLength); } });
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
    if (e.code === 'KeyR') attack();
    if (e.code === 'KeyF' && myCraft) { if (myCraft.lockT < 1.2 || !war.fireMissile(myCraft)) ui.toast(myCraft.missiles ? (myCraft.lock && myCraft.lockT > 1.2 ? 'Reloading.' : 'No lock: keep a target ahead of you, from behind, for a second.') : 'No missiles left.', 'warn', 2000); else if (myCraft.lockT < 1.2) {} }
    if (e.code === 'KeyG' && myCraft) war.dropFlares(myCraft); else if (e.code === 'KeyG') grabOrThrow();
    if (e.code === 'KeyX' && flight) { flight.assist = !flight.assist; ui.toast(flight.assist ? 'Flight assist on: wings level themselves, the hover holds height.' : 'Flight assist <b>off</b>. Nothing will catch you.', flight.assist ? '' : 'warn', 4000); }
    if (e.code === 'KeyV' && flight) { cockpitView = !cockpitView; avatar.object.visible = false; }
    if (e.code === 'Escape') openMenu();
    if (e.code === 'F3') { ui.toggleDebug(); e.preventDefault(); }
    if (e.code === 'KeyC') showCharacter();
    if (e.code === 'KeyJ') showWork();
    if (e.code === 'KeyT' && e.shiftKey) { clock.advance(planet.dayLength / 24); ui.toast('Skipped one hour <small>(developer time-skip — scheduled events still run in order)</small>'); }
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  renderer.domElement.addEventListener('click', () => { if (paused) return; if (document.pointerLockElement === renderer.domElement) attack(); else renderer.domElement.requestPointerLock?.(); });
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
  // ---- city lifts: every tall building's lift stops at its street door, its pads, skybridges and roof
  function liftNear() {
    if (ctrl.mode !== 'walk' || ride || flight) return null;
    const c = cityView.city; if (Math.hypot(ctrl.pos[0] - c.cx, ctrl.pos[2] - c.cz) > c.R + 200) return null;
    const [u, v] = c.toLocal(ctrl.pos[0], ctrl.pos[2]), y = ctrl.pos[1] - c.h - CITY_CURB;
    let best = null, bd = 2.6;
    blocksNear(c, u, v, 6, B => { for (const L of liftsOf(c, B)) for (const st of L.stops) { const d = Math.hypot(st.u - u, st.v - v); if (d < bd && Math.abs(st.y - y) < 1.6) { bd = d; best = { L, st, d }; } } });
    return best;
  }
  // what E means here: the door you're at beats a car that merely happens to be parked by it; whichever is nearer. The prompt and the key use this same answer.
  const carToTake = t => { const c = mayhem?.takeable(ctrl, t); if (!c || c.on) return c || null; const lf = liftNear(); return lf && lf.d <= c.d ? null : c; };
  async function liftFlow({ L, st }) {
    let pick = null;
    await modal(async () => { pick = await ui.choose({ title: `${L.b.label[0].toUpperCase() + L.b.label.slice(1)} — lift`, sub: `${L.stops.length} stops. You're at: ${st.label.toLowerCase()}.`,
      options: L.stops.map((q, i) => ({ a: 'go', v: String(i), label: q.label, disabled: q === st })) }); });
    if (!pick || pick.a !== 'go') return;
    const q = L.stops[+pick.v], c = cityView.city, [x, z] = c.toWorld(q.u, q.v);
    const secs = Math.max(8, Math.abs(q.y - st.y) / 9); clock.advance(secs);
    ctrl.pos = [x, c.h + CITY_CURB + q.y + 0.05, z]; ctrl.vel = [0, 0, 0];
    ui.toast(`The lift ${q.y > st.y ? 'climbs' : 'drops'} ${Math.round(Math.abs(q.y - st.y))} m. <small>${q.label}</small>`, '', 3500);
  }
  function interact() {
    const tk = carToTake(clock.now()); if (tk && !(nearVehicle() && isYours(nearVehicle(), player))) { takeCar(tk); return; }
    const lf = liftNear();
    if (lf) { liftFlow(lf); return; }
    if (ctrl.mode === 'walk' && ctrl.grounded && ctrl.where?.roof !== false && ctrl.climbDown()) return;
    const lad = nearLadder();
    if (lad) { ctrl.grabLadder(lad); return; }
    if (ride) { getOff(); return; }
    if (flight) { setDown(); return; }
    const rp = nearRamp();
    if (rp) { rampFlow(rp); return; }
    if (ctrl.mode === 'seat') { if (ctrl.seat.pose === 'lie') sleepFlow(); else ctrl.standUp(); return; }
    const bike = nearVehicle();
    if (bike) { bikeFlow(bike); return; }
    const vl = villagerAhead(clock.now()); if (vl) { const n = villagerChats.get(vl.id) || 0; villagerChats.set(vl.id, n + 1); ui.toast(`<b>${esc(n ? vl.villager.name : 'A stranger')}:</b> ${esc(villagerSays(vl, n))}`, '', 5000); return; }
    const who = personAhead(), di0 = nearestDoor(), ua0 = usableAhead();
    const wd = who ? Math.hypot(who.pos[0] - ctrl.pos[0], who.pos[2] - ctrl.pos[2]) - 0.6 : Infinity;     // the nearest thing wins: the person, a door, or furniture
    if (who && (di0 < 0 || wd < doorDist) && (!ua0 || wd < ua0.d + 0.8)) { talkFlow(who); return; }   // someone sitting on a chair beats the chair
    const i = nearestDoor(), u = usableAhead(), sd = siteRooms?.doorNear(ctrl.pos);
    if (sd && (i < 0 || sd.d < doorDist) && (!u || sd.d < u.d)) {       // a door out in the country works as any other
      const t = clock.now(), st = doorState(store, planet, sd.b, sd.door, t);
      if (st.open) { closeDoor(store, sd.b.key, sd.door); return; }
      const res = canOpen(store, planet, player, sd.b, sd.door, t);
      if (res.ok || insideBuilding(sd.b)) { openDoor(store, sched, sd.b.key, sd.door, t); if (res.key) ui.toast('Unlocked with your key.'); } else ui.toast(`${res.why}. `, 'warn');
      return;
    }
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
    } else ui.toast(`${res.why}. `, 'warn');
  }

  // ---- using things (sim/processes/use.js): furniture in reach, ahead of you on your floor
  const KIND_LABEL = { bed: 'Bed', sofa: 'Sofa', chair: 'Chair', table: 'Table', desk: 'Desk', planter: 'Planter', fridge: 'Fridge', console: 'Flight console', armchair: 'Armchair', shower: 'Shower', basin: 'Washbasin', toilet: 'Toilet', tvstand: 'Television', bookshelf: 'Bookshelf' };
  const VERB = { sleep: 'Lie down', sit: 'Sit down', open: 'Look inside', cook: 'Cook', buy: 'Browse the shelves', sell: 'Sell things at the till', terminal: 'Use the terminal',
    fabricate: 'Run the fabricator', assemble: 'Build something', wash: 'Run a wash', water: 'Water the plant', fly: 'Take the helm', shower: 'Take a shower', freshen: 'Wash your face', toilet: 'Use the toilet', tv: 'Watch the news', read: 'Read a book' };
  const labelOf = u => u.box && !['bench', 'counter', 'machine'].includes(u.pr.kind) ? u.box.label : KIND_LABEL[u.pr.kind]
    || (u.pr.kind === 'machine' ? (u.verbs.includes('wash') ? 'Washing machine' : 'Fabricator') : u.pr.kind === 'bench' ? (u.verbs.includes('assemble') ? 'Workbench' : 'Bench')
      : u.verbs.includes('cook') ? 'Kitchen counter' : u.verbs.includes('sell') ? 'Shop counter' : 'Counter');
  let cityLift = null, cityTake = null;
  // everyone out of doors near a spot who isn't a town agent: the city's walkers and the country's villagers
  const peopleNear = (t, x, z, r, max) => cityWalkers(cityView.city, t, x, z, r, max).concat(siteWalkers(planet, t, x, z, r, max)).sort((a, b) => a.d - b.d).slice(0, max);
  const villagerAhead = t => { let best = null, bd = 2.6; if (ctrl.mode !== 'walk') return null; for (const w of siteWalkers(planet, t, ctrl.pos[0], ctrl.pos[2], 5, 8)) { if (mayhem?.out.has(w.id)) continue; const dx = w.pos[0] - ctrl.pos[0], dz = w.pos[2] - ctrl.pos[2], d = Math.hypot(dx, dz); if (d < bd && Math.abs(w.pos[1] - ctrl.pos[1]) < 1.5 && (dx * Math.sin(ctrl.facing) + dz * Math.cos(ctrl.facing)) / (d || 1) > 0.2) { bd = d; best = w; } } return best; };
  const villagerChats = new Map();
  // the traffic lights near you show what their junction's doing
  function showCityLights() {
    const c = cityView.city, out = []; if (Math.hypot(ctrl.pos[0] - c.cx, ctrl.pos[2] - c.cz) > c.R + 300) { cityTraffic.showLights(out); return; }
    const [u, v] = c.toLocal(ctrl.pos[0], ctrl.pos[2]), t = clock.now(), base = c.h + CITY_CURB, RED = [1, 0.1, 0.06], AMB = [1, 0.6, 0.1], GRN = [0.1, 1, 0.3];
    blocksNear(c, u, v, 150, B => { for (const p of B.props) { if (p.k !== 'trafficlight' || Math.hypot(p.u - u, p.v - v) > 170) continue;
      const lu = p.u - 3.56 * Math.sin(p.rot), lv = p.v - 3.56 * Math.cos(p.rot), i = p.u < (B.rect[0] + B.rect[2]) / 2 ? B.i : B.i + 1, j = p.v < (B.rect[1] + B.rect[3]) / 2 ? B.j : B.j + 1, st = signalAt(c, i, j, t);
      const axis = p.u < (B.rect[0] + B.rect[2]) / 2 ? 0 : 1, y = st === axis ? 4.19 : st === -1 ? 4.52 : 4.85, [wx, wz] = c.toWorld(lu, lv);
      out.push({ pos: toRender(wx, base + y, wz), col: st === axis ? GRN : st === -1 ? AMB : RED });
    } });
    cityTraffic.showLights(out);
  }
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
    if (verb === 'shower') { clock.advance(600); player.fatigue = Math.max(0, player.fatigue - 0.1); store.touchPlayer(); ui.toast('Ten minutes under hot water. You feel awake again.'); return; }
    if (verb === 'freshen') { player.fatigue = Math.max(0, player.fatigue - 0.03); store.touchPlayer(); ui.toast('Cold water on your face.'); return; }
    if (verb === 'toilet') { clock.advance(180); ui.toast('A few quiet minutes.'); return; }
    if (verb === 'read') { const H = planet.dayLength / 24; clock.advance(H); advanceBody(player, 'sit', H, planet); store.touchPlayer(); ui.toast(`You read for an hour. ${['A history of the colony', 'A thriller set on a freighter', 'A field guide to the planet\'s plants', 'Poems', 'A manual for fabricators'][Math.floor(Math.random() * 5)]}.`); return; }
    if (verb === 'tv') return terminalFlow(b, true);
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
    if (value && b.city) ui.toast(`You took ${value} cr worth of ${esc(own.owner || b.owner)}'s things. In the city crowd nobody stops you — <small>the city's own law isn't watching yet</small>.`, 'warn', 7000);
    else if (value && b.country) { const seen = mayhem.crime(clock.now(), 'theft', Math.min(2, value / 200), ctrl.pos); ui.toast(`You took ${value} cr worth of ${esc(own.owner || b.owner)}'s things. ${seen ? `<b>${seen} ${seen === 1 ? 'person' : 'people'} saw you.</b>` : 'Nobody saw you.'}`, 'bad', 7000); }
    else if (value) {
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
  async function terminalFlow(b, tvOnly = false) {
    const t = clock.now(), mine = store.events.filter(e => e.who === player.id).slice(-8).reverse();
    const NEWS = ['died', 'born', 'household_arrived', 'household_left', 'case_opened', 'case_cold', 'fined', 'theft_discovered', 'break_in_discovered', 'resident_hired', 'door_repaired'];
    const news = store.events.filter(e => NEWS.includes(e.type)).slice(-10).reverse();
    const owed = (player.fines || []).reduce((n, f) => n + f.amount, 0);
    const list = es => `<ul class="events">${es.map(e => `<li>${describeEvent(e, planet)}</li>`).join('') || '<li class="none">Nothing yet.</li>'}</ul>`;
    await modal(() => ui.terminal({ title: tvOnly ? `${s.name} news` : `${b.owner} — terminal`, sections: tvOnly ? [{ h: 'Today', html: list(news) }, { h: 'Weather', html: `<p>${weatherAt(planet, t).label}</p>` }] : [
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
        if (r.a === 'equip') { const it = inventoryOf(player)[r.idx]; player.weapon = player.weapon === it.id ? null : it.id; store.touchPlayer(); ui.toast(player.weapon ? `${ITEMS[it.id].name} in hand.` : 'Put away.'); continue; }
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
  const allVehicles = () => vehiclesIn(store, planet, s).concat((player.cityCars || []).map(i => { const id = 'cf:' + i, d = store.getDelta('veh/' + id); return d && { id, city: true, ...d, ownerName: 'you' }; }).filter(Boolean));
  vehicles = allVehicles();
  sched.add(TIER.NEAR, { update: () => { vehicles = allVehicles(); } });
  const nearVehicle = () => {
    if (ride || ctrl.mode !== 'walk') return null;
    let best = null, bd = 9;
    for (const v of vehicles) { const d = Math.hypot(v.pos[0] - ctrl.pos[0], v.pos[2] - ctrl.pos[2]) - typeOf(v).L / 2 + 1.0; if (d < Math.min(bd, 2.2) && Math.abs(v.pos[1] - ctrl.pos[1]) < 1.6) { bd = d; best = v; } }
    return best;
  };
  function takeCar(tk) {
    const t = clock.now(), r = mayhem.take(tk, t);
    vehicles = allVehicles(); mount(vehicles.find(v => v.id === r.v.id) || r.v);
    ui.toast(r.moving ? `You drag <b>${esc(r.name)}</b> out and take the wheel.${r.seen ? ` <b>${r.seen} saw it.</b>` : ''}${r.v.fly ? ' <small><kbd>Space</kbd>/<kbd>Q</kbd> up and down</small>' : ''}` : `You hotwire ${esc(r.name)}'s ${typeOf(r.v).name.toLowerCase()}.${r.seen ? ` <b>${r.seen} saw it.</b>` : ''}${r.v.fly ? ' <small><kbd>Space</kbd>/<kbd>Q</kbd> up and down</small>' : ''}`, 'bad', 7000);
  }
  function mount(v) {
    ride = new Ride(world, planet, v); ctrl.mode = 'ride'; camDist = cam.dist; cam.dist = Math.max(cam.dist, 6.5);
  }
  function getOff() {
    if (Math.abs(ride.speed) > 4 && !ride.v.fly) { ui.toast('Slow down first.', 'warn', 2000); return; }
    park(store, ride.v, ride.pos, ride.facing);
    if (ride.v.fly && ride.pos[1] - world.groundAt(ride.pos[0], ride.pos[2], ride.pos[1]).h > 3) {       // out of a sky car, in the sky
      ctrl.pos = [ride.pos[0] - Math.cos(ride.facing) * 1.6, ride.pos[1], ride.pos[2] + Math.sin(ride.facing) * 1.6]; ctrl.vel = [Math.sin(ride.facing) * ride.speed * 0.8, 0, Math.cos(ride.facing) * ride.speed * 0.8]; ctrl.grounded = false; ctrl.mode = 'walk'; ctrl.facing = ride.facing; ride = null; cam.dist = camDist; vehicles = allVehicles(); return;
    }
    ctrl.pos = ride.dismountSpot(); ctrl.vel = [0, 0, 0]; ctrl.mode = 'walk'; ctrl.facing = ride.facing;
    ride = null; cam.dist = camDist; vehicles = allVehicles();
  }
  async function bikeFlow(v) {
    if (isYours(v, player)) return mount(v);
    if (v.forSale) {
      let pick = null;
      const T = typeOf(v); await modal(async () => { pick = await ui.choose({ title: T.name, sub: `For sale at ${esc(v.ownerName)}. About ${Math.round(T.top * 3.6)} km/h, ${Math.round(T.top * 3.6 * 1.4)} boosted. Hovers over ground and water.`,
        options: [{ a: 'buy', label: `Buy it — ${T.price} cr`, note: `You have ${player.credits ?? 0} cr`, disabled: (player.credits ?? 0) < T.price }] }); });
      if (pick?.a !== 'buy') return;
      const r = buyVehicle(store, v, clock.now());
      ui.toast(r.ok ? 'It\'s yours.' : r.why, r.ok ? '' : 'warn'); vehicles = vehiclesIn(store, planet, s);
      return;
    }
    ui.toast(`This belongs to ${esc(v.ownerName)}. Hold <kbd>F</kbd> to hotwire it.`, 'warn');
  }
  function hotwired(v) {
    const t = clock.now(), seen = witnessesHere();
    const inc = stealVehicle(store, s, v, t, seen); lodgeIncident(ctx, inc);
    const cop = seen.find(w => isOfficer(pop.byId.get(w.id)));
    if (cop) startPursuit(pop.byId.get(cop.id), 'you were seen stealing a bike');
    ui.toast(`You hotwired ${esc(v.ownerName)}'s bike. ${seen.length ? `<b>${seen} ${seen === 1 ? 'person' : 'people'} saw you.</b>` : 'Nobody saw you.'}`, 'bad', 8000);
    vehicles = vehiclesIn(store, planet, s); mount(vehicles.find(x => x.id === v.id));
  }
  // ---- ships (gen/ships.js, world/ships.js, player/flight.js). A landed ship is a
  // structure in the collision world, like a building; a flying one is a Flight.
  let ships = shipsIn(store, planet, s, clock.now()), flight = null, rampHold = 0, cockpitView = false;
  const stick = [0, 0];
  cam.onMouse = (dx, dy) => { if (!flight) return false; stick[0] = Math.max(-1, Math.min(1, stick[0] + dx * 0.006)); stick[1] = Math.max(-1, Math.min(1, stick[1] + dy * 0.006)); return true; };   // mouse forward = nose down
  const placed = new Map();          // ship id → structure in the collision world
  const shipById = id => ships.find(x => x.id === id);
  function syncShips() {
    ships = shipsIn(store, planet, s, clock.now());
    for (const sh of ships) {
      // a cargo run due while you're aboard waits: today's run is off
      if (onRun(sh) && placed.has(sh.id) && world.locate(...ctrl.pos)?.b?.key === sh.id) { holdRun(store, sh); ships = shipsIn(store, planet, s, clock.now()); return syncShips(); }
      const want = !sh.flying && !onRun(sh) && !(flight && flight.ship.id === sh.id), have = placed.get(sh.id);
      const sig = JSON.stringify([sh.at, sh.O]);
      if (have && (!want || have.sig !== sig)) { world.removeStructure(have); placed.delete(sh.id); }
      if (want && !placed.has(sh.id)) {
        const b = structureOf(s, sh, id => id !== 0 || (rampDown(shipById(sh.id) || sh, planet, clock.now(), player) && shipView.rampOpen(sh.id)), planet);
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
      if (sh.forSale) opts.push({ a: 'buy', label: `Buy the ${sh.name} — ${PRICES[sh.model]} cr`, note: `You have ${player.credits ?? 0} cr`, disabled: (player.credits ?? 0) < PRICES[sh.model] });
      opts.push({ a: 'steal', label: 'Override the lockout and take off', note: `It belongs to ${esc(sh.ownerName)}. <b>That's stealing a ship.</b>` });
    }
    let pick = null;
    await modal(async () => { pick = await ui.choose({ title: `${sh.name} — helm`, sub: `${shipIsYours(sh, player) ? 'Your ship.' : esc(sh.ownerName) + '\'s ship.'} ${({ freighter: 'A cargo freighter: a high hold, a crew deck with two bunks, a two-seat flight deck.', courier: 'A small fast courier: a cabin and a two-seat cockpit.', patrol: 'Civic Security\'s patrol ship.', yacht: 'A private yacht: a lounge, a galley, a stateroom and a bridge.' })[sh.model] || 'A short-range shuttle: a cargo hold, a bunk and a galley.'}`, options: opts }); });
    if (!pick || pick.a === 'close') return;
    if (pick.a === 'buy') { const r = buyShip(store, sh, t); ui.toast(r.ok ? `The ${esc(sh.name)} is yours. Sit at the helm again to take off.` : r.why, r.ok ? '' : 'warn'); syncShips(); return; }
    if (pick.a === 'steal') {
      const seen = witnessesHere(), inc = stealShip(store, s, sh, t, seen); lodgeIncident(ctx, inc);
      ui.toast(`You overrode the ${esc(sh.name)}'s lockout. ${seen.length ? `<b>${seen} ${seen === 1 ? 'person' : 'people'} saw you.</b>` : 'Nobody saw you.'}`, 'bad', 8000);
    }
    takeOff(shipsIn(store, planet, s, clock.now()).find(x => x.id === sh.id));
  }
  function takeOff(sh) {
    const b = placed.get(sh.id); if (b) { world.removeStructure(b); placed.delete(sh.id); }
    const { c, facing } = centreOf(s, sh);
    launch(store, sh); setRamp(store, sh, false);
    ships = shipsIn(store, planet, s, clock.now());
    flight = new Flight(world, planet, shipById(sh.id), c, facing);
    ctrl.mode = 'pilot'; camDist = cam.dist; cam.dist = Math.max(22, flight.L.D * 1.6); cam.pitch = 0.25;
    joinWar();

  }
  function setDown() {
    const why = flight.landingProblem();
    if (why) { ui.toast(`Can't land: ${why}.`, 'warn', 2500); return; }
    const sh = flight.ship;
    land(store, sh, flight.pos, flight.facing); setRamp(store, sh, false);
    leaveWar(); flight = null; cam.dist = camDist; syncShips();
    const b = placed.get(sh.id), a = b.plan.anchors.find(x => x.kind === 'pilot');
    ctrl.mode = 'walk'; ctrl.seatAt(buildingToWorld(s, b, a.x, a.y, a.z), toWorldDir(b, a.facing), 'sit', buildingToWorld(s, b, a.x, b.plan.layout.deck, a.z - 0.8));
   
  }
  if (player.piloting) { // you were flying when you left: you're still at the helm
    const sh = shipById(player.piloting);
    if (sh?.flying && sh.at) { const b = placed.get(sh.id); if (b) { world.removeStructure(b); placed.delete(sh.id); } flight = new Flight(world, planet, sh, sh.at.c, sh.at.facing); flight.onGround = false; ctrl.mode = 'pilot'; cam.dist = 30; joinWar(); }
  }

  // ---- people: the one in front of you, and talking to them (sim/processes/talk.js)
  const personAhead = () => {
    let best = null, bd = 2.6;
    for (const a of agents) {
      if (String(a.id).startsWith('tr:')) continue;
      const dx = a.pos[0] - ctrl.pos[0], dz = a.pos[2] - ctrl.pos[2], d = Math.hypot(dx, dz);
      if (d < bd && Math.abs(a.pos[1] - ctrl.pos[1]) < 1.5 && (dx * Math.sin(ctrl.facing) + dz * Math.cos(ctrl.facing)) / (d || 1) > 0.2) { bd = d; best = a; }
    }
    return best;
  };
  const nameFor = p => known(store, p.id) || relation(p.id) ? p.name : p.age < 16 ? 'a child' : p.age > 64 ? 'an older ' + (hashStr(2, p.id) % 2 ? 'man' : 'woman') : 'a stranger';
  async function talkFlow(a) {
    const p = a.person;
    if (a.pose === 'lie') { ui.toast(`${esc(nameFor(p))} is asleep.`); return; }
    const said = []; let n = 0;
    const say = (who, line) => said.push(`<p><b>${esc(who)}:</b> ${esc(line)}</p>`);
    await modal(async () => {
      for (;;) {
        const t = clock.now(), met = known(store, p.id) || !!relation(p.id);
        const opts = [];
        if (!met) opts.push({ a: 'intro', label: 'Introduce yourself' });
        opts.push({ a: 'work', label: 'Ask what they do' }, { a: 'home', label: 'Ask where they live' }, { a: 'family', label: 'Ask about their family' },
          { a: 'chat', label: 'Make small talk' }, { a: 'way', label: 'Ask for directions' });
        const r = await ui.choose({ title: met ? p.name : nameFor(p)[0].toUpperCase() + nameFor(p).slice(1), sub: `${p.age} · ${esc(a.activity)}${relation(p.id) ? ' · ' + relation(p.id) : ''}${said.length ? '<div class="talk">' + said.slice(-6).join('') + '</div>' : ''}`, options: opts });
        if (r.a === 'close') break;
        const reticent = !met && r.a !== 'intro' && r.a !== 'chat' && r.a !== 'way';
        if (r.a === 'intro') { introduce(store, p, t); say('You', `I'm ${player.given || player.name.split(' ')[0]}.`); say(p.given, `${p.given}. ${p.given === player.given ? 'Same as you!' : 'Nice to meet you.'}`); continue; }
        if (reticent) { say(p.given || 'They', "Sorry — do I know you?"); continue; }
        talked(store, p);
        if (r.a === 'work') say(p.given, workLine(pop, p));
        if (r.a === 'home') say(p.given, homeLine(pop, p));
        if (r.a === 'family') say(p.given, familyLine(pop, p));
        if (r.a === 'chat') say(met ? p.given : 'They', smallTalk(pop, store, p, t, weatherAt(planet, t), a.activity, n++));
        if (r.a === 'way') {
          const dests = directionsFrom(pop, polity, player, p);
          const w = await ui.choose({ title: 'Directions', sub: 'Where to?', options: dests.map((d, i) => ({ a: 'go', v: String(i), label: d.label[0].toUpperCase() + d.label.slice(1), note: `${Math.round(Math.hypot(d.pos[0] - ctrl.pos[0], d.pos[2] - ctrl.pos[2]))} m` })) });
          if (w.a === 'go') { const d = dests[+w.v]; player.waypoint = { x: d.pos[0], y: d.pos[1], z: d.pos[2], label: d.label }; store.touchPlayer(); say(met ? p.given : 'They', 'That way — I\'ve pointed it out.'); }
        }
      }
    });
  }


  // ---- you can be hurt too: health heals over a day or so; at nothing you go down
  player.hp ??= 100;
  let lastShotAt = -1e9, hitUntil = -1e9; const landSafeAt = performance.now() + 4000;   // (not for falling into the world on loading)
  const fleeing = new Map();     // id → { pos, until }: bystanders running from gunfire
  function clearShot(a, b) { const n = 10; for (let i = 1; i < n; i++) { const f = i / n; if (world.solidAt(a[0] + (b[0] - a[0]) * f, a[1] + 1.3 + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, 0.05)) return false; } return true; }
  function showShot(from, to) {
    const g = tracer.geometry.attributes.position; g.setXYZ(0, ...toRender(...from)); g.setXYZ(1, ...toRender(...to)); g.needsUpdate = true; tracer.material.opacity = 0.9;
    flash.position.set(...toRender(...from)); flash.intensity = 25;
  }
  function scare(at, t) { for (const a of agents) { if (String(a.id).startsWith('tr:') || a.pose === 'lie') continue; if (Math.hypot(a.pos[0] - at[0], a.pos[2] - at[2]) < 40 && !fleeing.has(a.id)) fleeing.set(a.id, { pos: a.pos.slice(), until: t + 25 + Math.random() * 15 }); } }
  function hurtPlayer(dmg, by) {
    player.hp = Math.max(0, player.hp - dmg); store.touchPlayer();
    ui.toast(`You're hit${by ? ` — ${esc(by)}` : ''}. <small>${Math.round(player.hp)}% health</small>`, 'bad', 2500);
    if (player.hp > 0) return;
    const t = clock.now();
    if (pursuit && pursuit.state !== 'return') {          // shot down by the law: you wake in their cell
      const cell = arrest(ctx, t, { resisted: true, by: pursuit.person.name });
      player.inventory = inventoryOf(player).filter(x => ITEMS[x.id].cat !== 'weapon'); player.weapon = null;
      ctrl.pos = cell.pos.slice(); ctrl.vel = [0, 0, 0]; pursuit.end('caught', t); doorView.refresh(store, planet, t);
      ui.toast(`You go down. You wake up in the ${esc(polity.securityName)} cell, patched up, your weapons gone.`, 'bad', 12000);
    } else {                                              // anything else: you come round where you fell, an hour later
      clock.advance(planet.dayLength / 24); ui.toast('You go down. You come round an hour later, hurting.', 'bad', 9000);
    }
    player.hp = 35; player.fatigue = Math.min(1, player.fatigue + 0.4); store.touchPlayer();
  }
  // ---- violence (sim/processes/combat.js): what's in your hand, and what happens when you use it
  let lastAttack = -1e9;
  const bodies = [];                 // the dead, where they fell: { id, person, pos, facing, until }
  const downAt = new Map();          // someone knocked down stays where they fell: id → { pos, facing }
  const tracer = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0 }));
  tracer.frustumCulled = false; scene.add(tracer);
  const flash = new THREE.PointLight(0xffd090, 0, 9, 2); scene.add(flash);
  // ---- laying hands on the city (sim/mayhem.js)
  const knownName = p => p ? (known(store, p.id) ? p.name : nameFor(p)) : 'them';
  // the plan window at this point in a town or walk-in building's wall: bodies go through those
  function planWindowAt(x, y, z) {
    for (const b of world.near(x, z)) {
      if (b.type === 'ship') continue;
      const [lx, lz] = world.toB(b, x, z), { plan } = world.colliders(b), ly = y - world.baseOf(b);
      if (!world.inside(b, lx, lz, 0.6)) continue;
      for (const wl of plan.walls) {
        if (!wl.exterior) continue;
        const alongX = wl.z0 === wl.z1, c = alongX ? lz - wl.z0 : lx - wl.x0, a = alongX ? lx : lz;
        if (Math.abs(c) > 0.6) continue;
        for (const o of wl.openings) if (o.kind === 'window' && a >= o.a && a <= o.b && ly - wl.k * plan.H >= o.y0 - 0.3 && ly - wl.k * plan.H <= o.y1 + 0.3) return { b, k: wl.k, o };
      }
    }
    return null;
  }
  const mayhemHooks = {
    windowAt: (x, y, z) => planWindowAt(x, y, z),
    onGlass: (win, b2, t) => { ui.toast(`Glass goes everywhere — ${esc(b2.name || 'someone')} goes through the window.`, 'bad', 4000); mayhem.crime(t, 'threw someone through a window', 1.2, b2.pos); },
    onHit: (b2, v, t) => hurtBody(b2, v, t),
    onLand: (b2, v, t, sp) => hurtBody(b2, Math.max(v, sp * 0.7), t),
  };
  function hurtBody(b2, v, t) {
    if (v < 5) return;
    if (b2.person) {          // one of the town's people: this goes through the town's law
      const p = b2.person, W = v > 17 ? 'carbine' : v > 8 ? 'pistol' : 'fists', here = world.locate(...b2.pos), seen = residents.witnesses(t, b2.pos, here?.b?.key || null, here?.k ?? null).filter(w => w.id !== p.id);
      const res = strike(ctx, p, W, t, seen); if (res.incident) lodgeIncident(ctx, res.incident);
      ui.toast(res.killed ? `<b>${esc(p.name)}</b> is dead.` : `${esc(knownName(p))} hits hard. <small>${Math.round(res.hp)}% health</small>`, 'bad', 4000);
      if (res.killed) { bodies.push({ id: p.id, person: p, pos: b2.pos.slice(), facing: b2.facing, until: t + planet.dayLength / 24 }); b2.until = 0; }
    } else if (v > 16 && !b2.dead) { b2.dead = true; mayhem.crime(t, 'killed someone', 4, b2.pos); ui.toast(`${esc(b2.name || 'They')} didn't survive that.`, 'bad', 5000); }
  }
  function stepMayhem(dt) {
    const t = clock.now(); mayhem.stepBodies(dt, t, mayhemHooks);
    const c = mayhem.carry;
    if (c) { c.pos = [ctrl.pos[0] + Math.sin(ctrl.facing) * 0.75, ctrl.pos[1] + 0.25, ctrl.pos[2] + Math.cos(ctrl.facing) * 0.75]; }
    mayhem.stepOfficers(dt, t, ctrl, {
      armed: () => (player.weapon && inventoryOf(player).some(x => x.id === player.weapon)) || t - lastShotAt < 30,
      watchHere: () => { let w = null; sitesNear(planet, ctrl.pos[0], ctrl.pos[2], 200, S => { if (!w && S.items.some(i => /^gb_(cottage|tenement|inn)_/.test(i.k)) && Math.hypot(S.x - ctrl.pos[0], S.z - ctrl.pos[2]) < S.clear + 60) w = S; }); return w; },
      onCop: (n, local) => { if (n === 1) ui.toast(local ? `<b>The watch from ${esc(local.label)}</b> is coming for you.` : `<b>${esc(cityView.city.name)} Security</b> is coming for you.`, 'bad', 7000); },
      shoot: (o, d) => { const hit = Math.random() < Math.max(0.12, Math.min(0.8, 1 - d / 40)) * (ctrl.speed > 3 ? 0.6 : 1); showShot([o.pos[0], o.pos[1] + 1.4, o.pos[2]], [ctrl.pos[0] + (hit ? 0 : (Math.random() - 0.5) * 3), ctrl.pos[1] + 1.2, ctrl.pos[2] + (hit ? 0 : (Math.random() - 0.5) * 3)]); if (hit) { hurtPlayer(14 + Math.random() * 8, 'a Security officer'); if (player.hp <= 36 && mayhem.officers.length) cityArrest(); } },
      caught: (o, local) => local ? watchArrest(local) : cityArrest(),
    });
  }
  // Caught by a village's watch: no cells out here. They take your weapons and what you owe, and let you know you're not welcome.
  function watchArrest(S) {
    const t = clock.now(), h = mayhem.heat(t), fine = Math.round(40 + h * 60); mayhem.officers = []; player.heat = null; player.credits = (player.credits ?? 0) - fine;
    player.inventory = inventoryOf(player).filter(x => ITEMS[x.id].cat !== 'weapon'); player.weapon = null; store.touchPlayer();
    store.log({ t, type: 'watch_arrest', fine, by: player.id, byName: player.name, site: S.label });
    ui.toast(`<b>The watch</b> has you. They take your weapons and <b>${fine} cr</b> for the damage, and tell you to clear out of ${esc(S.label)}.`, 'bad', 11000);
  }
  // Caught by the city's law: a night in their cells, the fines out of your account, your weapons gone.
  function cityArrest() {
    const t = clock.now(), h = mayhem.heat(t), fine = Math.round(150 + h * 180); mayhem.officers = []; player.heat = null; player.credits = (player.credits ?? 0) - fine;
    player.inventory = inventoryOf(player).filter(x => ITEMS[x.id].cat !== 'weapon'); player.weapon = null; player.hp = Math.max(player.hp, 40); store.touchPlayer();
    store.log({ t, type: 'city_arrest', fine, by: player.id, byName: player.name, city: cityView.city.name });
    clock.advance(planet.dayLength / 6); ctrl.vel = [0, 0, 0];
    ui.toast(`<b>${esc(cityView.city.name)} Security</b> has you. Four hours in their cells, <b>${fine} cr</b> in fines, your weapons gone.`, 'bad', 12000);
  }
  // Grab whoever's in front of you, or throw whoever you're holding.
  function grabOrThrow() {
    if (paused || ctrl.mode !== 'walk' || ride || flight || !mayhem) return;
    const t = clock.now(), fx = Math.sin(ctrl.facing), fz = Math.cos(ctrl.facing), c = mayhem.carry;
    if (c) {     // up and out: harder the fitter you are, harder still with a run-up
      const sp = 7.5 + (player.fitness ?? 0.5) * 3 + ctrl.speed * 0.8;
      mayhem.carry = null; mayhem.thrown({ ...c, vel: [fx * sp, 2.6, fz * sp], facing: ctrl.facing }); mayhem.crime(t, 'threw someone', 0.8, c.pos);
      ui.toast(`You throw ${esc(c.name || 'them')}.`, 'bad', 2500); return;
    }
    let best = null, bd = 1.9;
    const near = list => { for (const a of list) { const dx = a.pos[0] - ctrl.pos[0], dz = a.pos[2] - ctrl.pos[2], d = Math.hypot(dx, dz); if (d < bd && Math.abs(a.pos[1] - ctrl.pos[1]) < 1.3 && (dx * fx + dz * fz) / (d || 1) > 0.3) { bd = d; best = a; } } };
    near(agents.filter(a => !String(a.id).startsWith('tr:') && a.pose !== 'lie')); near(peopleNear(t, ctrl.pos[0], ctrl.pos[2], 6, 30).filter(w => !mayhem.out.has(w.id)));
    if (!best) return;
    const person = best.person || null, id = best.id; if (!person) mayhem.out.add(id);
    mayhem.carry = { id, person, name: person ? knownName(person) : 'a passer-by', pos: best.pos.slice(), age: best.age || person?.age || 30 };
    ui.toast(`You've got ${esc(mayhem.carry.name)}.`, 'warn', 3500);
    mayhem.crime(t, 'grabbed someone', 0.4, best.pos);
  }
  function attack() {
    if (paused || ctrl.mode !== 'walk' || ride || flight) return;
    const id = player.weapon && inventoryOf(player).some(x => x.id === player.weapon) ? player.weapon : 'fists', W = WEAPONS[id];
    const now = performance.now() / 1000; if (now - lastAttack < W.every) return; lastAttack = now;
    const t = clock.now(); if (W.ranged) { lastShotAt = t; scare(ctrl.pos, t); }
    let target = null, hitPoint = null;
    if (!W.ranged) {
      let bd = W.reach + 0.4;
      for (const a of agents) {
        if (String(a.id).startsWith('tr:') || bodies.some(b => b.id === a.id)) continue;
        const dx = a.pos[0] - ctrl.pos[0], dz = a.pos[2] - ctrl.pos[2], d = Math.hypot(dx, dz);
        if (d < bd && Math.abs(a.pos[1] - ctrl.pos[1]) < 1.4 && (dx * Math.sin(ctrl.facing) + dz * Math.cos(ctrl.facing)) / (d || 1) > 0.5) { bd = d; target = a; }
      }
      avatar.punch?.();
    } else {
      // a shot along the line of sight (camera centre), with a little spread; walls stop it
      const o = camera.position.clone(), dir = new THREE.Vector3(); camera.getWorldDirection(dir);
      dir.x += (Math.random() - 0.5) * W.spread * 2; dir.y += (Math.random() - 0.5) * W.spread * 2; dir.normalize();
      const wo = [o.x + origin[0], o.y, o.z + origin[2]];
      let wall = W.reach;
      for (let d = 1.5; d < W.reach; d += 0.4) if (world.solidAt(wo[0] + dir.x * d, wo[1] + dir.y * d, wo[2] + dir.z * d, 0.02)) { wall = d; break; }
      let best = wall;
      for (const a of agents) {
        if (String(a.id).startsWith('tr:') || bodies.some(b => b.id === a.id)) continue;
        const lying = a.pose === 'lie' || isDown(store, a.id, t);
        for (const hy of lying ? [0.2] : [0.5, 1.0, 1.45]) {          // body points: legs, chest, head
          const px = a.pos[0] - wo[0], py = a.pos[1] + hy - wo[1], pz = a.pos[2] - wo[2], along = px * dir.x + py * dir.y + pz * dir.z;
          if (along < 0.5 || along > best) continue;
          const off = Math.hypot(px - dir.x * along, py - dir.y * along, pz - dir.z * along);
          if (off < (lying ? 0.45 : 0.3)) { best = along; target = a; }
        }
      }
      hitPoint = [wo[0] + dir.x * best, wo[1] + dir.y * best, wo[2] + dir.z * best];
      const g = tracer.geometry.attributes.position, hp = toRender(...hitPoint), hand = toRender(ctrl.pos[0] + Math.sin(ctrl.facing) * 0.5, ctrl.pos[1] + 1.35, ctrl.pos[2] + Math.cos(ctrl.facing) * 0.5);
      g.setXYZ(0, ...hand); g.setXYZ(1, ...hp); g.needsUpdate = true; tracer.material.opacity = 0.9;
      flash.position.set(...hand); flash.intensity = 25;
    }
    if (!target) {       // no one there: a passer-by in the city, a window, whatever's in the way
      const fx = Math.sin(ctrl.facing), fz = Math.cos(ctrl.facing), at = hitPoint || [ctrl.pos[0] + fx * (W.reach + 0.3), ctrl.pos[1] + 1.2, ctrl.pos[2] + fz * (W.reach + 0.3)];
      if (mayhem) {
        const near = peopleNear(t, at[0], at[2], 3, 12).filter(w => !mayhem.out.has(w.id) && Math.hypot(w.pos[0] - at[0], w.pos[2] - at[2]) < (W.ranged ? 0.6 : 1.1) && Math.abs(w.pos[1] + 1 - at[1]) < 1.4)[0];
        if (near) { mayhem.out.add(near.id); mayhem.thrown({ id: near.id, name: 'A passer-by', pos: near.pos.slice(), vel: [fx * (W.dmg > 30 ? 2 : 3), 1.5, fz * (W.dmg > 30 ? 2 : 3)], age: near.age, facing: near.facing, dead: W.dmg > 30 }); const n = mayhem.crime(t, W.dmg > 30 ? 'shot someone' : 'assault', W.dmg > 30 ? 3.5 : 0.8, at); ui.toast(`You hit a passer-by${W.dmg > 30 ? ' — they drop' : ''}.${n ? ` <b>${n} saw.</b>` : ''}`, 'bad', 3500); return; }
        if (mayhem.breakGlass(at, fx, fz, t)) { ui.toast('The window shatters.', 'bad', 2500); return; }
        const k = mayhem.smash(at, t); if (k) { cityView.propAt = null; ui.toast(`You smash it to pieces.`, 'warn', 2500); return; }
      }
      return;
    }
    const p = target.person, here = world.locate(...ctrl.pos);
    const seen = residents.witnesses(t, ctrl.pos, here?.b?.key || null, here?.k ?? null).filter(w => w.id !== p.id && !bodies.some(b => b.id === w.id));
    if (!downAt.has(p.id)) downAt.set(p.id, { pos: target.pos.slice(), facing: target.facing });
    const res = strike(ctx, p, id, t, seen);
    if (res.incident) lodgeIncident(ctx, res.incident);
    const cop = seen.find(w => isOfficer(pop.byId.get(w.id)));
    if (cop && !pursuit) startPursuit(pop.byId.get(cop.id), res.killed ? `you killed ${p.name}` : `you attacked ${p.name}`);
    if (res.killed) { bodies.push({ id: p.id, person: p, pos: downAt.get(p.id).pos, facing: downAt.get(p.id).facing, until: t + planet.dayLength / 24 }); downAt.delete(p.id);
      ui.toast(`<b>${esc(p.name)}</b> is dead.${seen.length ? ` <b>${seen.length} saw it.</b>` : ''}`, 'bad', 8000); }
    else ui.toast(`You hit ${esc(known(store, p.id) ? p.name : nameFor(p))}${res.down ? ' — they go down' : ''}. <small>${Math.round(res.hp)}% health</small>`, 'bad', 2500);
  }

  // ---- air combat (sim/aircombat.js): your ship in the fight, raids, and Civic Security's fighters
  const war = new AirWar(world, planet), combatView = new CombatView(scene);
  let myCraft = null, raid = null, firing = false;
  function joinWar() { leaveWar(); myCraft = war.spawn(flight.ship.model, 'player', flight.pos, flight.facing, 0, 'player', flight); }
  function leaveWar() { if (myCraft) war.craft = war.craft.filter(c => c !== myCraft); myCraft = null; }
  renderer.domElement.addEventListener('mousedown', e => { if (e.button === 0 && flight && document.pointerLockElement) firing = true; });
  addEventListener('mouseup', () => { firing = false; });
  // Somewhere open to come down near (x, z) from height y: the ground (or a roof, a deck) with
  // nothing solid where you'd stand — searching outward in rings.
  function clearLanding(x, y, z) {
    for (const r of [0, 15, 30, 50, 80, 120]) for (let k = 0; k < (r ? 10 : 1); k++) {
      const a = k / 10 * Math.PI * 2, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r, h = Math.max(world.groundAt(px, pz, y).h, planet.seaLevel);
      if (!world.solidAt(px, h + 0.9, pz, 0.4) && !world.solidAt(px, h + 1.6, pz, 0.4)) return [px, h, pz];
    }
    return [x, Math.max(surfaceHeight(planet, x, z), planet.seaLevel), z];
  }
  function eject() {     // your ship is gone: out you go, down on a parachute
    const sh = flight.ship, at = flight.pos.slice();
    store.patchDelta(shipKey(sh.id), { destroyed: true, flying: undefined, at: { c: at, facing: flight.facing } });
    store.log({ t: clock.now(), type: 'ship_lost', who: player.id, whoName: player.name, ship: sh.name });
    leaveWar(); flight = null; cam.dist = camDist; ctrl.mode = 'walk';
    ctrl.pos = clearLanding(at[0] + 20, at[1], at[2] + 20); ctrl.vel = [0, 0, 0];
    player.fatigue = Math.min(1, player.fatigue + 0.35); store.touchPlayer(); syncShips();
    ui.toast(`The ${esc(sh.name)} is going down — you <b>eject</b> and come down on a parachute.`, 'bad', 9000);
  }
  // raids: every few hours raiders come in over the hills; security scrambles
  function raidTick(t) {
    const k = raidIndex(planet, t), R = raidAt(planet, s, k);
    if (!raid && t >= R.t && t < R.t + 200 && !store.getDelta('raid/' + k)) {
      const dist = 7000, bx = Math.sin(R.bearing), bz = Math.cos(R.bearing), C = cityView.city;
      // where you are decides what they hit: the megacity (its sky lanes and tower tops), or the town
      const inCity = Math.hypot(ctrl.pos[0] - C.cx, ctrl.pos[2] - C.cz) < C.R + 2500;
      const tgt = inCity ? [ctrl.pos[0] * 0.6 + C.cx * 0.4, C.h + 260, ctrl.pos[2] * 0.6 + C.cz * 0.4] : [s.cx, s.h, s.cz], n = inCity ? R.n + 2 : R.n, nd = inCity ? R.defenders + 2 : R.defenders;
      raid = { k, t0: t, raiders: [], defenders: [], city: inCity };
      for (let i = 0; i < n; i++) raid.raiders.push(Object.assign(war.spawn(R.models[i % R.models.length], 'raider', [tgt[0] + bx * dist + (i - n / 2) * 140, Math.max(tgt[1], s.h) + 1300 + i * 90, tgt[2] + bz * dist + i * 60], R.bearing + Math.PI, 170), { groundTarget: tgt }));
      const hq = pop.buildingByKey.get(polity.security), at = inCity ? [tgt[0] - bx * 1500, C.h + 400, tgt[2] - bz * 1500] : hq ? buildingToWorld(s, hq, hq.w / 2, 0, hq.d / 2) : [s.cx, s.h, s.cz];
      for (let i = 0; i < nd; i++) raid.defenders.push(war.spawn(R.defModels[i % R.defModels.length], 'security', [at[0] + i * 60, (inCity ? at[1] : s.h + 260) + i * 40, at[2] - 80], R.bearing, inCity ? 170 : 140));
      const dir = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((-R.bearing + Math.PI * 2.5) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
      ui.toast(`<b>Raiders inbound</b> — ${n} fighters from the ${dir}${inCity ? `, making for ${esc(C.name)}` : ''}. ${inCity ? `${esc(C.name)} Defence` : esc(polity.securityName)} is scrambling ${nd}.`, 'bad', 10000);
    }
    if (raid && (raid.raiders.every(c => !c.alive) || t - raid.t0 > 300)) {
      const downed = raid.raiders.filter(c => !c.alive).length, lost = raid.defenders.filter(c => !c.alive).length;
      store.patchDelta('raid/' + raid.k, { done: true, downed, lost });
      store.log({ t, type: 'raid', downed, n: raid.raiders.length, lost, authority: polity.securityName, settlementName: s.name });
      ui.toast(downed === raid.raiders.length ? `The raid is over: all ${downed} raiders shot down${lost ? `, ${lost} of ours lost` : ''}.` : `The raiders pull back — ${downed} of ${raid.raiders.length} shot down${lost ? `, ${lost} of ours lost` : ''}.`, '', 8000);
      for (const c of raid.raiders.concat(raid.defenders)) if (c.alive) war.craft = war.craft.filter(x => x !== c);
      raid = null;
    }
  }
  sched.add(TIER.NEAR, { update: () => raidTick(clock.now()) });
  // markers over every combatant you can see: who, how far, locked
  const markers = document.createElement('div'); markers.className = 'markers'; document.getElementById('ui').append(markers);
  function drawMarkers() {
    markers.innerHTML = '';
    if (!war.craft.some(c => c.alive && c.side !== 'player')) return;
    const v = new THREE.Vector3();
    for (const c of war.craft) {
      if (!c.alive || c === myCraft) continue;
      const d = Math.hypot(c.f.pos[0] - ctrl.pos[0], c.f.pos[1] - ctrl.pos[1], c.f.pos[2] - ctrl.pos[2]); if (d > 9000) continue;
      v.set(...toRender(...c.f.pos)).project(camera); if (v.z > 1) continue;
      const el = document.createElement('div'), foe = c.side === 'raider', locked = myCraft?.lock === c;
      el.className = 'mk ' + (foe ? 'foe' : 'friend') + (locked ? (myCraft.lockT > 1.2 ? ' locked' : ' locking') : '');
      el.style.left = ((v.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - v.y) / 2 * innerHeight) + 'px';
      el.innerHTML = `<i></i><span>${foe ? 'raider' : 'security'} · ${c.name} · ${d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km'}${locked && myCraft.lockT > 1.2 ? ' · LOCK' : ''}</span>`;
      markers.append(el);
    }
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
    ui.toast(`You are <b>${player.name}</b>, ${player.age}, born in ${s.name} on ${planet.name}. ${player.withParents ? 'You still live with' : 'You live alone; your'} ${par.length ? (player.withParents ? '' : 'parent' + (par.length > 1 ? 's' : '') + ' ') + par.map(x => x.given).join(' and ') : 'family'}${player.withParents ? '' : ' live across town'}. Your home is behind you.`, '', 11000);
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
        run: keys.has('ShiftLeft') || keys.has('ShiftRight'), jump: jumpQueued, yaw: cam.yaw, tired: player.fatigue > 0.92, exhausted: player.fatigue > 0.985, drop: keys.has('KeyQ'),
      };
      jumpQueued = false;
      if (flight) {
        // the stick: mouse moves it, it springs back to centre; arrow keys too (Up = nose down, like a stick)
        stick[0] *= Math.exp(-dt * 2.5); stick[1] *= Math.exp(-dt * 2.5);
        const kp = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0), kr = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
        flight.step(dt, { throttle: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0), pitch: Math.max(-1, Math.min(1, stick[1] + kp)), roll: Math.max(-1, Math.min(1, stick[0] + kr)),
          yaw: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), up: keys.has('Space'), down: keys.has('KeyQ'), boost: input.run, brake: keys.has('KeyB'), wind: weatherAt(planet, t).wind });
        ctrl.pos = [flight.pos[0], flight.pos[1] + 2.4, flight.pos[2]]; ctrl.facing = flight.facing; ctrl.speed = 0;
        if (flight.impact > 15) { player.fatigue = Math.min(1, player.fatigue + 0.1); ui.toast(`Impact at ${Math.round(flight.impact * 3.6)} km/h.`, 'bad', 3000); }
        if (myCraft && firing) war.fireGuns(myCraft, dt);
        // chase camera: behind and a little above, following the heading and part of the pitch
        cam.yaw += Math.atan2(Math.sin(flight.facing - cam.yaw), Math.cos(flight.facing - cam.yaw)) * Math.min(1, dt * 3);
        cam.pitch += (0.18 - flight.pitch * 0.6 - cam.pitch) * Math.min(1, dt * 3);
      } else if (ride) {
        for (let sub = 0, n = Math.ceil(dt / (1 / 120)); sub < n; sub++) ride.step(dt / n, { fwd: input.fwd, right: input.right, boost: input.run, up: keys.has('Space'), down: keys.has('KeyQ') });
        ctrl.pos = ride.pos.slice(); ctrl.facing = ride.facing; ctrl.speed = Math.abs(ride.speed);
        if (ride.impact > 12) { player.fatigue = Math.min(1, player.fatigue + 0.08); ui.toast(`You hit something at ${Math.round(ride.impact * 3.6)} km/h.`, 'bad', 3000); }
        cam.yaw += Math.atan2(Math.sin(ride.facing - cam.yaw), Math.cos(ride.facing - cam.yaw)) * Math.min(1, dt * (ride.speed > 2 ? 2.5 : 0));   // the camera swings in behind
      } else {
        for (let sub = 0, n = Math.ceil(dt / (1 / 120)); sub < n; sub++) ctrl.step(dt / n, input, moveSpeedFactor(player));
        const hard = mayhem?.afterStep(t, dt, ctrl);
        if (hard > 9) hurtPlayer(Math.min(120, (hard - 8.5) ** 2 * 0.9), 'a hard landing');
      }
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
      } else if (keys.has('KeyF') && siteRooms?.doorNear(ctrl.pos)) {       // the lock on a country door: there's nobody to stop you but whoever's watching
        const { b, door } = siteRooms.doorNear(ctrl.pos), st = doorState(store, planet, b, door, t);
        if (st.locked && !st.broken) {
          forceHold += dt;
          ui.showPrompt(`Forcing the lock… <i class="meter"><b style="width:${Math.min(100, forceHold / 1.8 * 100)}%"></b></i>`);
          if (forceHold > 1.8) { forceHold = 0; forceDoor(store, sched, planet, s, b, door, t, player, []); const seen = mayhem.crime(t, 'breaking in', 0.5, ctrl.pos); ui.toast(`You broke the lock. ${seen ? `<b>${seen} ${seen === 1 ? 'person' : 'people'} saw you.</b>` : 'Nobody saw you.'}`, 'bad', 7000); }
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
      const fx = Math.sin(ride.facing), fz = Math.cos(ride.facing), back = ride.T.seat[0], rx = ride.T.kind === 'bike' ? 0 : -Math.cos(ride.facing) * ride.T.W * 0.22;   // (in a car: the driver's seat, a little to one side)
      avatar.object.position.set(rp[0] + fx * back + rx, rp[1] + ride.T.seat[1] - 0.5 + Math.sin(ride.pitch) * back, rp[2] + fz * back + (ride.T.kind === 'bike' ? 0 : Math.sin(ride.facing) * ride.T.W * 0.22));
      avatar.object.rotation.set(0, ride.facing, 0);
    }
    avatar.setHeld?.(player.weapon && inventoryOf(player).some(x => x.id === player.weapon) && !ride && !flight && ctrl.mode !== 'seat' ? player.weapon : null);
    avatar.update(dt, ride ? 0 : ctrl.speed, ctrl.grounded, ride ? null : climbPose, ride ? 'sit' : ctrl.mode === 'seat' ? ctrl.seat.pose : ctrl.stun > 0 && ctrl.grounded ? 'lie' : null);
    avatar.object.visible = !flight;
    if (ctrl.mode === 'wall') avatar.climb(ctrl.wall.pose(), toRender);
    holdsView.update(ctrl.mode === 'wall' ? ctrl.wall : null, toRender);
    // a hard landing: you feel it from about 4 m, and a long fall can put you down
    if (ctrl.landed > 9 && performance.now() > landSafeAt) { const v = ctrl.landed; hurtPlayer(Math.min(120, (v - 8.5) ** 2 * 0.9), v > 22 ? 'a long fall' : 'a hard landing'); ctrl.stun = Math.max(ctrl.stun || 0, Math.min(2.2, (v - 8) * 0.12)); ctrl.landed = 0; }
    if (ctrl.slipped) { ctrl.slipped = false; ui.toast('Your grip goes.', 'bad', 3000); }
    shipView.update(ships.map(sh => {
      if (flight && flight.ship.id === sh.id) return { id: sh.id, model: sh.model, c: toRender(...flight.pos), facing: flight.facing, pitch: flight.pitch, roll: flight.roll, colour: sh.colour, rampDown: false };
      if (sh.flying) return null;
      if (onRun(sh)) {   // on a cargo run: drawn along its path, recomputed every frame so it moves smoothly
        const tr = tripOf(planet, sh, t, centreOf(s, sh), sh.skip);
        return tr.c ? { id: sh.id, model: sh.model, c: toRender(...tr.c), facing: tr.facing, pitch: tr.pitch, colour: sh.colour, rampDown: false } : null;
      }
      const { c, facing } = centreOf(s, sh);
      return Math.abs(c[0] - ctrl.pos[0]) < 3000 && Math.abs(c[2] - ctrl.pos[2]) < 3000 ? { id: sh.id, model: sh.model, c: toRender(...c), facing, colour: sh.colour, rampDown: rampDown(sh, planet, t, player) } : null;
    }).filter(Boolean).concat(airTraffic(planet, s, t, ctrl.pos[0], ctrl.pos[2]).map(a => ({ ...a, c: toRender(...a.c) })))
      .concat(war.craft.filter(c => c !== myCraft).map(c => ({ id: 'war' + c.id, model: c.model, c: toRender(c.f.pos[0], c.f.pos[1], c.f.pos[2]), facing: c.f.facing, pitch: c.f.pitch, roll: c.f.roll, colour: c.side === 'raider' ? 0 : 4, rampDown: false }))), dt);
    const traffic = trafficNear(planet, s, t, ctrl.pos[0], ctrl.pos[2], 1400, cityTraffic.life.delayOf);
    vehView.update(traffic.map(v => ({ ...v, pos: toRender(...v.pos) })).concat(vehicles.filter(v => (!ride || v.id !== ride.v.id) && Math.abs(v.pos[0] - ctrl.pos[0]) < 400 && Math.abs(v.pos[2] - ctrl.pos[2]) < 400).map(v => ({ ...v, pos: toRender(...v.pos) }))
      .concat(ride ? [{ type: ride.v.type, pos: toRender(...ride.pos), facing: ride.facing, pitch: ride.pitch, roll: ride.roll, colour: ride.v.colour }] : [])));
    avatar.setOpacity?.(Math.min(1, Math.max(0, (cam.cur - 0.6) / 0.9)));
    // residents (ACTIVE tier): positions are a pure function of time
    agents = residents.agents(t, dt, ctrl.pos, world);
    for (const a of agents) {           // knocked down: lying where they fell until they get up
      const dn = isDown(store, a.id, t) && downAt.get(a.id);
      if (dn) { a.pos = dn.pos.slice(); a.facing = dn.facing; a.pose = 'lie'; a.moving = false; a.activity = 'hurt, on the ground'; }
      else if (downAt.has(a.id) && !isDown(store, a.id, t)) downAt.delete(a.id);
    }
    for (const a of agents) {          // bystanders running from gunfire: away from you, then back to their day
      const fl = fleeing.get(a.id); if (!fl) continue;
      if (fl.until < t || a.pose === 'lie') { fleeing.delete(a.id); continue; }
      const dx = fl.pos[0] - ctrl.pos[0], dz = fl.pos[2] - ctrl.pos[2], d = Math.hypot(dx, dz) || 1;
      const [nx, nz] = world.resolve(fl.pos[0] + dx / d * 4.2 * dt, fl.pos[2] + dz / d * 4.2 * dt, fl.pos[1]);
      fl.pos = [nx, world.groundAt(nx, nz, fl.pos[1] + 0.5).h, nz];
      Object.assign(a, { pos: fl.pos.slice(), facing: Math.atan2(dx, dz), moving: true, pose: 'walk', activity: 'running from gunfire' });
    }
    if (!flight && !paused) for (const r of war.rounds) {      // a raider's strafing run can find you on foot
      if (r.from.side !== 'raider' || Math.abs(r.p[0] - ctrl.pos[0]) > 3 || Math.abs(r.p[2] - ctrl.pos[2]) > 3 || Math.abs(r.p[1] - ctrl.pos[1] - 1) > 2.5) continue;
      r.life = 0; hurtPlayer(10, 'raider fire'); scare(ctrl.pos, t); break;
    }
    for (let i = bodies.length - 1; i >= 0; i--) if (bodies[i].until < t) bodies.splice(i, 1);
    agents = agents.filter(a => !bodies.some(b => b.id === a.id) && !mayhem?.holds(a.id)).concat(bodies.map(b => ({ id: b.id, person: b.person, age: b.person.age, pos: b.pos.slice(), facing: b.facing, pose: 'lie', moving: false, activity: 'dead' })));
    tracer.material.opacity = Math.max(0, tracer.material.opacity - dt * 9); flash.intensity = Math.max(0, flash.intensity - dt * 400);
    if (pursuit) {
      const ev = paused ? null : pursuit.update(t, dt, { pos: ctrl.pos, speed: ctrl.speed }, world, s);
      if (ev === 'chase') ui.toast(`You ran. <b>${pursuit.person.name}</b> is chasing you.`, 'bad', 6000);
      // armed and dangerous: the officer draws and shoots (not you running unarmed)
      const armedPlayer = (player.weapon && inventoryOf(player).some(x => x.id === player.weapon)) || t - lastShotAt < 30;
      if (pursuit.state !== 'return' && armedPlayer && !paused) {
        if (isDown(store, pursuit.person.id, t) || bodies.some(b => b.id === pursuit.person.id)) { pursuit.end('lost', t); ui.toast(`<b>${pursuit.person.name}</b> is down.`, 'bad', 4000); }
        else {
          if (!pursuit.drawn) { pursuit.drawn = true; ui.toast(`<b>${pursuit.person.name}</b> draws a pistol.`, 'bad', 4000); }
          pursuit.shotIn = (pursuit.shotIn ?? 1.2) - dt;
          const d = Math.hypot(ctrl.pos[0] - pursuit.pos[0], ctrl.pos[2] - pursuit.pos[2]);
          if (pursuit.shotIn <= 0 && d < 40 && clearShot(pursuit.pos, ctrl.pos)) {
            pursuit.shotIn = 0.8 + Math.random() * 0.6;
            const hit = Math.random() < Math.max(0.12, Math.min(0.85, 1 - d / 45)) * (ctrl.speed > 3 ? 0.6 : 1);
            showShot([pursuit.pos[0], pursuit.pos[1] + 1.4, pursuit.pos[2]], [ctrl.pos[0] + (hit ? 0 : (Math.random() - 0.5) * 3), ctrl.pos[1] + 1.2, ctrl.pos[2] + (hit ? 0 : (Math.random() - 0.5) * 3)]);
            if (hit) hurtPlayer(14 + Math.random() * 8, pursuit.person.name);
          }
        }
      }
      if (ev === 'caught') {
        const cell = arrest(ctx, t, { resisted: pursuit.resisted, by: pursuit.person.name });
        const taken = inventoryOf(player).filter(x => ITEMS[x.id].cat === 'weapon');      // weapons are taken off you
        if (taken.length) { player.inventory = inventoryOf(player).filter(x => ITEMS[x.id].cat !== 'weapon'); player.weapon = null; store.touchPlayer(); ui.toast(`They took your ${taken.map(x => ITEMS[x.id].name.toLowerCase()).join(', ')}.`, 'bad', 6000); }
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
    if (!paused && !flight && t > hitUntil && (ride || ctrl.mode === 'walk')) {       // traffic doesn't stop for you
      const me = ride ? ride.pos : ctrl.pos, near = traffic.filter(v => Math.abs(v.pos[0] - me[0]) < 12 && Math.abs(v.pos[2] - me[2]) < 12);
      for (const v of cityTraffic.nearby) if (!v.parked && !v.ship && v.car !== mayhem?.rider?.car && Math.abs(v.pos[0] - me[0]) < 12 && Math.abs(v.pos[2] - me[2]) < 12) near.push(v);
      const v = near.find(q => struckBy(q, me[0], me[1], me[2], ride ? 0.7 : 0.32) && (q.id.startsWith('tr:') ? q.speed * cityTraffic.life.rateOf(q.id) : q.speed) > 1.5);
      if (v) {
        hitUntil = t + 2;
        const vs = v.id.startsWith('tr:') ? v.speed * cityTraffic.life.rateOf(v.id) : v.speed;      // (what it's still doing after braking)
        const T = typeOf(v), fx = Math.sin(v.facing), fz = Math.cos(v.facing), dx = me[0] - v.pos[0], dz = me[2] - v.pos[2], side = dx * fz - dz * fx >= 0 ? 1 : -1;
        const hit = ride ? Math.hypot(Math.sin(ride.facing) * ride.speed - fx * vs, Math.cos(ride.facing) * ride.speed - fz * vs) : vs;
        if (ride) { ride.speed *= 0.2; hurtPlayer(Math.min(90, hit * 2), `a ${T.name.toLowerCase()} hit you`); }
        else {
          ctrl.knock(fx * hit * 0.75 + fz * side * 2, fz * hit * 0.75 - fx * side * 2, 2.5 + hit * 0.18, 1.2 + hit * 0.06);
          hurtPlayer(Math.min(95, hit * hit * 0.22 * (T.L > 5.5 ? 1.5 : 1) + 6), `a ${T.name.toLowerCase()} hit you`);
          scare(me, t);
        }
      }
    }
    const riders = trafficNear(planet, s, t, ctrl.pos[0], ctrl.pos[2], 160, cityTraffic.life.delayOf).filter(v => !v.parked).map(v => {   // the riders of passing traffic (seated, a little behind the bike's centre)
      const fx = Math.sin(v.facing), fz = Math.cos(v.facing);
      const T = typeOf(v); return { id: v.id, age: 30, pose: 'sit', moving: false, facing: v.facing, pos: toRender(v.pos[0] + fx * T.seat[0], v.pos[1] + T.seat[1] - 0.5, v.pos[2] + fz * T.seat[0]) };
    });
    crowd.update(agents.map(a => ({ ...a, pos: toRender(...a.pos), uniform: !!(a.person.job && pop.jobById.get(a.person.job).security) })).concat(riders, peopleNear(t, ctrl.pos[0], ctrl.pos[2], 90, Math.max(0, 90 - agents.length - riders.length)).filter(w => !mayhem?.out.has(w.id) && mayhem?.carry?.id !== w.id).map(w => ({ ...w, pos: toRender(...w.pos) })), (mayhem ? mayhem.crowd() : []).map(w => ({ ...w, pos: toRender(...w.pos) }))), dt);
    const inUse = [...residents.doorsInUse(agents)].filter(k => { const [bk, id] = k.split('#'); return !store.getDelta(doorKey(bk, id))?.held; });
    doorView.transient = new Set(inUse.map(k => doorIndex.get(k)).filter(i => i !== undefined));
    if (!shot && flight && cockpitView) { // the pilot's eye, looking out of the windscreen
      const L = flight.L, a = flight.L.seats.find(x => x.kind === 'pilot'), e = new THREE.Euler(-flight.pitch, flight.facing, flight.roll, 'YXZ');
      const eye = new THREE.Vector3(a.x - L.W / 2, L.deck + 1.7, a.z - L.D / 2 - 0.45).applyEuler(e), ahead = new THREE.Vector3(a.x - L.W / 2, L.deck + 1.45, a.z - L.D / 2 + 12).applyEuler(e);
      const p0 = toRender(flight.pos[0] + eye.x, flight.pos[1] + eye.y, flight.pos[2] + eye.z), p1 = toRender(flight.pos[0] + ahead.x, flight.pos[1] + ahead.y, flight.pos[2] + ahead.z);
      camera.position.set(...p0); camera.lookAt(...p1);
    } else if (!shot) cam.update(dt, ctrl.pos, toRender);
    war.step(dt, !!myCraft); combatView.update(war, toRender); drawMarkers();
    if (myCraft && !myCraft.alive && flight) eject();
    sched.tick(dt, t, ctx);
    terrain.update(ctrl.pos[0], ctrl.pos[2], 5);
    cityView.update(ctrl.pos, 1 - (sky.state.day ?? 1));
    town.group.visible = Math.hypot(ctrl.pos[0] - s.cx, ctrl.pos[2] - s.cz) < 7000;   // (the town is a speck from the city)
    { const me = flight ? null : ride ? ride.pos : ctrl.pos; cityTraffic.update(clock.now(), dt, ctrl.pos, 1 - (sky.state.day ?? 1), toRender, me ? [me] : [], town.group.visible ? trafficNear(planet, s, clock.now(), ctrl.pos[0], ctrl.pos[2], 320, cityTraffic.life.delayOf).filter(v => !v.parked) : []); }
    showCityLights();
    if (!cityRooms) { cityRooms = new CityInteriors(planet, s, cityView.city, world, cityView, propLib); root.add(cityRooms.group);
      mayhem = new Mayhem({ world, store, planet, city: cityView.city, view: cityTraffic }); mayhem.peopleNear = (t, x, z, r, max) => { const here = world.locate(...ctrl.pos)?.b?.item; return peopleNear(t, x, z, r, max).filter(w => !w.indoors || w.indoors === here); };   // (whoever's indoors sees only what happens indoors, with them)
      cityView.isBroken = (B, idx) => mayhem.brokenProp(B, idx); }
    if (!paused) stepMayhem(dt);
    if (!goods && propLib) { goods = new Goods(propLib, planet, s, store, world); root.add(goods.group); } goods?.update(clock.now(), ctrl.pos);
    cityRooms.update(ctrl.pos);
    if (!siteRooms && propLib) { siteRooms = new SiteInteriors(planet, s, world, outposts, propLib, store, k => cityView.kit(k)); root.add(siteRooms.group); } siteRooms?.update(ctrl.pos, clock.now()); setWindowGlow(1 - (sky.state.day ?? 1));
    flora.update(ctrl.pos[0], ctrl.pos[2]);
    outposts.update(ctrl.pos[0], ctrl.pos[2]);
    if (!flight || flight.altitude() < 60) grass.update(ctrl.pos[0], ctrl.pos[2], dt, weatherAt(planet, t).wind); grass.group.visible = (!flight || flight.altitude() < 60) && !params.has('nograss');
    const camW = [camera.position.x + origin[0], camera.position.y, camera.position.z + origin[2]];
    const wx = params.has('weather') ? { ...weatherAt(planet, t), ...JSON.parse(params.get('weather')) } : weatherAt(planet, t);
    const skyState = sky.update(t, new THREE.Vector3(rp[0], rp[1], rp[2]), camera.position, wx);
    weatherView.update(dt, wx, skyState, camera, origin, !!world.locate(...ctrl.pos)?.room && !(flight && !cockpitView));   // under a roof: no rain
    sea.update(dt, camera, origin, wx.wind); terrainTime.value += dt;
    if (player.waypoint) {
      const wp = player.waypoint, d = Math.hypot(wp.x - ctrl.pos[0], wp.z - ctrl.pos[2]);
      if (d < 6) { ui.toast(`You've arrived: ${esc(wp.label)}.`); player.waypoint = null; store.touchPlayer(); beam.visible = false; }
      else { const r = toRender(wp.x, wp.y, wp.z); beam.position.set(r[0], r[1], r[2]); beam.visible = true; }
    } else beam.visible = false;
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
      if (flight) {
        const why = flight.onGround ? flight.landingProblem() : null, f = flight;
        ui.showPrompt(`<span class="fltape"><b>${Math.round(f.airspeed * 3.6)}</b> km/h · <b>${Math.round(f.altitude())}</b> m · ${f.vel[1] >= 0 ? '↑' : '↓'}${Math.abs(f.vel[1]).toFixed(1)} m/s · thr <b>${Math.round(f.throttle * 100)}%</b>${f.hover > 0.05 ? ` · lift ${Math.round(f.hover * 100)}%` : ''} · α ${(f.aoa * 57.3).toFixed(0)}° · ${f.gload.toFixed(1)} g${f.assist ? '' : ' · <b class="late">ASSIST OFF</b>'}${myCraft ? ` · hull <b class="${myCraft.hp / myCraft.maxHp < 0.35 ? 'late' : ''}">${Math.max(0, Math.round(myCraft.hp / myCraft.maxHp * 100))}%</b>${myCraft.guns ? ` · msl ${myCraft.missiles} · flares ${myCraft.flares}` : ''}` : ''}${war.missiles.some(m => m.target === myCraft) ? ' · <b class="late">MISSILE</b>' : ''}${f.stalled ? ' · <b class="late">STALL</b>' : Math.abs(f.aoa) > 0.22 && !f.onGround && f.airspeed > f.vs * 0.45 ? ' · <b class="warnc">stall warning</b>' : ''}</span>
          <small>${f.onGround && why ? `can't land: ${why}` : ''}</small>`);
      }
      else if (rampHold > 0) {}
      else if (rpn) ui.showPrompt(shipIsYours(rpn.sh, player) ? `<kbd>E</kbd> ${rpn.down ? 'Raise' : 'Lower'} the ramp — the ${esc(rpn.sh.name)}` : rpn.down ? `The ${esc(rpn.sh.name)} · ${esc(rpn.sh.ownerName)}${rpn.sh.forSale ? ` · for sale, ${PRICES[rpn.sh.model]} cr` : ''}` : `The ${esc(rpn.sh.name)} · ramp locked · hold <kbd>F</kbd> force`);
      else if (ride) ui.showPrompt(`<b>${Math.round(Math.abs(ride.speed) * 3.6)} km/h</b>`);
      else if (hotwire > 0) {}
      else if (nv && (di < 0 || Math.hypot(nv.pos[0] - ctrl.pos[0], nv.pos[2] - ctrl.pos[2]) < doorDist)) ui.showPrompt(isYours(nv, player) ? `<kbd>E</kbd> ${typeOf(nv).kind === 'bike' ? 'Ride' : 'Drive'} your ${typeOf(nv).name.toLowerCase()}` : nv.forSale ? `<kbd>E</kbd> ${typeOf(nv).name} for sale — ${typeOf(nv).price} cr` : `${esc(nv.ownerName)}'s ${typeOf(nv).name.toLowerCase()} · hold <kbd>F</kbd> hotwire`);
      else if (ctrl.mode === 'seat') ui.showPrompt(null);
      else if (ua && (di < 0 || ua.d < doorDist) && !(() => { const w = personAhead(); return w && Math.hypot(w.pos[0] - ctrl.pos[0], w.pos[2] - ctrl.pos[2]) - 0.6 < ua.d + 0.8; })()) {
        const st = statusOf(ua.b, ua.u, t), own = ownership(ua.b, ua.u.room, player);
        ui.showPrompt(`<kbd>E</kbd> ${labelOf(ua.u)} <small>— ${ua.u.verbs.map(v => VERB[v].toLowerCase()).join(' · ')}${st ? ` · <b>${st}</b>` : ''}${ua.u.box && !own.yours && !own.communal && !ua.u.box.shop ? ` · ${esc(own.owner)}'s` : ''}</small>`);
      }
      else if (ctrl.mode === 'wall') { const w = ctrl.wall; ui.showPrompt(player.fatigue > 0.92 ? 'Your grip is going' : w.blocked ? `<small>${w.blocked}</small>` : null); }
      else if (ctrl.mode === 'ladder') ui.showPrompt(player.fatigue > 0.92 ? 'You\'re exhausted' : null);
      else if (lad && forceHold === 0) ui.showPrompt(`<kbd>E</kbd> ${ctrl.pos[1] > lad.foot[1] + 1.5 ? 'Climb down the ladder' : 'Climb the fire ladder'}`);
      else if (di >= 0 && forceHold === 0) {
        const { b, door } = town.doors[di], st = doorState(store, planet, b, door, t);
        const res = canOpen(store, planet, player, b, door, t);
        const what = door.kind === 'interior' ? 'door' : door.kind === 'core' ? (door.access === 'unit' ? `apartment ${door.unit}` : 'door') : `${b.owner} · ${address(s, b)}`;
        ui.showPrompt(st.held ? `Holding cell — locked until your release${player.custody ? ' at ' + formatHour(solarHour(planet, player.custody.until)) : ''}` : st.open ? `<kbd>E</kbd> Close ${what}` : st.broken ? `<kbd>E</kbd> Open ${what} <small>(lock broken)</small>`
          : res.ok || (door.kind !== 'interior' && insideBuilding(b)) ? `<kbd>E</kbd> Open ${what}${res.key ? ' <small>(your key)</small>' : ''}` : `${res.why} · <kbd>E</kbd> try · hold <kbd>F</kbd> force`);
      } else if (forceHold === 0 && mayhem && (cityTake = carToTake(t))) { const c = cityTake, d = driverOf(cityTraffic.fleet, c.car), T = typeOf(c.car); ui.showPrompt(c.on ? `On <b>${esc(d.name)}</b>'s ${T.name.toLowerCase()} <small>· ${esc(purposeOf(cityTraffic.fleet, c.car, t))}</small> · <kbd>E</kbd> force your way in · <kbd>Space</kbd> jump` : c.parked ? `<kbd>E</kbd> Steal ${esc(d.name)}'s ${T.name.toLowerCase()}` : `<kbd>E</kbd> Drag <b>${esc(d.name)}</b> out of the ${T.name.toLowerCase()} <small>· ${esc(purposeOf(cityTraffic.fleet, c.car, t))}</small>`); }
      else if (forceHold === 0 && (cityLift = liftNear())) ui.showPrompt(`<kbd>E</kbd> Lift — ${esc(cityLift.L.b.label)} <small>· ${cityLift.L.stops.filter(q => q !== cityLift.st).map(q => q.label.split(' —')[0].toLowerCase()).filter((q, i, a) => a.indexOf(q) === i).join(' · ')}</small>`);
      else if (forceHold === 0) {
        // the person in front of you
        let best = null, bd = 2.6;
        for (const a of agents) {
          const dx = a.pos[0] - ctrl.pos[0], dz = a.pos[2] - ctrl.pos[2], d = Math.hypot(dx, dz);
          if (d < bd && Math.abs(a.pos[1] - ctrl.pos[1]) < 1.5 && (dx * Math.sin(ctrl.facing) + dz * Math.cos(ctrl.facing)) / (d || 1) > 0.2) { bd = d; best = a; }
        }
        if (best) {
          const rel = relation(best.id), p = best.person, met = known(store, p.id) || rel;
          ui.showPrompt(`<kbd>E</kbd> Talk · <b>${esc(met ? p.name : nameFor(p))}</b>${rel ? ` — ${rel}` : ''} · ${p.age}${met ? ' · ' + occupation(pop, p) : ''} <small>· ${best.activity}</small>`);
        } else { const w = villagerAhead(t); ui.showPrompt(w ? `<kbd>E</kbd> Talk · <b>${villagerChats.has(w.id) ? esc(w.villager.name) : 'a stranger'}</b> · ${w.villager.age} <small>· ${esc(w.doing)}</small>` : null); }
      }
    }
    ui.quiet = !flight && (t - lastShotAt < 12 || performance.now() / 1000 - lastAttack < 8 || !!mayhem?.officers.length || !!(pursuit && pursuit.state !== 'return') || !!mayhem?.carry);
    const cp = cityPlace(cityView.city, ctrl.pos[0], ctrl.pos[2]);
    ui.updateHud({ planet, s, player, t, located: loc, atWork, cell: holdingCell(planet, s, polity), weather: wx, pos: ctrl.pos, cityAt: cp && { label: cp.label, city: cityView.city.name } });
    frames++;
    if (now - fpsT > 1000) {
      fps = frames; frames = 0; fpsT = now;
      const info = renderer.info.render;
      ui.debug(`${fps} fps · ${info.calls} calls · ${(info.triangles / 1e3).toFixed(0)}k tris · tiles ${terrain.count} (+${terrain.pending}) · pos ${camW.map(v => v.toFixed(0)).join(',')} · jobs ${store.jobs.length} · deltas ${store.deltas.size}`);
    }
    if (performance.now() - lastSave > 10000) { lastSave = performance.now(); save(); }
    if (!params.has('norefl')) sea.renderReflection(renderer, scene, camera, [grass.group, weatherView.rain, crowd.group, vehView.group].filter(Boolean));
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
  window.ORBIS = { avatar, sites: () => siteRooms, ladders, store, planet, s, ctrl, cam, clock, world, town, doorView, scene, renderer, ready: false, save, pop, residents, crowd, getAgents: () => agents, ctx, polity, showWork, getPursuit: () => pursuit, startPursuit, cell: holdingCell(planet, s, polity), ui, propView, use: { usableAhead, useThing, statusOf, labelOf }, showInventory, getRide: () => ride, getVehicles: () => vehicles, getFlight: () => flight, war, getRaid: () => raid, raidTick, weatherView, avatar, attack, getBodies: () => bodies, cityView, cityTraffic, liftNear, outposts, getMayhem: () => mayhem, takeCar, grabOrThrow, getRide2: () => ride,  getCityRooms: () => cityRooms, city: getCity(planet), cityPlace, hurtPlayer, setCockpitView: v => { cockpitView = v; }, getShips: () => ships, syncShips };
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
