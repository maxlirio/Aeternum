// ORBIS — boot and game loop. Wires the modules together; owns no game rules itself.
//   core/  seeds, noise, addresses       gen/   pure world generation
//   world/ persistent changes            sim/   time, scheduler, processes
//   render/ three.js views of gen data   player/ motion, camera, collision
import * as THREE from 'three';
import { rocksNear, ledgesNear } from './gen/rocks.js';
import { seedHex, seedFromHex, makeSeed, hashStr } from './core/hash.js';
import { HOMEWORLD, Address } from './core/address.js';
import { setTownCulture } from './render/materials.js';
import { SkyIslesView } from './render/skyisles.js';
import { HarbourView } from './render/harbour.js';
import { FleetWar } from './sim/fleetwar.js';
import { marketOf, priceAt, holdSize, goodName } from './gen/trade.js';
import { townSociety, nationsOf, relationOf } from './gen/society.js';
import { PlanetWar, enemyOf as warEnemyOf, beamAt, burnAt, shipAt, shipPoint, ruinFloor, ruinKeep, FIRE as PW_FIRE, DONE as PW_DONE, GONE as PW_GONE, ARRIVE as PW_ARRIVE, AWAY as PW_AWAY, MODEL as PW_MODEL, LANCE as PW_LANCE, BEAM_R, HANG, VENTS, VENT_HP, VENT_R, GUNS as PW_GUNS } from './sim/planetwar.js';
import { Boarding, FUSE } from './sim/boarding.js';
import { BoardingView } from './render/boarding.js';
import { hulkPush, hulkDecks, restPose, bedsOf } from './gen/hulk.js';
import { gangsOf } from './gen/gangs.js';
import { FrontBattle, frontsOf, setFrontFit, setFrontTown, RANKS } from './sim/front.js';
import { Infantry } from './sim/infantry.js';
import { BattlePlan } from './sim/battleplan.js';
import { InfantryView } from './render/infantry.js';
import { Armor } from './sim/armor.js';
import { ArmorView } from './render/armor.js';
import { FleetWarView } from './render/fleetwar.js';
import { noteExplored } from './world/gencache.js';
import { isCloudWorld, cloudOf } from './gen/skyisles.js';
import { cultureOf } from './gen/culture.js';
import { makePlanet } from './gen/planet.js';
import { getSettlement, settlementNear, townOfKey, address, regionOf } from './gen/settlement.js';
import { voyageAt, VOYAGES } from './gen/voyages.js';
import { openHoloMap } from './ui/holomap.js';
import { FtlTunnel, ftlFlash } from './render/ftl.js';
import { starChart, jumpOf, addressOf } from './gen/stars.js';
import { buildingPlan } from './gen/building.js';
import { newCharacter } from './gen/character.js';
import { MemorialView } from './render/memorials.js';
import { familyOf, tierOf, addDeed, AREAS, skyRenown, groundRenown } from './game/family.js';
import { SkySortie, WAVES as SKY_WAVES } from './game/sky.js';
import { campaignOf, frontOf, pressure, gainOf, apply as warApply, wavesFor, strikeEvery, holdSay, KINDS as GO_KINDS, battleNow, decide as battleDecide, battleSay } from './game/campaign.js';
import { loadMixamo, infoOf as clipInfo } from './player/mixamo.js';
import { fate, epitaph, estate, inherit, hpCap, warStage, pressOf, MAX_WOUNDS } from './sim/lineage.js';
import { occupation } from './gen/population.js';
import { livePopulation, refreshLife, townContext } from './world/town.js';
import { RiverFeed } from './world/riverfeed.js';
import { TownStreamer } from './render/towns.js';
import { RoadView } from './render/roads.js';
import { GlobeView } from './render/globe.js';
import { curveTheGround } from './render/curve.js';
import { globeOf, canon, geoAt, surfaceDistance } from './gen/globe.js';
import { registerLifeJobs, scheduleLife, LIFE_EVENTS } from './sim/processes/life.js';
import { Jostle } from './sim/jostle.js';
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
import { whereAt, dayIndex } from './gen/schedule.js';
import { CapitalView } from './render/capital.js';
import { ThrustView } from './render/thrust.js';
import { fleetOf, fleetContact, bayShelter, HULLS } from './gen/capital.js';
import { RINGS, ringFolk, folkAt, W as RING_W } from './gen/rings.js';
import { ringStructure, spinOf, wrapRing } from './world/rings.js';
import { vesperStructure } from './world/vesper.js';
import { VesperStreets } from './render/vesperreal.js';
import { vesperCity } from './gen/vesper.js';
import { RingView, bendAt, plantGroup } from './render/rings.js';
import { plantSet } from './gen/flora.js';
import { TerrainStreamer, terrainTime, terrainWind, terrainFar } from './render/terrain.js';
import { SkySystem } from './render/sky.js';
import { buildSettlementMesh, poolMaterial } from './render/settlement-mesh.js';
import { DoorView } from './render/doors.js';
import { loadPropLibrary, PropView } from './render/props.js';
import { materials, occupancy, WINDOW_TYPES, loadSurfaces, loadGround } from './render/materials.js';
import { CollisionWorld } from './player/collision.js';
import { Controller } from './player/controller.js';
import { slidePose } from './player/moves.js';
import { FollowCamera } from './player/camera.js';
import { createPlaceholderAvatar } from './player/avatar.js';
import { loadAdventurer } from './player/adventurer.js';
import { SurfaceProbe } from './render/probe.js';
import { LedgeView } from './render/ledges.js';
import { ShipDamage } from './render/damage.js';
import { FlightHud } from './ui/flighthud.js';
import { CombatHud } from './ui/combathud.js';
import { Sound } from './render/sound.js';
import { laddersIn, ladderOf } from './gen/climb.js';
import { interiorPoints } from './gen/paths.js';
import { SPEEDER, typeOf } from './gen/vehicles.js';
import { vehiclesIn, park, buyVehicle, stealVehicle, isYours } from './world/vehicles.js';
import { Ride } from './player/ride.js';
import { VehicleView } from './render/vehicles.js';
import { SHIP_PRICE, PRICES, tripOf, LAYOUTS } from './gen/ships.js';
import { shipsIn, onRun, holdRun, shipIsYours, rampDown, rampLocked, setRamp, structureOf, centreOf, buyShip, stealShip, launch, land, forceRamp, shipKey } from './world/ships.js';
import { Flight, fromEuler } from './player/flight.js';
import { AirWar, raidAt, raidIndex, steerToward } from './sim/aircombat.js';
import { CombatView } from './render/combat.js';
import { heightCache } from './world/heightcache.js';
import { LightPool } from './render/lightpool.js';
import { ShipView, cockpitReadout, LIVERY } from './render/ships.js';
import { FloraView } from './render/flora.js';
import { RockView } from './render/rocks.js';
import { GroundMarks } from './render/prints.js';
import { Crashes, toLocal, dirLocal } from './sim/crash.js';
import { felledOf, fellKey, floraNear } from './gen/flora.js';
import { FX } from './render/fx.js';
import { bridgeGroup } from './render/bridges.js';
import { WreckView } from './render/wrecks.js';
import { PAINTS_VEHICLE } from './render/props.js';
import { FaunaSim } from './sim/fauna.js';
import { FaunaView } from './render/fauna.js';
import { CityView } from './render/city.js';
import { rawHeight } from './gen/terrain.js';
import { surfaceHeight } from './gen/surface.js';
import { CityTrafficView } from './render/citytraffic.js';
import { CityInteriors } from './render/cityreal.js';
import { PipeView } from './render/pipes.js';
import { OutpostView } from './render/outposts.js';
import { buildingParts, setWindowGlow } from './render/housegen.js';
import { smallParts } from './render/smallgen.js';
import { SiteInteriors } from './render/sitereal.js';
import { RiverView } from './render/rivers.js';
import { sitesNear } from './gen/outposts.js';
import { localTones } from './gen/culture.js';
import { Goods } from './render/goods.js';
import { Mayhem } from './sim/mayhem.js';
import { cityWalkers } from './gen/citytraffic.js';
import { siteWalkers, villagerSays } from './gen/villagers.js';
import { signalAt, driverOf, purposeOf } from './gen/cityfleet.js';
import { townSignals, townLight, townRedAhead } from './gen/roadrules.js';
import { RoadRules } from './sim/roadrules.js';
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
// ?planet=N (and ?system=M): load another world of this universe instead of home: the developer's switch until there's a way to fly there.
// Each world keeps its own save slot, so nothing done on one is laid over another.
if (params.get('auto') === 'line' && !params.has('planet') && !params.has('seed')) params.set('planet', 7);      // (?auto=line: the first world of the default seed whose nation is at war on land)
const WORLD = params.has('planet') ? new Address([['galaxy', 0], ['sector', 0, 0, 0], ['system', +params.get('system') || 0], ['body', +params.get('planet') || 0]]) : HOMEWORLD;
const backend = params.get('store') === 'mem' ? new MemoryBackend() : new IDBBackend(params.get('slot') || (params.get('auto') === 'line' ? 'line' : WORLD === HOMEWORLD ? 'main' : `world-${params.get('system') || 0}-${params.get('planet')}`));
const store = new WorldStore(backend);
window.ORBIS = { store, ready: false };
let AREA = null;      // (where the one you're playing is going: game/family.js AREAS; null, a life, as it's always been)
window.__started = true;      // (the code all loaded and linked: from here on, failures have their own handling)

boot().catch(e => { console.error(e); ui.panel(`<h2>Something broke</h2><pre>${String(e.stack || e)}</pre><p>Your save is safe. <button onclick="location.reload()">Reload</button></p>`); document.title = 'ERROR ' + e.message; });

async function boot() {
  const has = await store.open();
  let choice = params.get('auto') || null;
  if (!choice) {      // the front door is the family (game/family.js): who carries the name, what it's called, where they go next
    const hasSave = has && (!!store.player || !!store.meta?.heir), L = store.meta?.lineage || [], P = store.player;
    const fam = hasSave ? familyOf(store.meta, P?.surname || L[0]?.surname) : null;
    const r = await ui.family({ hasSave, family: fam, tier: fam ? tierOf(fam.renown) : null, lineage: L, areas: AREAS,
      member: P ? { name: P.name, age: P.age, where: `${P.birthplaceName || ''}${P.planetName ? ', ' + P.planetName : ''}`, wounds: P.wounds || 0 } : null,
      heirPending: !P && store.meta?.heir ? store.meta.heir.after?.name || 'the last of them' : null });
    if (r.a === 'area') { AREA = r.area; choice = hasSave ? 'continue' : 'new'; } else choice = r.a;
  }
  if (choice === 'restore') return restoreFlow();
  if (choice !== 'new' && has && !store.player && store.meta?.heir) return start({ fresh: true, heir: store.meta.heir });      // (the last of your line is dead: the next takes it up, in the same universe)
  if (choice === 'arrive') { const H = ftlHandoff(); if (H && (!has || !store.player)) { store.create(H.universe, EPOCH, Date.now()); store.meta.nextCharacter = 1; return start({ fresh: true }); } return start(null); }     // (out of FTL: a world you've been to, or a new one in the same universe)
  if (choice === 'line') return start(newUniverse());      // (?auto=line: a new soldier, straight onto the line on foot, in a slot of its own)
  if (choice === 'new' || !has || !store.player) return start(newUniverse());
  return start(null);
}

// what an FTL jump carries across (ui/holomap.js, main.js ftlJump): who you are, what you have, the ship you're flying
// the FTL handoff from the world you left: in this tab's session storage, else local storage, else (both full: the origin's local storage is
// shared with every other site on it) carried in the URL itself
function ftlStash(H) { const j = JSON.stringify(H); for (const S of ['sessionStorage', 'localStorage']) { try { window[S].setItem('orbis-ftl', j); return ''; } catch { } } return '#ftl=' + encodeURIComponent(j); }
function ftlHandoff() {
  const ok = H => H && Date.now() - H.at < 20 * 60000 ? H : null, m = location.hash.match(/^#ftl=(.*)$/);
  if (m) { try { return ok(JSON.parse(decodeURIComponent(m[1]))); } catch { } }
  for (const S of ['sessionStorage', 'localStorage']) { try { const H = ok(JSON.parse(window[S].getItem('orbis-ftl') || 'null')); if (H) return H; } catch { } }
  return null;
}
function ftlClear() { for (const S of ['sessionStorage', 'localStorage']) { try { window[S].removeItem('orbis-ftl'); } catch { } } if (location.hash.startsWith('#ftl=')) history.replaceState(null, '', location.pathname + location.search); }
function newUniverse() {
  const fixed = params.get('seed') || (params.get('auto') === 'line' ? '00c0ffee00b0a7e5' : null);
  const words = fixed ? null : crypto.getRandomValues(new Uint32Array(2));
  const hex = fixed ? seedHex(seedFromHex(fixed.padStart(16, '0').slice(0, 16))) : seedHex(makeSeed(words[0], words[1]));
  store.create(hex, EPOCH, Date.now());
  store.meta.nextCharacter = 1;
  return { fresh: true };
}

async function start(fresh) {
  // out of FTL: the tunnel goes on round your ship while this world is built, and it's left only when the ground under you is there
  const arriving = params.get('auto') === 'arrive' && !!ftlHandoff(); let ftl = null, ftlOut = null, ftlPumpOff = false; if (arriving) ui.hush = true;
  ui.loading('Generating the world…', 0);
  // ---- renderer (first: coming out of FTL, the tunnel's drawn with it from the start), and the built models, loading while the world's worked out
  const renderer = new THREE.WebGLRenderer({ antialias: !params.has('noaa'), logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2) > 1.4 && !params.has('auto') ? Math.min(devicePixelRatio, 2) * 0.75 : Math.min(devicePixelRatio, 2));      // (a high-density screen starts at three quarters of its own grain; the frame rate then says whether it can have more: see the end of frame())
  renderer.setSize(innerWidth, innerHeight);
  renderer.lazyPrograms = params.has('lazyshaders');      // (vendor/three: leaves a thing out while the driver's still building its shader, not stopping for it. Off: it left things unlit once they did appear)
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.prepend(renderer.domElement);
  const libP = params.has('boxprops') ? Promise.resolve(null) : loadPropLibrary(undefined, renderer.capabilities.getMaxAnisotropy()).catch(e => { console.warn('prop library', e); return null; });
  // coming out of FTL: the tunnel from the first frame, your ship in it as soon as its model's loaded
  if (arriving) { const H = ftlHandoff(); ftl = new FtlTunnel(renderer); ftl.speed = 1; ftl.render(0.016);
    libP.then(lib => { if (ftl && lib) ftl.ship(new ShipView(lib), H.ship.model, H.ship.colour); });
    let lp = performance.now(); const pump = now => { if (ftlPumpOff || !ftl) return; ftl.render(Math.min(0.05, (now - lp) / 1000)); lp = now; requestAnimationFrame(pump); }; requestAnimationFrame(pump); }     // (while the world's being built: the frame loop takes over when it starts)
  const U = seedFromHex(store.meta.universe);
  const planet = makePlanet(U, WORLD); setTownCulture(cultureOf(planet).key);      // (this world's people face their towns their own way)
  // s, pop, polity, ctx and the like below are the town you're in. homeS and homeCtx stay where you started.
  let s = getSettlement(planet, 0, 0); const homeS = s;
  const sched = new Scheduler(store); registerDoorJobs(sched); registerLawJobs(sched); registerWorkJobs(sched); registerLifeJobs(sched); registerUseJobs(sched);
  ui.loading('Counting the townsfolk…', 0.01); await tick();
  // the town as it stands now: generated residents with their lives since laid over them
  let pop = livePopulation(planet, s, store, store.meta.gameTime), polity = getPolity(planet, s);
  const homeCtx = { store, sched, planet, s, pop, polity }; let ctx = homeCtx;
  sched.ctxFor = (town, c) => townContext(homeCtx, town) === homeCtx ? c : { ...townContext(homeCtx, town), offline: c.offline };
  ctx.doorstepOf = bKey => { const q = townOfKey(planet, bKey) || homeS, b = q.buildings.find(x => x.key === bKey); return doorstep(q, b, buildingPlan(planet, q, b)).pos; };
  { const pl = store.player; // saves from before careers / fines existed
    if (pl) { pl.inventory ??= []; pl.hunger ??= 0.25; pl.skills ??= startingSkills(U, pl.serial || 1, pl.age); pl.applications ??= []; pl.career ??= []; pl.job ??= null; pl.fines ??= []; pl.warrant ??= null; pl.custody ??= null; } }

  if (store.player) scheduleLife(store, planet, s, store.meta.gameTime);   // saves from before residents' lives moved on
  let report = null;
  if (fresh) {
    const serial = store.meta.nextCharacter++, H = fresh.heir || null, t0 = H ? store.meta.gameTime : EPOCH;
    ui.loading(H ? 'The next of the line…' : 'Finding your family…', 0.02); await tick();
    const p = newCharacter(U, planet, s, pop, serial, t0, H?.estate ? { household: H.estate.household } : {});
    p.startSkills = { ...p.skills }; if (H?.estate) inherit(p, H.estate); if (H) p.after = H.after;
    const home = s.buildings.find(b => b.key === p.home);
    const ds = doorstep(s, home, buildingPlan(planet, s, home));
    p.pos = ds.pos; p.facing = ds.facing;
    p.inventory = p.inventory?.length ? p.inventory : []; p.hunger = 0.25; giveItem(p, 'ration', 2); giveItem(p, 'water', 1);
    store.setPlayer(p); store.meta.heir = null; store.dirty.meta = true; familyOf(store.meta, p.surname);
    refreshLife(pop, store, t0); scheduleLife(store, planet, s, t0);
    store.log({ t: t0, type: 'life_began', name: p.name, place: s.name, character: p.id, ...(H?.estate ? { heirOf: H.estate.name } : {}) });
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
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 60000);
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
  const root = new THREE.Group(); scene.add(root);   // world content; offset = floating origin
  const origin = [0, 0, 0];
  const toRender = (x, y, z) => [x - origin[0], y - origin[1], z - origin[2]];
  curveTheGround(globeOf(planet).R);
  await loadSurfaces(renderer.capabilities.getMaxAnisotropy()); await loadGround().catch(e => console.warn("ground pictures unavailable: the plain ground stands in", e));
  materials();
  ui.loading('Weathering the surface…', 0.05);
  await tick();

  const sky = new SkySystem(renderer, scene, planet);
  const weatherView = new WeatherView(scene, planet);
  const terrain = new TerrainStreamer(planet, root);
  // furniture from the built asset library; the box furniture remains the fallback if it can't load
  const propLib = await libP;
  let propView = propLib ? new PropView(propLib) : null;
  const vehView = new VehicleView(propLib); scene.add(vehView.group);
  const shipView = new ShipView(propLib); scene.add(shipView.group);
  const shipDamage = new ShipDamage(shipView); shipView.damage = shipDamage; const hud = new FlightHud(), chud = new CombatHud(), sound = new Sound();
  if (arriving && ftl && !ftl.shipG.children.length) { const H = ftlHandoff(); if (H) ftl.ship(shipView, H.ship.model, H.ship.colour); }      // (your ship in the tunnel, if it isn't yet)
  const capitalView = new CapitalView(scene, propLib); setTimeout(() => capitalView.load(), 2500);
  const flora = new FloraView(propLib, planet, renderer); root.add(flora.group);      // (world coordinates, under the floating origin)
  const ringView = new RingView(scene, propLib, planet, flora);
  const grass = new GrassField(planet); root.add(grass.group);
  // what shellfire's done to a building (hit/<key>: { d: damage taken }): its windows out ('shot'), or knocked down to broken walls ('down')
  const hpOf = b => 130 + b.w * b.d * 0.8, bState = b => { const D = store.getDelta('hit/' + b.key); return !D || !(D.d > 0) ? null : D.d >= hpOf(b) * 1.7 ? 'flat' : D.d >= hpOf(b) ? 'down' : 'shot'; }, fallen = st => st === 'down' || st === 'flat', bPanes = b => store.getDelta('hit/' + b.key)?.w || null;      // (w: the panes shot out of it one by one, as window boxes)
  let town = await buildSettlementMesh(planet, s, f => ui.loading(`Building ${s.name}…`, 0.1 + 0.6 * f), propView, { ruin: bState, panes: bPanes });
  root.add(town.group);
  const cityView = new CityView(planet, propLib); root.add(cityView.group);   // the megacity on the horizon (gen/city.js)
  const cityTraffic = new CityTrafficView(planet, cityView.city, propLib); scene.add(cityTraffic.group); root.add(cityTraffic.points);
  propLib?.setLocal(localTones(planet));
  let trespassAt = null;
  const rivers = new RiverView(planet); root.add(rivers.group); ringView.waterBase = rivers.mat; capitalView.waterBase = rivers.mat;
  const rocks = new RockView(planet); root.add(rocks.group);
  const prints = new GroundMarks(planet); root.add(prints.group);
  const faunaView = new FaunaView(planet); root.add(faunaView.group);
  let fauna = null;      // (made once the clock and the store exist)
  let siteRooms = null;        // and walk-in country buildings
  let cityRooms = null;        // walk-in city buildings (made once the collision world exists)
  const pipes = new PipeView(); root.add(pipes.group);
  root.add(bridgeGroup(planet, s));
  const harbour = isCloudWorld(planet) ? null : new HarbourView(planet, k => cityView.kit(k), propLib); if (harbour) root.add(harbour.group);      // (towns out over the water, their piles and jetties; fishing boats working from every harbour)
  const outposts = new OutpostView(planet, propLib, k => k.startsWith('gb_') ? (propLib ? buildingParts(planet, k, propLib.wornSurface) : null) : k.startsWith('sm_') ? (propLib ? smallParts(planet, k, propLib.wornSurface) : null) : cityView.kit(k)); root.add(outposts.group);
  let goods = null;
  let roadRules = null, roadLimit = null;
  let mayhem = null;           // what you can do to the city, and what it does back (made with the collision world)
  let doorView = new DoorView(s, town.doors);
  town.group.add(doorView.mesh);
  let doorIndex = new Map(town.doors.map((d, i) => [d.b.key + '#' + d.door.id, i]));
  const towns = new TownStreamer(planet, root, propLib, homeS), riverFeed = new RiverFeed(planet, { onExplore: (ci, cj) => { if (noteExplored(store.player, ci, cj)) store.touchPlayer(); } }),      // (where you've been goes in the save; what was worked out there in world/gencache.js)
    roadView = new RoadView(planet, root), globeView = new GlobeView(planet, scene); globeView.fromCache(riverFeed?.cache); terrain.useCache(riverFeed?.cache);
  // what a climber's hands feel for (render/probe.js): the walls of the towns, sites and rooms near you
  // what a body's limbs stop against when a take throws it about (player/contact.js): the ground under it (floors, decks, roofs), and what's built
  const bodyContact = { floor: (x, y, z) => { const W = fromRender(x, y, z); return world.groundAt(W[0], W[2], W[1]).h - origin[1]; }, solid: (x, y, z) => { const W = fromRender(x, y, z); return world.solidAt(W[0], W[1], W[2], 0.02, false); } };
  const probe = new SurfaceProbe(() => [town.group, ...[...towns.full.values()].map(T => T.town?.group), outposts.group, siteRooms?.group, cityRooms?.group, ledgeView?.group]);
  const fromRender = (x, y, z) => [x + origin[0], y + origin[1], z + origin[2]];
  const ledgeView = new LedgeView(); root.add(ledgeView.group);
  // you: the ADVENTURER body once it has loaded (the placeholder until then, or for good with ?body=placeholder)
  if (params.get('body') !== 'placeholder') loadAdventurer(params.get('body') === 'bare' ? './assets/adventurer.glb' : './assets/adventurer_kit.glb').then(A => { const old = avatar; A.planet = planet; A.lib = propLib; A.setWorld(probe, fromRender); A.setContact?.(bodyContact); A.object.position.copy(old.object.position); A.object.quaternion.copy(old.object.quaternion); A.object.visible = old.object.visible; scene.remove(old.object); scene.add(A.object); avatar = A; window.__body = 'adventurer'; }).catch(e => console.warn('body', e));
  let inSpace = false, geoAtX = 0, geoAtZ = 0;
  const world = new CollisionWorld(planet, s, (b, id) => { const q = world.townOf(b), T = q === homeS ? homeTown : towns.full.get(q.key); return !!T?.doorView && T.doorView.isPassable(T.doorIndex.get(b.key + '#' + id)); });   // (a town not built yet keeps its doors shut)
  const b2w = (b, ...at) => buildingToWorld(world.townOf(b), b, ...at);
  const sea = makeSea(planet); scene.add(sea);
  // a world with no ground (gen/skyisles.js): no land to stream, no sea; its decks and the cloud sea below instead
  const cloudW = isCloudWorld(planet), altRef = cloudW ? cloudOf(planet).deck : planet.seaLevel;
  const arrivalAt = () => { const a = 1.1; return [homeS.cx + Math.sin(a) * 26000, altRef + 30000, homeS.cz + Math.cos(a) * 26000]; };     // (out of FTL: 30 km up, 26 km out from the first town)
  const skyIsles = cloudW ? new SkyIslesView(planet, propLib) : null; if (skyIsles) root.add(skyIsles.group);
  if (cloudW) sea.visible = false;
  // where someone told you to go: a tall pale beam you can see over the rooftops
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 120, 12, 1, true).translate(0, 60, 0), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beam.visible = false; scene.add(beam);          // (not 'water': that's the plant-watering action)

  const player = store.player;
  player.credits ??= 500; player.record ??= [];        // saves from before money existed
  const ctrl = new Controller(world, player.pos);
  ctrl.facing = player.facing || 0;
  let avatar = createPlaceholderAvatar();
  avatar.lib = propLib; scene.add(avatar.object);
  const cam = new FollowCamera(camera, world, renderer.domElement);
  cam.yaw = ctrl.facing;
  const roomLight = new THREE.PointLight(0xffe2c0, 0, 14, 1.6); scene.add(roomLight);
  const headLamp = new THREE.PointLight(0xfff0d8, 0, 9, 1.4); scene.add(headLamp);
  const lightPool = new LightPool(scene, 3); let lightTick = 0;      // (render/lightpool.js: three real point lights, shared out each frame among everything that asks for one)
  // ---- residents
  ui.loading('Waking the town…', 0.68); await tick();
  let residents = new Residents(pop); const jostle = new Jostle();
  residents.refresh(clock.now(), ctrl.pos, null);
  avatar.planet = planet;
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
  homeCtx.onServe = function (t) { if (this.s === s) startPursuit(nearestOfficerOnDuty(t), player.warrant?.reason || 'a warrant'); };     // (the law where the warrant was issued: it can only send someone if you're there)

  // warm up the terrain around the player before revealing the world
  for (let i = 0; terrain.pending || i === 0; i++) {
    if (!cloudW) { if (arriving) { const A = arrivalAt(); terrain.update(A[0], A[2], 40, A[1] - altRef); } else terrain.update(player.pos[0], player.pos[2], 40); }
    ui.loading('Streaming terrain…', 0.7 + 0.3 * Math.min(1, i / 40));
    await tick();
    if (i > 400) break;
  }
  if (!params.has('syncterrain')) terrain.useWorkers();     // (from here the ground is built off the frame: flying fast, it keeps up without stalling)

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
      if (e.type === 'fined' && e.who === player.id) ui.toast(`${e.authority || polity.securityName} fined you <b>${e.amount} ${e.currency}</b> — ${e.offence.toLowerCase()}. Pay at their office within ${PAY_DAYS} days.`, 'bad', 9000);
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
    if (onShiftNow(player, t) && !atWork && shiftNoticed !== player.shift.t0) { shiftNoticed = player.shift.t0; ui.toast(`Your shift at <b>${player.job.employer}</b> has started (${(q => address(q, q.buildings.find(x => x.key === player.job.b)))(townOfKey(planet, player.job.b))}).`, 'warn', 8000); }
    if (atWork) shiftNoticed = player.shift.t0;
  } });
  sched.add(TIER.NEAR, { update: dt => { player.hp = Math.min(hpCap(player), (player.hp ?? 100) + 80 * dt / planet.dayLength); } });
  sched.add(TIER.NEAR, { update: dt => { advanceBody(player, ctrl.mode === 'seat' ? (ctrl.seat.pose === 'lie' ? 'rest' : 'sit') : 'idle', dt, planet); store.touchPlayer(); } });
  sched.add(TIER.ACTIVE, { update: dt => doorView.update(dt) });

  // ---- input
  const keys = new Set();
  let bootHold = null;      // (set once the world's up: below)
  let dying = false;      // (dead: sim/lineage.js, dieFlow; nothing more is saved over the death)
  let paused = false, forceHold = 0, jumpQueued = false, slideQueued = false, lastSave = performance.now();
  addEventListener('keydown', e => {
    if (paused) return;
    sound.wake(); keys.add(e.code);
    if (e.code === 'Space' && !flight && !tankV) { jumpQueued = true; crouched = false; }
    if ((e.code === 'KeyZ' || e.code === 'ControlLeft') && !e.repeat && !flight && !ride && !tankV && ctrl.mode === 'walk') {      // (down at a full run: a slide, then crouched where it stops)
      if (!crouched && ctrl.grounded && ctrl.speed > 5.2 && !proned) { crouched = true; slideQueued = true; } else crouched = !crouched; proned = false; }
    if (e.code === 'KeyX' && !flight && !ride && !tankV && ctrl.mode === 'walk') { proned = !proned; if (proned) crouched = false; }      // (prone: flat behind your rifle; get up with it again, or by moving off)      // (crouch: down behind cover, or moving low)
    if (e.code === 'KeyE' && !gunToggle() && !tankToggle() && !plantCharge()) interact();
    if (e.code === 'KeyQ' && onLine() && !tankV && ctrl.mode === 'walk') fireLauncher();
    if (e.code === 'KeyI') showInventory();
    if (e.code === 'KeyL') switchLight();
    if (e.code === 'KeyR') attack();
    if (e.code === 'KeyF' && myCraft) { if (myCraft.lockT < 1.2 || !war.fireMissile(myCraft)) ui.toast(myCraft.missiles ? (myCraft.lock && myCraft.lockT > 1.2 ? 'Reloading.' : 'No lock: keep a target ahead of you, from behind, for a second.') : 'No missiles left.', 'warn', 2000); else if (myCraft.lockT < 1.2) {} }
    if (e.code === 'KeyG' && myCraft) war.dropFlares(myCraft); else if (e.code === 'KeyG' && onLine()) throwGrenade();
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
  renderer.domElement.addEventListener('click', () => { sound.wake(); if (paused) return; if (document.pointerLockElement === renderer.domElement) { if (!heldRanged() && !tankV) attack(); } else renderer.domElement.requestPointerLock?.(); });
  // a gun: held down, it keeps firing; the other button puts your eye to its sight (in a tank, the gunner's)
  // Aiming: hold the right button, as ever. For a trackpad, where you can't hold one click and make another: a quick right click (a two-finger tap)
  // puts the gun up and leaves it up till the next one, V does the same from the keys, Alt held aims while it's down; and R held is the trigger.
  let aimBtn = false, aimStick = false, aimT0 = 0, aimWasStuck = false;
  const aimSync = () => { aimHeld = aimBtn || aimStick || keys.has('AltLeft') || keys.has('AltRight'); };
  renderer.domElement.addEventListener('mousedown', e => { if (paused || document.pointerLockElement !== renderer.domElement || flight || ride) return; if (e.button === 0 && (heldRanged() || tankV)) { trigger = true; if (!tankV) attack(); } if (e.button === 2) { aimBtn = true; aimT0 = performance.now(); aimWasStuck = aimStick; aimStick = false; aimSync(); } });
  addEventListener('mouseup', e => { if (e.button === 0) trigger = false; if (e.button === 2) { aimBtn = false; if (!aimWasStuck && performance.now() - aimT0 < 230) aimStick = true; aimSync(); } });
  addEventListener('keydown', e => { if (e.repeat || paused || flight || ride) return; if (e.code === 'KeyV') { aimStick = !aimStick; aimSync(); } if (e.code === 'AltLeft' || e.code === 'AltRight') { e.preventDefault(); aimHeld = true; } if (e.code === 'KeyR' && (heldRanged() || tankV)) trigger = true; });
  addEventListener('keyup', e => { if (e.code === 'KeyR') trigger = false; if (e.code === 'AltLeft' || e.code === 'AltRight') { keys.delete(e.code); aimSync(); } });
  renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('blur', () => { trigger = false; wantShot = false; aimHeld = aimBtn = aimStick = false; });
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && !paused && window.ORBIS.ready && !params.has('cam')) openMenu(); });

  const save = async () => {
    if (dying) return;
    if (ride) { park(store, ride.v, ride.pos, ride.facing); player.pos = ride.dismountSpot(); }
    else if (flight) { store.patchDelta(shipKey(flight.ship.id), { flying: true, at: { c: flight.pos.slice(), facing: flight.facing } }); player.piloting = flight.ship.id; player.pos = flight.pos.slice(); }
    else player.pos = ctrl.pos.slice();
    if (!flight) player.piloting = null;
    { const L = !flight && !ride ? world.locate(...ctrl.pos) : null; player.aboard = L?.b?.type === 'ship' ? L.b.key : null; }      // (so it's there to stand in when you come back: below, at boot)
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
  let ladders = laddersIn(planet, s);
  const nearLadder = () => {
    if (ctrl.mode !== 'walk') return null;
    const [x, y, z] = ctrl.pos;
    return ladders.find(l => (Math.hypot(l.foot[0] - x, l.foot[2] - z) < 1.1 && Math.abs(y - l.foot[1]) < 1.2)
      || (Math.hypot(l.roof[0] - x, l.roof[2] - z) < 1.3 && Math.abs(y - l.roof[1]) < 0.6)) || null;
  };
  // ---- city lifts: every tall building's lift stops at its street door, its pads, skybridges and roof
  function liftNear() {
    if (ctrl.mode !== 'walk' || ride || flight) return null;
    { const V = vesperLift(); if (V) return V; }
    { const ML = meridianLift(), here = ringHere(); let st = null, d = 9;
      const stops = [ML && { label: 'Promenade — the Meridian\'s decks', at: [ML.at[0], ML.at[1] + 0.05, ML.at[2]], deck: true, face: ML.face }, ...ringStructs.map(b => ({ label: `${b.label[0].toUpperCase() + b.label.slice(1)} — ${b.plan.rooms[0].label}`, at: ringStop(b), ring: b, face: ringFace(b) }))].filter(Boolean);
      if (ML) { const q = Math.hypot(ML.at[0] - ctrl.pos[0], ML.at[2] - ctrl.pos[2]); if (q < 2.4 && Math.abs(ML.at[1] - ctrl.pos[1]) < 1.6) { st = stops[0]; d = q; } }
      if (here) for (let k = 0; k < 6; k++) { const p = ringStop(here, k), q = Math.hypot(p[0] - ctrl.pos[0], p[2] - ctrl.pos[2]); if (q < 2.6 && q < d) { d = q; st = { ...stops.find(x => x.ring === here), label: `${here.label[0].toUpperCase() + here.label.slice(1)} — ${here.plan.rooms[k].label}` }; } }
      if (st) return { L: { b: { label: 'the spoke lift' }, stops: stops.map(x => x.ring && st.ring === x.ring ? st : x) }, st, d, spoke: true };
    }
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
    const q = L.stops[+pick.v];
    if (q.at) {         // up a spoke to the hub, where you weigh nothing, along it, and down another
      const rise = q.at[1] - ctrl.pos[1]; clock.advance(q.ring || q.deck ? 70 : Math.max(10, Math.abs(rise) / 8)); ctrl.pos = q.at.slice(); ctrl.vel = [0, 0, 0]; ctrl.grounded = false;
      if (q.face !== undefined) { ctrl.facing = q.face; cam.yaw = q.face; }      // (out of the doors with the lift behind you)
      if (!q.ring && !q.deck) { ui.toast(`The lift ${rise > 0 ? 'climbs' : 'drops'} ${Math.round(Math.abs(rise))} m. <small>${esc(q.label)}</small>`, '', 4000); return; }
      ui.toast(q.deck ? 'Up the spoke, along the axle where you weigh nothing, and out into the Meridian\'s promenade.' : `The cab climbs the spoke and you get lighter, float a moment at the hub, then grow heavy again going down into <b>${esc(q.ring.label)}</b>.`, '', 6000);
      return;
    }
    const c = cityView.city, [x, z] = c.toWorld(q.u, q.v);
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
    if (flight && docking) return;
    if (flight && !flight.onGround) { const dt_ = dockTarget(); if (dt_) { startDock(dt_.C); return; } }
    if (flight && !flight.onGround && flight.pos[1] - altRef > 5000 && flight.altitude() > 1500) { holoFlow(); return; }        // (5 km up and in the air, clear of anything under you: the navigation screen, and the stars. Set down on a deck — a great ship's bay five kilometres up — E shuts down and steps out)
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
  const peopleNear = (t, x, z, r, max) => scatter(t, cityWalkers(cityView.city, t, x, z, r, max).concat(siteWalkers(planet, t, x, z, r, max)).sort((a, b) => a.d - b.d).slice(0, max));
  // People who've just seen something run from it, then calm down and go back to what they were at. Nothing is stored: it's worked out
  // from where they'd otherwise be, and how long ago it happened.
  const SCATTER = 22, SCATTER_R = 34, SHOUTS = ['Help! Somebody help!', 'Get away from me!', 'Call the watch!', 'Run!', "What are you doing?!", 'Stop them!'];
  function scatter(t, list) {
    const A = mayhem?.alarm; if (!A) return list; const dt = t - A.t; if (dt < 0 || dt > SCATTER) { if (dt > SCATTER) mayhem.alarm = null; return list; }
    for (const w of list) { if (w.indoors || w.uniform) continue; const dx = w.pos[0] - A.at[0], dz = w.pos[2] - A.at[1], d = Math.hypot(dx, dz) || 1; if (d > SCATTER_R) continue;
      const out = dt < SCATTER * 0.6 ? Math.min(22, dt * 4.6) : Math.max(0, 22 * (1 - (dt - SCATTER * 0.6) / (SCATTER * 0.4))), ux = dx / d, uz = dz / d, [rx, rz] = world.resolve(w.pos[0] + ux * out, w.pos[2] + uz * out, w.pos[1] + 0.3);
      w.pos = [rx, world.groundAt(rx, rz, w.pos[1] + 2).h, rz]; w.moving = dt < SCATTER * 0.95; w.pose = 'walk'; w.facing = dt < SCATTER * 0.6 ? Math.atan2(ux, uz) : Math.atan2(-ux, -uz); w.doing = 'running'; w.scared = true; }
    return list;
  }
  const villagerAhead = t => { let best = null, bd = 2.6; if (ctrl.mode !== 'walk') return null; for (const w of siteWalkers(planet, t, ctrl.pos[0], ctrl.pos[2], 5, 8)) { if (mayhem?.out.has(w.id)) continue; const dx = w.pos[0] - ctrl.pos[0], dz = w.pos[2] - ctrl.pos[2], d = Math.hypot(dx, dz); if (d < bd && Math.abs(w.pos[1] - ctrl.pos[1]) < 1.5 && (dx * Math.sin(ctrl.facing) + dz * Math.cos(ctrl.facing)) / (d || 1) > 0.2) { bd = d; best = w; } } return best; };
  const villagerChats = new Map();
  // the traffic lights near you show what their junction's doing
  function showCityLights() {
    const c = cityView.city, out = [];
    if (town.group.visible) { const t = clock.now(), RED = [1, 0.1, 0.06], AMB = [1, 0.6, 0.1], GRN = [0.1, 1, 0.3], base = s.h + 0.05;
      for (const S of townSignals(s)) { if (Math.hypot(S.x - ctrl.pos[0], S.z - ctrl.pos[2]) > 190) continue; const st = townLight(S, t);
        // over each lane coming in, on its right: the head on its arm
        for (const [on, lu, lv, axis] of [[S.arms.vm, S.u + S.hu + 0.7 - 3.5, S.v - S.hv - 1.2 - 0.33, 0], [S.arms.vp, S.u - S.hu - 0.7 + 3.5, S.v + S.hv + 1.2 + 0.33, 0], [S.arms.um, S.u - S.hu - 1.2 - 0.33, S.v - S.hv - 0.7 + 3.5, 1], [S.arms.up, S.u + S.hu + 1.2 + 0.33, S.v + S.hv + 0.7 - 3.5, 1]]) { if (!on) continue; const y = st === axis ? 4.5 : st === -1 ? 4.83 : 5.16, [wx, wz] = s.toWorld(lu, lv); out.push({ pos: toRender(wx, base + y, wz), col: st === axis ? GRN : st === -1 ? AMB : RED }); } } }
    if (Math.hypot(ctrl.pos[0] - c.cx, ctrl.pos[2] - c.cz) > c.R + 300) { cityTraffic.showLights(out); return; }
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
    for (const u of usablesOf(planet, world.townOf(loc.b), loc.b)) {
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
  const toWorldDir = (b, a) => { const p0 = b2w(b, 0, 0, 0), p1 = b2w(b, Math.sin(a), 0, Math.cos(a)); return Math.atan2(p1[0] - p0[0], p1[2] - p0[2]); };
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
      const away = q => { const w = b2w(b, q.x, q.y, q.z); return Math.hypot(w[0] - ctrl.pos[0], w[2] - ctrl.pos[2]); };
      const a = u.seats.slice().sort((p, q) => away(p) - away(q))[0]; if (!a) return;
      ctrl.seatAt(b2w(b, a.x, a.y, a.z), toWorldDir(b, a.facing), a.pose, ctrl.pos);
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
  // Whatever's been moved or bought stays where you left it, wherever it came from: so every town anything has come from is looked at, as well as this one.
  const fleetTowns = new Set([homeS]); for (const k of store.deltas.keys()) if (/^(veh|ship)\//.test(k)) { const q = townOfKey(planet, k); if (q) fleetTowns.add(q); }
  let vehicles = [], ride = null, camDist = cam.dist, hotwire = 0;
  const allVehicles = () => [...fleetTowns].flatMap(q => vehiclesIn(store, planet, q)).concat((player.cityCars || []).map(i => { const id = 'cf:' + i, d = store.getDelta('veh/' + id); return d && { id, city: true, ...d, ownerName: 'you' }; }).filter(Boolean));
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
  // ---- crashes (sim/crash.js: what happens; render/wrecks.js and fx.js: what it looks like)
  const fx = new FX(); root.add(fx.group);
  const thrustView = new ThrustView(scene, shipView, fx);
  const trafficGone = new Set(), outSince = new Map(); let goneAtBoot = null;
  const wrecks = new Crashes({ ground: (x, z, y) => Math.max(world.groundAt(x, z, y).h, planet.seaLevel), load: id => store.getDelta('wreck/' + id) || null, save: (id, d) => store.patchDelta('wreck/' + id, d) });
  const wreckView = new WreckView(D => {
    if (D.kind === 'ship') { const M = shipView.models?.[D.model]; if (!M) return null; const { W, D: dp } = M.L; return { prims: M.hullPrims, fit: new THREE.Matrix4().makeRotationY(Math.PI / 2).multiply(new THREE.Matrix4().makeTranslation(-W / 2, 0, -dp / 2)) }; }
    const K = vehView.types[D.type]; if (!K) return null; return { prims: K.prims, fit: K.fit };
  }, D => { const T = D.type && typeOf({ type: D.type }); return T?.paint || PAINTS_VEHICLE[((D.colour % PAINTS_VEHICLE.length) + PAINTS_VEHICLE.length) % PAINTS_VEHICLE.length]; });
  root.add(wreckView.group);
  shipView.hidden = sh => { const D = wrecks.get('ship:' + sh.id); return !!D && (D.hits.length > 0 || D.burnt > 0); };
  { const fel = store.getDelta('felled'); if (fel?.list) for (const [k, a] of fel.list) felledOf(planet).set(k, a); }
  for (const [k, v] of store.deltas) if (k.startsWith('wreck/') && (v.type || v.kind === 'ship') && v.pos) { const id = k.slice(6), D = wrecks.of(id, v); if (id.startsWith('tr:') || id.startsWith('city:')) trafficGone.add(id); }      // what's still lying where you left it
  goneAtBoot = new Set(trafficGone);      // (those were crashed long ago: their drivers are long gone)
  const kindOf = T => T.kind === 'bike' ? 'bike' : 'car';
  const crashRec = (id, v, T = typeOf(v)) => wrecks.of(id, { kind: kindOf(T), L: T.L, W: T.W, H: T.H, type: v.type || T.id, colour: v.colour ?? 0, pos: v.pos, facing: v.facing, pitch: v.pitch, roll: v.roll });
  // On foot, a vehicle's in your way like anything else, and you can get up onto one: its box stops at its roof.
  function carsSolid() {     // (out to 70 m: as far as people are walking about near you, sim/jostle.js)
    const me = ctrl.pos, out = [], add = (x, y, z, facing, T, roof = false, speed = 0) => { if (Math.abs(x - me[0]) > 70 || Math.abs(z - me[2]) > 70 || Math.abs(y - me[1]) > 12) return; const fx = Math.sin(facing), fz = Math.cos(facing); out.push({ x, y, z, fx, fz, hl: T.L * (speed ? 0.47 : 0.5), hw: T.W * (speed ? 0.47 : 0.5), h: T.H * 0.92, reach: Math.hypot(T.L, T.W) * 0.5, roof, vx: fx * (speed || 0), vz: fz * (speed || 0) }); };
    for (const v of vehicles) { const D = wrecks.get(v.id); add(D ? D.pos[0] : v.pos[0], D ? D.pos[1] : v.pos[1], D ? D.pos[2] : v.pos[2], D ? D.facing : v.facing, typeOf(v), true); }
    for (const D of wrecks.list.values()) if (D.kind !== 'ship' && !vehicles.some(v => v.id === D.id)) add(D.pos[0], D.pos[1], D.pos[2], D.facing, D, true);
    for (const v of lastTraffic) if (!trafficGone.has(v.id)) add(v.pos[0], v.pos[1], v.pos[2], v.facing, typeOf(v), true, (v.speed || 0) * cityTraffic.life.rateOf(v.id));
    for (const v of cityTraffic.nearby) if (!v.ship && v.type && !trafficGone.has('city:' + v.car?.i) && v.car !== mayhem?.rider?.car && !cityTraffic.taken.has(v.car?.i)) add(v.pos[0], v.pos[1], v.pos[2], v.facing, typeOf(v), !mayhem?.rider && (v.parked || (v.speed || 0) < 1), v.moving === false ? 0 : (v.speed || 0));     // (the car you're riding isn't in your way; a moving roof is the rider code's to catch, or you'd stand on where it was a frame ago)
    world.carBoxes = out;
  }
  let rideCamY = null;
  let lastTraffic = [], waterTick = 0, shadowTick = 0, rezT = 0, rezN = 0, rezUp = 0, rezCap = 9, rezCapT = 0, resolution = Math.min(devicePixelRatio, 2) > 1.4 && !params.has('auto') ? Math.min(devicePixelRatio, 2) * 0.75 : Math.min(devicePixelRatio, 2);
  // Things you can hit that aren't walls: parked vehicles, the road's and the city's traffic
  function rideBumps(t) {
    if (!ride) return; const me = ride.pos, T = ride.T, R0 = Math.max(T.L, T.W) * 0.5;
    const hitOne = (id, pos, facing, speed, O, make) => {
      const dx = me[0] - pos[0], dz = me[2] - pos[2], d = Math.hypot(dx, dz), R = R0 * 0.72 + Math.max(O.L, O.W) * 0.36; if (d >= R || d < 1e-3 || Math.abs(pos[1] - me[1]) > Math.max(T.H, O.H)) return;
      const nx = dx / d, nz = dz / d, ov = [Math.sin(facing) * speed, Math.cos(facing) * speed], mine = T.L * T.W, theirs = O.L * O.W, share = theirs / (mine + theirs);
      const dv = ride.collide(nx, nz, 0.15, share * 1.15 + 0.15, ov, 0.9, 0); if (!dv) return;
      ride.pos[0] += nx * (R - d) * 0.6; ride.pos[2] += nz * (R - d) * 0.6;
      const D = make(), big = (dv / Math.max(0.2, share)) * (1 - share);
      const lx = toLocal(D, me[0], pos[1] + O.H * 0.5, me[2]), L = Math.hypot(lx[0], lx[2]) || 1, at = [lx[0] / L * Math.min(O.L * 0.5, Math.abs(lx[0])), O.H * 0.5, lx[2] / L * Math.min(O.W * 0.5, Math.abs(lx[2]))], w = dirLocal(D, -nx, 0, -nz);
      wrecks.hit(D, big, at, w); wrecks.shove(D, -nx * big * 0.75 + ov[0] * 0.8, big * 0.08, -nz * big * 0.75 + ov[1] * 0.8); fx.sparks([(me[0] + pos[0]) / 2, pos[1] + O.H * 0.5, (me[2] + pos[2]) / 2], Math.min(40, Math.round(dv * 2.5)), Math.min(14, 3 + dv * 0.4));
      if (mayhem && dv > 3) mayhem.crime(t, 'a smash', Math.min(0.8, dv * 0.03), pos);
    };
    for (const v of vehicles) { if (v.id === ride.v.id) continue; const O = typeOf(v); if (Math.abs(v.pos[0] - me[0]) > 15 || Math.abs(v.pos[2] - me[2]) > 15) continue; const live = wrecks.get(v.id); hitOne(v.id, live ? live.pos : v.pos, live ? live.facing : v.facing, 0, O, () => crashRec(v.id, v, O)); }
    for (const D of wrecks.list.values()) { if (D.ride || D.kind === 'ship' || vehicles.some(v => v.id === D.id) || Math.abs(D.pos[0] - me[0]) > 15 || Math.abs(D.pos[2] - me[2]) > 15) continue; hitOne(D.id, D.pos, D.facing, 0, D, () => D); }
    // a tree in the way goes over, if you're moving and it isn't too big
    if (Math.abs(ride.speed) > 9) floraNear(planet, me[0] + Math.sin(ride.facing) * T.L * 0.5, me[2] + Math.cos(ride.facing) * T.L * 0.5, T.W * 0.5 + 1.2, p => { if (!p.solid || p.felled || Math.abs(p.y - me[1]) > 3 || p.size > 8 + Math.abs(ride.speed) * 0.7) return; const a = Math.atan2(Math.sin(ride.facing), Math.cos(ride.facing)); felledOf(planet).set(fellKey(p), +ride.facing.toFixed(2)); p.felled = { a: ride.facing }; store.patchDelta('felled', { list: [...felledOf(planet).entries()] }); flora.at = null; fx.dust([p.x, p.y + 0.2, p.z], 16, [0.32, 0.28, 0.2]); wreckView.throwBits({ facing: 0, pos: [p.x, p.y, p.z] }, [0, 1, 0], [0, 0, 0], 16, 4, [0.26, 0.17, 0.09]); ride.speed *= 0.72; const dv = Math.abs(ride.speed) * 0.3; if (!ride.crash || dv > ride.crash.dv) ride.crash = { dv, at: [T.L * 0.48, T.H * 0.4, 0], dir: [-1, 0, 0], nx: 0, nz: 0 }; });
    const near = trafficNear(planet, s, clock.now(), me[0], me[2], 18, cityTraffic.life.delayOf);
    for (const v of near) { if (v.parked || trafficGone.has(v.id)) continue; const O = typeOf(v); hitOne(v.id, v.pos, v.facing, v.speed * cityTraffic.life.rateOf(v.id), O, () => { trafficGone.add(v.id); return crashRec(v.id, v, O); }); }
    for (const v of cityTraffic.nearby) { if (v.ship || v.parked || v.car === mayhem?.rider?.car || cityTraffic.taken.has(v.car?.i) || Math.abs(v.pos[0] - me[0]) > 15 || Math.abs(v.pos[2] - me[2]) > 15) continue; const O = typeOf(v), id = 'city:' + v.car?.i; if (trafficGone.has(id)) continue; hitOne(id, v.pos, v.facing, v.speed || 0, O, () => { trafficGone.add(id); if (v.car) cityTraffic.taken.add(v.car.i); return crashRec(id, { ...v, type: v.type }, O); }); }
  }
  // A crash of the vehicle you're in: what it did to the machine, and what it did to you.
  function afterRide(dt) {
    if (!ride) return;
    const T = ride.T, D = crashRec(ride.v.id, { ...ride.v, pos: ride.pos, facing: ride.facing }, T);
    D.ride = true; D.pos = ride.pos.slice(); D.facing = ride.facing; D.pitch = ride.pitch; D.roll = ride.roll; ride.dead = D.dead;
    const C = ride.crash; ride.crash = null;
    if (C) {
      const dir = C.ground ? [0, 1, 0] : C.dir, at = C.ground ? [0, 0.05, 0] : C.at, r = wrecks.hit(D, C.dv, at, dir); ride.dead = D.dead;
      if (!r.none) {
        const p = [ride.pos[0] + Math.sin(ride.facing) * at[0] - Math.cos(ride.facing) * at[2], ride.pos[1] + T.H * 0.5, ride.pos[2] + Math.cos(ride.facing) * at[0] + Math.sin(ride.facing) * at[2]];
        fx.sparks(p, Math.min(60, Math.round(C.dv * 3)), Math.min(13, 3 + C.dv * 0.4), [C.nx || 0, 0, C.nz || 0]); if (C.dv > 8) fx.dust(p, Math.min(24, Math.round(C.dv)));
        fx.shake = Math.max(fx.shake, Math.min(0.9, C.dv * 0.03));
        const hurt = C.dv > 7 ? (C.dv - 7) ** 1.5 * (T.kind === 'bike' ? 1.8 : 0.72) : 0; if (hurt) hurtPlayer(Math.min(150, hurt), `a crash at ${Math.round(C.dv * 3.6)} km/h`);
        scare(ride.pos, clock.now()); fauna?.scare(ride.pos[0], ride.pos[2], 50);
        // on a bike you keep going when it doesn't. In a car, only if it's bad.
        if (ride && ((T.kind === 'bike' && C.dv > 11) || C.dv > 33)) throwClear(C);
      }
    }
    if (ride && ride.dead) { D.smoke = Math.max(D.smoke, 0.3); }
    if (ride && D.fire > 0.55) { burnTick += dt; if (burnTick > 1) { burnTick = 0; hurtPlayer(7, 'the fire'); } }
  }
  let burnTick = 0;
  function throwClear(C) {
    const v = ride.v, sp = Math.abs(ride.speed) + C.dv * 0.8, f = ride.facing; park(store, v, ride.pos, f); wrecks.get(v.id) && (wrecks.get(v.id).ride = false);
    ctrl.pos = [ride.pos[0] + Math.sin(f) * (ride.T.L * 0.5 + 0.6), ride.pos[1] + 1.1, ride.pos[2] + Math.cos(f) * (ride.T.L * 0.5 + 0.6)];
    ctrl.mode = 'walk'; const nx = -(C.nx || 0) * -0.6, nz = -(C.nz || 0) * -0.6; ride = null; cam.dist = camDist; vehicles = allVehicles();
    ctrl.knock((Math.sin(f) * 0.7 + nx) * Math.min(14, sp), Math.min(7, 2 + C.dv * 0.2), (Math.cos(f) * 0.7 + nz) * Math.min(14, sp), 1.6);
  }
  function stepCrashes(dt, t, _, traffic) {
    wrecks.step(dt);
    for (const e of wrecks.drain()) {
      if (e.type === 'blast') {
        fx.blast(e.pos, e.R); wreckView.throwBits(e.D, [0, e.D.H * 0.6, 0], [0, -0.3, 0], 40, 15, wreckView.items.get(e.D.id)?.paint || [0.2, 0.2, 0.2]);
        // what's on the road when it goes up goes with it
        for (const v of trafficNear(planet, s, t, e.pos[0], e.pos[2], e.R * 1.4, cityTraffic.life.delayOf)) { if (v.parked || trafficGone.has(v.id) || Math.hypot(v.pos[0] - e.pos[0], v.pos[2] - e.pos[2]) > e.R * 1.2) continue; trafficGone.add(v.id); crashRec(v.id, v, typeOf(v)); }
        for (const v of cityTraffic.nearby) { if (v.ship || !v.car || v.car === mayhem?.rider?.car || Math.hypot(v.pos[0] - e.pos[0], v.pos[2] - e.pos[2]) > e.R * 1.2) continue; const id = 'city:' + v.car.i; if (trafficGone.has(id)) continue; trafficGone.add(id); cityTraffic.taken.add(v.car.i); crashRec(id, v, typeOf(v)); }
        for (const v of vehicles) { if (ride?.v.id !== v.id && Math.hypot(v.pos[0] - e.pos[0], v.pos[2] - e.pos[2]) < e.R * 1.2) crashRec(v.id, v); }
        wrecks.blastAt(e.pos, e.R * 1.5, e.D);
        // you
        const me = ride ? ride.pos : flight ? flight.pos : ctrl.pos, d = Math.hypot(me[0] - e.pos[0], me[1] - e.pos[1], me[2] - e.pos[2]);
        if (ride && e.D.id === ride.v.id) { hurtPlayer(95, 'the explosion'); if (ride) throwClear({ dv: 26, nx: 0, nz: 0 }); }
        else if (d < e.R * 1.6) { const f = Math.max(0, 1 - d / (e.R * 1.6)); hurtPlayer(130 * f * f, 'an explosion'); if (!ride && !flight) ctrl.knock((me[0] - e.pos[0]) / (d || 1) * 13 * f, 5 * f + 1, (me[2] - e.pos[2]) / (d || 1) * 13 * f, 1.2 * f + 0.2); }
        fx.shake = Math.max(fx.shake, Math.max(0, 1 - d / (e.R * 8)));
        // anyone in it, and everyone who heard it
        for (const a of agents) { if (String(a.id).startsWith('tr:') || !a.person || bodies.some(b => b.id === a.id)) continue; const q = Math.hypot(a.pos[0] - e.pos[0], a.pos[2] - e.pos[2]); if (q < e.R) { const res = strike(ctx, a.person, q < e.R * 0.55 ? 'marksman' : 'pistol', t, []); if (!downAt.has(a.person.id)) downAt.set(a.person.id, { pos: a.pos.slice(), facing: a.facing }); if (res.killed) bodies.push({ id: a.person.id, person: a.person, pos: a.pos.slice(), facing: a.facing, until: t + planet.dayLength / 24 }); } }
        scare(e.pos, t); fauna?.scare(e.pos[0], e.pos[2], 180); for (const A of fauna?.animals || []) { const q = Math.hypot(A.x - e.pos[0], A.z - e.pos[2]); if (q < e.R) fauna.hurt(A, 200 * (1 - q / e.R)); }
        if (mayhem) mayhem.crime(t, 'an explosion', 1.4, e.pos);
      }
    }
    // a wreck still moving carries on into whatever's next
    for (const D of wrecks.list.values()) { const sp = Math.hypot(D.vel[0], D.vel[2]); if (D.ride || sp < 4 || D.kind === 'ship') continue; const hitAny = (O, id, make) => { const d = Math.hypot(O.pos[0] - D.pos[0], O.pos[2] - D.pos[2]); if (d > (D.L + O.L) * 0.42 || d < 0.01) return; const M = make(), nx = (O.pos[0] - D.pos[0]) / d, nz = (O.pos[2] - D.pos[2]) / d, vn = D.vel[0] * nx + D.vel[2] * nz; if (vn < 1) return; wrecks.hit(M, vn, [0, M.H * 0.5, 0], [0, 0, 1]); wrecks.shove(M, nx * vn * 0.6, vn * 0.05, nz * vn * 0.6); wrecks.hit(D, vn * 0.7, [D.L * 0.45, D.H * 0.5, 0], [-1, 0, 0]); D.vel[0] -= nx * vn * 0.7; D.vel[2] -= nz * vn * 0.7; fx.sparks([(O.pos[0] + D.pos[0]) / 2, D.pos[1] + 0.7, (O.pos[2] + D.pos[2]) / 2], 22, 8); }; for (const O of wrecks.list.values()) if (O !== D && !O.ride && O.kind !== 'ship') hitAny(O, O.id, () => O); for (const v of vehicles) if (v.id !== D.id && ride?.v.id !== v.id) hitAny({ pos: v.pos, L: typeOf(v).L }, v.id, () => crashRec(v.id, v)); for (const v of traffic) if (!v.parked && !trafficGone.has(v.id)) hitAny({ pos: v.pos, L: typeOf(v).L }, v.id, () => { trafficGone.add(v.id); return crashRec(v.id, v, typeOf(v)); }); }
    const wx = weatherAt(planet, t).wind;
    wreckView.update(dt, wrecks, (x, z, y) => Math.max(world.groundAt(x, z, y).h, planet.seaLevel), fx, wx, ctrl.pos[0], ctrl.pos[2]);
    fx.update(dt, renderer);
    // forget the far old ones that aren't yours (saved all the same)
    for (const D of wrecks.list.values()) if (!D.ride && !D.hits.length && !D.burnt && !D.fire && Math.hypot(D.pos[0] - ctrl.pos[0], D.pos[2] - ctrl.pos[2]) > 800) wrecks.forget(D.id);
  }
  // A ship that hits something: the same rules at its scale.
  function afterFlight(dt, t) {
    if (!flight) return;
    const sh = flight.ship, id = 'ship:' + sh.id, L = flight.L, D = wrecks.of(id, { kind: 'ship', model: sh.model, L: L.D, W: L.W, H: L.H ?? (L.ceiling + 1), type: null, colour: sh.colour || 0, pos: [flight.pos[0], flight.pos[1], flight.pos[2]], facing: flight.facing, pitch: flight.pitch, roll: flight.roll });
    if (flight.felled) { store.patchDelta('felled', { list: [...felledOf(planet).entries()] }); flora.at = null; fx.dust([flight.pos[0], flight.pos[1], flight.pos[2]], 18, [0.3, 0.27, 0.2]); }      // (trees it went through stay down: player/flight.js)
    D.ride = true; D.pos = [flight.pos[0], flight.pos[1] - (L.gear ?? 0), flight.pos[2]]; D.facing = flight.facing; D.pitch = flight.pitch; D.roll = flight.roll; flight.dead = D.dead;
    if (flight.impact > 3) {
      const v = flight.vel, sp = Math.hypot(...v) || 1, r = flight.belly ? wrecks.hit(D, flight.impact, [(Math.random() - 0.5) * L.D * 0.5, 0.2, (Math.random() - 0.5) * L.W * 0.3], [0, 1, 0]) : wrecks.hit(D, flight.impact, [L.D * 0.42, (L.H ?? 3) * 0.4, 0], [-1, 0, 0]);
      if (!r.none) { fx.sparks(flight.pos, Math.min(90, Math.round(flight.impact * 3)), 14); fx.shake = Math.max(fx.shake, Math.min(1, flight.impact * 0.03)); if (flight.impact > 15) hurtPlayer(Math.min(120, (flight.impact - 15) ** 1.4 * 0.6), `a crash at ${Math.round(flight.impact * 3.6)} km/h`); }
    }
    // down and dead on the ground, or blown apart: you're out of it
    if (D.exploded || (D.dead && flight.onGround && Math.hypot(...flight.vel) < 3)) {
      D.ride = false; player.piloting = null; sh.wrecked = true; const p = flight.pos.slice(), f = flight.facing;
      window.__flightEnd = D.exploded ? 'exploded' : 'wrecked'; leaveWar(); flight = null; cam.dist = camDist; ctrl.mode = 'walk'; ctrl.pos = [p[0] + Math.cos(f) * (L.W * 0.5 + 2), world.groundAt(p[0], p[2], p[1] + 2).h + 0.2, p[2] - Math.sin(f) * (L.W * 0.5 + 2)]; ctrl.vel = [0, 0, 0];
      if (D.exploded) ctrl.knock(Math.cos(f) * 7, 4, -Math.sin(f) * 7, 1.6);
      syncShips();
    }
  }
  // A shot that finds a vehicle
  function shotVehicles(wo, dir, best, W, list) {
    let hit = null, bd = best;
    for (const q of list) { const T = q.T, cx = q.pos[0], cy = q.pos[1] + T.H * 0.5, cz = q.pos[2], dx = cx - wo[0], dy = cy - wo[1], dz = cz - wo[2], along = dx * dir[0] + dy * dir[1] + dz * dir[2]; if (along < 1 || along > bd) continue; if (Math.hypot(dx - dir[0] * along, dy - dir[1] * along, dz - dir[2] * along) < Math.max(T.W * 0.55, T.H * 0.5) + (W.wide ? 0.4 : 0)) { bd = along; hit = { ...q, along }; } }
    return hit;
  }
  function mount(v) {
    if (wrecks.get(v.id)?.dead) { ui.toast("It's a wreck. It won't start.", 'warn', 2500); return; }
    ride = new Ride(world, planet, v); ctrl.mode = 'ride'; camDist = cam.dist; cam.dist = Math.max(cam.dist, 6.5);
  }
  function getOff() {
    if (Math.abs(ride.speed) > 4 && !ride.v.fly) { ui.toast('Slow down first.', 'warn', 2000); return; }
    park(store, ride.v, ride.pos, ride.facing); if (wrecks.get(ride.v.id)) wrecks.get(ride.v.id).ride = false;
    if (ride.v.fly && ride.pos[1] - world.groundAt(ride.pos[0], ride.pos[2], ride.pos[1]).h > 3) {       // out of a sky car, in the sky
      ctrl.pos = [ride.pos[0] - Math.cos(ride.facing) * 1.6, ride.pos[1], ride.pos[2] + Math.sin(ride.facing) * 1.6]; ctrl.vel = [Math.sin(ride.facing) * ride.speed * 0.8, 0, Math.cos(ride.facing) * ride.speed * 0.8]; ctrl.grounded = false; ctrl.mode = 'walk'; ctrl.facing = ride.facing; ride = null; cam.dist = camDist; vehicles = allVehicles(); return;
    }
    ctrl.pos = ride.dismountSpot(); ctrl.vel = [0, 0, 0]; ctrl.mode = 'walk'; ctrl.facing = ride.facing;
    ride = null; cam.dist = camDist; vehicles = allVehicles();
  }
  const garageNear = () => { const [x, z] = ctrl.pos; for (const b of s.buildings) { if (b.type !== 'workshop') continue; const [wx, wz] = s.toWorld(b.O[0], b.O[1]); if (Math.hypot(wx - x, wz - z) < 200) return b.owner || 'the workshop'; } let hit = null; sitesNear(planet, x, z, 200, S => { for (const it of S.items) if (/^gb_(garage|smithy)/.test(it.k) && Math.hypot(it.x - x, it.z - z) < 200) hit = 'the garage'; }); return hit; };
  async function repairFlow(v, D) {
    const T = typeOf(v), g = garageNear();
    if (D.exploded || D.burnt > 0.5) { ui.toast('Burnt out. Nothing left to fix.', 'warn', 3000); return; }
    if (!g) { ui.toast(D.dead ? "It's a wreck, and there's no garage near enough to tow it to." : 'It needs a garage.', 'warn', 3500); return; }
    const cost = Math.max(40, Math.round((100 - D.hp) / 100 * T.price * 0.45)); let pick = null;
    await modal(async () => { pick = await ui.choose({ title: 'Repair it', sub: `${esc(g)} can have it right. It's ${Math.round(D.hp)}% what it was.`, options: [{ a: 'fix', label: `Fix it — ${cost} cr`, note: `You have ${player.credits ?? 0} cr`, disabled: (player.credits ?? 0) < cost }] }); });
    if (pick?.a !== 'fix') return; player.credits -= cost; store.touchPlayer(); const key = 'wreck/' + v.id, keep = store.getDelta(key); if (keep) { const clear = {}; for (const q of Object.keys(keep)) clear[q] = undefined; store.patchDelta(key, clear); } wrecks.forget(v.id); ui.toast('Good as new.', '', 2500);
  }
  async function bikeFlow(v) {
    { const D = wrecks.get(v.id); if (isYours(v, player) && D && (D.hits.length || D.burnt > 0)) { await repairFlow(v, D); if (wrecks.get(v.id)) { if (D.dead) return; } } }
    if (isYours(v, player)) return mount(v);
    if (v.forSale) {
      let pick = null;
      const T = typeOf(v); await modal(async () => { pick = await ui.choose({ title: T.name, sub: `For sale at ${esc(v.ownerName)}. About ${Math.round(T.top * 3.6)} km/h, ${Math.round(T.top * 3.6 * 1.4)} boosted. Hovers over ground and water.`,
        options: [{ a: 'buy', label: `Buy it — ${T.price} cr`, note: `You have ${player.credits ?? 0} cr`, disabled: (player.credits ?? 0) < T.price }] }); });
      if (pick?.a !== 'buy') return;
      const r = buyVehicle(store, v, clock.now());
      ui.toast(r.ok ? 'It\'s yours.' : r.why, r.ok ? '' : 'warn'); vehicles = allVehicles();
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
    vehicles = allVehicles(); mount(vehicles.find(x => x.id === v.id));
  }
  // ---- ships (gen/ships.js, world/ships.js, player/flight.js). A landed ship is a
  // structure in the collision world, like a building; a flying one is a Flight.
  let flyAs = null;      // (?fly=<model>: whichever ship you take is that model)
  const fleet = fleetOf(planet, homeS);
  const visitorShip = () => { const V = store.getDelta('visitor/ship'); return V ? { ...V, ...(store.getDelta(shipKey(V.id)) || {}) } : null; };      // (a ship you flew in from another world: its record lives in this world's save)
  let strikeView = null;      // (the dreadnought over a town just now, if there's one: strikeTick, further on)
  let issuedShip = null;      // (the fighter you were issued, while it's standing somewhere: it's a ship like any other until it's handed back)
  const allShips = t => { const L = [...fleetTowns].flatMap(q => shipsIn(store, planet, q, t)).concat(fleet.filter(C => !C.away).map(C => C.ship), visitorShip() ? [visitorShip()] : [], strikeView?.deck ? [strikeView.C.ship] : [], issuedShip && store.getDelta(shipKey(issuedShip.id))?.at ? [{ ...issuedShip, ...store.getDelta(shipKey(issuedShip.id)) }] : []); /* (a great ship away on a run has no decks here to walk: gen/voyages.js) */ if (flyAs) for (const x of L) if (x.id === flyAs.id) { x.model = flyAs.model; if (flyAs.paint !== null) x.colour = flyAs.paint; } return L; }, shipTown = sh => townOfKey(planet, sh.id) || homeS;
  let ships = allShips(clock.now()), flight = null, rampHold = 0, cockpitView = false;
  const stick = [0, 0];
  // In a ship the mouse aims: it swings a direction round the sky and the view follows it; your instructor flies the nose there, the guns with it
  // (render the aim circle: ui/flighthud.js). The arrow keys are the stick itself and take over while they're held.
  let aimDir = null, aimSt = {};     // (aimSt: the instructor's memory — its eased bank, the way round it chose)
  cam.onMouse = (dx, dy) => { if (!flight) return false; if (docking) return true;
    if (!aimDir) aimDir = flight.fwd.slice();
    let yaw = Math.atan2(aimDir[0], aimDir[2]), pit = Math.asin(Math.max(-1, Math.min(1, aimDir[1]))); yaw -= dx * 0.0021; pit = Math.max(-1.45, Math.min(1.45, pit - dy * 0.0021));
    aimDir = [Math.sin(yaw) * Math.cos(pit), Math.sin(pit), Math.cos(yaw) * Math.cos(pit)]; return true; };
  const placed = new Map();          // ship id → structure in the collision world
  const shipById = id => ships.find(x => x.id === id);
  function syncShips() {
    ships = allShips(clock.now());
    for (const sh of ships) {
      // a cargo run due while you're aboard waits: today's run is off
      if (onRun(sh) && placed.has(sh.id) && world.locate(...ctrl.pos)?.b?.key === sh.id) { holdRun(store, sh); ships = allShips(clock.now()); return syncShips(); }
      const want = !sh.flying && !onRun(sh) && !(flight && flight.ship.id === sh.id) && !wrecks.get('ship:' + sh.id)?.exploded, have = placed.get(sh.id);     // (blown apart: there's no inside left)
      const sig = JSON.stringify([sh.at, sh.O]);
      if (have && (!want || have.sig !== sig)) { world.removeStructure(have); placed.delete(sh.id); }
      if (want && !placed.has(sh.id)) {
        const b = structureOf(shipTown(sh), sh, id => sh.fleet || id !== 0 || (rampDown(shipById(sh.id) || sh, planet, clock.now(), player) && shipView.rampOpen(sh.id)), planet);
        b.sig = sig; world.addStructure(b, shipTown(sh)); placed.set(sh.id, b);
      }
    }
  }
  // loading aboard a ship: it's there to stand in. Its town's fleet is counted, and a cargo run due while you were away waits (as it would with you aboard)
  { const A = player.aboard; if (A && !player.piloting) { const q = townOfKey(planet, A); if (q) fleetTowns.add(q); const sh = allShips(clock.now()).find(x => x.id === A); if (sh && onRun(sh) && sh.trip) holdRun(store, sh); } }
  syncShips();
  sched.add(TIER.NEAR, { update: syncShips });
  // ---- the Meridian's spin rings (gen/rings.js). Each is walked as a flat strip laid out over the ship, its ends the same place; it's only
  // drawn bent and turning (render/rings.js). In there, spin holds you to the floor (player/controller.js).
  const meridian = fleet.find(C => C.model === 'meridian');
  const ringStructs = meridian ? RINGS.map((g, i) => { const f = meridian.yaw, b = ringStructure(homeS, g, [meridian.x + Math.cos(f) * (i - 1) * 140, meridian.y + 700, meridian.z - Math.sin(f) * (i - 1) * 140], f); world.addStructure(b, homeS); return b; }) : [];     // (side by side over the ship, so none is over another)
  const ringHere = (p = ctrl.pos) => { for (const b of ringStructs) { if (p[1] < b.base - 3 || p[1] > b.base + 40) continue; const [lx, lz] = world.toB(b, p[0], p[2]); if (lx > -1 && lx < b.w + 1 && lz > -2 && lz < b.d + 2) return b; } return null; };
  const ringStop = (b, k = 0) => { const g = b.plan.ring, sk = (k + 0.5) * g.C / 6; return b2w(b, RING_W / 2, 0.05, sk - 4.4); };
  const yawOf = ([dx, dz]) => Math.atan2(dx, dz), ringFace = b => yawOf(world.fromBVec(b, 0, -1));
  const ringBend = new THREE.Matrix4(), _rm = new THREE.Matrix4(), _rp = new THREE.Vector3(), _rq = new THREE.Quaternion(), _rs = new THREE.Vector3();
  function meridianLift() {     // the spoke lift's door in the Meridian's promenade, if its decks are standing
    const b = meridian && placed.get(meridian.ship.id); return b ? { b, at: b2w(b, 3.3, b.plan.layout.deck, 48.25), face: yawOf(world.fromBVec(b, 1, 0)) } : null;
  }
  // ---- the Vesper's city deck (gen/vesper.js): streets you can walk, roofs you can land on, lifts up the towers, and one down to the docks
  const vesper = fleet.find(C => C.model === 'vesper'), vesperB = vesper ? vesperStructure(homeS, vesper) : null;
  // the Vesper's trees are the planet's own: down the boulevard and in the parks under the domes
  const vesperStreets = vesper ? new VesperStreets(planet, homeS, world, propLib, cityView, vesper, vesperCity()) : null; if (vesperStreets) root.add(vesperStreets.group);
  capitalView.onMesh = C => { if (C.model !== 'vesper') return; if (vesperStreets) C.mesh.add(vesperStreets.farGroup()); const V = vesperCity(), set = plantSet(planet).filter(sp => flora.kinds?.[sp]); if (!set.length) return;
    const spots = V.trees.map(([x, z], i) => ({ sp: set[i % set.length], x, y: V.DY + 0.2, s: z, h: 9, k: i * 7919 })).concat(V.parkTrees.map(([x, z, h, k]) => ({ sp: set[k % set.length], x, y: V.DY + 1.5, s: z, h, k })));
    const g = plantGroup(flora, spots, (it, q) => { q.identity(); return new THREE.Vector3(it.x, it.y, it.s); }); if (g) C.mesh.add(g); };
  if (vesperB) { world.owner.set(vesperB, homeS); world.loose.push({ b: vesperB, x: vesper.x, z: vesper.z, r: 2800 }); }
  const VC = vesper ? vesperCity() : null;
  function vesperLift() {
    if (!vesperB) return null; const p = ctrl.pos, near = (q, r = 2.4) => Math.hypot(q[0] - p[0], q[2] - p[2]) < r && Math.abs(q[1] - p[1]) < 1.8;
    const db = placed.get(vesper.ship.id), dock = db && b2w(db, 3.3, db.plan.layout.deck, 48.25), plaza = vesperB.toWorld(VC.plaza[0], VC.DY, VC.plaza[1] - 2.6);
    const dir = (x, z) => { const a = vesperB.toWorld(0, 0, 0), b = vesperB.toWorld(x, 0, z); return yawOf([b[0] - a[0], b[2] - a[2]]); };
    const down = [dock && { label: 'The docks — promenade', at: [dock[0], dock[1] + 0.05, dock[2]], face: yawOf(world.fromBVec(db, 1, 0)) }, { label: 'The city deck — the spire plaza', at: [plaza[0], plaza[1] + 0.05, plaza[2]], face: dir(0, -1) }].filter(Boolean);
    if (dock && near(dock, 2.2)) return { L: { b: { label: 'the city lift' }, stops: down }, st: down[0], d: 1 };
    if (near(plaza)) return { L: { b: { label: 'the city lift' }, stops: down }, st: down[down.length - 1], d: 1 };
    for (const Lf of VC.lifts) {
      const T = VC.towers[Lf.tower], st = vesperB.toWorld(...Lf.street), rf = vesperB.toWorld(...Lf.roof);
      const stops = [{ label: 'The street', at: [st[0], st[1] + 0.05, st[2]], face: dir(0, -1) }, { label: `The roof — ${Math.round(T.top - VC.DY)} m up`, at: [rf[0], rf[1] + 0.05, rf[2]], face: dir(0, 1) }];
      if (near(st)) return { L: { b: { label: `tower ${T.id + 1}` }, stops }, st: stops[0], d: 1 };
      if (near(rf)) return { L: { b: { label: `tower ${T.id + 1}` }, stops }, st: stops[1], d: 1 };
    }
    return null;
  }
  const nearRamp = () => {
    if (ctrl.mode !== 'walk') return null;
    for (const [id, b] of placed) {
      const L = b.plan.layout, mx = (L.ramp.x0 + L.ramp.x1) / 2;
      const foot = b2w(b, mx, 0, L.ramp.z0 - 0.4), top = b2w(b, mx, L.deck, L.ramp.z1 + 0.6);
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
    if (shipIsYours(sh, player)) { opts.push({ a: 'launch', label: 'Take off', note: 'Space climb · Q descend · W/S thrust · A/D turn · Shift boost · E lands when you\'re down and slow' });
      const here = sh.at ? settlementNear(planet, sh.at.c[0], sh.at.c[2]) : s; if (here && marketOf(planet, here, dayIndex(planet, t)).length) opts.push({ a: 'trade', label: `Trade cargo at ${here.name}`, note: `${holdOf(sh).n} of ${holdSize(LAYOUTS[sh.model])} crates in the hold` }); }
    else {
      if (sh.forSale) opts.push({ a: 'buy', label: `Buy the ${sh.name} — ${PRICES[sh.model]} cr`, note: `You have ${player.credits ?? 0} cr`, disabled: (player.credits ?? 0) < PRICES[sh.model] });
      opts.push({ a: 'steal', label: 'Override the lockout and take off', note: `It belongs to ${esc(sh.ownerName)}. <b>That's stealing a ship.</b>` });
    }
    let pick = null;
    await modal(async () => { pick = await ui.choose({ title: `${sh.name} — helm`, sub: `${shipIsYours(sh, player) ? 'Your ship.' : esc(sh.ownerName) + '\'s ship.'} ${({ freighter: 'A cargo freighter: a high hold, a crew deck with two bunks, a two-seat flight deck.', courier: 'A small fast courier: a cabin and a two-seat cockpit.', patrol: 'Civic Security\'s patrol ship.', yacht: 'A private yacht: a lounge, a galley, a stateroom and a bridge.' })[sh.model] || 'A short-range shuttle: a cargo hold, a bunk and a galley.'}`, options: opts }); });
    if (!pick || pick.a === 'close') return;
    if (pick.a === 'trade') { await tradeFlow(sh, sh.at ? settlementNear(planet, sh.at.c[0], sh.at.c[2]) : s); return; }
    if (pick.a === 'buy') { const r = buyShip(store, sh, t); ui.toast(r.ok ? `The ${esc(sh.name)} is yours. Sit at the helm again to take off.` : r.why, r.ok ? '' : 'warn'); syncShips(); return; }
    if (pick.a === 'steal') {
      const seen = witnessesHere(), inc = stealShip(store, s, sh, t, seen); lodgeIncident(ctx, inc);
      ui.toast(`You overrode the ${esc(sh.name)}'s lockout. ${seen.length ? `<b>${seen} ${seen === 1 ? 'person' : 'people'} saw you.</b>` : 'Nobody saw you.'}`, 'bad', 8000);
    }
    takeOff(allShips(clock.now()).find(x => x.id === sh.id));
  }
  // ---- trade (gen/trade.js): crates in your ship's hold, bought where they're made, sold where they're wanted
  // ---- gangs on their corners (gen/gangs.js)
  let turfT = 0, turfWarned = null, turfTick = 0, scorchTick = 0;
  function gangTick(dt) {
    if ((turfTick -= dt) > 0 || flight || ride || !pop.gangOf) return; turfTick = 0.5;
    const t = clock.now(), hr = (t % planet.dayLength) / planet.dayLength * 24, night = hr > 20 || hr < 3.5;
    // a member's cut, once a day
    if (player.gang && player.gangTown === s.key || player.gang?.startsWith(s.key)) { const d = Math.floor(t / planet.dayLength); if (player.gangDay !== d) { if (player.gangDay != null) { const cut = 30 + (d % 5) * 12; player.credits = (player.credits ?? 0) + cut; ui.toast(`Your cut from ${esc(player.gangName)}'s business: <b>${cut} cr</b>.`, '', 5000); } player.gangDay = d; store.touchPlayer(); } }
    const G = night ? gangsOf(planet, s, pop).find(q => Math.hypot(ctrl.pos[0] - q.turf.x, ctrl.pos[2] - q.turf.z) < q.turf.r) : null;
    if (!G || player.gang === G.id) { turfT = 0; return; }
    const out = G.members.filter(id => { const w = whereAt(pop, pop.byId.get(id), t); return w.activity === 'with the gang'; }); if (out.length < 2) return;
    turfT += 0.5;
    if (turfWarned !== G.id) { turfWarned = G.id; ui.toast(`<b>${esc(G.name)}</b> are out on their corner. Someone calls out: "Wrong street, friend."`, 'warn', 6000); return; }
    if (turfT > 8) { turfT = -40; const take = Math.min(player.credits ?? 0, 40 + Math.floor(Math.random() * 60)); player.credits = (player.credits ?? 0) - take; store.touchPlayer();
      store.log({ t, type: 'mugged', who: player.id, by: G.name, amount: take, town: s.name, at: [Math.round(ctrl.pos[0]), Math.round(ctrl.pos[2])] });
      ui.toast(take ? `${esc(G.name)} close round you and go through your pockets: <b>${take} cr</b> gone.` : `${esc(G.name)} close round you, find nothing worth taking, and shove you on your way.`, 'bad', 8000); hurtPlayer(take ? 6 : 12, G.name); }
  }
  // ---- soldiering (sim/front.js): enlisted with your town's nation, flown to the front in an issued fighter
  const onLand = F => { const x = F.x - Math.sin(F.dir) * 150, z = F.z - Math.cos(F.dir) * 150; return !cloudW && landY(x, z) > planet.seaLevel + 0.5 && landY(F.x, F.z) > planet.seaLevel + 1; };
  // (and level enough to be a battlefield: no more than a gentle roll across the 400 m of it and both sides' ground behind, not a mountainside or a ravine)
  const levelAt = F => { const ux = Math.sin(F.dir), uz = Math.cos(F.dir); let lo = 1e9, hi = -1e9, steep = 0; for (let s = -200; s <= 200; s += 50) { let prev = null; for (let a = -125; a <= 125; a += 25) { const y = landY(F.x + ux * a - uz * s, F.z + uz * a + ux * s); if (y <= planet.seaLevel + 0.3) return false; lo = Math.min(lo, y); hi = Math.max(hi, y); if (prev != null) steep = Math.max(steep, Math.abs(y - prev) / 25); prev = y; } } return hi - lo < 34 && steep < 0.3; };
  // a town within reach of that stretch of border is where the fighting is: in its streets (the megacity and anything in the sea aside)
  setFrontTown((P, F) => { if (P !== planet || cloudW || params.has('fieldwar')) return null; if (params.get('fronttown') === 'home') return { x: homeS.cx, z: homeS.cz, key: homeS.key, name: homeS.name };      // (a test: the war's in your own town)
    let best = null, bd = 9000; try { for (const q of planetWar.h.townsNear(F.x, F.z, 9000)) { const d = Math.hypot(q.cx - F.x, q.cz - F.z); if (d < bd && q.buildings?.length > 6 && landY(q.cx, q.cz) > planet.seaLevel + 1) { bd = d; best = q; } } } catch { } return best && { x: best.cx, z: best.cz, key: best.key, name: best.name }; });
  setFrontFit((P, F) => P === planet && onLand(F) && levelAt(F));      // (sim/front.js: a front over water is found further along the border, on land)
  // ?auto=line: enlisted and on the line at once; a world whose nation has no war on land hands on to the next world
  function lineStart() {
    const nat = townSociety(planet, s)?.nation, F = nat && frontsOf(planet, nat).find(onLand);
    if (!F) { const n = +(params.get('planet') || 0) + 1; if (n < 24) { params.set('planet', n); ui.loading(`No war on land here: on to world ${n}…`, 0); location.replace('?' + params); } else ui.toast('No world nearby has a war on land.', 'warn'); return; }
    if (player.soldier?.nation !== nat.id) player.soldier = { nation: nat.id, rank: 0, kills: 0, since: clock.now() }; store.touchPlayer(); deployFlow(true, 72);      // (the next of a line keeps the rank the regiment gave them back)      // (set down just behind your own sandbags, the fight in front of you)
  }
  async function deployFlow(foot = false, back = 150, pick = null) {
    const S = player.soldier, nat = townSociety(planet, s)?.nation; if (!S || !nat) return;
    const Fs = frontsOf(planet, nat); if (!Fs.length) { ui.toast('Nowhere to send you: there\'s no fighting on our borders today.', 'warn'); return; }
    if (foot) {      // a transport sets you down at your side's rally point, behind the sandbags, with an issued carbine
      const F = pick || Fs.find(onLand) || Fs[0], ux = Math.sin(F.dir), uz = Math.cos(F.dir), x = F.x - ux * back, z = F.z - uz * back;
      if (cloudW || landY(x, z) <= planet.seaLevel + 0.5) { ui.toast('The line here is over water: there\'s no fighting on foot. You could fly.', 'warn'); return; }
      if (!inventoryOf(player).some(q => q.id === 'carbine')) giveItem(player, 'carbine'); player.weapon = 'carbine'; player.footDuty = { x: F.x, z: F.z, rx: F.x - ux * 150, rz: F.z - uz * 150 }; store.touchPlayer(); kit();      // (rx, rz: the rally point, where the medics bring you and you're resupplied)
      { let px = x, pz = z; const q = F.town && townOfKey(planet, F.town), inB = (ax, az) => { if (!q?.buildings) return false; const [u, v] = q.toLocal(ax, az); return q.buildings.some(b => { const du = u - b.O[0], dv = v - b.O[1], lx = du * b.ex[0] + dv * b.ex[1], lz = du * b.ez[0] + dv * b.ez[1]; return lx > -2 && lz > -2 && lx < b.w + 2 && lz < b.d + 2; }); };
        for (let R = 0, k = 0; R <= 60 && inB(px, pz); k++) { if (k % 10 === 0) R += 3; px = x + Math.cos(k * 0.628 + R) * R; pz = z + Math.sin(k * 0.628 + R) * R; }      // (in a town: set down in the street, not in somebody's kitchen)
        ctrl.mode = 'walk'; ctrl.pos = [px, landY(px, pz) + 0.1, pz]; ctrl.vel = [0, 0, 0]; ctrl.facing = F.dir; cam.yaw = F.dir; }
      ui.toast(`<b>On the line.</b> A transport drops you ${back < 120 ? 'just behind the sandbags of the' : 'at the'} ${esc(nat.name)} ${back < 120 ? 'line' : 'rally point'} with a carbine and a squad. Three objectives stand on the border with ${esc(F.b.name)}: hold ours, take theirs.`, '', 11000); return;
    }
    const F = Fs[0], sh = { id: 'issued:' + Math.floor(clock.now()), model: ['interceptor', 'striker', 'warden'][S.rank % 3], name: `${nat.name} ${RANKS[S.rank]} ${player.name.split(' ').pop()}`, colour: 4 };
    const x = F.x - Math.sin(F.dir) * 6000, z = F.z - Math.cos(F.dir) * 6000, y = Math.max(world.groundAt(x, z, 1e5).h, planet.seaLevel) + 900;
    flight = new Flight(world, planet, sh, [x, y, z], F.dir); flight.onGround = false; flight.vel = [Math.sin(F.dir) * 150, 0, Math.cos(F.dir) * 150]; flight.throttle = 0.7; flight.issued = { x: F.x, z: F.z };
    ctrl.mode = 'pilot'; camDist = cam.dist; cam.dist = Math.max(22, flight.L.D * 1.6); cam.pitch = 0.25; joinWar();
    ui.toast(`<b>Deployed.</b> A transport drops you at the staging field and you're in the air in a ${esc(sh.model)}, 6 km short of the ${esc(F.b.name)} line. Bring down what comes at you.`, '', 10000);
  }
  // ---- the great ships' runs (gen/voyages.js): the freighters to other towns and back, the Anvil on patrol
  const voyHome = new Map(fleet.map(C => [C.model, { x: C.x, y: C.y, z: C.z, yaw: C.yaw }])), voySkip = new Map(), voyDests = (() => { const out = [], [ri, rj] = regionOf(homeS.cx, homeS.cz);
    if (!cloudW) for (let i = ri - 6; i <= ri + 6; i++) for (let j = rj - 6; j <= rj + 6; j++) { const q = getSettlement(planet, i, j); if (q && q.key !== homeS.key) { const d = Math.hypot(q.cx - homeS.cx, q.cz - homeS.cz); if (d > 5000 && d < 22000) out.push({ x: q.cx, z: q.cz, name: q.name, d }); } }
    return out.sort((a, b) => a.d - b.d).slice(0, 6); })();
  let voyBoot = true;
  function voyageTick(t) {
    if (params.has('still')) return;       // (?still: the fleet stays on station, for the e2e runs)
    let changed = false;
    for (const C of fleet) {
      if (!VOYAGES[C.model] || docking?.C === C) continue;
      const sk = voySkip.get(C.model) || voySkip.set(C.model, new Set()).get(C.model);
      if (voyBoot) { const v0 = voyageAt(C, voyHome.get(C.model), voyDests, groundY, t); if (v0.away) sk.add(v0.k); }      // (you arrive with them all home: whatever run was under way is finished, the next goes out on time)
      const v = voyageAt(C, voyHome.get(C.model), voyDests, groundY, t, sk);
      if (v.away && !C.away) {      // about to put out: not with you aboard, nor while you're in its bay
        const aboard = world.locate(...ctrl.pos)?.b?.key === C.ship.id || (flight && Math.hypot(flight.pos[0] - C.x, flight.pos[1] - C.y, flight.pos[2] - C.z) < C.length * 0.6);
        if (aboard) { sk.add(v.k); continue; }
        if (Math.hypot(ctrl.pos[0] - C.x, ctrl.pos[2] - C.z) < 12000) ui.toast(v.dest.name === 'patrol' ? `The <b>${esc(C.name)}</b> leaves station on patrol.` : `The <b>${esc(C.name)}</b> puts out ${C.model === 'halcyon' ? 'with passengers' : 'with cargo'} for ${esc(v.dest.name)}.`, '', 6000);
      }
      if (!v.away && C.away && Math.hypot(ctrl.pos[0] - C.x, ctrl.pos[2] - C.z) < 25000) ui.toast(`The <b>${esc(C.name)}</b> is back on station.`, '', 5000);
      if (v.away !== !!C.away) changed = true;
      C.away = v.away; C.x = v.x; C.y = v.y; C.z = v.z; C.yaw = v.yaw;
    }
    voyBoot = false; if (changed) syncShips();
  }
  // ---- interstellar travel: the holo map (ui/holomap.js), the jump, and coming out of it over another world
  const HERE = { system: WORLD.parts[2][1], body: WORLD.parts[3][1] };
  const dropDelta = k => { const d = store.getDelta(k); if (d) store.patchDelta(k, Object.fromEntries(Object.keys(d).map(x => [x, undefined]))); };
  async function holoFlow() {
    let pick = null; await modal(async () => { pick = await openHoloMap(U, HERE); });
    if (pick) await ftlJump(pick);
  }
  async function ftlJump(to) {
    const chart = starChart(U), J = jumpOf(chart, HERE, to), dest = chart[to.system], sh = flight.ship;
    try {
      const P = player, carry = { name: P.name, given: P.given, family: P.family, age: P.age, credits: P.credits, inventory: P.inventory, weapon: P.weapon, skills: P.skills, hp: P.hp, fatigue: P.fatigue, hunger: P.hunger, soldier: P.soldier ? { ...P.soldier, world: WORLD.key } : null, worlds: [...new Set([...(P.worlds || []), WORLD.key])] };
      var hand = ftlStash({ at: Date.now(), universe: store.meta.universe, from: WORLD.key, fromName: planet.name, to, player: carry, ship: { id: sh.id, model: sh.model, name: sh.name, colour: sh.colour } });
    } catch (e) { console.error('FTL', e); ui.toast(`The FTL drive won't spool: ${esc(e.message || e)}.`, 'bad', 6000); return; }
    // the jump starts the moment you engage it; what's left behind is saved while the stars stretch (and can't hold you here if the save is slow or fails)
    paused = true; keys.clear();
    ui.toast(`<b>FTL.</b> ${to.system === HERE.system ? 'In-system jump' : J.ly.toFixed(1) + ' light years'} to ${esc(dest.name)}.`, '', 4000);
    ftlFlash(450, 0.85); ftl = new FtlTunnel(renderer); ftl.ship(shipView, sh.model, sh.colour); ftl.speed = 0;
    const effect = new Promise(r => setTimeout(r, 2600)), saving = (async () => {      // (long enough to see it take hold; the rest of the way is while the next world is built)
      try {
        if (sh.id === visitorShip()?.id) { dropDelta('visitor/ship'); dropDelta(shipKey(sh.id)); player.piloting = null; player.pos = ctrl.pos.slice(); }     // (you take it with you: it's not parked here any more)
        else { store.patchDelta(shipKey(sh.id), { flying: undefined, away: true }); player.piloting = null; player.pos = flight.pos.slice(); }
        store.meta.gameTime = clock.now(); store.meta.realTime = Date.now(); store.touchPlayer(); store.dirty.meta = true; await store.flush();
      } catch (e) { console.warn('saving before the jump', e); }
    })();
    await Promise.race([Promise.all([effect, saving]), new Promise(r => setTimeout(r, J.secs * 1000 + 5000))]);
    const q = new URLSearchParams(); for (const k of ['seed', 'hour', 'store']) if (params.has(k)) q.set(k, params.get(k));
    if (!(to.system === 0 && to.body === 3)) { q.set('planet', to.body); q.set('system', to.system); }
    q.set('auto', 'arrive'); location.href = location.pathname + '?' + q.toString() + hand;
  }
  // out of FTL: high over this world's first town, in the ship you came in
  async function arrival() {
    const H = ftlHandoff(); if (!H || H.to.system !== HERE.system || H.to.body !== HERE.body) { if (ftl) ftlOut = { t: 0, say: '' }; return; } ftlClear();
    const C = H.player; for (const k of ['name', 'given', 'family', 'age', 'credits', 'inventory', 'weapon', 'skills', 'hp', 'fatigue', 'hunger', 'worlds']) if (C[k] !== undefined) player[k] = C[k];
    player.soldier = C.soldier && C.soldier.world === WORLD.key ? C.soldier : player.soldier?.world === WORLD.key ? player.soldier : (C.soldier ? null : player.soldier);     // (enlistment is with a nation of the world you enlisted on)
    let sh = shipById(H.ship.id);
    if (!sh) { const V = { id: 'ship:visitor:' + H.ship.id.replace(/[^\w]/g, '').slice(-12), model: H.ship.model, name: H.ship.name, colour: H.ship.colour, owner: 'you:' + player.id, ownerName: 'you', from: H.from, flying: true };
      if (visitorShip() && visitorShip().id !== V.id) { const old = visitorShip(); dropDelta(shipKey(old.id)); }
      store.patchDelta('visitor/ship', V); store.patchDelta(shipKey(V.id), { flying: true }); ships = allShips(clock.now()); sh = shipById(V.id); }
    else store.patchDelta(shipKey(sh.id), { flying: true, away: undefined });
    const b = placed.get(sh.id); if (b) { world.removeStructure(b); placed.delete(sh.id); }
    const [x, y, z] = arrivalAt(), f = Math.atan2(homeS.cx - x, homeS.cz - z);     // (30 km up, 26 km out, nose down at the town: the world fills the screen ahead)
    flight = new Flight(world, planet, sh, [x, y, z], f); flight.onGround = false; flight.q = fromEuler(f, -0.45, 0); flight.syncEuler(); flight.vel = [Math.sin(f) * 220, -110, Math.cos(f) * 220]; flight.throttle = 0.4;
    ctrl.mode = 'pilot'; camDist = cam.dist; cam.dist = Math.max(22, flight.L.D * 1.6); cam.pitch = 0.25; ctrl.pos = [x, y, z]; joinWar(); player.piloting = sh.id; store.touchPlayer();
    const say = `<b>Out of FTL</b> over <b>${esc(planet.name)}</b>${H.to.system !== 0 || H.fromName ? `, from ${esc(H.fromName)}` : ''}. ${esc(townSociety(planet, homeS)?.nation?.name || 'Its people')} have a town below.`;
    if (ftl) { paused = true; keys.clear(); ftlOut = { t: 0, say }; } else ui.toast(say, '', 10000);
  }
  function soldierKill() { const S = player.soldier; S.kills = (S.kills || 0) + 1; const pay = 120 + 40 * S.rank; player.credits = (player.credits ?? 0) + pay; if (S.kills % 5 === 0 && S.rank < RANKS.length - 1) { S.rank++; ui.toast(`Promoted: <b>${RANKS[S.rank]}</b>.`, '', 7000); } store.touchPlayer(); if (onLine()) chud.log(`+${pay} cr`, 'you'); else ui.toast(`Kill confirmed. <b>${pay} cr</b>.`, '', 3000); }
  function endDeployment() {
    leaveWar(); flight = null; cam.dist = camDist; ctrl.mode = 'walk';
    const hq = pop.buildingByKey.get(polity.security), at = hq ? b2w(hq, hq.w / 2, 0, -2) : [s.cx, s.h, s.cz]; ctrl.pos = [at[0], s.h + 0.1, at[2]]; ctrl.vel = [0, 0, 0];
    ui.toast(`Deployment over: you hand the fighter back and a transport brings you home. <small>${RANKS[player.soldier.rank]} · ${player.soldier.kills || 0} kills</small>`, '', 8000);
  }
  function holdOf(sh) { const H = store.getDelta('hold/' + sh.id) || { goods: {} }; H.n = Object.values(H.goods).reduce((a, b) => a + b, 0); return H; }
  async function tradeFlow(sh, town) {
    let note = '';
    await modal(async () => {
      for (;;) {
        const day = dayIndex(planet, clock.now()), M = marketOf(planet, town, day), H = holdOf(sh), cap = holdSize(LAYOUTS[sh.model]), soc = townSociety(planet, town), opts = [];
        for (const g of M) { opts.push({ a: 'buy', v: g.good, label: `Buy a crate of ${g.name.toLowerCase()} — ${g.buy} cr`, note: g.made ? `made here: cheap` : 'shipped in', disabled: (player.credits ?? 0) < g.buy || H.n >= cap }); if (H.goods[g.good]) opts.push({ a: 'sell', v: g.good, label: `Sell a crate of ${g.name.toLowerCase()} — ${g.sell} cr`, note: `${H.goods[g.good]} in the hold` }); }
        for (const [g, n] of Object.entries(H.goods)) if (n && !M.some(q => q.good === g)) { const [, sp] = priceAt(planet, town, g, day); opts.push({ a: 'sell', v: g, label: `Sell a crate of ${goodName(g).toLowerCase()} — ${sp} cr`, note: `${n} in the hold · nobody makes it here` }); }
        const r = await ui.choose({ title: `${town.name} — freight market`, sub: `${esc(soc?.industryLabel ? town.name + ' lives by ' + soc.industryLabel : '')}. You have ${player.credits ?? 0} cr. Hold: ${H.n} of ${cap} crates.${note ? ' ' + note : ''}`, options: opts });
        if (!r || r.a === 'close') break;
        const [bp, sp] = priceAt(planet, town, r.v, day);
        if (r.a === 'buy') { player.credits -= bp; H.goods[r.v] = (H.goods[r.v] || 0) + 1; note = `Bought a crate of ${goodName(r.v).toLowerCase()}.`; }
        else { player.credits = (player.credits ?? 0) + sp; H.goods[r.v]--; if (!H.goods[r.v]) delete H.goods[r.v]; note = `Sold a crate of ${goodName(r.v).toLowerCase()} for ${sp} cr.`; }
        store.patchDelta('hold/' + sh.id, { goods: { ...H.goods } }); store.touchPlayer();
        if (r.a === 'sell') store.log({ t: clock.now(), type: 'trade', who: player.id, good: r.v, price: sp, town: town.name });
      }
    });
  }
  function takeOff(sh) {
    const b = placed.get(sh.id); if (b) { world.removeStructure(b); placed.delete(sh.id); }
    const { c, facing } = centreOf(shipTown(sh), sh);
    launch(store, sh); setRamp(store, sh, false);
    ships = allShips(clock.now());
    flight = new Flight(world, planet, shipById(sh.id), c, facing);
    // in a great ship's bay: nose to its doors (a ship set down facing the back wall, as they used to be, can't get out)
    const bay = (strikeView?.deck ? [strikeView.C] : []).concat(fleet).find(C => !C.away && Math.hypot(c[0] - C.x, c[1] - C.y, c[2] - C.z) < Math.max(C.span || 0, C.length) * 0.6);
    if (bay) { const out = bay.ship.at.facing + Math.PI; flight.q = fromEuler(out, 0, 0); flight.syncEuler(); }
    ctrl.mode = 'pilot'; camDist = cam.dist; cam.dist = Math.max(22, flight.L.D * 1.6); cam.pitch = 0.25;
    joinWar();

  }
  // ---- docking with one of the great ships: E near one and the ship flies itself in — out to the line of the bay, along it, in through the
  // mouth, and down onto the hangar deck. It's flown, not jumped, and once started it can't be broken off.
  let docking = null;
  const DOCK_CRUISE = 85, DOCK_BRAKE = 9;      // m/s it flies the approach at; m/s² it sheds speed at
  // in a fight in the air (a sortie on, a dreadnought overhead, or enemy craft within 6 km): the great ships don't open their bays to anyone
  function airBattle() { if (sortie || strikeView) return true; const p = flight?.pos; if (!p) return false; for (const c of war.craft) if (c.alive && !c.fixed && c.side === 'raider' && Math.hypot(c.f.pos[0] - p[0], c.f.pos[1] - p[1], c.f.pos[2] - p[2]) < 6000) return true; return false; }
  function dockTarget() {
    if (!flight || docking) return null; let best = null, bd = 1500;
    // (in a fight in the air the fleet's bays are shut; the dreadnought's own stands open for its fighters the whole time it hangs there)
    for (const C of (airBattle() ? [] : fleet.filter(C => !fleetWar.away(C.model) && !C.away)).concat(strikeView?.deck ? [strikeView.C] : [])) { const at = C.ship.at, fx = Math.sin(at.facing), fz = Math.cos(at.facing), m = [at.c[0] - fx * C.deckD / 2, at.c[1], at.c[2] - fz * C.deckD / 2], d = Math.hypot(flight.pos[0] - m[0], flight.pos[1] - m[1], flight.pos[2] - m[2]), near = Math.max(0, Math.hypot(flight.pos[0] - C.x, flight.pos[1] - C.y, flight.pos[2] - C.z) - (C.span || C.length) * 0.55), q = Math.min(d, near * 2.5 + 200); if (q < bd) { bd = q; best = { C, d }; } }     // (near the hull anywhere counts, not just near the bay's mouth: on a ship five kilometres long you can be beside it and a long way from its door)
    return best;
  }
  function startDock(C) {
    const L = flight.L, H = L.H ?? L.ceiling + 1, at = C.ship.at, lay = LAYOUTS[C.ship.model], mouth = lay.doors[0], hole = mouth.height ?? 6.6;
    if (L.W > mouth.width - 2 || L.D > 40 || H > hole - 0.2) { ui.toast(`The ${esc(flight.ship.name)} won't fit through the ${esc(C.name)}'s bay doors.`, 'warn', 4000); return; }
    const fx = Math.sin(at.facing), fz = Math.cos(at.facing), D = C.deckD, R0 = lay.rooms[0], zl = Math.max(R0.rect[1] + L.D / 2 + 8, (R0.rect[1] + R0.rect[3]) / 2 - 2);
    const deckY = at.c[1] + lay.deck, yIn = deckY + Math.min(0.45, (hole - H) / 2);      // (through the middle of the doors, not the ceiling over them)
    const P = (z, y = yIn) => [at.c[0] + fx * (z - D / 2), y, at.c[2] + fz * (z - D / 2)];
    // the way: from where you are, on round onto the bay's line a long way out, down it, in through the doors, to the spot to set down
    const here = flight.pos.slice(), sp = Math.max(8, flight.airspeed), dir = sp > 9 ? flight.vel.map(v => v / flight.airspeed) : flight.fwd;
    // coming in fast it flies on ahead first, braking, and only turns for the bay once it's down to a speed it can turn and stop from (never straight at the bay at full speed)
    const run = Math.max(Math.min(260, sp * 3), sp > DOCK_CRUISE ? (sp * sp - DOCK_CRUISE * DOCK_CRUISE) / (2 * DOCK_BRAKE) + 120 : 0), long = run > 260, dy = long ? Math.max(0, dir[1]) : dir[1];      // (a long run-on is flown level or climbing, not on down a dive)
    const lead = [here[0] + dir[0] * run, here[1] + dy * run, here[2] + dir[2] * run];
    if (long) for (const k of [0.25, 0.5, 0.75, 1]) lead[1] = Math.max(lead[1], Math.max(world.groundAt(here[0] + dir[0] * run * k, here[2] + dir[2] * run * k, 1e5).h, planet.seaLevel) + 150);
    const far = P(-420, yIn + 40), mid = P(-150, yIn + 6), near = P(-30), inside = P(zl);
    const clear = pts => { for (let i = 0; i < pts.length; i += 3) { const q = pts[i]; if (fleetContact(strikeView ? fleet.concat(strikeView.C) : fleet, q[0], q[1], q[2], Math.max(4, L.W * 0.6))) return false; } return true; };
    let route = null;
    for (const h of [0, 150, 400, 800, 1300, 1800]) {
      const ld = [lead[0], lead[1] + h * 0.5, lead[2]], ctl = h ? [here, ld, [ld[0], Math.max(ld[1], C.y + h), ld[2]], [far[0], C.y + h, far[2]], far] : [here, lead, far];
      const curve = spline(ctl.concat([mid, near, inside]));
      const outside = curve.filter(q => q.s < curve.find(c => c.u >= ctl.length + 1 - 1e-6)?.s);     // (in the dock's own approach the hull's shape doesn't apply: the doorway is the gap in it)
      if (clear(outside) || h === 1800) { route = curve; break; }
    }
    const sIn = route.find(q => Math.hypot(q.p[0] - near[0], q.p[2] - near[2]) < 3)?.s ?? route[route.length - 1].s * 0.95, sMid = route.find(q => Math.hypot(q.p[0] - mid[0], q.p[2] - mid[2]) < 6)?.s ?? sIn * 0.8;
    docking = { C, route, s: 0, v: sp, sIn, sMid, end: route[route.length - 1].s, f: at.facing, settle: false, deckY, roll: flight.roll, pitch: flight.pitch, facing: flight.facing };
    flight.throttle = 0.3;
    ui.toast(`Docking with the ${esc(C.name)}. The ship's flying itself in.`, '', 4000);
  }
  // a smooth way through points (centripetal Catmull-Rom), as points every ~2 m with the distance along it: [{ p, s, u }]
  function spline(pts) {
    const out = [], ext = [pts[0].map((v, i) => 2 * v - pts[1][i]), ...pts, pts[pts.length - 1].map((v, i) => 2 * v - pts[pts.length - 2][i])];
    let s = 0, prev = null;
    for (let k = 1; k < ext.length - 2; k++) {
      const [p0, p1, p2, p3] = [ext[k - 1], ext[k], ext[k + 1], ext[k + 2]], d = (a, b) => Math.max(1e-3, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])));
      const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3), n = Math.max(4, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]) / 2));
      for (let j = 0; j <= n; j++) {
        if (j === 0 && k > 1) continue;
        const t = t1 + (t2 - t1) * j / n, L = (a, b, ta, tb) => a.map((v, i) => v * (tb - t) / (tb - ta) + b[i] * (t - ta) / (tb - ta));
        const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3), B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3), p = L(B1, B2, t1, t2);
        if (prev) s += Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]); out.push({ p, s, u: k - 1 + j / n }); prev = p;
      }
    }
    return out;
  }
  function stepDock(dt) {
    const d = docking, R = d.route, p = flight.pos;
    if (!d.settle) {
      // speed: up to a cruise, easing down so it reaches the line slow, creeps in through the doors, stops on the spot
      const left = d.end - d.s, cap = d.s > d.sIn ? 4 : d.s > d.sMid ? 16 : DOCK_CRUISE, want = Math.min(cap, Math.sqrt(0.36 + 2 * 2.2 * Math.max(0, left)), d.s < d.sMid ? Math.sqrt(16 * 16 + 2 * 3 * Math.max(0, d.sMid - d.s)) : 99);
      // the brakes: hard (air brakes and reverse thrust), and harder still if that's what it takes to be down to speed where the way says so — it never arrives still moving fast
      const need = (v1, dist) => d.v > v1 ? (d.v * d.v - v1 * v1) / (2 * Math.max(0.5, dist)) : 0, brake = Math.max(DOCK_BRAKE, need(0.6, left), d.s < d.sMid ? need(16, d.sMid - d.s) : 0, d.s < d.sIn ? need(4, d.sIn - d.s) : 0);
      d.v += Math.max(-brake * dt, Math.min(3 * dt, want - d.v)); d.s = Math.min(d.end, d.s + Math.max(0.3, d.v) * dt);
      let i = R.findIndex(q => q.s >= d.s); if (i < 1) i = 1; const a = R[i - 1], b = R[i], k = (d.s - a.s) / Math.max(1e-6, b.s - a.s);
      const q = a.p.map((v, j) => v + (b.p[j] - v) * k), T = b.p.map((v, j) => v - a.p[j]), tl = Math.hypot(...T) || 1;
      flight.vel = T.map(v => v / tl * d.v); p[0] = q[0]; p[1] = q[1]; p[2] = q[2];
      // the attitude a pilot would fly it with: nose along the way, banked into the turn, nose up or down with the climb; level and square to the bay at the end
      const hd = d.s > d.sMid ? d.f : Math.atan2(T[0], T[2]), turn = Math.atan2(Math.sin(hd - d.facing), Math.cos(hd - d.facing)), rate = Math.max(-0.5, Math.min(0.5, turn * 1.5));
      d.facing += rate * dt; const bank = d.s > d.sMid ? 0 : Math.max(-0.55, Math.min(0.55, Math.atan(-d.v * rate / 9.81))), climb = d.s > d.sIn ? 0 : Math.max(-0.3, Math.min(0.3, Math.asin(T[1] / tl) * 0.8));
      d.roll += (bank - d.roll) * Math.min(1, dt * 1.8); d.pitch += (climb - d.pitch) * Math.min(1, dt * 1.5);
      flight.hover = d.s > d.sMid ? 0.6 : 0; flight.throttle = d.s > d.sMid ? 0 : 0.35;
      if (d.s >= d.end - 0.01 && d.v < 0.8) d.settle = true;
    } else {           // over the spot: let it down onto the gear, slowing as it nears the deck
      const fx = Math.sin(d.f), fz = Math.cos(d.f), a = flight.L.D * 0.32, b = flight.L.W * 0.3, g = Math.max(...[[a, b], [a, -b], [-a, b], [-a, -b]].map(([u, v]) => world.groundAt(p[0] + fx * u - fz * v, p[2] + fz * u + fx * v, p[1] - 0.3).h));     // (the deck under it, not the deck over it)
      const vy = Math.min(1.0, 0.12 + (p[1] - g) * 0.9); p[1] = Math.max(g, p[1] - vy * dt); flight.vel = [0, -vy, 0]; flight.hover = 0.4;
      // turned round on the spot first, nose to the doors, so that it leaves the way it came in (a ship set down facing the back wall can't get out)
      const fOut = d.f + Math.PI, err = Math.atan2(Math.sin(fOut - d.facing), Math.cos(fOut - d.facing)); d.facing += Math.sign(err) * Math.min(Math.abs(err), dt * 0.6); d.roll *= 1 - Math.min(1, dt * 3); d.pitch *= 1 - Math.min(1, dt * 3);
      if (Math.abs(err) > 0.03) p[1] = Math.max(p[1], g + 0.6);      // (held clear of the deck while it turns)
      if (p[1] <= g + 0.002 && Math.abs(err) <= 0.03) { flight.vel = [0, 0, 0]; flight.onGround = true; flight.hover = 0; flight.throttle = 0; docking = null; ui.toast(`Down in the ${esc(d.C.name)}'s bay. <kbd>E</kbd> to shut down and step out.`, '', 5000); }
    }
    flight.q = fromEuler(d.facing, d.pitch, d.roll); flight.w = [0, 0, 0]; flight.syncEuler(); flight.onGround = !docking;
  }
  function setDown() {
    const why = flight.landingProblem();
    if (why) { ui.toast(`Can't land: ${why}.`, 'warn', 2500); return; }
    const sh = flight.ship;
    land(store, sh, flight.pos, flight.facing); setRamp(store, sh, false);
    leaveWar(); flight = null; cam.dist = camDist; syncShips();
    const b = placed.get(sh.id), a = b.plan.anchors.find(x => x.kind === 'pilot');
    ctrl.mode = 'walk'; ctrl.seatAt(b2w(b, a.x, a.y, a.z), toWorldDir(b, a.facing), 'sit', b2w(b, a.x, b.plan.layout.deck, a.z - 0.8));
   
  }
  let bootJoin = false;
  if (player.piloting) { // you were flying when you left: you're still at the helm
    const sh = shipById(player.piloting);
    if (sh?.flying && sh.at) { const b = placed.get(sh.id); if (b) { world.removeStructure(b); placed.delete(sh.id); } flight = new Flight(world, planet, sh, sh.at.c, sh.at.facing); flight.onGround = false; ctrl.mode = 'pilot'; cam.dist = 30; bootJoin = true; }     // (into the air war once it's there: it's set up further on)
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
    const said = []; let n = 0, deployAfter = false;
    const say = (who, line) => said.push(`<p><b>${esc(who)}:</b> ${esc(line)}</p>`);
    await modal(async () => {
      for (;;) {
        const t = clock.now(), met = known(store, p.id) || !!relation(p.id);
        const opts = [];
        if (!met) opts.push({ a: 'intro', label: 'Introduce yourself' });
        opts.push({ a: 'work', label: 'Ask what they do' }, { a: 'home', label: 'Ask where they live' }, { a: 'family', label: 'Ask about their family' },
          { a: 'chat', label: 'Make small talk' }, { a: 'way', label: 'Ask for directions' });
        const crew = pop.gangOf?.(p.id);      // a gang's boss can let you in (gen/gangs.js)
        if (crew && crew.boss === p.id && player.gang !== crew.id) opts.push({ a: 'join', label: `Ask to run with ${crew.name}`, note: player.gang ? 'You\'d be leaving your own crew.' : 'Their turf is yours to walk; there\'s a cut in it. The law won\'t like it.' });
        if (crew && player.gang === crew.id) opts.push({ a: 'leave', label: `Walk away from ${crew.name}` });
        const pj = p.job && pop.jobById.get(p.job), natHere = townSociety(planet, s)?.nation, atWar = natHere && frontsOf(planet, natHere).length;
        if (pj?.title === 'Security chief' && atWar && !player.soldier) opts.push({ a: 'enlist', label: `Enlist with ${natHere.name}`, note: `At war with ${frontsOf(planet, natHere).map(F => F.b.name).join(' and ')}. Paid for every kill.` });
        if (pj?.title === 'Security chief' && player.soldier) { opts.push({ a: 'deploy', label: 'Report for duty: to the front, in a fighter', note: `${RANKS[player.soldier.rank]} · ${player.soldier.kills || 0} kills` }); opts.push({ a: 'deployfoot', label: 'Report for duty: to the line, on foot', note: 'A carbine and a place in the line. Take the objectives.' }); }
        const r = await ui.choose({ title: met ? p.name : nameFor(p)[0].toUpperCase() + nameFor(p).slice(1), sub: `${p.age} · ${esc(a.activity)}${relation(p.id) ? ' · ' + relation(p.id) : ''}${said.length ? '<div class="talk">' + said.slice(-6).join('') + '</div>' : ''}`, options: opts });
        if (r.a === 'close') break;
        const reticent = !met && r.a !== 'intro' && r.a !== 'chat' && r.a !== 'way';
        if (r.a === 'enlist') { player.soldier = { nation: natHere.id, rank: 0, kills: 0, since: t }; store.touchPlayer(); store.log({ t, type: 'enlisted', who: player.id, nation: natHere.name }); say(p.given, `Welcome to the ${natHere.name} forces, ${RANKS[0].toLowerCase()}. Report to me when you're ready to go to the front.`); continue; }
        if (r.a === 'deploy') { deployAfter = true; break; }
        if (r.a === 'deployfoot') { deployAfter = 'foot'; break; }
        if (r.a === 'join') { if (!met || (player.credits ?? 0) < 50) { say(p.given || 'They', !met ? 'Who are you? Get lost.' : 'Come back with something to show. Fifty, say.'); continue; } player.credits -= 50; player.gang = crew.id; player.gangName = crew.name; player.gangDay = null; store.touchPlayer(); store.log({ t, type: 'joined_gang', who: player.id, gang: crew.name, town: s.name }); say(p.given, `Fifty. Fine. You're with ${crew.name} now. Our corner's your corner.`); continue; }
        if (r.a === 'leave') { player.gang = null; store.touchPlayer(); say(p.given, 'Your choice. Don\'t come round the corner after dark.'); continue; }
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
    if (deployAfter) deployFlow(deployAfter === 'foot');      // (reporting for duty: off to the front, sim/front.js; on foot, sim/infantry.js)
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
  function hurtPlayer(dmg, by, from = null) {
    if (tankV) { armor.damage(tankV, dmg * 2.5, by, from ? [tankV.pos[0] - from[0], 0, tankV.pos[2] - from[2]] : null); return; }      // (in your tank, it takes it)
    const line = fighting(); hurtT = performance.now() / 1000; let shielded = false;
    if (line && shield > 0) { const take = Math.min(shield, dmg); shield -= take; dmg -= take; shielded = dmg <= 0; if (shield <= 0) sound.shieldDown(); }
    if (from) { let a = cam.yaw - Math.atan2(from[0] - ctrl.pos[0], from[2] - ctrl.pos[2]); a = Math.atan2(Math.sin(a), Math.cos(a)); chud.hurt(a, shielded); }
    sound.hurt(shielded); fx.shake = Math.max(fx.shake, shielded ? 0.15 : 0.35); if (!shielded) avatar.flinch?.(/punch|fist|beat|gang|crew|thug/i.test(by || '') ? 'punch' : null);
    if (dmg <= 0 || dying) return;
    const hp0 = player.hp; player.hp = Math.max(0, player.hp - dmg); store.touchPlayer();
    if (!line) ui.toast(`You're hit${by ? ` — ${esc(by)}` : ''}. <small>${Math.round(player.hp)}% health</small>`, 'bad', 2500);
    if (player.hp > 0) return;
    const t = clock.now();
    // whether it's the end (sim/lineage.js): overkill, left on the field, or worn out by old wounds
    { const near = (side, r) => infantry.F ? infantry.men.filter(M => M.hp > 0 && M.side === side && Math.hypot(M.pos[0] - ctrl.pos[0], M.pos[2] - ctrl.pos[2]) < r).length : 0;
      const F = fate(player, hp0, dmg, { line, arrested: !!(pursuit && pursuit.state !== 'return'), foesNear: near('theirs', 25), friendsNear: near('ours', 15) });
      if (F.dead && window.ORBIS.mortal !== false) { dieFlow(by, F.why, from); return; } }
    player.wounds = (player.wounds || 0) + 1;      // (you live, and carry it after)
    if (pursuit && pursuit.state !== 'return') {          // shot down by the law: you wake in their cell
      const cell = arrest(ctx, t, { resisted: true, by: pursuit.person.name });
      player.inventory = inventoryOf(player).filter(x => ITEMS[x.id].cat !== 'weapon'); player.weapon = null;
      ctrl.pos = cell.pos.slice(); ctrl.vel = [0, 0, 0]; pursuit.end('caught', t); doorView.refresh(store, planet, t);
      ui.toast(`You go down. You wake up in the ${esc(polity.securityName)} cell, patched up, your weapons gone.`, 'bad', 12000);
    } else if (player.footDuty && infantry.F) {           // down on the line: the medics carry you back behind it
      const R = player.footDuty; ctrl.pos = [R.rx, landY(R.rx, R.rz) + 0.1, R.rz]; ctrl.vel = [0, 0, 0]; clock.advance(planet.dayLength / 48);
      ui.toast('You go down. Medics drag you back to the rally point and patch you up.', 'bad', 9000); kit();
    } else {                                              // anything else: you come round where you fell, an hour later
      clock.advance(planet.dayLength / 24); ui.toast('You go down. You come round an hour later, hurting.', 'bad', 9000);
    }
    player.hp = 35; player.fatigue = Math.min(1, player.fatigue + 0.4); store.touchPlayer(); proned = false; crouched = false; ctrl.stun = Math.max(ctrl.stun || 0, 3.2);      // (you come round on the ground, and get up off it)
    if (!line) ui.toast(player.wounds >= MAX_WOUNDS ? `That one will stay with you. <b>You won't survive going down again.</b>` : `It leaves its mark: a wound you'll carry. <small>${hpCap(player)}% health at most now</small>`, 'warn', 7000); else chud.log(player.wounds >= MAX_WOUNDS ? "You won't survive going down again" : `Wounded: ${hpCap(player)}% at most now`, 'bad');
  }
  // ---- death: one life is one life (sim/lineage.js). The universe goes on and keeps what you did; the next of your line takes it up
  async function dieFlow(by, why, from = null) {
    if (dying) return; dying = true; paused = true; keys.clear(); document.exitPointerLock?.();
    // how you go down (the recorded takes): shot from in front, from behind, or anything else (a blast, a crash, the wounds)
    { let kind = 'dying'; if (from && !/blast|explosion|grenade|shell|crash|fall|landing|fire/i.test(by || '')) { const a = Math.atan2(from[0] - ctrl.pos[0], from[2] - ctrl.pos[2]) - ctrl.facing; kind = Math.cos(a) > 0 ? 'death_front' : 'death_back'; }
      proned = false; crouched = false; avatar.die?.(kind); }
    const t = clock.now(), P = player, here = currentTown?.s || s;
    const days = (t - (P.created ?? EPOCH)) / planet.dayLength, E = epitaph(P, { t, cause: by || 'wounds', why, place: here.name, planetName: planet.name, days });
    const est = estate(P, P.startSkills);
    store.meta.lineage = [...(store.meta.lineage || []), E];
    store.patchDelta('fallen/' + P.serial, { name: P.name, t, cause: E.cause, pos: ctrl.pos.slice(), facing: ctrl.facing || 0, town: here.key });      // (a stone where they fell: render/memorials.js)
    store.log({ t, type: 'player_died', name: P.name, character: P.id, cause: E.cause, settlementName: here.name });
    sound.hurt?.(false); fx.shake = 1; avatar.object.visible = true;
    // the next of the line: one of the family in the home town, if the family's still there; else, someone new
    const homePop = homeTown.pop, serial = store.meta.nextCharacter, kin = est.household != null && homePop.households.some(h => h.id === est.household && h.members.length);
    let heir = null; try { heir = kin ? newCharacter(U, planet, homeS, homePop, serial, t, { household: est.household }) : null; } catch (e) { console.warn('heir', e); }
    const stranger = (() => { try { return newCharacter(U, planet, homeS, homePop, serial, t); } catch { return null; } })();
    const left = (store.meta.lineage || []).length, stage = warStage(store.meta.lineage, (t - EPOCH) / planet.dayLength);
    // what they were in the middle of is told for them (game/family.js)
    let last = null;
    if (sortie) { const st = sortie.stats('died'); last = skyRenown(st); sortie.end(); sortieHud.classList.add('hidden'); addDeed(store.meta, { t, who: P.name, area: 'sky', what: `died in the sky over ${run?.town || here.name}${st.kills ? `, ${st.kills} shot down first` : ''}`, renown: last.total }); sortie = null; run = null; }
    else if (groundRun) { const st = { kills: (P.soldier?.kills || 0) - groundRun.kills0, taken: groundRun.taken }; last = groundRenown(st); addDeed(store.meta, { t, who: P.name, area: 'ground', what: `died on the line against ${groundRun.front}${st.kills ? `, ${st.kills} of theirs put down first` : ''}`, renown: last.total }); groundRun = null; }
    const fam = familyOf(store.meta, P.surname), legacy = `The ${fam.name} family: ${tierOf(fam.renown).name}, ${fam.renown} renown${last?.total ? ` (+${last.total} for how they went)` : ''}.`;
    await new Promise(r => setTimeout(r, 3200));      // (a moment where you fell: long enough to see yourself go down)
    const yrs = n => `${n} day${n === 1 ? '' : 's'}`, W = est.heirloom ? ITEMS[est.heirloom]?.name : null;
    const pick = await ui.death({
      name: P.name, age: P.age, cause: E.cause, place: here.name, planet: planet.name, days: yrs(E.days), rank: P.soldier ? RANKS[P.soldier.rank] : null, kills: E.kills, line: store.meta.lineage, stage, legacy,
      heir: heir ? { label: `Carry on as ${heir.name}, ${heir.age}`, note: `Of the ${heir.surname} family. Inherits ${est.credits} cr${W ? ` and ${P.given}'s ${W}` : ''}${est.soldier ? `, and a place in the regiment` : ''}.` } : null,
      stranger: stranger ? { label: `Begin again as someone else in ${homeS.name}`, note: 'A stranger to them. Nothing is handed on; the world remembers all the same.' } : null,
    });
    const after = { name: P.name, cause: E.cause, place: here.name, stage };
    store.meta.heir = { estate: pick === 'heir' && heir ? est : null, after, at: Date.now() };
    store.meta.gameTime = t + planet.dayLength * 2; store.meta.realTime = Date.now();      // (two days: the burial)
    store.player = null; store.dirty.player = true; store.dirty.meta = true;
    try { await store.flush(); } catch (e) { console.warn('saving the death', e); }
    location.reload();
  }
  // ---- violence (sim/processes/combat.js): what's in your hand, and what happens when you use it
  let lastAttack = -1e9;
  // a fight on foot: the trigger held, sighting down the gun (aimK eases in), how far the shots wander now (bloom), your issued shield, your grenades
  let recoilDebt = 0;      // (how far the kick has put the muzzle up: most of it settles back once you stop firing, as a held gun does)
  let trigger = false, wantShot = false, aimHeld = false, aimK = 0, gunK = 0, bloom = 0, lastFired = -1e9, hurtT = -1e9, shield = 0, nades = 0, shotsHeard = 0, lastHeard = 0;
  // the sight: how far in it's zoomed (the wheel changes it), your breath (held, the sight steadies, for a few seconds), the way it wanders
  let proned = false, proneK = 0, lastStun = 0;      // prone (X on foot): down on your front behind the rifle
  let crouched = false, crouchK = 0, rockets = 0, tankV = null, zoomBy = {}, breath = 1, gasp = 0, holding = false, swayT = 0, sway = [0, 0], hidAvatar = false;
  const SHIELD = 60, baseFov = camera.fov;
  const scoped = () => aimK > 0.5 && (!!tankV || heldRanged() && !flight && !ride && ctrl.mode === 'walk');
  const zoomRange = () => tankV ? [2, 8, 3.5] : (W => [Math.max(1.5, (W?.zoom || 2) / 2), (W?.zoom || 2) * 1.5, W?.zoom || 2])(WEAPONS[player.weapon]);
  const zoomNow = () => { const k = tankV ? 'tank' : player.weapon, [, , d] = zoomRange(); return zoomBy[k] ?? d; };
  cam.onWheel = dy => { if (!scoped()) return false; const k = tankV ? 'tank' : player.weapon, [lo, hi] = zoomRange(); zoomBy[k] = Math.max(lo, Math.min(hi, zoomNow() * (dy > 0 ? 1 / 1.25 : 1.25))); return true; };
  const heldRanged = () => { const id = player.weapon && inventoryOf(player).some(x => x.id === player.weapon) ? player.weapon : null; return !!(id && WEAPONS[id]?.ranged); };
  const onLine = () => !!(player.footDuty && infantry.F && ctrl.mode === 'walk' && !flight && !ride);
  const aboardDread = () => !!strikeView?.board && !flight && !ride && strikeView.board.inside(ctrl.pos), fighting = () => onLine() || aboardDread();      // (in a fight on foot: the line, or the decks of a dreadnought you've boarded)
  const kit = () => { shield = SHIELD; nades = 3; rockets = 3; };
  // the carbine's underslung launcher: an anti-armour round where you're looking
  function fireLauncher() {
    if (rockets <= 0) { sound.blip(260); return; }
    const o = camera.position.clone(), dir = new THREE.Vector3(); camera.getWorldDirection(dir); const wo = [o.x + origin[0], o.y + origin[1], o.z + origin[2]];
    const from = [ctrl.pos[0] + Math.sin(cam.yaw) * 0.7, ctrl.pos[1] + 1.42, ctrl.pos[2] + Math.cos(cam.yaw) * 0.7], to = [wo[0] + dir.x * 400, wo[1] + dir.y * 400, wo[2] + dir.z * 400];
    rockets--; armor.rocket(from, to, 'ours', 'player', scoped() ? 0.0015 : 0.008); sound.rocket(from); lastFired = performance.now() / 1000;
    cam.pitch = Math.max(-0.9, cam.pitch - 0.035); fx.shake = Math.max(fx.shake, 0.25); for (let i = 0; i < 6; i++) fx.smoke([ctrl.pos[0] - Math.sin(cam.yaw) * (0.8 + i * 0.3), ctrl.pos[1] + 1.3, ctrl.pos[2] - Math.cos(cam.yaw) * (0.8 + i * 0.3)], 0.6, [0, 0], 0.5, 0.35);
  }
  // a tank of your own side: climb in (E beside it), and out again
  // the heavy gun on an objective your side holds (sim/infantry.js): the use key puts you behind it, and again (or walking off) takes you off it
  const EMPLACED = { name: 'Heavy gun', dmg: 58, reach: 240, every: 0.085, ranged: true, spread: 0.014, energy: true, emplaced: true };
  let gunPost = null;
  function gunToggle() {
    if (gunPost) { gunPost.gun.you = false; gunPost = null; return true; }
    if (!infantry.F || flight || ride || tankV || ctrl.mode !== 'walk' || dying) return false;
    const side = player.soldier && nationsOf(planet)[player.soldier.nation] === infantry.F.a ? 'ours' : null; if (!side) return false;
    const O = infantry.mountGun({ pos: ctrl.pos, side }); if (!O) return false; gunPost = O; crouched = false; proned = false; ui.toast('You\'re on the gun.', '', 2500); return true;
  }
  function gunTick() {
    const O = gunPost; if (!O) return; const G = O.gun;
    if (!infantry.F || !G.you || G.out > 0 || O.owner !== 'ours' || dying || keys.has('KeyW') || keys.has('KeyA') || keys.has('KeyS') || keys.has('KeyD')) { G.you = false; gunPost = null; return; }
    const seat = infantry.at(O.a - 0.9, O.s + 2.4); ctrl.pos = [seat[0], seat[1] + 0.02, seat[2]]; ctrl.vel = [0, 0, 0]; G.yaw = cam.yaw; G.firedT = performance.now() / 1000 - lastAttack < 0.06 ? infantry.t : G.firedT;
  }
  function tankToggle() {
    if (tankV) { leaveTank(); return true; }
    if (!onLine()) return false;
    const V = armor.list.filter(V => !V.dead && V.side === 'ours' && V.crew === 'ai' && armor.inHull(V, ctrl.pos[0], ctrl.pos[2], 2.2)).sort((a, b) => Math.hypot(a.pos[0] - ctrl.pos[0], a.pos[2] - ctrl.pos[2]) - Math.hypot(b.pos[0] - ctrl.pos[0], b.pos[2] - ctrl.pos[2]))[0]; if (!V) return false;
    armor.board(V); tankV = V; aimHeld = aimBtn = aimStick = false; trigger = false; aimK = 0; chud.log(`You climb into the ${V.T.name}`, 'you'); sound.clink(V.pos); cam.yaw = V.turret; return true;
  }
  function leaveTank() {
    const V = tankV; if (!V) return; armor.leave(V); tankV = null; aimHeld = aimBtn = aimStick = false; trigger = false; aimK = 0;
    const rx = Math.cos(V.facing), rz = -Math.sin(V.facing), x = V.pos[0] + rx * (V.T.W / 2 + 1.0), z = V.pos[2] + rz * (V.T.W / 2 + 1.0); ctrl.pos = [x, landY(x, z) + 0.05, z]; ctrl.vel = [0, 0, 0]; ctrl.mode = 'walk';
  }
  // where you're looking from the tank, out to 600 m: the ground, a hull, else far off
  function tankAim() {
    const o = camera.position.clone(), dir = new THREE.Vector3(); camera.getWorldDirection(dir); const wo = [o.x + origin[0], o.y + origin[1], o.z + origin[2]], d3 = [dir.x, dir.y, dir.z];
    let best = 600; const h = armor.onRay(wo, d3, best, tankV); if (h) best = h.along;
    for (let d = 4; d < best; d += d < 60 ? 1 : 3) if (landY(wo[0] + d3[0] * d, wo[2] + d3[2] * d) > wo[1] + d3[1] * d) { best = d; break; }
    return [wo[0] + d3[0] * best, wo[1] + d3[1] * best, wo[2] + d3[2] * best];
  }
  function throwGrenade() {
    if (nades <= 0) { sound.blip(260); return; }
    const o = camera.position.clone(), dir = new THREE.Vector3(); camera.getWorldDirection(dir); const wo = [o.x + origin[0], o.y + origin[1], o.z + origin[2]], h = Math.hypot(dir.x, dir.z) || 1;
    // where it comes down: where you're looking, if that's the ground within a throw, else as far as the angle you're looking up throws it
    let reach = Math.max(8, Math.min(32, 18 + dir.y * 45)); for (let d = 2; d < 40; d += 0.5) { const x = wo[0] + dir.x * d, y = wo[1] + dir.y * d, z = wo[2] + dir.z * d; if (y <= landY(x, z) + 0.2) { reach = Math.min(32, Math.hypot(x - ctrl.pos[0], z - ctrl.pos[2])); break; } }
    nades--; const to = [ctrl.pos[0] + dir.x / h * reach, 0, ctrl.pos[2] + dir.z / h * reach];
    // the throw first (the wind-up), the grenade away when the hand lets it go
    const rel = avatar.throwIt?.() || 0; lastFired = performance.now() / 1000;
    setTimeout(() => { infantry.throwYours([ctrl.pos[0] + Math.sin(ctrl.facing) * 0.4, ctrl.pos[1] + (crouched ? 1.3 : 1.8), ctrl.pos[2] + Math.cos(ctrl.facing) * 0.4], to); sound.clink(ctrl.pos); }, rel * 1000);
  }
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
    mayhem.stepOfficers(dt, t, ctrl, {
      armed: () => (player.weapon && inventoryOf(player).some(x => x.id === player.weapon)) || t - lastShotAt < 30,
      watchHere: () => { let w = null; sitesNear(planet, ctrl.pos[0], ctrl.pos[2], 200, S => { if (!w && (S.guarded || S.items.some(i => /^gb_(cottage|tenement|inn)_/.test(i.k))) && Math.hypot(S.x - ctrl.pos[0], S.z - ctrl.pos[2]) < S.clear + 60) w = S; }); return w; },
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
  function attack() {
    if (paused || ctrl.mode !== 'walk' || ride || flight) return;
    const id = player.weapon && inventoryOf(player).some(x => x.id === player.weapon) ? player.weapon : 'fists', W = gunPost ? EMPLACED : WEAPONS[id];
    // a long gun at your side comes up to the shoulder first; the round goes when it's there (a click while it's coming up still fires, then)
    if (W.ranged && W.two && !tankV && gunK < 0.8) { wantShot = true; return; } wantShot = false;
    const now = performance.now() / 1000; if (now - lastAttack < W.every) return; lastAttack = now;
    const t = clock.now(); if (W.ranged) { lastShotAt = t; scare(ctrl.pos, t); fauna?.scare(ctrl.pos[0], ctrl.pos[2], W.reach); }
    let target = null, hitPoint = null;
    // a long gun with an enemy close enough to touch, and you not sighting: the bayonet, not a shot (the recorded take)
    if (W.ranged && W.two && !aimHeld && infantry.F) { const fx = Math.sin(ctrl.facing), fz = Math.cos(ctrl.facing);
      const M = infantry.men.find(M => M.hp > 0 && M.side === 'theirs' && Math.hypot(M.pos[0] - ctrl.pos[0], M.pos[2] - ctrl.pos[2]) < 2.2 && ((M.pos[0] - ctrl.pos[0]) * fx + (M.pos[2] - ctrl.pos[2]) * fz) > 0.4);
      if (M) { avatar.melee?.(player.weapon); setTimeout(() => { if (M.hp > 0 && Math.hypot(M.pos[0] - ctrl.pos[0], M.pos[2] - ctrl.pos[2]) < 2.6) { const k = infantry.hurt(M, 95, 'player', [fx, fz]); chud.hit(k); sound.hit(k); chud.log(k ? 'Bayonet' : 'Bayonet: he\'s still up', 'you'); } }, 380); return; } }
    if (!W.ranged) {
      let bd = W.reach + 0.4;
      for (const a of agents) {
        if (String(a.id).startsWith('tr:') || bodies.some(b => b.id === a.id)) continue;
        const dx = a.pos[0] - ctrl.pos[0], dz = a.pos[2] - ctrl.pos[2], d = Math.hypot(dx, dz);
        if (d < bd && Math.abs(a.pos[1] - ctrl.pos[1]) < 1.4 && (dx * Math.sin(ctrl.facing) + dz * Math.cos(ctrl.facing)) / (d || 1) > 0.5) { bd = d; target = a; }
      }
      if (avatar.melee) avatar.melee(player.weapon && WEAPONS[player.weapon] ? player.weapon : 'fists'); else avatar.punch?.();
      const beast = !target && fauna?.inReach(ctrl.pos[0], ctrl.pos[1], ctrl.pos[2], ctrl.facing, W.reach);
      if (beast) { fauna.hurt(beast, W.dmg); return; }
    } else {
      // a shot along the line of sight (camera centre), with a little spread; walls stop it
      const o = camera.position.clone(), dir = new THREE.Vector3(); camera.getWorldDirection(dir);
      const spr = (scoped() ? W.spread * 0.08 * (ctrl.speed > 0.6 ? 4 : 1) + bloom * 0.45 : W.spread * (1 - 0.65 * aimK) * (ctrl.speed > 2.5 ? 1.6 : 1) + bloom) * (crouched && ctrl.speed < 0.6 ? 0.7 : 1); dir.x += (Math.random() - 0.5) * spr * 2; dir.y += (Math.random() - 0.5) * spr * 2; dir.normalize();
      const wo = [o.x + origin[0], o.y + origin[1], o.z + origin[2]];
      // what's in the way stops it: the land, walls, cars, stones, trees, rocks (CollisionWorld.hardAt)
      let wall = world.rayHard(wo, [dir.x, dir.y, dir.z], W.reach, 0.15, 1.2) ?? W.reach;
      if (tiltIn) wall = Math.min(wall, world.rayHard(tiltIn.dk.toLevel(wo), tiltIn.dk.vecTo([dir.x, dir.y, dir.z]), W.reach, 0.15, 1.2) ?? W.reach);      // (aboard a wreck: its bulkheads stop a round)
      try { shotGlass(wo, [wo[0] + dir.x * wall, wo[1] + dir.y * wall, wo[2] + dir.z * wall]); } catch (e) { console.warn(e); }
      let best = wall;
      for (const a of agents) {
        if (String(a.id).startsWith('tr:') || bodies.some(b => b.id === a.id)) continue;
        const lying = a.pose === 'lie' || isDown(store, a.id, t);
        for (const hy of lying ? [0.2] : [0.5, 1.0, 1.45]) {          // body points: legs, chest, head
          const px = a.pos[0] - wo[0], py = a.pos[1] + hy - wo[1], pz = a.pos[2] - wo[2], along = px * dir.x + py * dir.y + pz * dir.z;
          if (along < 0.5 || along > best) continue;
          const off = Math.hypot(px - dir.x * along, py - dir.y * along, pz - dir.z * along);
          if (off < (lying ? 0.45 : 0.3) * (W.wide || 1)) { best = along; target = a; }
        }
      }
      { const list = []; for (const v of vehicles) { if (ride?.v.id === v.id) continue; const D = wrecks.get(v.id); list.push({ id: v.id, v, T: typeOf(v), pos: D ? D.pos : v.pos }); }
        for (const D of wrecks.list.values()) if (!D.ride && D.kind !== 'ship' && !vehicles.some(v => v.id === D.id)) list.push({ id: D.id, D, T: D, pos: D.pos });
        const q = shotVehicles(wo, [dir.x, dir.y, dir.z], best, W, list);
        if (q) { best = q.along; const D = q.D || crashRec(q.id, q.v, q.T), hp = [wo[0] + dir.x * best, wo[1] + dir.y * best, wo[2] + dir.z * best]; wrecks.shot(D, W.dmg, toLocal(D, ...hp), dirLocal(D, dir.x, dir.y, dir.z)); fx.sparks(hp, 8, 4); target = null; } }
      const hull = infantry.F && armor.onRay(wo, [dir.x, dir.y, dir.z], best);      // (armour: a rifle round only sparks off it)
      if (hull) { best = hull.along; const hp = [wo[0] + dir.x * best, wo[1] + dir.y * best, wo[2] + dir.z * best]; armor.damage(hull.V, W.dmg * (hull.V.kind === 'tank' ? 0.02 : 0.08), 'player', [dir.x, dir.y, dir.z]); fx.sparks(hp, 7, 4); sound.clink(hp); target = null; }
      const wallHit = infantry.F && infantry.coverOnRay(wo, [dir.x, dir.y, dir.z], best);      // (sandbags stop it)
      if (wallHit) { best = wallHit.along; fx.dust([wo[0] + dir.x * best, wo[1] + dir.y * best, wo[2] + dir.z * best], 6, [0.62, 0.56, 0.44]); }
      const man = infantry.F && infantry.onRay(wo, [dir.x, dir.y, dir.z], best);
      if (man) { best = man.along; target = null; if (man.M.hp > 0) { const kill = infantry.hurt(man.M, W.dmg * (man.head ? 1.8 : 1), 'player', [dir.x, dir.z]); chud.hit(kill, man.head); sound.hit(kill); } fx.dust([wo[0] + dir.x * best, wo[1] + dir.y * best, wo[2] + dir.z * best], 4, [0.45, 0.12, 0.1]); }
      if (infantry.F) infantry.heard(wo, [dir.x, dir.y, dir.z], best);
      { const B = strikeView?.board, gm = B && B.onRay(wo, [dir.x, dir.y, dir.z], best);      // (a marine aboard the dreadnought: sim/boarding.js)
        if (gm) { best = gm.along; target = null; const kill = B.hurt(gm.M, W.dmg * (gm.head ? 1.8 : 1), [dir.x, dir.z]); chud.hit(kill, gm.head); sound.hit(kill); fx.dust([wo[0] + dir.x * best, wo[1] + dir.y * best, wo[2] + dir.z * best], 4, [0.45, 0.12, 0.1]); }
        if (B) B.heard(wo); }
      const shot = fauna?.onRay(wo, [dir.x, dir.y, dir.z], best);
      if (shot) { best = shot.along; target = null; fauna.hurt(shot.A, W.dmg); }
      hitPoint = [wo[0] + dir.x * best, wo[1] + dir.y * best, wo[2] + dir.z * best];
      const g = tracer.geometry.attributes.position, hp = toRender(...hitPoint), hand = toRender(ctrl.pos[0] + Math.sin(ctrl.facing) * 0.5, ctrl.pos[1] + 1.35, ctrl.pos[2] + Math.cos(ctrl.facing) * 0.5);
      g.setXYZ(0, ...hand); g.setXYZ(1, ...hp); g.needsUpdate = true; tracer.material.opacity = 0.9;
      flash.position.set(...hand); flash.intensity = 25;
      // the kick: the muzzle climbs (less with it to your eye), and the next shots wander further until you let it settle
      { const kick = (0.008 + Math.random() * 0.006) * (1 - 0.35 * aimK) * (crouched || proned ? 0.75 : 1); cam.pitch = Math.max(-0.9, cam.pitch - kick); recoilDebt += kick; } cam.yaw += (Math.random() - 0.5) * 0.005; bloom = Math.min(W.spread * 2.5, bloom + W.spread * 0.4);
      sound.shot(null, { energy: !!W.energy }); fx.shake = Math.max(fx.shake, 0.1); lastFired = performance.now() / 1000; avatar.fired?.();
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
    else { ui.toast(`You hit ${esc(known(store, p.id) ? p.name : nameFor(p))}${res.down ? ' — they go down' : ''}. <small>${Math.round(res.hp)}% health</small>`, 'bad', 2500);
      if (!res.down) { acting.set(p.id, { id: 'punched', from: 0.9, rate: 1.4, t0: t, until: t + 1.6 / 1.4, pos: target.pos.slice(), facing: Math.atan2(ctrl.pos[0] - target.pos[0], ctrl.pos[2] - target.pos[2]) });
        // hit with fists or a blade, some hit back: the guard up, coming at you with hooks, until one of you is down or you're away
        const W2 = WEAPONS[id]; if ((!W2 || !W2.ranged) && !isOfficer(p) && !scrap && Math.random() < 0.6) { scrap = { id: p.id, name: p.given || p.name, pos: target.pos.slice(), until: t + 25, next: t + 1.6 }; ui.toast(`<b>${esc(known(store, p.id) ? p.name : nameFor(p))}</b> puts their fists up.`, 'warn', 3000); } } }
  }

  // ---- people in the recorded takes (player/mixamo.js poseCrowd, render/crowd.js): getting up, a blow taken, dead, fist fights
  const DEATHS = ['death_front', 'death_back', 'dying'], diedAt = new Map(), acting = new Map();      // acting: id → { id: take, from, rate, t0, until, pos, facing }
  let scrap = null, brawl = null, nextBrawl = 0;      // scrap: someone you hit squaring up to you; brawl: two of them going at it
  loadMixamo().catch(() => {});
  function actPeople(t, dt) {
    for (const [k, A] of acting) if (t > A.until) { if (A.then === 'up') acting.set(k, { id: 'get_up', from: 1.6, rate: 1.3, t0: t, until: t + 5 / 1.3, pos: A.pos, facing: A.facing }); else acting.delete(k); }
    // squaring up to you: the boxer's guard, closing in, a hook every second or two
    if (scrap) { const a = agents.find(x => x.id === scrap.id), d = a ? Math.hypot(scrap.pos[0] - ctrl.pos[0], scrap.pos[2] - ctrl.pos[2]) : 99;
      if (!a || a.pose === 'lie' || isDown(store, scrap.id, t) || bodies.some(b => b.id === scrap.id) || d > 9 || t > scrap.until || flight || ride) { if (a && d > 9) ui.toast(`${esc(scrap.name)} lets you go.`, '', 2500); scrap = null; }
      else { const f = Math.atan2(ctrl.pos[0] - scrap.pos[0], ctrl.pos[2] - scrap.pos[2]); if (d > 1.3) { const k = Math.min(d - 1.2, dt * 1.6); scrap.pos[0] += Math.sin(f) * k; scrap.pos[2] += Math.cos(f) * k; scrap.pos[1] = world.groundAt(scrap.pos[0], scrap.pos[2], scrap.pos[1] + 1).h; }
        if (t >= scrap.next) { scrap.next = t + 1.4 + Math.random() * 1.2; scrap.swing = t; if (d < 1.7) setTimeout(() => { if (scrap && Math.hypot(scrap.pos[0] - ctrl.pos[0], scrap.pos[2] - ctrl.pos[2]) < 1.9) hurtPlayer(5 + Math.random() * 7, `a punch from ${scrap.name}`, scrap.pos); }, 420); }
        const sw = t - (scrap.swing ?? -9); acting.set(scrap.id, sw < 1.0 ? { id: 'hook', from: 0.6, rate: 1.7, t0: scrap.swing, until: t + 0.1, pos: scrap.pos, facing: f } : { id: Math.sin(t * 0.8) > 0 ? 'strafe_l' : 'strafe_r', from: 0, rate: 0.6, t0: 0, until: t + 0.1, pos: scrap.pos, facing: f, loop: true }); } }
    // two of them going at it (Fist Fight A against B, in step, face to face), till one of them's down
    if (brawl) { const A = agents.find(x => x.id === brawl.a), B = agents.find(x => x.id === brawl.b), el = t - brawl.t0;
      if (!A || !B || el > brawl.dur) { if (A && B) { const L = Math.random() < 0.5 ? brawl.a : brawl.b, P = L === brawl.a ? brawl.pa : brawl.pb; acting.set(L, { id: 'dazed', from: 0, rate: 1, t0: t, until: t + 20, pos: P, facing: L === brawl.a ? brawl.f : brawl.f + Math.PI, then: 'up' }); } brawl = null; }
      else { acting.set(brawl.a, { id: 'fight_a', from: 0, rate: 1, t0: brawl.t0, until: t + 0.1, pos: brawl.pa, facing: brawl.f }); acting.set(brawl.b, { id: 'fight_b', from: 0, rate: 1, t0: brawl.t0, until: t + 0.1, pos: brawl.pb, facing: brawl.f + Math.PI }); } }
    else if (t > nextBrawl && !flight && agents.length > 6) { nextBrawl = t + 90 + Math.random() * 150;
      const free = agents.filter(a => !a.bKey && a.person && a.person.age >= 18 && a.pose !== 'lie' && a.pose !== 'sit' && !acting.has(a.id) && !String(a.id).startsWith('tr:') && !isOfficer(a.person) && Math.hypot(a.pos[0] - ctrl.pos[0], a.pos[2] - ctrl.pos[2]) < 45);
      let pair = null; for (const a of free) { const b = free.find(b => b !== a && Math.hypot(b.pos[0] - a.pos[0], b.pos[2] - a.pos[2]) < 6 && !world.solidAt((a.pos[0] + b.pos[0]) / 2, a.pos[1] + 1, (a.pos[2] + b.pos[2]) / 2, 0.9) && (pop.gangOf?.(a.person.id)?.id !== pop.gangOf?.(b.person.id)?.id || !pop.gangOf?.(a.person.id))); if (b) { pair = [a, b]; break; } }
      if (pair) { const [a, b] = pair, mid = [(a.pos[0] + b.pos[0]) / 2, a.pos[1], (a.pos[2] + b.pos[2]) / 2], f = Math.atan2(b.pos[0] - a.pos[0], b.pos[2] - a.pos[2]), g = 0.65;
        const pa = [mid[0] - Math.sin(f) * g, 0, mid[2] - Math.cos(f) * g], pb = [mid[0] + Math.sin(f) * g, 0, mid[2] + Math.cos(f) * g]; pa[1] = world.groundAt(pa[0], pa[2], mid[1] + 1).h; pb[1] = world.groundAt(pb[0], pb[2], mid[1] + 1).h;
        brawl = { a: a.id, b: b.id, pa, pb, f, t0: t, dur: (clipInfo('fight_a')?.dur || 4.6) * 0.98 }; if (Math.hypot(mid[0] - ctrl.pos[0], mid[2] - ctrl.pos[2]) < 30) ui.toast(`A fight breaks out: <b>${esc(a.person.given)}</b> and <b>${esc(b.person.given)}</b> go at each other.`, 'warn', 5000); } }
    // and what they're acting out, laid over where the day had them
    for (const a of agents) { const A = acting.get(a.id); if (!A || a.activity === 'dead') continue;
      if (A.pos) { a.pos = A.pos.slice(); a.moving = false; } if (A.facing != null) a.facing = A.facing; const I = clipInfo(A.id); if (!I) continue;
      a.clip = { id: A.id, t: A.loop ? (t * A.rate) % I.dur : A.from + (t - A.t0) * A.rate }; if (A.id === 'dazed' || A.id === 'get_up') a.pose = 'lie'; }
  }
  // ---- running people down: whatever you're driving (a car, a bike, a tank) hits whoever's in front of it as hard as it's going and as heavy as it is
  const hitBy = new Map();      // id → when: each person's hit once per pass, not every frame they're under it
  function runOver(t) {
    const V = tankV ? { pos: tankV.pos, facing: tankV.facing, speed: tankV.speed, L: tankV.T.L, W: tankV.T.W, kg: 3, name: `your ${tankV.T.name}` } : ride && !ride.dead ? { pos: ride.pos, facing: ride.facing, speed: ride.speed, L: ride.T.L, W: ride.T.W, kg: ride.T.L > 5.5 ? 1.6 : ride.T.kind === 'bike' ? 0.6 : 1, name: `your ${ride.T.name.toLowerCase()}` } : null;
    if (!V || Math.abs(V.speed) < 2.5) return;
    const fx = Math.sin(V.facing), fz = Math.cos(V.facing), sp = Math.abs(V.speed), sg = Math.sign(V.speed), now = performance.now();
    for (const [k, w] of hitBy) if (now - w > 2500) hitBy.delete(k);
    const under = p => { const dx = p[0] - V.pos[0], dz = p[2] - V.pos[2], u = dx * fx + dz * fz, v = dx * fz - dz * fx; return Math.abs(u) < V.L / 2 + 0.35 && Math.abs(v) < V.W / 2 + 0.3 && Math.abs(p[1] - V.pos[1]) < 2.5 && u * sg > -V.L / 4; };
    const dmg = Math.min(250, sp * sp * 0.5 * V.kg), fling = (p, dead) => [fx * sg * sp * 0.6 + (Math.random() - 0.5), 1.5 + sp * 0.12, fz * sg * sp * 0.6 + (Math.random() - 0.5)];
    let hit = 0;
    // the townsfolk about: a real resident, hurt or killed, with whoever saw it
    for (const a of agents) { if (a.pose === 'lie' || a.bKey || String(a.id).startsWith('tr:') || !a.person || hitBy.has(a.id) || bodies.some(b => b.id === a.id) || !under(a.pos)) continue;
      hitBy.set(a.id, now); hit++; const p = a.person, here = world.locate(...ctrl.pos), seen = residents.witnesses(t, ctrl.pos, here?.b?.key || null, here?.k ?? null).filter(w => w.id !== p.id && !bodies.some(b => b.id === w.id));
      const fall = [a.pos[0] + fx * sg * Math.min(6, sp * 0.4), a.pos[1], a.pos[2] + fz * sg * Math.min(6, sp * 0.4)]; downAt.set(p.id, { pos: fall, facing: V.facing });
      const res = strike(ctx, p, 'vehicle', t, seen, dmg); if (res.incident) lodgeIncident(ctx, res.incident);
      if (!res.killed && !res.down && sp > 5.5) { store.patchDelta('hurt/' + p.id, { downUntil: t + 60 + sp * 12 }); res.down = true; }      // (struck by a car you're knocked off your feet, however much of you is left)
      const cop = seen.find(w => isOfficer(pop.byId.get(w.id))); if (cop && !pursuit) startPursuit(pop.byId.get(cop.id), res.killed ? `you ran down and killed ${p.name}` : `you ran down ${p.name}`);
      if (res.killed) { bodies.push({ id: p.id, person: p, pos: fall, facing: V.facing, until: t + planet.dayLength / 24 }); downAt.delete(p.id); ui.toast(`You ran down <b>${esc(p.name)}</b>. They're dead.${seen.length ? ` <b>${seen.length} saw it.</b>` : ''}`, 'bad', 8000); }
      else ui.toast(`You ran into ${esc(known(store, p.id) ? p.name : nameFor(p))}${res.down ? ' — they go down' : ''}. <small>${Math.round(res.hp)}% health</small>`, 'bad', 3000); }
    // passers-by in the city: thrown
    if (mayhem) for (const w of peopleNear(t, V.pos[0], V.pos[2], V.L, 12).concat(mayhem.crowd ? mayhem.crowd().filter(c => !c.flying && c.pose !== 'lie') : [])) { if (!w?.pos || mayhem.out.has(w.id) || hitBy.has(w.id) || !under(w.pos)) continue;
      hitBy.set(w.id, now); hit++; const dead = dmg > 60; mayhem.out.add(w.id); mayhem.thrown({ id: w.id, name: w.name || 'A passer-by', pos: w.pos.slice(), vel: fling(w.pos, dead), age: w.age, facing: w.facing, dead });
      const n = mayhem.crime(t, dead ? 'ran someone down' : 'hit someone with a vehicle', dead ? 3.5 : 1.2, w.pos); ui.toast(`You hit a passer-by${dead ? ' — they don\'t get up' : ''}.${n ? ` <b>${n} saw.</b>` : ''}`, 'bad', 3500); }
    // soldiers on the line
    if (infantry.F) for (const M of infantry.men) { if (M.hp <= 0 || hitBy.has(M.id) || !under(M.pos)) continue; hitBy.set(M.id, now); hit++; const k = infantry.hurt(M, dmg, 'player', [fx * sg, fz * sg]); if (onLine() || tankV) chud.log(k ? `Ran down a ${M.side === 'theirs' ? infantry.F.b.name : 'friendly'} soldier` : 'Hit a soldier', M.side === 'theirs' ? 'you' : 'bad'); }
    if (hit) { sound.hit?.(true); fx.shake = Math.max(fx.shake, Math.min(0.5, 0.1 + sp * 0.015) / V.kg); if (ride) ride.speed *= Math.max(0.55, 1 - 0.18 / V.kg); }
  }
  // ---- air combat (sim/aircombat.js): your ship in the fight, raids, and Civic Security's fighters
  const war = new AirWar(world, planet), combatView = new CombatView(scene); war.lookY = (x, z) => farY(x, z);
  // the great ships in the fight (sim/fleetwar.js): Anvil's lasers and missiles, Bastion's fighters, Sable's bombing runs. What lands, wrecks.
  planet.craters = [...store.deltas].filter(([k]) => k.startsWith('crater/')).map(([, v]) => v);
  const groundY = (x, z) => Math.max(world.groundAt(x, z, 1e5).h, cloudW ? -1e9 : planet.seaLevel);
  // What the fog has swallowed whole isn't drawn: FogExp2 at density d leaves exp(-(d·r)²) of a thing at r, under a quarter of a
  // percent past 2.45/d, so it would come out the fog's own colour anyway. Only for the big far groups (the great ships, the city,
  // towns, outposts, rocks, trees), only for what the fog colours (lit windows and nav lights carry on through it), and through
  // layers, so nothing else that hides or shows these is crossed. (The home fleet and town were 5 M triangles a frame from the line.)
  const FOG_GROUPS = /^(fleet|city|towns|outposts|rocks|flora|settlement:|town-far:)/, _fs = new THREE.Sphere(); let fogT = 0;
  function fogCull() {
    const f = scene.fog; if (!f?.density || (fogT = (fogT + 1) % 8)) return; const D = 2.45 / f.density, cp = camera.position;
    const visit = g => g.traverse(o => { if (!o.isMesh || o.isSkinnedMesh) return; const ms = [].concat(o.material); if (!ms.every(m => m.fog === true)) { o.layers.mask = 1; return; }
      let S; if (o.isInstancedMesh) { if (!o.count) return; if (!o.boundingSphere || o.userData.fogV !== o.instanceMatrix.version || o.userData.fogN !== o.count) { o.computeBoundingSphere(); o.userData.fogV = o.instanceMatrix.version; o.userData.fogN = o.count; } S = o.boundingSphere; }      // (instances: the sphere round all of them)
      else { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); S = o.geometry.boundingSphere; }
      _fs.copy(S).applyMatrix4(o.matrixWorld); o.layers.mask = _fs.center.distanceTo(cp) - _fs.radius > D ? 0 : 1; });
    for (const c of scene.children) { if (FOG_GROUPS.test(c.name)) visit(c); else if (!c.name && c.isGroup) for (const k of c.children) if (FOG_GROUPS.test(k.name) || !k.name && k.isGroup) visit(k); }
  }
  // The great ships, what's on them, and the docked ships were drawn whether or not they were in view (frustumCulled off): 5-6 M
  // triangles a frame in the home town. Their shaders don't move vertices, so culling them by their bounds is safe; an instanced
  // mesh's bound (round all its instances) is remade whenever its instances move or change in number.
  function cullFix() {
    for (const c of scene.children) { if (c.name !== 'fleet' && c.name !== 'ships') continue;
      c.traverse(o => { if (!o.isMesh || o.isSkinnedMesh) return; if (o.userData.noCull) return; if (window.__noCullFix) { o.frustumCulled = false; return; }      // (the switch: to compare against the old way)
        if (o.isInstancedMesh) { if (o.userData.cv !== o.instanceMatrix.version || o.userData.cn !== o.count) { if (o.count) o.computeBoundingSphere(); o.userData.cv = o.instanceMatrix.version; o.userData.cn = o.count; } if (!o.count) return; }
        o.frustumCulled = true; }); }
  }
  // what the armour does that you see and hear: its guns, the blasts, hits on it, it brewing up; engines and tracks; wrecks burning
  function armorFx(dt) {
    const me = ctrl.pos, dist = p => Math.hypot(p[0] - me[0], p[2] - me[2]);
    for (const e of armor.drain()) {
      if (e.type === 'fire') { sound.cannon(e.p, e.kind); const g = armor.gunDir(e.V); for (let i = 0; i < (e.kind === 'shell' ? 5 : 1); i++) fx.smoke([e.p[0] + g[0] * i * 0.6, e.p[1], e.p[2] + g[2] * i * 0.6], e.kind === 'shell' ? 0.9 : 0.4, [g[0] * 4, g[2] * 4], 0.6, 0.22); if (e.kind === 'shell') { fx.sparks(e.p, 10, 6, g); fx.burnLight(e.p, 6); }
        const d = dist(e.p); fx.shake = Math.max(fx.shake, e.V === tankV ? 0.5 : Math.max(0, (e.kind === 'shell' ? 0.45 : 0.15) - d / 300)); }
      if (e.type === 'launch') { sound.rocket(e.p); fx.smoke(e.p, 0.8, [0, 0], 0.5, 0.4); }
      if (e.type === 'blast') { if (!e.onHull) damageBuildings(e.p, e.kind === 'ac' ? e.R * 0.4 : e.R * 1.6); fx.blast(e.p, e.R * 0.45); fx.dustRing(e.p, e.R * (e.kind === 'ac' ? 0.4 : 0.9)); if (e.onHull) fx.sparks(e.p, 18, 6); sound.boom(e.p, e.kind === 'ac' ? 2 : e.R); const d = dist(e.p); fx.shake = Math.max(fx.shake, Math.max(0, (e.kind === 'ac' ? 0.2 : 0.8) - d / 60)); if (d < 8 && !tankV) infantry.felt(0.3); }
      if (e.type === 'hitV' && e.V === tankV) { chud.hurt(0, !e.pen); sound.hurt(!e.pen); fx.shake = Math.max(fx.shake, e.pen ? 0.6 : 0.3); }
      if (e.type === 'yourHitV') { chud.hit(e.kill); sound.hit(e.kill); if (!e.pen && !e.kill) chud.log(`It bounced: hit the ${e.V.T.name} in the side or the back`, ''); }
      if (e.type === 'yourHit') { chud.hit(e.kill); sound.hit(e.kill); }
      if (e.type === 'vdown') { const V = e.V; fx.blast([V.pos[0], V.pos[1] + 1.5, V.pos[2]], 4); fx.sparks([V.pos[0], V.pos[1] + 2, V.pos[2]], 40, 10); sound.boom(V.pos, 9); const d = dist(V.pos); fx.shake = Math.max(fx.shake, Math.max(0, 1 - d / 120));
        if (e.by === 'player' && V.side === 'theirs') { chud.log(`You knocked out a ${infantry.F.b.name} ${V.T.name}`, 'you'); player.credits = (player.credits ?? 0) + (V.kind === 'tank' ? 600 : 300); soldierKill(); }
        else if (e.by === 'player' && V.side === 'ours' && V !== tankV) ui.toast('That was one of ours.', 'bad', 4000);
        else if (d < 400) chud.log(`${V.side === 'ours' ? infantry.F.a.name : infantry.F.b.name} ${V.T.name} knocked out`, V.side === 'ours' ? 'bad' : ''); }
    }
    // the rounds in flight: a rocket's smoke trail
    for (const R of armor.rounds) if (R.kind === 'rocket' && Math.random() < dt * 40) fx.smoke(R.p, 0.35, [0, 0], 0.6, 0.35);
    // engines (the three nearest), track dust and exhaust, the wrecks burning
    const eng = [];
    for (const V of armor.list) { const d = dist(V.pos); if (d > 700) continue;
      if (V.dead) { const top = [V.pos[0], V.pos[1] + 1.6, V.pos[2]]; if (V.deadT < 120 && Math.random() < dt * 10) fx.flame(top, 1.3); if (Math.random() < dt * (V.deadT < 120 ? 4 : 1.2)) fx.smoke(top, 2.2, [0.5, 0.3], 0.05, 0.5); if (V.deadT < 120 && d < 300) fx.burnLight(top, 3); continue; }
      if (d < 260) eng.push({ id: V.id, p: V.pos, load: Math.min(1, Math.abs(V.speed) / V.T.top * 0.8 + Math.abs(V.yawRate) * 0.4 + 0.1), d });
      if (d < 200 && Math.abs(V.speed) > 1.2 && Math.random() < dt * Math.abs(V.speed) * 1.2) { const fx2 = Math.sin(V.facing), fz2 = Math.cos(V.facing), side = Math.random() < 0.5 ? -1 : 1, x = V.pos[0] - fx2 * V.T.L * 0.45 + fz2 * side * V.T.W * 0.4, z = V.pos[2] - fz2 * V.T.L * 0.45 - fx2 * side * V.T.W * 0.4; fx.dust([x, landY(x, z), z], 3, [0.5, 0.45, 0.38]); }
      if (d < 200 && Math.random() < dt * (1.5 + Math.abs(V.speed) * 0.5)) { const fx2 = Math.sin(V.facing), fz2 = Math.cos(V.facing); fx.smoke([V.pos[0] - fx2 * V.T.L * 0.5, V.pos[1] + 1.3, V.pos[2] - fz2 * V.T.L * 0.5], 0.5, [-fx2 * 2, -fz2 * 2], 0.12, 0.25); } }
    sound.engines(eng.sort((a, b) => a.d - b.d).slice(0, 3));
  }
  function groundBlast({ p, R, by }) {
    damageBuildings(p, R);
    fx.blast(p, R * 0.5); fx.dustRing(p, R); wrecks.blastAt(p, R * 1.5);
    const d = Math.hypot(ctrl.pos[0] - p[0], ctrl.pos[1] - p[1], ctrl.pos[2] - p[2]); if (d < R * 2.5 && !flight) hurtPlayer(Math.round(80 * (1 - d / (R * 2.5))), `a blast from the ${by === 'sable' ? 'Sable' : 'Anvil'}`);
    if (!cloudW && p[1] > planet.seaLevel + 0.5) {        // a crater, kept: the ground stays broken (gen/surface.js craterAt)
      const C = { x: Math.round(p[0] * 10) / 10, z: Math.round(p[2] * 10) / 10, r: R * 0.55, d: R * 0.16 }, id = 'crater/' + Math.round(p[0]) + ',' + Math.round(p[2]);
      if (!store.getDelta(id) && planet.craters.length < 600) { planet.craters.push(C); store.patchDelta(id, C); terrain.refresh(p[0], p[2], C.r * 1.7); battleY.drop(p[0], p[2], C.r * 1.7); farY.drop(p[0], p[2], C.r * 1.7); }
    }
    for (const b of nearBuildingsOf(p, R * 1.6)) if (!store.getDelta('scorch/' + b.key)) store.patchDelta('scorch/' + b.key, { t: clock.now() });     // (what was hit is marked: render keeps it scorched)
  }
  function nearBuildingsOf(p, r) { const out = []; for (const b of s.buildings || []) { const [x, z] = s.toWorld(b.O[0] + b.ex[0] * b.w / 2 + b.ez[0] * b.d / 2, b.O[1] + b.ex[1] * b.w / 2 + b.ez[1] * b.d / 2); if (Math.hypot(x - p[0], z - p[2]) < r + Math.max(b.w, b.d) / 2) out.push(b); } return out; }
  const landY = (x, z) => Math.max(surfaceHeight(planet, x, z), planet.seaLevel);      // (the land itself, loaded or not: the line can be a long way off)
  let aloft = false;      // (flying more than 300 m up: set each frame)
  const roughY = (x, z) => Math.max(rawHeight(planet, x, z), planet.seaLevel);      // (how high you are, flying: the land's own shape, which costs nothing; landY asks for the towns, rivers and roads round it)
  const battleY = heightCache(landY, 0.5), farY = heightCache(landY, 12, 400);      // (world/heightcache.js: what the battle stands on, and what its aircraft look ahead at)
  const infantry = new Infantry({ ground: battleY, resolve: (x, z, y) => world.resolve(x, z, y + 0.05, 0.3, 1.7, true), hooks: { hitPlayer: (d, by, from) => hurtPlayer(d, by, from), hard: (o, d, far) => world.rayHard(o, d, far, 0.3, 0.5) } }), infantryView = new InfantryView(scene, root, planet, toRender);      // (sim/infantry.js: the war on foot along the same line)
  // what a hull drives on besides the land: the rocks lying about, and the rock standing out of a steep hillside
  const armorRocks = (x, z, R, fn) => { const f = q => fn({ x: q.x, z: q.z, r: q.r, g: q.g, top: q.top, flat: q.shape === 'slab' || q.deep !== undefined }); rocksNear(planet, x, z, R, f); ledgesNear(planet, x, z, R, f); };
  // everything else solid a hull meets: buildings, outposts, trees, cars and wrecks (the world's own collision, less the line's works and the hulls, which sim/armor.js does itself)
  const armorSolid = (x, z, y, r, h) => { const F = world.field; world.field = null; try { return world.resolve(x, z, y, r, h); } finally { world.field = F; } };
  // a tree in the way of a hull going at it goes down (as one in a car's way does)
  const armorFell = (x, z, R, facing, y) => { let n = 0; floraNear(planet, x, z, R, p => { if (!p.solid || p.felled || Math.abs(p.y - y) > 3 || p.size > 16) return; felledOf(planet).set(fellKey(p), +facing.toFixed(2)); p.felled = { a: facing }; n++; fx.dust([p.x, p.y + 0.2, p.z], 16, [0.32, 0.28, 0.2]); }); if (n) { store.patchDelta('felled', { list: [...felledOf(planet).entries()] }); flora.at = null; } return n; };
  { const blast0 = infantry.blast.bind(infantry); infantry.blast = (p, R, ...rest) => { try { damageBuildings(p, R ?? 6); } catch (e) { console.warn(e); } return blast0(p, R, ...rest); }; }      // (a grenade, a shell, a rocket: whatever bursts in a street)
  infantry.hooks.built = (x, z, pad = 0.5, hull = false) => { const q = battleTown(); if (!q?.buildings) return false; const [u, v] = q.toLocal(x, z); for (const b of q.buildings) { if (hull && bState(b) === 'flat') continue;      // (a hull goes over what's been flattened)
    const du = u - b.O[0], dv = v - b.O[1], lx = du * b.ex[0] + dv * b.ex[1], lz = du * b.ez[0] + dv * b.ez[1]; if (lx > -pad && lz > -pad && lx < b.w + pad && lz < b.d + pad) return true; } return false; };
  const armor = new Armor(infantry, { hitPlayer: (d, by, from) => hurtPlayer(d, by, from), knock: (vx, vz) => ctrl.knock(vx, vz, 2.5, 0.9), rocks: armorRocks, solid: armorSolid, fell: armorFell, ram: (...q) => armorRam(...q) }), armorView = new ArmorView(scene, toRender);      // (sim/armor.js: tanks and carriers on the same line)
  // the dead of your line, each under a stone where they fell (render/memorials.js; solid, player/collision.js stones)
  const memorials = new MemorialView(); root.add(memorials.group);
  const syncStones = () => { const F = [...store.deltas].filter(([k]) => k.startsWith('fallen/')).map(([k, v]) => ({ key: k, ...v })).filter(f => Array.isArray(f.pos));
    world.stones = memorials.sync(F, (x, z, y) => { try { return world.groundAt(x, z, y + 1).h; } catch { return landY(x, z); } }, t => `Day ${dayNumber(planet, t)}`); };
  syncStones();
  const boardingView = new BoardingView(scene, planet, toRender);      // (render/boarding.js: the marines aboard a dreadnought you've boarded)
  infantry.armor = armor; world.field = infantry;      // (the works and the hulls are solid: player/collision.js)
  // ---- the war over the whole planet (sim/planetwar.js): dreadnoughts burning towns, whether you're there or not
  const planetWar = new PlanetWar({
    townsNear: (x, z, r) => { const [rx, rz] = regionOf(x, z), k = Math.ceil(r / 3072), out = []; for (let a = -k; a <= k; a++) for (let b = -k; b <= k; b++) { const q = getSettlement(planet, rx + a, rz + b); if (q && Math.hypot(q.cx - x, q.cz - z) < r) out.push(q); } return out; },
    farTown: p => { for (let k = 0; k < 6; k++) { const a = Math.random() * 6.283, d = 15000 + Math.random() * 45000, [rx, rz] = regionOf(p[0] + Math.sin(a) * d, p[2] + Math.cos(a) * d), q = getSettlement(planet, rx, rz); if (q) return q; } return null; },
    nationOf: q => townSociety(planet, q)?.nation || null,
    enemyOf: nat => warEnemyOf(nationsOf(planet), (a, b) => relationOf(planet, a, b), nat),
    isHome: q => q === homeS || q.key === homeS.key, ground: landY,
    getDelta: k => store.getDelta(k), patchDelta: (k, v) => store.patchDelta(k, v), clearDelta: k => { const D = store.getDelta(k); if (D) store.patchDelta(k, Object.fromEntries(Object.keys(D).map(q => [q, undefined]))); },
  }, params.has('strike') ? { firstIn: +params.get('strike') || 5 } : params.has('slot') ? { firstIn: 1e12, newsIn: 1e12 } : {});      // (?strike=s: one in s seconds; the test runs, ?slot=, have none)
  const townBurnt = q => planetWar.ruined(q, clock.now());
  towns.ruinOf = q => { const burnt = townBurnt(q); return b => burnt ? true : bState(b); }; towns.panesOf = bPanes;
  world.ruined = (b, H) => { const q = world.townOf(b); return q && q !== homeS && townBurnt(q) ? ruinFloor(b.key, H) : b.type === 'ship' ? null : bState(b) === 'flat' ? 0.6 : bState(b) === 'down' ? Math.max(2.4, H * ruinKeep(b.key) * 0.55 - 2.85) : null; };
  // Shellfire on a town. Every blast takes something off what stands near it; the first leaves a building's windows out, enough of them bring it
  // down to its broken walls (what's inside is under them). 
  const battleTown = () => { const k = infantry.F?.town; return k ? townOfKey(planet, k) : null; };
  const centreOfB = (q, b) => q.toWorld(b.O[0] + b.ex[0] * b.w / 2 + b.ez[0] * b.d / 2, b.O[1] + b.ex[1] * b.w / 2 + b.ez[1] * b.d / 2);
  // A round through a window takes that pane out (the building's own glass in the town's mesh, render/settlement-mesh.js breakGlass), kept in the save
  const shotGlass = (from, to) => { let n = 0; for (const h of world.windowsOn(from, to)) { const b = h.b; if (bState(b)) continue; const box = h.w.slice(0, 6).map(v => +v.toFixed(2)), D = store.getDelta('hit/' + b.key), W = D?.w || []; if (W.some(q => q[0] === box[0] && q[1] === box[1] && q[4] === box[4])) continue;
      const q = world.townOf(b), T = q === homeS ? homeTown : towns.full.get(q.key); let was = false; try { was = !!T?.town?.breakGlass?.(b, [box]); } catch (e) { console.warn('glass', e); } if (!was) continue;
      store.patchDelta('hit/' + b.key, { w: [...W, box].slice(-80), t: clock.now() }); fx.glass(h.p, 16); sound.glass?.(h.p); n++; } return n; };
  // Where a man can fight from inside what's built there (sim/infantry.js posts): behind each window that has a room to stand in, reached from
  // the door by the rooms and the stairs (gen/paths.js, the way the people who live there go); along the edge of each flat roof a fire ladder goes up to
  infantry.hooks.posts = F => { const q = battleTown(), out = []; if (!q?.buildings) return out; const ux = Math.sin(F.dir), uz = Math.cos(F.dir);
    for (const b of q.buildings) { if (b.type === 'ship' || fallen(bState(b))) continue; const [cx, cz] = centreOfB(q, b); if (Math.abs((cx - F.x) * ux + (cz - F.z) * uz) > 150 || Math.abs((cx - F.x) * -uz + (cz - F.z) * ux) > 250) continue;
      let plan; try { plan = buildingPlan(planet, q, b); } catch { continue; } const W = (lx, ly, lz) => buildingToWorld(q, b, lx, ly, lz), grounded = p => { p[1] = landY(p[0], p[2]); return p; }; let n = 0;
      for (const wl of plan.walls) { if (!wl.exterior || !wl.openings.length) continue; const alongX = wl.z0 === wl.z1, inw = wl.side === 'front' ? [0, 1] : wl.side === 'back' ? [0, -1] : wl.side === 'left' ? [1, 0] : [-1, 0], nw = world.fromBVec(b, -inw[0], -inw[1]);
        for (const o of wl.openings) { if (o.kind !== 'window' || o.y0 > 1.25 || o.y1 < 1.7 || n >= 14) continue; const c = (o.a + o.b) / 2, cc = alongX ? wl.z0 : wl.x0, x = (alongX ? c : cc) + inw[0] * 0.85, z = (alongX ? cc : c) + inw[1] * 0.85, fy = wl.k * plan.H;
          const room = plan.rooms.find(r => r.k === wl.k && x > r.rect[0] + 0.2 && x < r.rect[2] - 0.2 && z > r.rect[1] + 0.2 && z < r.rect[3] - 0.2); if (!room) continue;
          if (plan.props.some(pr => !pr.soft && x > pr.x0 - 0.35 && x < pr.x1 + 0.35 && z > pr.z0 - 0.35 && z < pr.z1 + 0.35 && pr.y > fy - 0.5 && pr.y < fy + 2)) continue;      // (something stands at that window)
          let pts = null; try { pts = interiorPoints(plan, b.key, 'outside', { k: wl.k, room: room.i, x, z }); } catch { } if (!pts || pts.length < 2) continue;
          const path = pts.map(pt => { const w = W(pt[0], pt[1], pt[2]); if (pt.door) w.door = pt.door; return w; }); grounded(path[0]);
          out.push({ pos: W(x, fy, z), face: Math.atan2(nw[0], nw[1]), n: nw, k: wl.k, roof: false, b: b.key, path }); n++; } }
      const lad = !plan.roofSlopes && ladderOf(planet, q, b);
      if (lad) { const top = plan.F * plan.H, add = (x, z, nl) => { const nw = world.fromBVec(b, nl[0], nl[1]), path = [grounded(lad.behind.slice()), grounded(lad.foot.slice()), lad.head.slice(), lad.roof.slice(), W(x, top, z)]; path.lad = 2; path.ladFace = lad.facing; out.push({ pos: W(x, top, z), face: Math.atan2(nw[0], nw[1]), n: nw, k: plan.F, roof: true, b: b.key, path }); };
        for (let x = 1.6; x < b.w - 1.2; x += 6) { add(x, 0.85, [0, -1]); add(x, b.d - 0.85, [0, 1]); } for (let z = 3; z < b.d - 2.6; z += 6) { add(0.85, z, [-1, 0]); add(b.w - 0.85, z, [1, 0]); } } }
    return out; };
  // Can a man at a see a man at b past what's built (eye to chest)? Each building the line crosses: over its top, or (when one of them's inside it) out through a window
  { let lk = null, list = [];
    infantry.hooks.los = (a, b) => { const q = battleTown(); if (!q?.buildings) return true; if (lk !== q.key) { lk = q.key; list = q.buildings.filter(B => B.type !== 'ship').map(B => { const [x, z] = centreOfB(q, B); return { B, x, z, r: Math.hypot(B.w, B.d) / 2 + 0.2 }; }); }
      const ex = b[0] - a[0], ez = b[2] - a[2], L2 = ex * ex + ez * ez || 1e-9;
      for (const it of list) { const t = Math.max(0, Math.min(1, ((it.x - a[0]) * ex + (it.z - a[2]) * ez) / L2)), px = a[0] + ex * t - it.x, pz = a[2] + ez * t - it.z; if (px * px + pz * pz > it.r * it.r) continue;
        const B = it.B, c = world.colliders(B), base = world.baseOf(B), [ax, az] = world.toB(B, a[0], a[2]), [bx, bz] = world.toB(B, b[0], b[2]), ay = a[1] - base, by = b[1] - base, dx = bx - ax, dz = bz - az; c.top ??= c.walls.reduce((m, w) => Math.max(m, w[5]), 0);
        let t0 = 0, t1 = 1, out = false; for (const [p0, d, hi] of [[ax, dx, B.w], [az, dz, B.d]]) { if (Math.abs(d) < 1e-9) { if (p0 < 0 || p0 > hi) out = true; continue; } let u0 = -p0 / d, u1 = (hi - p0) / d; if (u0 > u1) [u0, u1] = [u1, u0]; t0 = Math.max(t0, u0); t1 = Math.min(t1, u1); }
        if (out || t0 >= t1) continue; const inA = t0 <= 0, inB = t1 >= 1; if (inA && inB) { if (Math.abs(ay - by) > 1.2) return false; continue; }
        const through = tt => { const y = ay + (by - ay) * tt; if (y > c.top + 0.05) return 2; const lx = ax + dx * tt, lz = az + dz * tt; return c.wins.some(w => y > w[4] + 0.05 && y < w[5] - 0.05 && lx > w[0] - 0.12 && lx < w[2] + 0.12 && lz > w[1] - 0.12 && lz < w[3] + 0.12) ? 1 : 0; };
        if (!inA && !inB) { if (through(t0) !== 2 || through(t1) !== 2) return false; continue; }
        const y = inA ? ay : by; if (y >= c.plan.F * c.plan.H - 0.3 && !c.plan.roofSlopes ? through(inA ? t1 : t0) !== 2 : !through(inA ? t1 : t0)) return false; }
      return true; }; }
  // (a door a man of the line goes through is held open for him: render/doors.js transient)
  const warDoors = new Map(); infantry.hooks.door = key => warDoors.set(key, clock.now() + 1.5);
  let lastHitKey = '';
  // what a building's taken is added to (hit/<key>), and when that changes how it stands, it's done again where it stands: its glass out, then down to
  // its broken walls, then (shelled on, or driven over by a tank) to nothing over knee height
  function hitBuilding(q, b, dmg) {
    const was = bState(b), D = store.getDelta('hit/' + b.key); if (was === 'flat') return; store.patchDelta('hit/' + b.key, { d: (D?.d || 0) + dmg, t: clock.now() }); const is = bState(b); if (is === was) return;
    const [x, z] = centreOfB(q, b), half = Math.max(b.w, b.d) / 2;
    world.cols.delete(b.key); { const T = q === homeS ? homeTown : towns.full.get(q.key); try { T?.town?.setState?.(b, is); if (fallen(is)) T?.doorView?.drop(b.key); } catch (e) { console.warn('building', e); } }      // (that building alone: render/settlement-mesh.js setState; a town not built yet is built as it now is)
    if (fallen(is)) { towns.reblock(q.key); infantry.changed?.(b.key, is); }
    if (fallen(is)) { const g = landY(x, z), c = [x, g + 1, z], k = is === 'flat' && was === 'down' ? 0.5 : 1; fx.dustRing(c, half * 2.2 * k); if (k === 1) fx.blast([x, g + 3, z], half * 0.5); for (let n = 0; n < 10 * k; n++) fx.smoke([x + (Math.random() - 0.5) * b.w, g + 1 + Math.random() * 5 * k, z + (Math.random() - 0.5) * b.d], 2 + Math.random() * 2.5); sound.boom(c, 30 * k); fx.shake = Math.max(fx.shake, Math.min(0.8, 40 * k / (Math.hypot(ctrl.pos[0] - x, ctrl.pos[2] - z) + 20)));
      if (k === 1 && world.locate(...ctrl.pos)?.b?.key === b.key && !flight) hurtPlayer(75, 'a building coming down on you'); } }
  function damageBuildings(p, R) {
    const key = Math.round(p[0] * 4) + ',' + Math.round(p[2] * 4) + ',' + Math.round(clock.now() * 4); if (key === lastHitKey) return; lastHitKey = key;
    for (const q of new Set([s, battleTown()])) { if (!q?.buildings || Math.hypot(q.cx - p[0], q.cz - p[2]) > (q.R || 300) + R + 80) continue;
      for (const b of q.buildings) { if (b.type === 'ship') continue; const [x, z] = centreOfB(q, b), half = Math.max(b.w, b.d) / 2, d = Math.hypot(x - p[0], z - p[2]), reach = R * 1.5 + half; if (d > reach) continue;
        hitBuilding(q, b, Math.min(60, R * 2) * Math.max(0.25, 1 - d / reach)); } } }
  // a hull pushing at something built (sim/armor.js ram: the point of its nose): a tank goes through a house; a carrier only shakes it
  const armorRam = (x, z, V, dt) => { const q = battleTown() || s; if (!q?.buildings) return; const [u, v] = q.toLocal(x, z);
    for (const b of q.buildings) { if (b.type === 'ship') continue; const du = u - b.O[0], dv = v - b.O[1], lx = du * b.ex[0] + dv * b.ex[1], lz = du * b.ez[0] + dv * b.ez[1]; if (lx < -1.5 || lz < -1.5 || lx > b.w + 1.5 || lz > b.d + 1.5) continue;
      hitBuilding(q, b, dt * (V.kind === 'tank' ? 70 : 9)); if (Math.random() < dt * 6) fx.dust([x, landY(x, z) + 1 + Math.random() * 1.5, z], 6, [0.55, 0.5, 0.45]); return; } };
  let ruinsNear = [], ruinsT = 0, beamSnd = 0, sirenT = 0, smokeK = 0;
  // the great ships brought down, lying where they fell (gen/hulk.js; hulk/… in the save): drawn (render/capital.js wreckOf) and solid to everything
  // a great ship down (gen/hulk.js). Its decks are still in it, at the angle it lies: a level copy of them stands in the collision world far overhead,
  // and you walk that while you're inside (tiltStep, below); render/capital.js draws them where they really are, dark
  const hulkOf = v0 => { let v = v0; if (!v.dug) v = { ...v, ...restPose(v.model, v.x, v.z, v.yaw, landY, ((Math.abs(v.x * 7 + v.z * 13) % 100) / 100)) };      // (one brought down before wrecks were laid with their dock at the ground)
    { const L0 = LAYOUTS[v.model + '_decks']; for (const B of bedsOf(v, L0?.D, L0?.W)) if (!(planet.beds ||= []).some(q => q.x === B.x && q.z === B.z)) { planet.beds.push(B); const r = B.r + B.e + (B.x2 !== undefined ? Math.hypot(B.x2 - B.x, B.z2 - B.z) : 0); battleY.drop(B.x, B.z, r); farY.drop(B.x, B.z, r); try { terrain?.refresh(B.x, B.z, r); } catch { } } }
    const H = { ...v, wreck: true, livery: 4, colour: 0, length: 3500, name: 'wreck', ship: { model: 'none', at: { c: [1e9, 0, 1e9], facing: 0 } } }, L = LAYOUTS[v.model + '_decks'], Dk = L && hulkDecks(H, L);
    if (Dk) { H.dk = Dk; H.deckModel = v.model + '_decks'; try { H.deckB = structureOf(homeS, { id: `ship:hulk:${Math.round(v.x)},${Math.round(v.z)}`, model: H.deckModel, at: Dk.at, field: true, fleet: true }, () => true, null); H.deckB.plan = { ...H.deckB.plan, slabs: [...H.deckB.plan.slabs, { k: 0, y: L.deck, rects: [[L.ramp.x0, -1.6, L.ramp.x1, L.ramp.z1 + 0.3]] }] }; world.addStructure(H.deckB, homeS); } catch (e) { console.warn('wreck decks', e); H.dk = null; } }
    return H; };
  let tiltIn = null;      // the wreck whose decks you're on
  const tiltEnter = () => { if (tiltIn || flight || ride) return; for (const H of hulks) { if (!H.dk || Math.abs(ctrl.pos[0] - H.x) > 4000 || Math.abs(ctrl.pos[2] - H.z) > 4000) continue; if (H.dk.inShip(H.dk.ship(ctrl.pos), -0.3)) { tiltIn = H; return; } } };
  const hulks = [...store.deltas].filter(([k]) => k.startsWith('hulk/')).map(([, v]) => hulkOf(v)).filter(H => H.t <= clock.now());      // (one still falling when the game was saved has landed by now, or lands when its time comes: below)
  const hulksPending = [...store.deltas].filter(([k]) => k.startsWith('hulk/')).map(([, v]) => v).filter(v => v.t > clock.now());
  world.hulks = hulks;
  const bigShips = () => { let L = fleet; if (strikeView) L = L.concat(strikeView.C); return hulks.length ? L.concat(hulks) : L; };
  // the burnt towns round you (for their smoke, and for who's not walking about in them any more), and the one burning now
  const burntAt = (x, z) => { for (const R of ruinsNear) if (Math.hypot(x - R.cx, z - R.cz) < R.R) return true; const S = planetWar.cur; return !!S && Math.hypot(x - S.cx, z - S.cz) < S.R && clock.now() - S.t0 >= burnAt(S, x, z); };
  // the town's built again, as ruins, once the beam's done with it (and everything in it that stood is gone)
  async function rebuildBurnt(S) {
    const q = townOfKey(planet, S.key); if (!q || q === homeS) return; world.forget(q);
    const sh = towns.shells.get(q.key); if (sh && !towns.full.has(q.key)) { towns.group.remove(sh.group); towns.shells.delete(q.key); }
    const T = towns.full.get(q.key); if (!T?.ready) return; const here = currentTown === T;
    towns.drop(T); { const sh2 = towns.shells.get(q.key); if (sh2) { towns.group.remove(sh2.group); towns.shells.delete(q.key); } }
    const N = await towns.build(q); if (here) enterTown(N);
  }
  // the dreadnought's decks go (it's leaving, or breaking up): what stood in its bay goes with it, and so does anyone still aboard
  function strikeDecksOff(why) {
    const V = strikeView; if (!V?.deck) return; const B = V.board, aboard = !flight && !ride && B.inside(ctrl.pos), id = V.C.ship.id;
    for (const sh of ships) { if (sh.id === id || !sh.at || sh.fleet || !B.inside(sh.at.c) || flight?.ship.id === sh.id) continue; const b = placed.get(sh.id); if (b) { world.removeStructure(b); placed.delete(sh.id); } if (issuedShip?.id === sh.id) { dropDelta(shipKey(sh.id)); issuedShip = null; } else store.patchDelta(shipKey(sh.id), { destroyed: true }); }
    V.C.ship = { model: 'none', at: { c: [1e9, 0, 1e9], facing: 0 } }; V.deck = false; V.board = null; boardingView.update(null);
    if (V.C.decks) { capitalView.group.remove(V.C.decks); V.C.decks = null; }
    { const b = placed.get(id); if (b) { world.removeStructure(b); placed.delete(id); } } syncShips();
    if (aboard && !dying) dieFlow(why === 'broke up' ? 'still aboard the dreadnought when it broke up' : 'carried off aboard the dreadnought', 'overkill');
  }
  // the fight aboard it (sim/boarding.js): its marines whether you come or not; you, if you're on its decks; the charge on its lance
  function boardTick(dt, now, V) {
    const B = V.board, aboard = aboardDread() && !dying, c = toRender(...V.C.ship.at.c), near = Math.hypot(camera.position.x - c[0], camera.position.y - c[1], camera.position.z - c[2]) < 1100;
    if (aboard || B.fuse != null) planetWar.hold(dt, now);
    if (aboard && !V.armed) { V.armed = true; if (!inventoryOf(player).some(q => q.id === 'carbine')) giveItem(player, 'carbine'); player.weapon = 'carbine'; kit(); store.touchPlayer(); if (run?.area === 'dread') run.boarded = true;
      ui.toast(`<b>You're aboard it.</b> Its lance stands in the drum between the hulls: across this hull, out along an arm. A charge on the lance's coolant junction brings the ship down.`, '', 12000); }
    B.step(dt, aboard ? { pos: ctrl.pos, alive: player.hp > 0, low: Math.max(crouchK, proneK * 1.6), moving: ctrl.speed > 2.5 } : null);
    boardingView.update(near ? B : null, dt, now);
    for (const S of B.shots) { if (S.n <= V.heardN) continue; V.heardN = S.n; if (!aboard) continue; sound.shot(S.from); if (!S.hit) { fx.sparks(S.to, 4, 3); if (Math.hypot(S.to[0] - ctrl.pos[0], S.to[2] - ctrl.pos[2]) < 3) { sound.crack(S.to); fx.shake = Math.max(fx.shake, 0.08); } } }
    for (const e of B.drain()) {
      if (e.type === 'alarm') { if (aboard) { ui.toast('<b>They know you\'re aboard.</b> The watch below is turning out.', 'bad', 7000); sound.siren(ctrl.pos); } }
      else if (e.type === 'hit') { if (aboard) hurtPlayer(e.dmg, 'a marine aboard the dreadnought', e.from); }
      else if (e.type === 'down') { chud.log('Marine down', 'you'); if (run?.area === 'dread') run.marines = (run.marines || 0) + 1; }
      else if (e.type === 'planted') { ui.toast(`<b>The charge is on the lance's coolant junction.</b> ${FUSE} seconds. Get back to the bay and out.`, 'bad', 10000); sound.blip(300); if (run?.area === 'dread') run.charge = true; }
      else if (e.type === 'fuse') { ui.toast(`<b>${e.left} seconds</b> on the charge.`, 'bad', 3500); sound.blip(e.left > 10 ? 500 : 900); }
      else if (e.type === 'blow') { const p = B.toWorld(...B.L.charge); fx.blast(p, 30); sound.boom(p, 80); V.mine++; V.charged = true; planetWar.cripple(now); }
    }
  }
  function plantCharge() { const B = strikeView?.board; if (!B || !aboardDread()) return false; return B.plant({ pos: ctrl.pos }); }
  function strikeTick(dt) {
    const now = clock.now(), me = flight ? flight.pos : ctrl.pos;
    planetWar.step(dt, now, me, !inSpace && !dying && !paused);
    if ((ruinsT -= dt) <= 0) { ruinsT = 5; ruinsNear = planetWar.h.townsNear(me[0], me[2], 4000).filter(q => q !== homeS && townBurnt(q)).map(q => ({ cx: q.cx, cz: q.cz, R: q.R, g: landY(q.cx, q.cz), key: q.key, t0: planetWar.razed(q).t0 })); }
    for (const e of planetWar.drain()) {
      const S = e.S, C0 = strikeView?.C || { x: S.cx, y: S.g, z: S.cz }, d = Math.round(Math.hypot(S.cx - me[0], S.cz - me[2])), where = d < S.R ? 'right over you' : `${d < 1000 ? d + ' m' : (d / 1000).toFixed(1) + ' km'} ${compass(Math.atan2(S.cx - me[0], S.cz - me[2]))}`;
      if (e.type === 'warn') ui.toast(`<b>A ${esc(S.by)} dreadnought</b> is coming down through the clouds over <b>${esc(S.name)}</b>, ${where}. The sirens are going.${d < S.R + 200 ? ' <b>Get out of the town.</b>' : ''} It can be killed: four heat vents glow along its flanks, and with all four shot out it comes down.`, 'bad', 14000);
      else if (e.type === 'fire') ui.toast(`It's burning <b>${esc(S.name)}</b>.`, 'bad', 6000);
      else if (e.type === 'down') { ui.toast(`<b>The dreadnought is coming down.</b>${S.saved ? ` ${esc(S.name)} is saved.` : ''}`, '', 12000); sound.boom([C0.x, C0.y, C0.z], 90);
        warMove(S.byId, 'dread', { down: true, saved: S.saved });
        if (run?.area === 'dread' && run.key === S.key) { run.down = true; run.saved = S.saved; run.mine = !!strikeView?.mine; }      // (told at the debrief)
        else if (strikeView?.mine) { addDeed(store.meta, { t: now, who: player.name, area: 'sky', what: `brought down a ${S.by} dreadnought over ${S.name}${S.saved ? ', and saved the town' : ''}`, renown: S.saved ? 500 : 300 }); store.dirty.meta = true; } }
      else if (e.type === 'crash') { const H = S.rest, hk = hulkOf({ ...H, t: now }); hulks.push(hk); { const i = hulksPending.findIndex(q => q.x === H.x && q.z === H.z); if (i >= 0) hulksPending.splice(i, 1); }
        const fx0 = Math.sin(H.yaw), fz0 = Math.cos(H.yaw); for (let k = -5; k <= 5; k++) { const x = H.x + fx0 * k * 300, z = H.z + fz0 * k * 300, p = [x, landY(x, z), z]; if (k % 2 === 0) groundBlast({ p, R: 46, by: 'the dreadnought' }); else { fx.blast(p, 40); fx.dustRing(p, 80); } }
        sound.boom([H.x, H.y, H.z], 160); fx.shake = Math.max(fx.shake, Math.min(1, 2500 / (Math.hypot(me[0] - H.x, me[2] - H.z) + 500)));
        if (!flight && hulkPush(hk, [ctrl.pos[0], ctrl.pos[1] + 1, ctrl.pos[2]], 3)) hurtPlayer(9999, 'a dreadnought coming down on you');
        if (run?.area === 'dread' && run.key === S.key) run.endAt = now + 7;
        ui.toast(`<b>It's down.</b> The wreck lies ${Math.hypot(H.x - me[0], H.z - me[2]) < 1000 ? 'right by you' : `${(Math.hypot(H.x - me[0], H.z - me[2]) / 1000).toFixed(1)} km ${compass(Math.atan2(H.x - me[0], H.z - me[2]))}`}.`, '', 10000); }
      else if (e.type === 'gone') { if (run?.area === 'dread' && run.key === S.key) run.endAt = now + 2; }
      else if (e.type === 'burnt') { warMove(S.byId, 'dread', { burnt: true }); if (run?.area === 'dread' && run.key === S.key) run.burnt = true; ui.toast(S.down != null ? `<b>${esc(S.name)}</b> is gone.` : `<b>${esc(S.name)}</b> is gone. The dreadnought hangs over what's left of it.`, 'bad', 9000); ruinsT = 0; rebuildBurnt(S).catch(err => console.error('ruins', err)); }
      else if (e.type === 'news') { warMove(S.byId, 'news', null, -2); ui.toast(`<b>News:</b> a ${esc(S.by)} dreadnought burned <b>${esc(S.name)}</b> to the ground, ${Math.round(e.d / 1000)} km ${compass(e.dir)}.`, 'warn', 9000); }
    }
    dreadTick(now); airTick(now); awayBattles(dt);
    // the burnt towns smoke for days (and burn for the first hours)
    if ((smokeK -= dt) <= 0) { smokeK = 0.2; const w = weatherAt(planet, now).wind;
      for (const R of ruinsNear) { const age = now - R.t0; if (age > planet.dayLength * 3) continue; for (let k = 0; k < 4; k++) { const a = hashStr(k * 31 + 7, R.key) / 4294967296 * 6.283, r = R.R * (0.2 + 0.6 * (hashStr(k * 17 + 3, R.key) / 4294967296)), x = R.cx + Math.cos(a) * r, z = R.cz + Math.sin(a) * r, y = landY(x, z);
        if (age < planet.dayLength / 6) { fx.flame([x, y + 2, z], 6, w); fx.burnLight?.([x, y + 2, z], 3, 1); } fx.smoke([x, y + 6, z], 14, w, 0.05, 0.5); } } }
    // the one going on: its ship, its sirens, its beam and what the beam does
    const S = planetWar.cur;
    for (let i = hulksPending.length - 1; i >= 0; i--) if (hulksPending[i].t <= now) hulks.push(hulkOf(hulksPending.splice(i, 1)[0]));
    if (!S) { if (strikeView) { strikeDecksOff('left'); const V = strikeView, gone = new Set([...V.vents, ...V.escort]); war.craft = war.craft.filter(c => !gone.has(c)); for (const m of V.ventMesh) scene.remove(m);
      capitalView.group.remove(V.C.mesh); V.C.mesh = null; scene.remove(V.beam); scene.remove(V.hit); strikeView = null; } return; }
    const tt = now - S.t0, P = shipAt(S, tt);
    if (!strikeView || strikeView.key !== S.key) {
      const C = { model: PW_MODEL, name: 'dreadnought', x: P.x, y: P.y, z: P.z, yaw: P.yaw, colour: 0, livery: 3, length: HULLS[PW_MODEL].length, span: HULLS[PW_MODEL].span, enemy: true, deckW: HULLS[PW_MODEL].decks[0], deckD: HULLS[PW_MODEL].decks[1], ship: { model: 'none', at: { c: [1e9, 0, 1e9], facing: 0 } } };
      const beam = new THREE.Group(), add = (r, col, op) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, 1, 20, 1, true).translate(0, -0.5, 0), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); m.frustumCulled = false; beam.add(m); return m; };
      add(8, 0xfff6e6, 0.95); add(20, 0xff9a48, 0.32); add(46, 0xff5010, 0.1);
      const core = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); core.frustumCulled = false; beam.add(core);
      // where it meets the ground: a white-hot boil of fire, and the glare off it
      const hit = new THREE.Group(); for (const [r, col, op] of [[18, 0xfff2d8, 0.95], [42, 0xffa040, 0.45], [90, 0xff5a10, 0.16]]) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, 6.2832, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); m.frustumCulled = false; hit.add(m); }
      hit.visible = false; scene.add(hit);
      beam.visible = false; scene.add(beam); strikeView = { key: S.key, C, beam, core, hit, bi: 0, list: null, vents: [], ventMesh: [], escort: [], hull: { side: 'raider', alive: true, f: { pos: [P.x, P.y, P.z], vel: [0, 0, 0] }, name: 'dreadnought' }, gunT: 0, boomT: 0, mine: 0, left: VENTS.length, deck: false, board: null, heardN: 0 };
      // its heat vents: what can be shot out of it (sim/aircombat.js spawnFixed). Each a port in the flank: a steel throat with the reactor's heat glowing down it
      for (const v of VENTS) { strikeView.vents.push(war.spawnFixed('heat vent', 'raider', shipPoint(P, v), VENT_R, VENT_HP));
        const g = new THREE.Group(), sg = Math.sign(v[0]); const throat = new THREE.Mesh(new THREE.CylinderGeometry(22, 26, 18, 20, 1, true).rotateZ(Math.PI / 2).translate(sg * 5, 0, 0), new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.5, metalness: 0.9, side: THREE.DoubleSide }));
        const heat = new THREE.Mesh(new THREE.CircleGeometry(21, 24).rotateY(sg * Math.PI / 2).translate(sg * 2, 0, 0), new THREE.MeshBasicMaterial({ color: 0xff7a22, side: THREE.DoubleSide, fog: false }));
        const glare = new THREE.Mesh(new THREE.SphereGeometry(40, 16, 10), new THREE.MeshBasicMaterial({ color: 0xff6a18, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        for (const m of [throat, heat, glare]) { m.frustumCulled = false; g.add(m); } g.userData = { heat, glare }; scene.add(g); strikeView.ventMesh.push(g); }
      // its escort; and the town's own fighters go up to meet it
      for (let k = 0; k < 3; k++) strikeView.escort.push(war.spawn(['needle', 'shade', 'needle'][k], 'raider', [P.x + (k - 1) * 300, P.y - 300, P.z + 200 * k], P.yaw, 150));
      for (let k = 0; k < 2; k++) strikeView.escort.push(war.spawn(['interceptor', 'striker'][k], 'security', [S.cx + 800 + k * 200, S.g + 500, S.cz - 600], S.bearing, 140));
      const q = townOfKey(planet, S.key);      // each building, and when the beam gets to it
      strikeView.list = q ? q.buildings.map(b => { const [x, z] = q.toWorld(b.O[0] + b.ex[0] * b.w / 2 + b.ez[0] * b.d / 2, b.O[1] + b.ex[1] * b.w / 2 + b.ez[1] * b.d / 2); return { x, z, y: (q.h ?? landY(x, z)) + (b.floors || 2) * 3.2, tb: burnAt(S, x, z) }; }).sort((a, b) => a.tb - b.tb) : [];
      while (strikeView.bi < strikeView.list.length && strikeView.list[strikeView.bi].tb < tt - 2) strikeView.bi++;      // (picked up halfway: what's burnt is burnt)
    }
    const V = strikeView, C = V.C; Object.assign(C, { x: P.x, y: P.y, z: P.z, yaw: P.yaw, pitch: P.pitch || 0, roll: P.roll || 0 });
    const isDown = S.down != null; V.hull.f.pos = [P.x, P.y, P.z];
    // its decks (tools/gen-harrow.mjs): a place to stand for as long as it hangs still; gone when it gets under way or breaks up
    { const want = !isDown && tt >= PW_ARRIVE + 1 && tt < PW_AWAY;
      if (want && !V.deck) { const c = Math.cos(P.yaw), s = Math.sin(P.yaw), [mx, my, mz] = HULLS[PW_MODEL].dock, DD = C.deckD, f = Math.atan2(-c, s), wx = P.x + mx * c + mz * s, wz = P.z - mx * s + mz * c;
        C.ship = { id: `ship:${homeS.key}:dread`, model: PW_MODEL + '_decks', name: `${S.by} dreadnought`, at: { c: [wx + Math.sin(f) * DD / 2, P.y + my, wz + Math.cos(f) * DD / 2], facing: f }, field: true, fleet: true, colour: 4, owner: 'enemy', ownerName: S.by };
        V.deck = true; V.board = new Boarding(LAYOUTS[C.ship.model], C.ship.at); syncShips(); }
      else if (!want && V.deck) strikeDecksOff(isDown ? 'broke up' : 'left'); }
    if (V.board) boardTick(dt, now, V);
    // the vents ride with it; one shot out burns; the last one gone, down it comes
    { let left = 0; V.vents.forEach((c, i) => { const p = shipPoint(P, VENTS[i]), g = V.ventMesh[i]; c.f.vel = [(p[0] - c.f.pos[0]) / Math.max(dt, 1e-3), (p[1] - c.f.pos[1]) / Math.max(dt, 1e-3), (p[2] - c.f.pos[2]) / Math.max(dt, 1e-3)]; c.f.pos = p;
        g.position.set(...toRender(...p)); g.rotation.set(P.pitch || 0, P.yaw, P.roll || 0, 'YXZ'); g.userData.heat.visible = g.userData.glare.visible = c.alive && !isDown; if (c.alive) { left++; g.userData.glare.scale.setScalar(0.9 + Math.sin(tt * 5 + i) * 0.12 + (1 - c.hp / c.maxHp) * 0.5); }
        else if (Math.random() < dt * 14) { fx.flame(p, 10); fx.smoke([p[0], p[1] + 6, p[2]], 20, [0, 0], 0.04, 0.6); } });
      if (left < V.left && !isDown) { V.left = left; const p = V.vents.find(c => !c.alive && !c.said); if (p) { p.said = true; const sh = fx.shake; fx.blast(p.f.pos, 40); fx.shake = sh; sound.boom(p.f.pos, 30); }
        if (left) ui.toast(`A heat vent's gone. <b>${left} left.</b>`, '', 5000); else planetWar.cripple(now); } }
    // its guns: at whatever of yours or the town's is in the air near it
    if (!isDown && (V.gunT -= dt) <= 0) { V.gunT = 0.16; let tg = null, bd = 2400;
      for (const c of war.craft) { if (!c.alive || c.fixed || c.side === 'raider') continue; if (c === myCraft && docking?.C === C && docking.s > docking.sMid) continue;      // (down the line of its own bay, close in: none of its guns bear there)
        const d = Math.hypot(c.f.pos[0] - P.x, c.f.pos[1] - P.y, c.f.pos[2] - P.z) - 900; if (d < bd) { bd = d; tg = c; } }
      if (tg) { let gun = null, gd = Infinity; for (const q of PW_GUNS) { const p = shipPoint(P, q), d = Math.hypot(p[0] - tg.f.pos[0], p[1] - tg.f.pos[1], p[2] - tg.f.pos[2]); if (d < gd) { gd = d; gun = p; } }
        if (gd < 2000) { const tof = gd / 950, a = [tg.f.pos[0] + tg.f.vel[0] * tof - gun[0] + (Math.random() - 0.5) * gd * 0.07, tg.f.pos[1] + tg.f.vel[1] * tof - gun[1] + (Math.random() - 0.5) * gd * 0.07, tg.f.pos[2] + tg.f.vel[2] * tof - gun[2] + (Math.random() - 0.5) * gd * 0.07], l = Math.hypot(...a) || 1;
          war.rounds.push({ p: gun, v: a.map(q => q / l * 950), life: 2.2, from: V.hull }); if (Math.random() < 0.2) sound.shot?.(gun, { energy: true, heavy: true }); } } }
    // coming down: it breaks up as it falls
    if (isDown && !S.crashed && (V.boomT -= dt) <= 0) { V.boomT = 0.22; const p = shipPoint(P, [(Math.random() - 0.5) * 800, (Math.random() - 0.5) * 300, -1700 + Math.random() * 3300]), sh = fx.shake; fx.blast(p, 34); fx.smoke(p, 40, [0, 0], 0.04, 0.7);
      fx.shake = Math.max(sh, Math.min(0.5, 400 / (Math.hypot(me[0] - p[0], me[1] - p[1], me[2] - p[2]) + 300))); if (Math.random() < 0.4) sound.boom(p, 40); }
    const dMe = Math.hypot(S.cx - me[0], S.cz - me[2]);
    if (tt < PW_FIRE && (sirenT -= dt) <= 0) { sirenT = 4; sound.siren([S.cx, S.g + 20, S.cz]); }
    // the keel lights as it charges, and burns while it fires
    const keel = shipPoint(P, PW_LANCE), charging = !isDown && tt > PW_FIRE - 9 && tt < PW_DONE, B = beamAt(S, tt);
    V.beam.visible = charging; if (charging) { const k = B ? 1 : (tt - (PW_FIRE - 9)) / 9, r = toRender(...keel); V.beam.position.set(...r); V.core.scale.setScalar(20 + 50 * k);
      fx.burnLight?.(keel, 4 * k, 0);
      for (const m of V.beam.children) if (m !== V.core) { if (!B) { m.scale.set(0.001, 0.001, 0.001); continue; } const gy = landY(B[0], B[1]), L = keel[1] - gy, dx = B[0] - keel[0], dz = B[1] - keel[2];
        m.scale.set(1 + Math.sin(tt * 37 + m.id) * 0.08, Math.hypot(L, dx, dz), 1); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(dx, -L, dz).normalize()); } }
    V.hit.visible = !!B; if (B) { const gy = landY(B[0], B[1]); V.hit.position.set(...toRender(B[0], gy, B[1])); V.hit.scale.setScalar(0.85 + Math.sin(tt * 23) * 0.12 + Math.random() * 0.1); }
    if (B) { const gy = landY(B[0], B[1]), p = [B[0], gy, B[1]], w = weatherAt(planet, now).wind;
      fx.flame([p[0], gy + 3, p[2]], 12, w); fx.flame([p[0], gy + 3, p[2]], 9, w); fx.smoke([p[0], gy + 8, p[2]], 22, w, 0.04, 0.6); fx.burnLight?.(p, 6, 1);
      if ((beamSnd -= dt) <= 0) { beamSnd = 1.1; sound.beam(p); }
      // you, under it: there's nothing left of anyone under it, and near it the heat takes the skin off you
      if (!flight) { const d = Math.hypot(ctrl.pos[0] - p[0], ctrl.pos[2] - p[2]); if (d < BEAM_R + 4) hurtPlayer(9999, "a dreadnought's beam", p); else if (d < 70) hurtPlayer(Math.ceil(dt * 90 * (1 - d / 70)), "the heat of a dreadnought's beam", p); }
      fx.shake = Math.max(fx.shake, Math.min(0.5, 120 / (Math.hypot(me[0] - p[0], me[2] - p[2]) + 60))); }
    // each building as the beam reaches it: it goes up
    let n = 0; while (V.bi < V.list.length && V.list[V.bi].tb <= (isDown ? Math.min(tt, S.down) : tt)) { const b = V.list[V.bi++]; if (n++ > 3) continue; const p = [b.x, b.y, b.z], sh = fx.shake; fx.blast(p, 26); fx.shake = Math.max(sh, Math.min(0.6, 90 / (Math.hypot(me[0] - p[0], me[2] - p[2]) + 40)));
      if (Math.random() < 0.5) sound.boom(p, 12); wrecks.blastAt(p, 24); }
  }
  const front = new FrontBattle({ planet, war, ground: landY, hooks: { blast: e => { infantry.blast(e.p, e.R); if (battleNear(e.p, 9000)) { groundBlast(e); sound.boom(e.p, e.R); } } } });      // (sim/front.js: where your nation is at war, the war is on near its border)
  const fleetWar = new FleetWar({ war, fleet, ground: groundY, hooks: { blast: groundBlast } }), fleetWarView = new FleetWarView(scene, shipView, fx, renderer);
  let myCraft = null, raid = null, firing = false;
  // ---- the areas (game/family.js): a run in one of them, told as a deed to the family when it ends
  // sky battles (game/sky.js): a sortie over the home town in an issued fighter, two wingmen with you, the raiders in waves
  let sortie = null, run = null, groundRun = null; const sortieHud = document.createElement('div'); sortieHud.className = 'sortie hidden'; document.getElementById('ui').append(sortieHud);
  const compass = b => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round((((-b + Math.PI * 2.5) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 4)) % 8];
  function skyBegin(Z = null) {      // Z: a zone of the war ({ T, name, enemyId, level }); none: over home
    if (flight) { leaveWar(); flight = null; }
    if (raid) { for (const c of raid.raiders.concat(raid.defenders)) war.craft = war.craft.filter(x => x !== c); raid = null; }
    const T = Z?.T || [homeS.cx, homeS.h, homeS.cz], over = Z?.name || homeS.name, b = Z?.bearing ?? Math.random() * Math.PI * 2, tier = tierOf(familyOf(store.meta, player.surname).renown);
    const model = ['interceptor', 'interceptor', 'striker', 'striker', 'warden', 'warden'][tier.i];      // (a better name gets a better fighter)
    const x = T[0] - Math.sin(b) * 2200, z = T[2] - Math.cos(b) * 2200, y = Math.max(world.groundAt(x, z, 1e5).h, planet.seaLevel, T[1]) + 1100;
    const sh = { id: 'issued:sky:' + Math.floor(clock.now()), model, name: `${player.given}'s ${model}`, colour: 4 };
    flight = new Flight(world, planet, sh, [x, y, z], b); flight.onGround = false; flight.vtol = false; flight.vel = [Math.sin(b) * 150, 0, Math.cos(b) * 150]; flight.throttle = 0.75; flight.issued = { x: T[0], z: T[2], sky: true };
    ctrl.mode = 'pilot'; ctrl.pos = [x, y + 2.4, z]; ctrl.vel = [0, 0, 0]; camDist = cam.dist; cam.dist = Math.max(22, flight.L.D * 1.6); cam.pitch = 0.25; cam.yaw = b; aimDir = null; aimSt = {}; joinWar();
    sortie = new SkySortie(war, { town: T, bearing: b, waves: wavesFor(Z?.level || 0, SKY_WAVES) }); sortie.begin(myCraft);
    run = { area: 'sky', t0: clock.now(), town: over, enemyId: Z?.enemyId ?? null, line: !!Z?.T };
    ui.toast(Z?.T ? `<b>Over ${esc(over)}.</b> Their fighters are coming in from the ${compass(b)}, and gunships for our positions. You and two wingmen: keep them off the line.` : `<b>Sky battle over ${esc(over)}.</b> Raiders are coming in from the ${compass(b)}. You and two wingmen are all that's up: keep them off the town.`, 'bad', 10000);
  }
  let sortieSaid = '';
  function skyTick(dt) {
    const S = sortie; if (!S) return;
    S.step(dt);
    for (const e of S.drain()) {
      if (e.type === 'wave') ui.toast(`<b>Wave ${e.k + 1} of ${e.of}</b>: ${e.n} raiders from the ${compass(e.from)}${e.gunships ? `, ${e.gunships === 1 ? 'a gunship' : e.gunships + ' gunships'} making for the town` : ''}.`, 'bad', 7000);
      else if (e.type === 'clear' && e.of > e.k) ui.toast(`<b>Wave cleared.</b> Missiles back, the hull patched. ${e.of - e.k} more to come.`, '', 6000);
      else if (e.type === 'strike') { fx.blast(e.at, 9); fx.dustRing(e.at, 14); sound.boom(e.at, 8); fx.shake = Math.max(fx.shake, 0.15);
        for (const b of nearBuildingsOf(e.at, 30)) if (!store.getDelta('scorch/' + b.key)) store.patchDelta('scorch/' + b.key, { t: clock.now() });      // (what they hit stays hit)
        if (!S.saidStrike || S.t - S.saidStrike > 25) { S.saidStrike = S.t; ui.toast(`A gunship is hitting <b>${esc(run?.town || homeS.name)}</b>.`, 'bad', 4000); } }
      else if (e.type === 'winglost') ui.toast('A wingman is down.', 'bad', 4000);
      else if (e.type === 'done' && e.won) S.endAt = S.t + 3;
    }
    if (S.endAt && S.t >= S.endAt) { sortieEnd('home'); return; }
    if (!flight && !dying) { sortieEnd(S.won ? 'home' : 'crashed'); return; }      // (flew it into something, or it came apart round you: player/flight.js, afterFlight)
    // the plate at the top: where the fight's got to
    const guns = S.cur.filter(c => c.alive && !c.gone && c.bomber).length;
    const head = S.phase === 'lull' ? `Next wave in ${Math.max(0, Math.ceil(S.next - S.t))} s` : S.phase === 'fight' ? `Wave ${S.k + 1} of ${S.waves.length} · ${S.left} left${guns ? ` · <span class="hot">${guns === 1 ? 'a gunship' : guns + ' gunships'} on the town</span>` : ''}` : S.won ? 'The town is safe' : '';
    sortieHud.classList.remove('low');
    const html = `<b>${head.replace('The town is safe', run?.line ? 'The sky is ours' : 'The town is safe').replace('on the town', run?.line ? 'on the line' : 'on the town')}</b><small>${S.kills} shot down${S.strikes ? ` · ${run?.line ? 'the line' : 'the town'} hit ${S.strikes} time${S.strikes === 1 ? '' : 's'}` : ''}</small>`;
    if (html !== sortieSaid) { sortieHud.innerHTML = html; sortieSaid = html; } sortieHud.classList.remove('hidden');
  }
  // the end of a run: told as a deed to the family; then what next
  async function runDone({ area, what, R, pay = 0, title, sub, again, onAgain, home }) {
    const t = clock.now(), fam = familyOf(store.meta, player.surname), D = addDeed(store.meta, { t, who: player.name, area, what, renown: R.total }); store.dirty.meta = true;
    if (pay) { player.credits = (player.credits ?? 0) + pay; store.touchPlayer(); }
    store.log({ t, type: 'deed', who: player.id, whoName: player.name, area, what, renown: R.total }); await save();
    if (dying) return;
    await threatPasses();
    const told = warSaid.join(' '); if (told) { warLast = told; warSaid = []; awayTally = {}; }
    let pick = null; await modal(async () => { pick = await ui.debrief({ title, sub: sub + (pay ? ` · ${pay} cr pay` : '') + (told ? ` · ${told.replace(/<[^>]+>/g, '')}` : ''), parts: R.parts, total: R.total, family: fam, before: D.before, after: D.after, alive: player.hp > 0, again }); });
    if (pick === 'again') { if (again === WAR_AGAIN) home?.(); onAgain(); }
    else if (pick === 'family') { running = false; location.reload(); }
    else if (home) home();
  }
  function sortieEnd(end) {
    const S = sortie; if (!S || S.ending) return; S.ending = true;
    const st = S.stats(end), R = skyRenown(st); S.end(); sortieHud.classList.add('hidden'); sortie = null; const r = run; run = null;
    if (r.enemyId != null) warMove(r.enemyId, 'sky', st);
    if (r.line) for (const q of R.parts) if (q[0] === 'the town kept safe') q[0] = 'the line kept from their gunships';
    const flying = flight?.issued?.sky; if (flying) { leaveWar(); flight = null; cam.dist = camDist; ctrl.mode = 'walk'; }      // (handed back)
    const of = st.waves, what = st.won ? `saw off all ${of} waves ${r.line ? '' : 'of raiders '}over ${r.town}${st.kills ? `, ${st.kills} shot down` : ''}` : `held off ${st.cleared} of ${of} waves over ${r.town}${st.kills ? `, ${st.kills} shot down` : ''}${end === 'ejected' ? ', then was shot down and bailed out' : end === 'crashed' ? ', then crashed' : ''}`;
    runDone({ area: 'sky', what, R, pay: st.kills * 150 + st.cleared * 100, title: st.won ? (r.line ? 'The sky is ours' : 'The town is safe') : end === 'ejected' ? 'Shot down' : end === 'crashed' ? 'Down in the wreck' : 'Sortie over', sub: `${player.name} · sky battle over ${r.town}`, again: WAR_AGAIN, onAgain: warTable,
      home: () => { if (!flying) return; const hq = homeTown.pop.buildingByKey.get(homeTown.polity.security), at = hq ? b2w(hq, hq.w / 2, 0, -2) : [homeS.cx, homeS.h, homeS.cz]; ctrl.pos = [at[0], homeS.h + 0.1, at[2]]; ctrl.vel = [0, 0, 0]; ui.toast('You hand the fighter back and a transport brings you home.', '', 6000); } });
    if (flying) { const hq = homeTown.pop.buildingByKey.get(homeTown.polity.security), at = hq ? b2w(hq, hq.w / 2, 0, -2) : [homeS.cx, homeS.h, homeS.cz]; ctrl.pos = [at[0], homeS.h + 0.1, at[2]]; ctrl.vel = [0, 0, 0]; }
  }
  // ground battles: onto the line of your nation's war on land (sim/infantry.js, sim/front.js); over when you leave it
  function groundBegin(F0 = null) {
    const nat = myNation(), F = F0 || nat && frontsOf(planet, nat).find(onLand);
    if (!F) { ui.toast(`<b>${esc(planet.name)}</b> has no war on land just now: nowhere to fight on foot. You're sent up instead.`, 'warn', 9000); skyBegin(); return; }
    if (player.soldier?.nation !== nat.id) player.soldier = { nation: nat.id, rank: 0, kills: 0, since: clock.now() }; store.touchPlayer(); deployFlow(true, 72, F);
    groundRun = { kills0: player.soldier.kills || 0, taken: 0, front: F.b.name, enemyId: F.b.id };
  }
  function groundEnd() {
    const G = groundRun; if (!G) return; groundRun = null; const st = { kills: (player.soldier?.kills || 0) - G.kills0, taken: G.taken, won: !!G.won, lost: !!G.lost }, R = groundRenown(st);
    if (st.won) { R.parts.push(['all three objectives ours', 120]); R.total += 120; }
    warMove(G.enemyId, 'ground', st); player.footDuty = null; store.touchPlayer();
    runDone({ area: 'ground', what: `${st.won ? 'took the whole line from' : st.lost ? 'was on the line when it broke, against' : 'fought on the line against'} ${G.front}${st.kills ? `: ${st.kills} of theirs put down` : ''}${st.taken ? `, ${st.taken} objective${st.taken === 1 ? '' : 's'} taken` : ''}`, R, title: st.won ? 'The line is ours' : st.lost ? 'The line is lost' : 'Off the line', sub: `${player.name} · the line against ${G.front}`, again: WAR_AGAIN, onAgain: warTable, home: goHome });
  }
  // ---- the battle on the line as a battle (sim/battleplan.js): each side's turn to attack, its guns first; your side's orders said as they're given
  let battle = null, battleSaid = '', battleN = 0, battleSyncT = 0;
  // the battle on front F as the save has it (game/campaign.js): null where it's not your nation's war. fresh: fought on by the clock up to now first
  function battleRec(F, fresh = false) {
    const nat = myNation(); if (!nat || F.a !== nat) return null; const now = clock.now(), R = frontOf(camp(), F.b.id, now);
    if (fresh || !R.battle) { const { results } = battleNow(R, now); for (const q of results) warTold(F.b, q, true); if (R.battle.t > now) R.battle.t = now; store.dirty.meta = true; }      // (you come up on it as it begins, if there was a lull)
    return R;
  }
  // you've come up on it: the men and the works stand as the battle has them, with what each side has left and the objectives whose they are
  function battleStart(F, unseen = false) {
    infantry.press = pressOf(warStage(store.meta.lineage, (clock.now() - EPOCH) / planet.dayLength)); infantry.setup(F); battleSaid = '';
    const R = battleRec(F), B = R?.battle; if (B && B.t > clock.now()) { battle = null; return; }      // (a lull: the lines are manned, nobody's attacking)
    if (B) infantry.obj.forEach((O, i) => { O.prog = B.obj[i]; O.owner = B.obj[i] > 0 ? 'ours' : B.obj[i] < 0 ? 'theirs' : null; });
    battle = new BattlePlan(infantry, { blast: shellBlast, reserve: B ? B.g : null, first: B?.turn || null }); battleN = B?.n || 0;
    if (B) { front.air = B.air; front.sky = B.sky; }
    // begun where you can't see it (the world's just loaded, or it's the next battle on a front you've left): it has been going a while by
    // the time you could get there — fought forward a minute or two now, not set out for you
    if (unseen) { const secs = 40 + Math.random() * 70; for (let k = 0; k < secs * 10 && !battle.over; k++) { battle.step(0.1); infantry.step(0.1, null); armor.step(0.1, null); } battle.drain(); infantry.drain(); armor.events && (armor.events.length = 0); airWarmLeft = 30 + Math.random() * 60; }
  }
  // the air over it likewise: flown forward (a few steps a frame, while you're nowhere near) so that what you fly into has been flying
  let airWarmLeft = 0, battleSeen = false;
  function airWarm(dt, near) { if (airWarmLeft <= 0) return; if (near || flight || sortie || raid || !front.F) { airWarmLeft = 0; return; } const nat = myNation();
    for (let k = 0; k < 8; k++) { front.step(1 / 30, nat, ctrl.pos); war.step(1 / 30, false); } airWarmLeft -= 8 / 30; }
  const UI_QUIET = new Proxy({}, { get: () => () => {} }), uiReal = ui, chudReal = chud, soundReal = sound, sortieHudOff = () => { if (!sortie) sortieHud.classList.add('hidden'); };
  const liveWar = !params.has('slot') || params.has('livewar');
  // what the fight's done to it goes into the save as it goes (the reserves are the battle's own: sim/battleplan.js counts them down there)
  function battleSync(leaving = false) {
    const F = infantry.F, R = F && battleRec(F), B = R?.battle; if (!B || !battle || B.n !== battleN) return;
    B.obj = infantry.obj.map(O => O.owner === 'ours' ? 1 : O.owner === 'theirs' ? -1 : 0); B.turn = battle.A; B.t = clock.now(); store.dirty.meta = true;
  }
  // how far you are from it: what's fought where you can't see or hear it is still fought, only not drawn, sounded or told
  const battleNear = (p, r) => Math.hypot((flight ? flight.pos[0] : ctrl.pos[0]) - p[0], (flight ? flight.pos[2] : ctrl.pos[2]) - p[2]) < r;
  function shellBlast({ p, R, by }) {
    if (!battleNear(p, 6000)) { infantry.blast(p, R); return; }
    fx.blast(p, R * 0.6); fx.dustRing(p, R * 1.2); sound.boom(p, R); infantry.blast(p, R);
    const d = Math.hypot(ctrl.pos[0] - p[0], ctrl.pos[1] - p[1], ctrl.pos[2] - p[2]); if (!flight && !tankV) { if (d < R * 1.6) hurtPlayer(Math.round(70 * (1 - d / (R * 1.6))), by === 'our guns' ? 'our own guns, falling short' : 'a shell'); if (d < R * 5) { infantry.felt(0.3); fx.shake = Math.max(fx.shake, 0.5 * (1 - d / (R * 5))); } }
    if (Math.random() < 0.2) groundBlast({ p, R: R * 0.9, by });      // (one in five leaves its hole in the ground for good)
  }
  function battleTick(dt, side, near = true) {
    const B = battle; B.step(dt); const ui = near ? uiReal : UI_QUIET, chud = near ? chudReal : UI_QUIET, sound = near ? soundReal : UI_QUIET; const them = infantry.F.b.name, mm = v => `${Math.floor(Math.max(0, v) / 60)}:${String(Math.floor(Math.max(0, v) % 60)).padStart(2, '0')}`;
    for (const e of B.drain()) {
      const us = e.A === 'ours', O = e.O?.name;
      if (e.type === 'prep') ui.toast(us ? `<b>Stand to.</b> Our guns are on <b>${O}</b>. Form up short of it: we go in when they lift.` : `<b>Incoming!</b> Their guns are on <b>${O}</b>. Get off it and get down: they'll come in behind the shells.`, us ? '' : 'bad', 9000);
      else if (e.type === 'assault') { sound.whistle(us ? ctrl.pos : e.O.pos); ui.toast(us ? `<b>Go! Go! Take ${O}.</b> Follow the armour in.` : `<b>Here they come.</b> Back onto <b>${O}</b> and hold it.`, 'bad', 8000); }
      else if (e.type === 'taken') ui.toast(us ? `<b>${O} is ours.</b> Dig in on it: they'll come back for it.` : `<b>${O} is lost.</b> Fall back to the wall. We take it back when our guns have had it.`, us ? '' : 'bad', 8000);
      else if (e.type === 'failed') ui.toast(us ? `<b>Fall back!</b> The attack on ${O} has failed. Back to the wall.` : `<b>They're falling back.</b> ${O} held.`, us ? 'bad' : '', 8000);
      else if (e.type === 'party' && e.side === 'ours' && side) chud.log(e.left > 0 ? `${e.n} more of ours come up: ${e.left} left in reserve` : `The last ${e.n} of our reserve come up`, e.left > 0 ? '' : 'bad');
      else if (e.type === 'party' && e.left <= 0) chud.log(`${them} is down to its last men`, 'you');
      else if (e.type === 'broken') { const won = e.winner === 'ours';
        ui.toast(won ? `<b>${esc(them)} has broken.</b> They're running. The line is ours.` : `<b>Our line has broken.</b> Everyone's running. Get out.`, won ? '' : 'bad', 12000);
        const R = battleRec(infantry.F); if (R) { battleSync(); warTold(infantry.F.b, battleDecide(R, e.winner, clock.now())); store.dirty.meta = true; }      // (the line moves; after a lull the next begins)
        if (groundRun && !groundRun.endAt) { groundRun[won ? 'won' : 'lost'] = true; groundRun.endAt = clock.now() + 9; }
        if (run?.area === 'air' && !run.endAt) { run.ground = e.winner; run.endAt = clock.now() + 9; } }
    }
    if ((battleSyncT -= dt) <= 0) { battleSyncT = 3; if (!B.over) battleSync(); }
    if (!near || !side && !flight) { sortieHudOff(); return; }
    const S = B.state, us = S.A === 'ours', O = S.O?.name || '';
    const head = S.over ? (S.over === 'ours' ? 'They\'ve broken' : 'Our line has broken') : S.phase === 'prep' ? (us ? `Our guns on ${O} · in ${mm(S.left)}` : `Their guns on ${O} · ${mm(S.left)}`) : S.phase === 'assault' ? (us ? `Take ${O} · ${mm(S.left)}` : `Hold ${O} · ${mm(S.left)}`) : S.phase === 'dig' ? (us ? `Dig in on ${O}` : `${O} lost`) : (us ? 'Fall back' : `${O} held`);
    const air = front.air ? `<small>In the air: ours ${front.up('ours') + (flight ? 1 : 0)} up, ${front.air.ours} in reserve · theirs ${front.up('theirs')} up, ${front.air.theirs} in reserve${front.sky ? ` · the sky is ${front.sky}` : ''}</small>` : '';
    const html = `<b>${us || S.over === 'ours' ? head : `<span class="hot">${head}</span>`}</b><small>${flight ? 'On the ground: ours' : 'Ours'} ${S.ours} on the line, ${S.res.ours} in reserve · ${esc(them)} ${S.theirs}, ${S.res.theirs} in reserve</small>${air}`;
    if (html !== battleSaid) { sortieHud.innerHTML = html; battleSaid = html; } sortieHud.classList.remove('hidden'); sortieHud.classList.add('low');
  }
  // ---- the war as a campaign (game/campaign.js): its zones, how you go into one, and what a fight there does to the front
  const WAR_AGAIN = 'Back to the war table';
  const warFrom = {}, awayToastT = {}; let awayTally = {}; let warSaid = [], warLast = '', threat = null, threatHold = 0;      // (threatHold: none offered before then — they don't come one on another's heels)
  const an = n => (/^[AEIOU]/i.test(n) ? 'An ' : 'A ') + n;
  const myNation = () => townSociety(planet, homeS)?.nation || null, camp = () => campaignOf(store.meta, String(planet.seed));
  const natById = id => nationsOf(planet).find(n => n.id === id) || null;
  const strikesFixed = params.has('strike') || params.has('slot');
  // the battles on the fronts you're not at go on by the clock (looked at twice a minute)
  let awayT = 20; function awayBattles(dt) { if ((awayT -= dt) > 0 || dying) return; awayT = 30; const nat = myNation(); if (!nat) return; const now = clock.now();
    for (const F of frontsOf(planet, nat)) { if (front.F && front.F.b === F.b) continue; const R = frontOf(camp(), F.b.id, now), { results } = battleNow(R, now); for (const q of results) warTold(F.b, q, true); if (results.length) store.dirty.meta = true; } }
  function warTune() { const nat = myNation(), Fs = nat ? frontsOf(planet, nat) : []; if (!Fs.length || strikesFixed) return; planetWar.every = strikeEvery(Math.min(...Fs.map(F => frontOf(camp(), F.b.id, clock.now()).hold))); }
  // what happened on the front against enemy `id`: the hold moves, and it's said (at the debrief, and on the table)
  function warMove(id, kind, st, flat = null) {
    const nat = myNation(), E = id != null && natById(id); if (!nat || !E || E === nat || !frontsOf(planet, nat).some(F => F.b === E)) return null;
    const now = clock.now(), F = frontOf(camp(), id, now), g = flat != null ? { total: flat, parts: [] } : gainOf(kind, st); if (!g.total) return null;
    const r = warApply(F, g.total, now); store.dirty.meta = true; return warTold(E, r);
  }
  // the line against E has moved (r: game/campaign.js apply's or decide's result): said, and what follows from it
  function warTold(E, r, away = false) {
    const id = E.id, now = clock.now(); warTune();
    if (r.winner && !away) warSaid.push(`The battle on the ${E.name} line is ${r.winner === 'ours' ? 'won' : 'lost'}.`);
    else if (r.winner) {      // decided while you were elsewhere: counted, and told as one line for the front however many there were
      const T = awayTally[id] ||= { won: 0, lost: 0 }; T[r.winner === 'ours' ? 'won' : 'lost']++; const n = T.won + T.lost, head = `While you were elsewhere, on the ${E.name} line:`;
      warSaid = warSaid.filter(q => !q.startsWith(head)); warSaid.push(`${head} ${n === 1 ? `the battle was ${T.won ? 'won' : 'lost'}` : `${n} battles decided, ${T.won} won and ${T.lost} lost`}.`);
      if (now - (awayToastT[id] || -1e9) > 120) { awayToastT[id] = now; ui.toast(`<b>News from the ${esc(E.name)} line:</b> the battle there is ${r.winner === 'ours' ? 'won' : 'lost'}.`, r.winner === 'ours' ? '' : 'warn', 9000); } }
    const pc = v => Math.round(v) + '%'; if (!warSaid.some(q => q.startsWith(`The line against ${E.name}:`))) warFrom[id] = r.before; warSaid = warSaid.filter(q => !q.startsWith(`The line against ${E.name}:`));
    warSaid.push(`The line against ${E.name}: ${pc(warFrom[id])} → ${pc(r.after)} ours.` + (r.turn === 'won' ? ` <b>${E.name} is thrown back over the border.</b> They'll come again, harder.` : r.turn === 'lost' ? ` <b>The line has broken.</b> Their dreadnoughts are coming through.` : ''));
    if (r.turn === 'won') { addDeed(store.meta, { t: now, who: player.name, area: 'war', what: `was on the line when ${E.name} was thrown back over the border`, renown: 400 }); ui.toast(`<b>${esc(E.name)} is thrown back over the border.</b> The whole line against them is ours. They'll come again, harder.`, '', 12000); }
    else if (r.turn === 'lost') { planetWar.next = Math.min(planetWar.next, 40); ui.toast(`<b>The line against ${esc(E.name)} has broken.</b> Their dreadnoughts are coming through.`, 'bad', 12000); }
    return r;
  }
  function goHome() {
    if (flight || Math.hypot(ctrl.pos[0] - homeS.cx, ctrl.pos[2] - homeS.cz) < 3000) return;
    const hq = homeTown.pop.buildingByKey.get(homeTown.polity.security), at = hq ? b2w(hq, hq.w / 2, 0, -2) : [homeS.cx, homeS.h, homeS.cz]; ctrl.mode = 'walk'; ctrl.pos = [at[0], homeS.h + 0.1, at[2]]; ctrl.vel = [0, 0, 0];
    ui.toast(`A transport brings you back to ${esc(homeS.name)}.`, '', 6000);
  }
  // a town of ours a dreadnought's making for (offered on the table; if you go elsewhere it may burn while you're gone)
  function threatNow() {
    const nat = myNation(); if (!nat) return null;
    const C = planetWar.cur; if (C && C.down == null && !C.far && natById(C.byId)) { const q = planetWar.h.townsNear(C.cx, C.cz, 200).find(t => t.key === C.key); if (q) return { town: q, enemy: natById(C.byId), live: true }; }
    if (hulks.length + hulksPending.length >= 6 || clock.now() < threatHold) return null;      // (the country round here is a graveyard of them already: they've stopped sending them this way)
    if (threat && !planetWar.razed(threat.town)) return threat;
    const c = planetWar.h.townsNear(homeS.cx, homeS.cz, 12000).filter(q => !planetWar.h.isHome(q) && !planetWar.razed(q) && planetWar.h.nationOf(q) === nat && planetWar.h.enemyOf(nat)).sort((a, b) => Math.hypot(a.cx - homeS.cx, a.cz - homeS.cz) - Math.hypot(b.cx - homeS.cx, b.cz - homeS.cz));
    if (!c.length || hashStr(Math.floor(clock.now() / 1200), 'threat:' + planet.seed) / 4294967296 > 0.7) return threat = null;
    return threat = { town: c[Math.floor(hashStr(Math.floor(clock.now() / 1200) + 9, 'threat:' + planet.seed) / 4294967296 * Math.min(3, c.length))], enemy: planetWar.h.enemyOf(nat), live: false };
  }
  // one you were told of and left: as often as not it's burnt by the time you're back
  async function threatPasses() {
    const T = threat; if (!T) return; threat = null; threatHold = clock.now() + 600; if (T.live || T.taken || Math.random() < 0.5 || planetWar.razed(T.town) || planetWar.cur) return;
    const q = T.town, S = { key: q.key, name: q.name, cx: q.cx, cz: q.cz, R: Math.max(120, (q.R || 300) * 1.05), g: q.h ?? landY(q.cx, q.cz), bearing: 0, a0: 0, t0: clock.now() - PW_GONE, by: T.enemy.name, byId: T.enemy.id, far: true };
    store.patchDelta('razed/' + q.key, S); warMove(T.enemy.id, 'dread', { burnt: true }); warSaid.push(`While you were away ${an(T.enemy.name).replace(/^A/, 'a')} dreadnought burned <b>${q.name}</b>.`); ruinsT = 0; rebuildBurnt(S).catch(err => console.error('ruins', err));
  }
  function warZones() {
    const nat = myNation(), now = clock.now(), zones = [], caps = []; if (!nat) return { zones, caps, nat };
    const T = threatNow();
    if (T) zones.push({ id: 'dread', kind: 'dread', T, hot: true, name: `Dreadnought over ${T.town.name}`, sub: T.live ? 'Under attack now' : `${T.enemy.name} · inbound`, x: T.town.cx, z: T.town.cz, hold: null,
      say: `${an(T.enemy.name)} dreadnought is ${T.live ? 'over' : 'making for'} ${T.town.name}, ${(Math.hypot(T.town.cx - homeS.cx, T.town.cz - homeS.cz) / 1000).toFixed(1)} km from home, to burn it to the ground. Shoot out the four heat vents along its flanks and it comes down. Do it before it fires and the town lives. Go elsewhere, and it may be gone when you're back.`,
      kinds: [{ key: 'air', ...GO_KINDS.air, say: 'Issued a fighter. The town\'s own two go up with you; it has an escort, and guns.', ok: true }, { key: 'foot', ...GO_KINDS.foot, ok: false, why: 'Nothing a rifle can do to it.' }] });
    for (const F of frontsOf(planet, nat)) { const St = frontOf(camp(), F.b.id, now), land = onLand(F), live = front.F && front.F.b === F.b; if (!live) { const { results } = battleNow(St, now); for (const q of results) warTold(F.b, q, true); } const Bt = St.battle; caps.push({ x: F.b.cx, z: F.b.cz, name: F.b.name });
      zones.push({ id: 'front:' + F.b.id, kind: 'front', F, name: `The line against ${F.b.name}`, sub: `${F.state === 'war' ? 'War' : 'Border war'} · ${Math.round(St.hold)}% ours · ${holdSay(St.hold)}`, x: F.x, z: F.z, cap: { x: F.b.cx, z: F.b.cz }, hold: St.hold, holdSay: holdSay(St.hold), level: St.level,
        say: `Where our land meets ${F.b.name}'s, ${Math.round(Math.hypot(F.x - homeS.cx, F.z - homeS.cz) / 1000)} km ${compass(Math.atan2(F.x - homeS.cx, F.z - homeS.cz))} of home. ${battleSay(Bt, now)}. It goes on whether you're there or not; each battle won or lost moves the line. Push it to the top and they're thrown back over the border.`,
        kinds: [{ key: 'air', ...GO_KINDS.air, say: 'Issued a fighter and sent up into the air battle over the line: their fighters, and their gunships working over our men.', ok: true }, { key: 'foot', ...GO_KINDS.foot, say: 'Set down behind the sandbags with a carbine and a squad: three objectives on the border to take and hold.', ok: land, why: 'The line here is over water: nothing to fight for on foot.' }] }); }
    store.dirty.meta = true;
    zones.push({ id: 'home', kind: 'home', name: `The skies over ${homeS.name}`, sub: 'Raiders', x: homeS.cx, z: homeS.cz, hold: null, say: `Raiders come for ${homeS.name} in waves, gunships among them. Nothing to do with the border: it's your own town, and it pays.`,
      kinds: [{ key: 'air', ...GO_KINDS.air, say: 'Issued a fighter, with two wingmen: five waves over the town.', ok: true }, { key: 'foot', ...GO_KINDS.foot, ok: false, why: 'They never land.' }] });
    return { zones, caps, nat };
  }
  // the table: choose a zone and how you go in, and you're there
  async function warTable() {
    if (sortie || groundRun || run || dying) return; const { zones, caps, nat } = warZones(); if (!nat) { ui.toast(`Nobody rules ${esc(homeS.name)}: there's no war to go to.`, 'warn'); return; }
    let pick = null; await modal(async () => { pick = await ui.warTable({ nation: nat.name, world: planet.name, zones, caps, home: { x: homeS.cx, z: homeS.cz, name: homeS.name }, last: warLast }); });
    if (!pick) { goHome(); return; }
    const Z = pick.zone; if (threat && Z.kind === 'dread') threat.taken = true;
    if (Z.kind === 'home') skyBegin();
    else if (Z.kind === 'dread') dreadBegin(Z.T);
    else if (pick.kind === 'foot') { if (player.footDuty) { player.footDuty = null; infantry.end(); } groundBegin(Z.F); }
    else airJoin(Z.F);
  }
  // a fighter issued for one job, in the air at (x, y, z) heading b
  function issueFighter(x, y, z, b, to) {
    if (flight) { leaveWar(); flight = null; }
    const tier = tierOf(familyOf(store.meta, player.surname).renown), model = ['interceptor', 'interceptor', 'striker', 'striker', 'warden', 'warden'][tier.i];
    if (issuedShip) { const b0 = placed.get(issuedShip.id); if (b0) { world.removeStructure(b0); placed.delete(issuedShip.id); } dropDelta(shipKey(issuedShip.id)); }
    const sh = issuedShip = { id: 'issued:sky:' + Math.floor(clock.now()), model, name: `${player.given}'s ${model}`, colour: 4, owner: 'you:' + player.id, ownerName: 'you', field: true };
    flight = new Flight(world, planet, sh, [x, y, z], b); flight.onGround = false; flight.vtol = false; flight.vel = [Math.sin(b) * 150, 0, Math.cos(b) * 150]; flight.throttle = 0.75; flight.issued = { x: to[0], z: to[1], sky: true };
    ctrl.mode = 'pilot'; ctrl.pos = [x, y + 2.4, z]; ctrl.vel = [0, 0, 0]; camDist = cam.dist; cam.dist = Math.max(22, flight.L.D * 1.6); cam.pitch = 0.25; cam.yaw = b; aimDir = null; aimSt = {}; joinWar();
  }
  // into the air battle over a front (sim/front.js): no waves laid on for you — what's up there is what the two sides have up, and you're one more of ours
  function airJoin(F) {
    const nat = myNation(); if (player.soldier?.nation !== nat.id) player.soldier = { nation: nat.id, rank: 0, kills: 0, since: clock.now() }; store.touchPlayer();
    const x = F.x - Math.sin(F.dir) * 5200, z = F.z - Math.cos(F.dir) * 5200; let top = planet.seaLevel; for (let k = 0; k <= 5200; k += 400) top = Math.max(top, landY(x + Math.sin(F.dir) * k, z + Math.cos(F.dir) * k));      // (above everything between you and the line)
    issueFighter(x, top + 800, z, F.dir, [F.x, F.z]);
    run = { area: 'air', t0: clock.now(), front: F.b.name, enemyId: F.b.id, x: F.x, z: F.z, kills: 0, guns: 0, strafed: 0, e: war.events.length };
    ui.toast(`<b>Over the ${esc(F.b.name)} line.</b> The battle's below you and the air battle's ahead. Their fighters, and their gunships going in on our men: every one you bring down is one they haven't got. Their men and armour on the ground are yours to strafe.`, 'bad', 12000);
  }
  function airTick(now) {
    const r = run; if (!r || r.area !== 'air' || r.ending) return;
    const E = war.events; for (let i = Math.min(r.e, E.length); i < E.length; i++) if (E[i].type === 'killed' && E[i].by === myCraft && E[i].craft.side === 'raider' && !E[i].craft.fixed) { r.kills++; if (E[i].craft.bomber) r.guns++; } r.e = E.length;
    if (r.endAt && now >= r.endAt) airEnd(flight ? 'home' : 'down'); else if (!flight && !dying) airEnd('crashed');
    else if (flight && Math.hypot(flight.pos[0] - r.x, flight.pos[2] - r.z) > 16000) airEnd('home');      // (flown clean away from it)
  }
  function airEnd(end) {
    const r = run; if (!r || r.area !== 'air' || r.ending) return; r.ending = true; run = null;
    const flying = flight?.issued?.sky; if (flying) { leaveWar(); flight = null; cam.dist = camDist; ctrl.mode = 'walk'; }
    const parts = []; if (r.kills - r.guns) parts.push([`${r.kills - r.guns} fighter${r.kills - r.guns === 1 ? '' : 's'} shot down`, (r.kills - r.guns) * 12]); if (r.guns) parts.push([`${r.guns} gunship${r.guns === 1 ? '' : 's'} brought down off our men`, r.guns * 30]); if (r.strafed) parts.push([`${r.strafed} of theirs hit on the ground`, r.strafed * 6]);
    if (r.sky === 'ours') parts.push(['the sky over the line won', 80]); if (r.ground === 'ours') parts.push(['the battle below won', 60]); if (r.kills >= 5) parts.push(['an ace in one sortie', 60]); if (end === 'home' && flying) parts.push(['brought the fighter home', 25]);
    const R = { parts, total: parts.reduce((n, p) => n + p[1], 0) }; warMove(r.enemyId, 'air', { kills: r.kills, strafed: r.strafed });
    if (flying) { const hq = homeTown.pop.buildingByKey.get(homeTown.polity.security), at = hq ? b2w(hq, hq.w / 2, 0, -2) : [homeS.cx, homeS.h, homeS.cz]; ctrl.pos = [at[0], homeS.h + 0.1, at[2]]; ctrl.vel = [0, 0, 0]; }
    runDone({ area: 'sky', what: `flew in the battle over the ${r.front} line${r.kills ? `: ${r.kills} shot down` : ''}${r.sky === 'ours' ? ', and the sky won' : r.sky === 'theirs' ? ', and the sky lost' : ''}${end === 'crashed' ? ', then went down' : ''}`, R, pay: r.kills * 150 + r.guns * 150 + r.strafed * 20,
      title: r.sky === 'ours' ? 'The sky is ours' : r.sky === 'theirs' ? 'The sky is lost' : r.ground === 'ours' ? 'The battle is won' : r.ground === 'theirs' ? 'The battle is lost' : end === 'crashed' ? 'Shot down' : 'Back from the line', sub: `${player.name} · the air over the ${r.front} line`, again: WAR_AGAIN, onAgain: warTable });
  }
  // against a dreadnought: up in a fighter a few kilometres off the town as it comes in
  function dreadBegin(T) {
    const q = T.town, S = planetWar.cur?.key === q.key ? planetWar.cur : planetWar.begin(q, clock.now(), T.enemy), b = S.bearing + Math.PI / 2;
    const x = q.cx - Math.sin(b) * 3200, z = q.cz - Math.cos(b) * 3200, y = Math.max(world.groundAt(x, z, 1e5).h, planet.seaLevel, S.g) + HANG * 0.8;
    issueFighter(x, y, z, b, [q.cx, q.cz]);
    run = { area: 'dread', t0: clock.now(), town: q.name, key: q.key, enemy: T.enemy.name, kills: 0, e: war.events.length };
  }
  function dreadTick(now) {
    const r = run; if (!r || r.area !== 'dread' || r.ending) return;
    const E = war.events; for (let i = r.e; i < E.length; i++) if (E[i].type === 'killed' && E[i].by === myCraft && E[i].craft.side === 'raider' && !E[i].craft.fixed) r.kills++; r.e = E.length;
    if (r.endAt && now >= r.endAt) dreadEnd(flight ? 'home' : 'down'); else if (!flight && !dying && !r.boarded) { if (aboardDread() || issuedShip && store.getDelta(shipKey(issuedShip.id))?.at) r.boarded = true; else dreadEnd('crashed'); }
  }
  function dreadEnd(end) {
    const r = run; if (!r || r.area !== 'dread' || r.ending) return; r.ending = true; run = null;
    const flying = flight?.issued?.sky; if (flying) { leaveWar(); flight = null; cam.dist = camDist; ctrl.mode = 'walk'; }
    if (issuedShip) { const b0 = placed.get(issuedShip.id); if (b0) { world.removeStructure(b0); placed.delete(issuedShip.id); } dropDelta(shipKey(issuedShip.id)); issuedShip = null; syncShips(); }
    const parts = []; if (r.down && r.mine) parts.push([r.charge ? 'a dreadnought brought down from inside, with a charge on its lance' : 'a dreadnought brought down', r.charge ? 450 : 300]); if (r.marines) parts.push([`${r.marines} of its marines put down`, r.marines * 15]); if (r.down && r.mine && r.saved) parts.push([`${r.town} saved`, 200]); if (r.kills) parts.push([`${r.kills} of its escort shot down`, r.kills * 12]); if (end === 'home' && flying) parts.push(['brought the fighter home', 25]);
    const R = { parts, total: parts.reduce((n, p) => n + p[1], 0) };
    const what = r.down ? `${r.mine ? 'brought down' : 'was up when the town\'s fighters brought down'} a ${r.enemy} dreadnought over ${r.town}${r.saved ? ', and saved the town' : ''}` : `went up against a ${r.enemy} dreadnought over ${r.town}${r.burnt ? ', and saw the town burn' : ''}${end === 'crashed' ? ', and was shot down' : ''}`;
    if (flying) { const hq = homeTown.pop.buildingByKey.get(homeTown.polity.security), at = hq ? b2w(hq, hq.w / 2, 0, -2) : [homeS.cx, homeS.h, homeS.cz]; ctrl.pos = [at[0], homeS.h + 0.1, at[2]]; ctrl.vel = [0, 0, 0]; }
    runDone({ area: 'sky', what, R, pay: (r.down && r.mine ? 1500 : 0) + r.kills * 150, title: r.down ? (r.saved ? `${r.town} is saved` : 'The dreadnought is down') : r.burnt ? `${r.town} is gone` : end === 'crashed' ? 'Shot down' : 'It got away', sub: `${player.name} · the dreadnought over ${r.town}`, again: WAR_AGAIN, onAgain: warTable });
  }
  function joinWar() { leaveWar(); myCraft = war.spawn(flight.ship.model, 'player', flight.pos, flight.facing, 0, 'player', flight); }
  function leaveWar() { if (myCraft) war.craft = war.craft.filter(c => c !== myCraft); myCraft = null; }
  if (bootJoin && flight) joinWar();
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
    window.__flightEnd = 'ejected'; leaveWar(); flight = null; cam.dist = camDist; ctrl.mode = 'walk';
    ctrl.pos = clearLanding(at[0] + 20, at[1], at[2] + 20); ctrl.vel = [0, 0, 0];
    player.fatigue = Math.min(1, player.fatigue + 0.35); store.touchPlayer(); syncShips();
    ui.toast(`The ${esc(sh.name)} is going down — you <b>eject</b> and come down on a parachute.`, 'bad', 9000);
  }
  // raids: every few hours raiders come in over the hills; security scrambles
  function raidTick(t, force = false) {
    if (sortie) return;      // (a sortie is its own raid: game/sky.js)
    const k = raidIndex(planet, t), R = raidAt(planet, s, k);
    if (!raid && (force || (t >= R.t && t < R.t + 200)) && !store.getDelta('raid/' + k)) {
      const dist = 7000, bx = Math.sin(R.bearing), bz = Math.cos(R.bearing), C = cityView.city;
      // where you are decides what they hit: the megacity (its sky lanes and tower tops), or the town
      const inCity = Math.hypot(ctrl.pos[0] - C.cx, ctrl.pos[2] - C.cz) < C.R + 2500;
      const tgt = inCity ? [ctrl.pos[0] * 0.6 + C.cx * 0.4, C.h + 260, ctrl.pos[2] * 0.6 + C.cz * 0.4] : [s.cx, s.h, s.cz], n = inCity ? R.n + 2 : R.n, nd = inCity ? R.defenders + 2 : R.defenders;
      raid = { k, t0: t, raiders: [], defenders: [], city: inCity, bearing: R.bearing, target: tgt };
      for (let i = 0; i < n; i++) raid.raiders.push(Object.assign(war.spawn(R.models[i % R.models.length], 'raider', [tgt[0] + bx * dist + (i - n / 2) * 140, Math.max(tgt[1], s.h) + 1300 + i * 90, tgt[2] + bz * dist + i * 60], R.bearing + Math.PI, 170), { groundTarget: tgt }));
      const hq = pop.buildingByKey.get(polity.security), at = inCity ? [tgt[0] - bx * 1500, C.h + 400, tgt[2] - bz * 1500] : hq ? b2w(hq, hq.w / 2, 0, hq.d / 2) : [s.cx, s.h, s.cz];
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
    const v = new THREE.Vector3(), placedMk = [];
    for (const c of war.craft) {
      if (!c.alive || c === myCraft) continue;
      const d = Math.hypot(c.f.pos[0] - ctrl.pos[0], c.f.pos[1] - ctrl.pos[1], c.f.pos[2] - ctrl.pos[2]); if (d > 9000) continue;
      v.set(...toRender(...c.f.pos)).project(camera); if (v.z > 1) continue;
      const el = document.createElement('div'), foe = c.side === 'raider', locked = myCraft?.lock === c;
      el.className = 'mk ' + (foe ? 'foe' : 'friend') + (locked ? (myCraft.lockT > 1.2 ? ' locked' : ' locking') : '');
      const sx = (v.x + 1) / 2 * innerWidth, sy = (1 - v.y) / 2 * innerHeight; el.style.left = sx + 'px'; el.style.top = sy + 'px';
      const near = placedMk.filter(q => Math.abs(q[0] - sx) < 140 && Math.abs(q[1] - sy) < 16).length; placedMk.push([sx, sy]); if (near) el.style.marginTop = (near * 15) + 'px';      // (two in close formation: their labels one under the other, not on top of each other)
      el.innerHTML = `<i></i><span>${c.fixed ? '' : (foe ? 'raider' : 'security') + ' · '}${c.name} · ${d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km'}${locked && myCraft.lockT > 1.2 ? ' · LOCK' : ''}</span>`;
      markers.append(el);
    }
  }
  async function showCharacter() {
    if (paused) return;
    paused = true; keys.clear(); document.exitPointerLock?.();
    await ui.character(player, homeTown.pop, planet, homeS, homeTown.polity);
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
      const r = await ui.work({ player, pop, planet, s, polity, t, listing, civic: here?.key === polity.security, register: store.events.filter(e => LIFE_EVENTS.includes(e.type) && (e.town ? e.town[0] === s.rx && e.town[1] === s.rz : s === homeS)), boardAt: sec ? `the ${polity.securityName} office, ${address(s, sec)}` : 'the civic office' });
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
      const a = await ui.menu({ war: dying ? null : sortie || groundRun || run ? 'Pull out: back to the war table' : 'The war table' });
      if (a === 'resume') break;
      if (a === 'war') { ui.closePanel(); ui.showHud(true); paused = false; if (sortie) sortieEnd('home'); else if (groundRun) groundEnd(); else if (run?.area === 'dread') dreadEnd(flight ? 'home' : 'down'); else if (run?.area === 'air') airEnd(flight ? 'home' : 'down'); else warTable(); return; }
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
  // Over one of the unfolded globe's cuts: you're on the next face now, whose map runs another way round. Where you are and how you're heading stay what they were.
  const crossCut = (x, z, [c, s_]) => {
    const spin = (a, b) => [c * a - s_ * b, s_ * a + c * b], delta = Math.atan2(s_, c);     // (a turn of the map, as a change in a heading measured the other way)
    if (flight) { flight.pos[0] = x; flight.pos[2] = z; const v = spin(flight.vel[0], flight.vel[2]); flight.vel[0] = v[0]; flight.vel[2] = v[1]; const q = [0, Math.sin(-delta / 2), 0, Math.cos(-delta / 2)], a = flight.q; flight.q = [q[3] * a[0] + q[1] * a[2], q[3] * a[1] + q[1] * a[3], q[3] * a[2] - q[1] * a[0], q[3] * a[3] - q[1] * a[1]]; flight.syncEuler(); ctrl.pos = [x, flight.pos[1] + 2.4, z]; }
    else if (ride) { ride.pos[0] = x; ride.pos[2] = z; ride.facing -= delta; ctrl.pos = [x, ctrl.pos[1], z]; }
    else { ctrl.pos = [x, ctrl.pos[1], z]; const v = spin(ctrl.vel[0], ctrl.vel[2]); ctrl.vel = [v[0], ctrl.vel[1], v[1]]; ctrl.facing -= delta; }
    cam.yaw -= delta;
  };
  // ---- the other towns: built as you come to them, and when you walk into one, it's the one that's here
  const enterTown = T => {
    T.pop ??= livePopulation(planet, T.s, store, clock.now()); T.polity ??= getPolity(planet, T.s); T.ctx ??= T === homeTown ? homeCtx : townContext(homeCtx, [T.s.rx, T.s.rz]);
    T.residents ??= new Residents(T.pop); T.ladders ??= laddersIn(planet, T.s);
    currentTown = T; ({ s, pop, polity, ctx, residents, town: town, doorView, doorIndex, propView, ladders } = T);
    world.gridAt(s.cx, s.cz);
    store.jobTown = T === homeTown ? null : [s.rx, s.rz];
    if (T !== homeTown) scheduleLife(store, planet, s, clock.now());     // (its people get on with their lives from now on, with you here or not)
    fleetTowns.add(s); vehicles = allVehicles(); syncShips();
    if (goods) { goods.s = s; goods.group.position.set(s.cx, 0, s.cz); goods.key = null; }
    agents = []; residents.refresh(clock.now(), ctrl.pos, null); doorView.refresh(store, planet, clock.now());
  };
  const homeTown = { s: homeS, ready: true, town, doorView, doorIndex, propView, pop, polity, ctx: homeCtx, residents, ladders };
  let currentTown = homeTown;
  sched.add(TIER.NEAR, { update: () => {
    const [x, , z] = ride ? ride.pos : ctrl.pos;
    { const moved = Math.hypot(x - geoAtX, z - geoAtZ); if (moved > 20000) { geoAtX = x; geoAtZ = z; const g = geoAt(planet, x, z); planet.hourShift = g.lon / (Math.PI * 2); planet.latHere = g.lat; planet.turnHere = g.turn; } }     // (it's the time of day it is where you are)
    if (inSpace) return;
    riverFeed.update(x, z); towns.update(x, z, currentTown); roadView.update(x, z);
    const q = settlementNear(planet, x, z);
    if (!q || q === s || pursuit || player.custody || Math.hypot(q.cx - x, q.cz - z) > q.R + 500) return;
    const T = q === homeS ? homeTown : towns.full.get(q.key);
    if (T?.ready) { enterTown(T); ui.toast(`<b>${esc(s.name)}</b> · ${pop.people.length} people`, '', 5000); }
  } });
  { const [x, , z] = ctrl.pos, q = settlementNear(planet, x, z);     // a game saved in another town starts there
    if (q && q !== homeS && Math.hypot(q.cx - x, q.cz - z) < q.R + 500) { ui.loading(`Building ${q.name}…`, 0.97); enterTown(await towns.ensure(q)); } }
  // ?fly (or ?fly=<model>): straight into the air at the helm of one of the town's ships, for the fun of it
  if (params.has('fly')) { const want = params.get('fly'), sh = ships.find(x => want && x.model === want) || ships.find(x => !x.patrol && !x.field && !x.flying) || ships[0];
    if (sh) { store.patchDelta(shipKey(sh.id), { owner: 'you:' + player.id, ownerName: 'you', forSale: false }); ships = allShips(clock.now()); { if (want && LAYOUTS[want]) { flyAs = { id: sh.id, model: want, paint: params.has('paint') ? +params.get('paint') : null }; ships = allShips(clock.now()); } takeOff(shipById(sh.id)); } flight.pos[1] = world.groundAt(flight.pos[0], flight.pos[2], 1e4).h + 1000; const sp = 90; flight.vel = [Math.sin(flight.facing) * sp, 0, Math.cos(flight.facing) * sp]; flight.throttle = 0.6; } }
  if (shot) applyShot(shot, { s, planet, ctrl, cam, town, doorView, store, sched, clock, world, pop });

  // ---- loop
  ui.closePanel(); ui.showHud(true);
  if (!fresh && !flight && !ride && ctrl.mode === 'walk') bootHold = { x: ctrl.pos[0], y: ctrl.pos[1], z: ctrl.pos[2], until: performance.now() + 12000 };
  const awayDue = !!(report && (report.elapsed > 60 || report.events.length)); if (awayDue) paused = true;      // (what happened while you were away is shown once the world's already drawing behind it: below)
  if (!fresh && store.meta.gen !== GEN_VERSION) ui.toast(`This save was made with world generator v${store.meta.gen}; this build is v${GEN_VERSION}. Changes you made may not line up with the regenerated world.`, 'warn', 12000);
  if (fresh?.heir) { const A = player.after || {}; ui.toast(`<b>${esc(A.name || 'They')}</b> was buried two days ago${A.place ? ` — they fell at ${esc(A.place)}` : ''}. ${player.heirOf ? `You are <b>${esc(player.name)}</b>, ${player.age}, of the same family. What they left is yours${player.weapon ? `, ${esc(ITEMS[player.weapon]?.name || 'their gun')} with it` : ''}.` : `You are <b>${esc(player.name)}</b>, ${player.age}, of ${esc(s.name)}: you knew of them. Nothing is yours but your own.`}`, '', 14000); }
  else if (fresh) {
    const par = player.family.parents.map(id => pop.byId.get(id));
    if (params.get('auto') !== 'arrive' && params.get('auto') !== 'line' && (!AREA || AREA === 'life')) ui.toast(`You are <b>${player.name}</b>, ${player.age}, born in ${s.name} on ${planet.name}. ${player.withParents ? 'You still live with' : 'You live alone; your'} ${par.length ? (player.withParents ? '' : 'parent' + (par.length > 1 ? 's' : '') + ' ') + par.map(x => x.given).join(' and ') : 'family'}${player.withParents ? '' : ' live across town'}. Your home is behind you.`, '', 11000);
  }
  let running = true, last = performance.now(), frames = 0, fpsT = last, fps = 0;
  near();
  // A frame that throws must not freeze the game on a blank picture: say what happened, and keep trying.
  let frameFails = 0; function safeFrame(now) { try { frame(now); frameFails = 0; } catch (e) { console.error(e); if (++frameFails === 5) ui.panel(`<h2>Something broke</h2><pre>${String(e.stack || e).slice(0, 700)}</pre><p>Your save is safe.</p><button onclick="location.reload()">Reload</button>`); if (frameFails < 300 && running) requestAnimationFrame(safeFrame); } }
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(safeFrame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = clock.now();
    if (!paused && !shot) {
      const input = {
        fwd: (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0),
        right: (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
        run: keys.has('ShiftLeft') || keys.has('ShiftRight'), jump: jumpQueued, jumpHeld: keys.has('Space'), slide: slideQueued, yaw: cam.yaw, tired: player.fatigue > 0.92, exhausted: player.fatigue > 0.985, drop: keys.has('KeyQ'),
      };
      jumpQueued = false; slideQueued = false;
      { const now = performance.now() / 1000, armed = heldRanged() && !flight && !ride && ctrl.mode === 'walk' && !tankV;
        if (armed && (trigger || wantShot)) attack();
        // the sight: right button held, the gun comes up and your eye goes to it (the view closes in over the shoulder, then you're
        // looking through it); the mouse moves you less the more it's zoomed; it wanders with your breathing, more moving or tired,
        // and holding your breath (Shift) steadies it for a few seconds, then you have to breathe
        aimK += (((armed || tankV) && aimHeld ? 1 : 0) - aimK) * Math.min(1, dt * 10); cam.aimK = tankV ? 0 : Math.min(1, aimK * 2);
        const sc = scoped(), Z = zoomNow(), fov = sc ? baseFov / Z : baseFov * (1 - 0.15 * Math.min(1, aimK * 2)); if (Math.abs(camera.fov - fov) > 0.02) { camera.fov = fov; camera.updateProjectionMatrix(); }
        cam.sens = sc ? Math.pow(1 / Z, 0.9) : 1;
        holding = sc && !tankV && input.run && breath > 0 && gasp <= 0; if (holding) { breath -= dt / 4.5; if (breath <= 0) { breath = 0; gasp = 2.2; } } else { breath = Math.min(1, breath + dt / 3.5); gasp = Math.max(0, gasp - dt); }
        if (sc) input.run = false;
        swayT += dt; { const A = sc && !tankV ? (0.0011 + (ctrl.speed > 0.6 ? 0.0045 : 0) + (player.fatigue || 0) * 0.002 + (now - hurtT < 1 ? 0.004 : 0)) * (holding ? 0.12 : gasp > 0 ? 2.4 : 1) : tankV && sc ? 0.0003 + Math.abs(tankV.speed) * 0.0006 : 0;
          sway = [(Math.sin(swayT * 1.3) + 0.6 * Math.sin(swayT * 0.37 + 1)) * A, (0.5 * Math.sin(swayT * 2.6) + 0.4 * Math.sin(swayT * 0.53)) * A + (holding ? 0 : Math.sin(swayT * 1.9) * A * 0.4)]; }
        // crouched: down behind whatever's in front of you; to fire, you come up just far enough to see over it
        if (ctrl.mode !== 'walk' || flight || ride || tankV) { crouched = false; proned = false; }
        if (proned && (input.fwd || input.right || input.jump)) { proned = false; crouched = true; }      // (moving off: up into a crouch)
        proneK += ((proned ? 1 : 0) - proneK) * Math.min(1, dt * 4); if (proneK > 0.05) { input.fwd = 0; input.right = 0; input.run = false; }
        { const fx = Math.sin(ctrl.facing), fz = Math.cos(ctrl.facing), wall = crouched && (aimHeld || trigger) && (world.solidAt(ctrl.pos[0] + fx * 0.9, ctrl.pos[1] + 0.7, ctrl.pos[2] + fz * 0.9, 0.1) || !!infantry.F && !!infantry.push(ctrl.pos[0] + fx * 0.9, ctrl.pos[2] + fz * 0.9, ctrl.pos[1], 0.9, 0.05));
          crouchK += ((crouched ? (wall ? 0.45 : 1) : 0) - crouchK) * Math.min(1, dt * 8); avatar.crouch?.(crouchK); input.crouch = crouched; if (crouched) input.run = false; }
        const W = WEAPONS[player.weapon]; bloom *= Math.exp(-dt * 3.5);
        if (recoilDebt > 0 && now - lastFired > Math.max(0.09, (W?.every || 0.1) * 1.2)) { const back = recoilDebt * Math.min(1, dt * 8); cam.pitch += back * 0.8; recoilDebt -= back; if (recoilDebt < 1e-4) recoilDebt = 0; }
        if (!armed) wantShot = false;
        input.aim = armed && aimHeld; input.face = armed && (aimHeld || trigger || wantShot || now - lastFired < 1.5) ? (window.__faceYaw ?? cam.yaw) : undefined;      // (kept up a moment after the last shot, then back down to your side)
        if (scrap && !armed && !input.face) input.face = Math.atan2(scrap.pos[0] - ctrl.pos[0], scrap.pos[2] - ctrl.pos[2]);      // (squared up to someone: you face them, and step round them)
        avatar.guard?.(!!scrap && !armed);      // (__faceYaw: photographs from the side)
        { const want = input.face != null ? 1 : crouched && armed ? 0.6 : 0; gunK += (want - gunK) * Math.min(1, dt * (want > gunK ? 9 : 4.5)); }      // (up to the shoulder in about a third of a second; down again slower)
        avatar.aimGun?.(gunK, input.face != null ? cam.pitch : 0.15);      // (crouched, the gun's held up ready, level, as riflemen hold it waiting)
        // the shield: down to nothing, it waits for a few quiet seconds, then comes back up
        if (fighting()) { if (now - hurtT > 4 && shield < SHIELD) { if (shield <= 0) sound.shieldUp(); shield = Math.min(SHIELD, shield + dt * 30); } } }
      if (flight) {
        // the stick: mouse moves it, it springs back to centre; arrow keys too (Up = nose down, like a stick)
        stick[0] *= Math.exp(-dt * 2.5); stick[1] *= Math.exp(-dt * 2.5);
        world.carBoxes = null;
        const kp = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0), kr = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
        if (docking) { stepDock(dt); ctrl.pos = [flight.pos[0], flight.pos[1] + 2.4, flight.pos[2]]; ctrl.facing = flight.facing; } else {
        // the instructor: flying (not hovering, not on the ground), the stick is put to bring the nose round onto where you're aiming
        let ip = 0, ir = 0, iy = 0; if (!aimDir || flight.onGround) aimDir = flight.fwd.slice();
        if (!flight.onGround && flight.airspeed > 35 && !kp && !kr) { const S = steerToward(flight, aimDir, true, aimSt, dt); ip = S.pitch; ir = S.roll; iy = S.yaw; }
        else if (!flight.onGround && !kp && !kr) { const want = Math.atan2(aimDir[0], aimDir[2]), e = Math.atan2(Math.sin(want - flight.facing), Math.cos(want - flight.facing)); iy = Math.max(-1, Math.min(1, e * 2)); }     // (slow, on the lift jets: it turns to face the way you're looking)
        if (kp || kr) aimDir = flight.fwd.slice();
        if (kp || kr || flight.onGround || flight.airspeed <= 35) aimSt = {};     // (the instructor picks up from however the ship is flying when it's next in charge)
        flight.step(dt, { throttle: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0), pitch: Math.max(-1, Math.min(1, stick[1] + kp + ip)), roll: Math.max(-1, Math.min(1, stick[0] + kr + ir)),
          yaw: Math.max(-1, Math.min(1, (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + iy)), up: keys.has('Space'), down: keys.has('KeyQ'), boost: input.run, brake: keys.has('KeyB'), wind: (w => { const k = 1 - bayShelter(fleet, ...flight.pos); return k >= 1 ? w : w && (Array.isArray(w) ? w.map(v => v * k) : typeof w === 'object' ? Object.fromEntries(Object.entries(w).map(([a, v]) => [a, typeof v === 'number' && a !== 'dir' && a !== 'heading' ? v * k : v])) : w * k); })(weatherAt(planet, t).wind) }); }
        ctrl.pos = [flight.pos[0], flight.pos[1] + 2.4, flight.pos[2]]; ctrl.facing = flight.facing; ctrl.speed = 0;
        afterFlight(dt, t);
        if (flight && myCraft && firing) war.fireGuns(myCraft, dt);
        // chase camera: behind and a little above, following the heading and part of the pitch
        if (flight && aimDir && !flight.onGround && flight.pos[1] - altRef < 30000) { const ay = Math.atan2(aimDir[0], aimDir[2]), ap = Math.asin(Math.max(-1, Math.min(1, aimDir[1]))); cam.yaw += Math.atan2(Math.sin(ay - cam.yaw), Math.cos(ay - cam.yaw)) * Math.min(1, dt * 10); cam.pitch += (0.1 - ap - cam.pitch) * Math.min(1, dt * 10); }     // (the view looks where you aim)
        else if (flight) { cam.yaw += Math.atan2(Math.sin(flight.facing - cam.yaw), Math.cos(flight.facing - cam.yaw)) * Math.min(1, dt * 6);
          cam.pitch += (0.18 + (0.4 * THREE.MathUtils.smoothstep(flight.pos[1], 30000, 900000) + 0.85 * THREE.MathUtils.smoothstep(flight.pos[1], 500000, 12000000)) - flight.pitch * 0.6 - cam.pitch) * Math.min(1, dt * 3); }     // (from orbit you want to be looking at the planet)
      } else if (ride) {
        world.carBoxes = null;
        rideBumps(t);
        for (let sub = 0, n = Math.ceil(dt / (1 / 120)); sub < n; sub++) ride.step(dt / n, { fwd: input.fwd, right: input.right, boost: input.run, up: keys.has('Space'), down: keys.has('KeyQ') });
        ctrl.pos = ride.pos.slice(); ctrl.facing = ride.facing; ctrl.speed = Math.abs(ride.speed);
        afterRide(dt);
        if (ride) cam.yaw += Math.atan2(Math.sin(ride.facing - cam.yaw), Math.cos(ride.facing - cam.yaw)) * Math.min(1, dt * (ride.speed > 2 ? 2.5 : 0));   // the camera swings in behind
      } else if (tankV) {
        // in your tank: you drive it, the turret follows where you look, the gun fires with the left button, the machine gun with Space
        world.carBoxes = null;
        armor.control(tankV, { fwd: input.fwd, right: input.right, aim: tankAim(), fire: trigger, mg: keys.has('Space') });
        ctrl.pos = [tankV.pos[0], tankV.pos[1] + 0.6, tankV.pos[2]]; ctrl.vel = [0, 0, 0]; ctrl.facing = tankV.facing; ctrl.speed = 0;
      } else {
        carsSolid();
        { const V = ctrl.where?.V; if (V && ctrl.grounded && (V.vx || V.vz)) { const [nx, nz] = world.resolve(ctrl.pos[0] + V.vx * dt, ctrl.pos[2] + V.vz * dt, ctrl.pos[1]); ctrl.pos = [nx, ctrl.pos[1], nz]; } }     // standing on something moving
        { const rb = ringHere(); ctrl.spin = rb ? spinOf(world, rb) : null; }
        if (bootHold) {      // just loaded: if the floor you were saved on isn't there yet (a deck, a ship, a town still building), you wait where you were for it
          const gap = bootHold.y - world.groundAt(bootHold.x, bootHold.z, bootHold.y + 0.3).h;
          if (gap > 1.5 && performance.now() < bootHold.until) { ctrl.pos = [bootHold.x, bootHold.y, bootHold.z]; ctrl.vel = [0, 0, 0]; }
          else { if (gap > 30) { const hb = homeS.buildings.find(b => b.key === player.home); if (hb) { ctrl.pos = doorstep(homeS, hb, buildingPlan(planet, homeS, hb)).pos.slice(); ctrl.vel = [0, 0, 0]; ui.toast("Where you were isn't there any more. You find your way home.", 'warn', 7000); } } bootHold = null; }
        }
        // aboard a wreck: the step's taken on the level copy of its decks and put back through the way the hull lies (gen/hulk.js hulkDecks); the slope pulls at you a little
        tiltEnter(); const TZ = tiltIn && ctrl.mode === 'walk' ? tiltIn.dk : null;
        if (TZ) { ctrl.pos = TZ.toLevel(ctrl.pos); ctrl.vel = TZ.vecTo(ctrl.vel); const dn = TZ.vecTo([0, -1, 0]); if (ctrl.grounded && ctrl.speed > 0.4) { ctrl.vel[0] += dn[0] * 2.2 * dt; ctrl.vel[2] += dn[2] * 2.2 * dt; } }
        if (!bootHold) for (let sub = 0, n = Math.ceil(dt / (1 / 120)); sub < n; sub++) ctrl.step(dt / n, input, moveSpeedFactor(player));
        if (TZ) { const out = !TZ.inside(ctrl.pos, 0.2); ctrl.pos = TZ.fromLevel(ctrl.pos); ctrl.vel = TZ.vecFrom(ctrl.vel); if (out) tiltIn = null; } else if (tiltIn) tiltIn = null;
        { const rb = ringHere(); if (rb) ctrl.pos = wrapRing(world, rb, ctrl.pos); }     // round the ring and back where you started
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
    // floating origin (high up, the height too: a graphics card can't hold a ship's shape 30,000 km from its zero)
    { const want = ctrl.pos[1] > 25000 ? Math.round(ctrl.pos[1]) : 0; if (want !== origin[1]) { origin[1] = want; root.position.y = -want; } }
    { const G = globeOf(planet), me = flight ? flight.pos : ride ? ride.pos : ctrl.pos, [cx, cz, turn] = canon(G, me[0], me[2]);
      if (turn) crossCut(cx, cz, turn); }
    if (Math.abs(ctrl.pos[0] - origin[0]) > 3000 || Math.abs(ctrl.pos[2] - origin[2]) > 3000) {
      origin[0] = Math.round(ctrl.pos[0]); origin[2] = Math.round(ctrl.pos[2]);
      root.position.set(-origin[0], -origin[1], -origin[2]);
    }
    const rp = toRender(...ctrl.pos);
    avatar.object.position.set(rp[0], rp[1] - (ctrl.grounded && !ctrl.where && ctrl.feel ? ctrl.feel.sink : 0), rp[2]);
    avatar.object.rotation.set(0, ctrl.facing, 0);
    if (ctrl.mode === 'seat') { // same placement as the crowd's sitters and sleepers (render/crowd.js)
      const fx = Math.sin(ctrl.facing), fz = Math.cos(ctrl.facing);
      if (ctrl.seat.pose === 'lie') avatar.object.position.set(rp[0] + fx * 0.87, rp[1] + 0.14, rp[2] + fz * 0.87);
      else avatar.object.position.set(rp[0] - fx * 0.12, rp[1], rp[2] - fz * 0.12);
    }
    const climbPose = ctrl.mode === 'ladder' ? { moving: ctrl.climbing, lean: 0 } : ctrl.mode === 'mantle' || ctrl.mode === 'vault' || ctrl.slide && !avatar.slide ? { moving: true, lean: 0.5 } : null;      // (over something: the body's put by the move, player/moves.js; up a steep slope you walk, slowly)
    if (ride) { // astride the saddle: the seat is ~0.45 m behind the bike's centre
      const fx = Math.sin(ride.facing), fz = Math.cos(ride.facing), back = ride.T.seat[0], rx = ride.T.kind === 'bike' ? 0 : -Math.cos(ride.facing) * ride.T.W * 0.22;   // (in a car: the driver's seat, a little to one side)
      avatar.object.position.set(rp[0] + fx * back + rx, rp[1] + ride.T.seat[1] - 0.5 + Math.sin(ride.pitch) * back, rp[2] + fz * back + (ride.T.kind === 'bike' ? 0 : Math.sin(ride.facing) * ride.T.W * 0.22));
      avatar.object.rotation.set(0, ride.facing, 0);
    }
    avatar.setHeld?.(player.weapon && inventoryOf(player).some(x => x.id === player.weapon) && !ride && !flight && ctrl.mode !== 'seat' ? player.weapon : null);
    { const v = ctrl.vel || [0, 0, 0], a = Math.atan2(v[0], v[2]) - ctrl.facing; avatar.moveDir?.(Math.atan2(Math.sin(a), Math.cos(a))); }
    if ((ctrl.stun || 0) > 0.3 && !(lastStun > 0) && avatar.knockedDown) avatar.knockedDown(ctrl.stun + 0.6); lastStun = ctrl.stun || 0;
    avatar.setProne?.(proneK > 0.5);
    avatar.update(dt, ride ? 0 : ctrl.speed, ctrl.grounded, ride || dying ? null : climbPose, ride ? 'sit' : ctrl.mode === 'seat' ? ctrl.seat.pose : ctrl.swimming ? 'swim' : ctrl.stun > 0 && ctrl.grounded && !avatar.knockedDown ? 'lie' : null);
    avatar.object.visible = !flight && !(ride && ride.T.kind !== 'bike');     // (inside a ship, car, van or truck you're out of sight; on a bike you sit on top of it)
    if (ctrl.mode === 'wall') avatar.climb(ctrl.wall.pose(), toRender);
    else if (ctrl.movePose && avatar.climb && !ride && !dying) avatar.climb(ctrl.movePose, toRender);
    else if (ctrl.slide && avatar.climb && !avatar.slide && !ride && !dying) avatar.climb(slidePose(ctrl.pos, ctrl.facing, ctrl.slide.t), toRender, { sling: false });
    avatar.slide?.(!!ctrl.slide && !ride && !dying && !flight);      // (the recorded slide, on the body that has the takes)
    if (!aloft) { pipes.update(world, ctrl.pos[0], ctrl.pos[1], ctrl.pos[2]); if (!params.has('noledges')) ledgeView.update(world, ctrl.pos[0], ctrl.pos[1], ctrl.pos[2]); }     // (from a ship well up, the things only seen from close by wait)
    // a hard landing: you feel it from about 4 m, and a long fall can put you down
    if (ctrl.jumped && !flight && !ride) avatar.jump?.(Math.hypot(ctrl.vel[0], ctrl.vel[2]));      // (the recorded jump: down, off, the legs drawn up)
    if (ctrl.landed > 2.5 && !flight && !ride && performance.now() > landSafeAt) avatar.land?.(ctrl.landed);      // (and down again: the recorded landing, harder the further you fell)
    if (ctrl.landed > 9 && performance.now() > landSafeAt) { const v = ctrl.landed; hurtPlayer(Math.min(120, (v - 8.5) ** 2 * 0.9), v > 22 ? 'a long fall' : 'a hard landing'); ctrl.stun = Math.max(ctrl.stun || 0, Math.min(2.2, (v - 8) * 0.12)); ctrl.landed = 0; }
    ctrl.frame();      // (what the steps since the last frame did, read: cleared for the next's)
    if (ctrl.slipped) { ctrl.slipped = false; ui.toast('Your grip goes.', 'bad', 3000); }
    voyageTick(t);
    capitalView.day.value = sky.state.day ?? 1; capitalView.update(bigShips(), toRender, camera.position, t);
    ringView.update(meridian, t, toRender, camera.position, sky.state.day ?? 1, !flight && ringHere()?.plan.ring.key || null);
    if (flight && !docking) { let P = fleetContact(strikeView ? fleet.concat(strikeView.C) : fleet, flight.pos[0], flight.pos[1], flight.pos[2], Math.max(2, flight.L.W * 0.35)); if (!P) for (const H of hulks) { P = hulkPush(H, flight.pos, Math.max(2, flight.L.W * 0.35)); if (P) break; } if (P) { flight.pos[0] += P[0]; flight.pos[1] += P[1]; flight.pos[2] += P[2]; const sp = flight.airspeed; if (sp > 6) { flight.impact = Math.max(flight.impact || 0, sp); flight.vel[0] *= 0.2; flight.vel[1] *= 0.2; flight.vel[2] *= 0.2; } } }
    shipView.viewer = toRender(...ctrl.pos);
    const vacOf = y => Math.min(1, Math.max(0, (y - 12000) / 28000)), heatOf = c => c ? Math.min(1, Math.max(0, (0.6 - c.hp / c.maxHp) / 0.45)) : 0;
    // the ship you're flying, wherever it came from (your own, or one issued for a sortie or a drop that isn't parked anywhere)
    const flown = sh => { const agl = flight.altitude(), dk = docking && (docking.settle || docking.s > docking.sIn - 40);
        return { id: sh.id, model: sh.model, c: toRender(...flight.pos), facing: flight.facing, pitch: flight.pitch, roll: flight.roll, colour: sh.colour, rampDown: false, msl: myCraft && myCraft.model === sh.model ? myCraft.missiles : null,
          gear: flight.onGround || dk || (agl < 45 && flight.airspeed < 40) || (flight.vtol && flight.hover > 0.25 && agl < 90) ? 1 : 0, thrust: flight.throttle * (keys.has('ShiftLeft') && flight.throttle > 0.95 ? 1.7 : 1), hover: flight.hover, heat: heatOf(myCraft), vac: vacOf(flight.pos[1]), ground: agl, landed: flight.onGround }; };
    const shipList = ships.filter(sh => !sh.fleet).map(sh => {
      if (flight && flight.ship.id === sh.id) return flown(sh);
      if (sh.flying) return null;
      if (sh.at?.c && Math.hypot(sh.at.c[0] - ctrl.pos[0], sh.at.c[2] - ctrl.pos[2]) > 2200 && !onRun(sh)) return null;     // parked, and too far to see
      if (onRun(sh)) {   // on a cargo run: drawn along its path, recomputed every frame so it moves smoothly
        const tr = tripOf(planet, sh, t, centreOf(shipTown(sh), sh), sh.skip);
        return tr.c ? { id: sh.id, model: sh.model, c: toRender(...tr.c), facing: tr.facing, pitch: tr.pitch, colour: sh.colour, rampDown: false, gear: tr.phase === 'away' ? 0 : 1, thrust: tr.phase === 'away' ? 0.8 : 0.2, hover: tr.phase === 'away' ? 0 : 0.7, ground: tr.phase === 'away' ? 99 : Math.max(0, tr.c[1] - surfaceHeight(planet, tr.c[0], tr.c[2])) } : null;
      }
      const { c, facing } = centreOf(shipTown(sh), sh);
      return Math.abs(c[0] - ctrl.pos[0]) < 3000 && Math.abs(c[2] - ctrl.pos[2]) < 3000 ? { id: sh.id, model: sh.model, c: toRender(...c), facing, colour: sh.colour, rampDown: rampDown(sh, planet, t, player) } : null;
    }).filter(Boolean).concat(flight && !ships.some(sh => sh.id === flight.ship.id && !sh.fleet) ? [flown(flight.ship)] : []).concat(airTraffic(planet, s, t, ctrl.pos[0], ctrl.pos[2]).map(a => ({ ...a, c: toRender(...a.c), gear: 0, thrust: 0.7, hover: 0 })))
      .concat(war.craft.filter(c => c !== myCraft && !c.fixed).map(c => ({ id: 'war' + c.id, model: c.model, c: toRender(c.f.pos[0], c.f.pos[1], c.f.pos[2]), facing: c.f.facing, pitch: c.f.pitch, roll: c.f.roll, colour: c.side === 'raider' ? 0 : 4, rampDown: false, msl: c.missiles, gear: 0, thrust: c.alive ? c.f.throttle : 0, hover: c.f.hover, heat: c.alive ? heatOf(c) : 1, vac: vacOf(c.f.pos[1]) })));
    shipView.update(shipList, dt); thrustView.update(shipList, dt, origin);
    const traffic = trafficNear(planet, s, t, ctrl.pos[0], ctrl.pos[2], 1400, cityTraffic.life.delayOf);
    stepCrashes(dt, t, wx0 => wx0, traffic); lastTraffic = traffic;
    vehView.update(traffic.filter(v => !trafficGone.has(v.id)).map(v => ({ ...v, pos: toRender(...v.pos) })).concat(vehicles.filter(v => !wrecks.get(v.id)?.hits?.length && !(wrecks.get(v.id)?.burnt > 0) && (!ride || v.id !== ride.v.id) && Math.abs(v.pos[0] - ctrl.pos[0]) < 400 && Math.abs(v.pos[2] - ctrl.pos[2]) < 400).map(v => ({ ...v, pos: toRender(...v.pos) }))
      .concat(ride && !(wrecks.get(ride.v.id)?.hits?.length) ? [{ type: ride.v.type, pos: toRender(...ride.pos), facing: ride.facing, pitch: ride.pitch, roll: ride.roll, colour: ride.v.colour }] : [])));
    avatar.setOpacity?.(Math.min(1, Math.max(0, (cam.cur - 0.6) / 0.9)));
    // aboard a wreck, in from its mouth: the sun's off you, and the lamp you carry lights you and what's close
    { const D = tiltIn?.dk, depth = D ? Math.max(0, Math.min(1, (D.ship(ctrl.pos)[0] * -1 + (D.place[0] - 6)) / 26)) : 0; avatar.setShade?.(1 - 0.93 * depth);
      headLamp.intensity = 7 * depth; if (depth > 0) headLamp.position.set(...toRender(ctrl.pos[0] - Math.sin(cam.yaw) * 1.4, ctrl.pos[1] + 2.1, ctrl.pos[2] - Math.cos(cam.yaw) * 1.4)); }
    // residents (ACTIVE tier): positions are a pure function of time
    agents = residents.agents(t, dt, ctrl.pos, world);
    for (const a of agents) {           // knocked down: on the ground, dazed, where they fell until they get up (and then they get up off it)
      const dn = isDown(store, a.id, t) && downAt.get(a.id);
      if (dn) { a.pos = dn.pos.slice(); a.facing = dn.facing; a.pose = 'lie'; a.moving = false; a.activity = 'hurt, on the ground'; a.clip = { id: 'dazed', t: t - (dn.t0 ??= t) }; }
      else if (downAt.has(a.id) && !isDown(store, a.id, t)) { const d = downAt.get(a.id); if (d.t0 != null) acting.set(a.id, { id: 'get_up', from: 1.6, rate: 1.3, t0: t, until: t + 5 / 1.3, pos: d.pos.slice(), facing: d.facing }); downAt.delete(a.id); }
    }
    actPeople(t, dt);
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
    agents = agents.filter(a => !bodies.some(b => b.id === a.id) && !mayhem?.holds(a.id)).concat(bodies.map(b => ({ id: b.id, person: b.person, age: b.person.age, pos: b.pos.slice(), facing: b.facing, pose: 'lie', moving: false, activity: 'dead', clip: { id: DEATHS[hashStr(1, String(b.id)) % 3], t: t - (diedAt.get(b.id) ?? diedAt.set(b.id, t).get(b.id)) } })));
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
    const riders = trafficNear(planet, s, t, ctrl.pos[0], ctrl.pos[2], 160, cityTraffic.life.delayOf).filter(v => !v.parked && !trafficGone.has(v.id)).map(v => {   // the riders of passing traffic (seated, a little behind the bike's centre); a car wrecked or taken has no one driving it on
      const fx = Math.sin(v.facing), fz = Math.cos(v.facing);
      const T = typeOf(v); return { id: v.id, age: 30, pose: 'sit', moving: false, facing: v.facing, pos: toRender(v.pos[0] + fx * T.seat[0], v.pos[1] + T.seat[1] - 0.5, v.pos[2] + fz * T.seat[0]) };
    });
    // and its driver got out: standing by what's left of it (unless there's nothing left of it, or them)
    for (const id of trafficGone) { if (!id.startsWith('tr:') || goneAtBoot.has(id)) continue; const seen = outSince.get(id) ?? outSince.set(id, t).get(id); if (t - seen > 300) continue; const D = wrecks.get(id);      // (a few minutes by it, then they've gone off to sort it out)
      if (!D?.pos || D.exploded || Math.abs(D.pos[0] - ctrl.pos[0]) > 160 || Math.abs(D.pos[2] - ctrl.pos[2]) > 160) continue;
      const f = D.facing ?? 0, W = (D.W || 1.8) / 2 + 0.9, x = D.pos[0] + Math.cos(f) * W, z = D.pos[2] - Math.sin(f) * W, y = world.groundAt(x, z, D.pos[1] + 1).h;
      riders.push({ id: id + ':driver', age: 30, pose: 'stand', moving: false, facing: Math.atan2(D.pos[0] - x, D.pos[2] - z), pos: toRender(x, y, z) }); }
    window.__riders = riders;
    // the people of the ring you're in, each standing up off its own bit of the curved floor
    const ringPeople = []; { const rb = !flight ? ringHere() : null;
      if (rb) { const g = rb.plan.ring, [, ps] = world.toB(rb, ctrl.pos[0], ctrl.pos[2]), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), V = new THREE.Vector3(), S = new THREE.Vector3();
        for (const f of ringFolk(g)) {
          const a = folkAt(g, f, t); let ds = (a.s - ps) % g.C; if (ds > g.C / 2) ds -= g.C; if (ds < -g.C / 2) ds += g.C; if (Math.abs(ds) > 170) continue;
          const w = b2w(rb, a.x, a.sit ? 0.45 : 0, ps + ds), r0 = toRender(...w), fa = a.sit ? toWorldDir(rb, Math.atan2(-[0, 1, 0, -1][a.face], -[-1, 0, 1, 0][a.face])) : toWorldDir(rb, a.dir > 0 ? 0 : Math.PI);
          bendAt(world, rb, meridian, t, w[0], w[1], w[2], toRender, M); V.set(...r0).applyMatrix4(M); M.decompose(S, Q, S); Q.multiply(new THREE.Quaternion().setFromAxisAngle(Y, fa));
          ringPeople.push({ id: f.id, pos: [V.x, V.y, V.z], facing: fa, q: Q.clone(), pose: a.sit ? 'sit' : 'stand', moving: a.moving, age: f.age });
          if (ringPeople.length >= 70) break;
        } } }
    window.__ringPeople = ringPeople;
    const walkers = (aloft ? [] : peopleNear(t, ctrl.pos[0], ctrl.pos[2], 90, Math.max(0, 90 - agents.length - riders.length))).filter(w => !mayhem?.out.has(w.id) && !burntAt(w.pos[0], w.pos[2]));
    window.__walkers = walkers; if (!aloft && !paused && !params.has('nojostle')) jostle.step(agents.filter(a => a.pose !== 'lie' && !fleeing.has(a.id)).concat(walkers.filter(w => !w.scared)), dt, world, flight || ride ? null : ctrl.pos);     // (everyone on foot has a body: sim/jostle.js)
    { const B = []; if (!flight && !ride) { const me = ctrl.pos, add = p => { if (Math.abs(p[0] - me[0]) < 4 && Math.abs(p[2] - me[2]) < 4) B.push(p); };     // (the people round you, for your own collision: player/collision.js)
      for (const a of agents) if (a.pose !== 'lie') add(a.pos); for (const w of walkers) add(w.pos); for (const w of mayhem ? mayhem.crowd() : []) if (w.pose !== 'lie') add(w.pos); for (const M of infantry.men || []) if (M.hp > 0) add(M.pos); }
      world.bodies = B; }
    crowd.update(ringPeople.concat(agents.filter(a => !burntAt(a.pos[0], a.pos[2])).map(a => ({ ...a, pos: toRender(...a.pos), uniform: !!(a.person.job && pop.jobById.get(a.person.job).security), crew: pop.gangOf?.(a.person.id)?.colour || null })).concat(riders, walkers.map(w => ({ ...w, pos: toRender(...w.pos) })), (mayhem ? mayhem.crowd() : []).map(w => ({ ...w, pos: toRender(...w.pos) })))), dt);
    const inUse = [...residents.doorsInUse(agents)].filter(k => { const [bk, id] = k.split('#'); return !store.getDelta(doorKey(bk, id))?.held; });
    if (warDoors.size) { const now = clock.now(); for (const [k, till] of warDoors) if (till < now) warDoors.delete(k); else inUse.push(k); }
    doorView.transient = new Set(inUse.map(k => doorIndex.get(k)).filter(i => i !== undefined));
    if (!shot && flight && cockpitView) { // the pilot's eye, looking out of the windscreen
      // the eye is fixed in the ship, turned with it: bank and the world tilts, the cockpit stays put round you
      const L = flight.L, a = flight.L.seats.find(x => x.kind === 'pilot'), Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-flight.pitch, flight.facing, flight.roll, 'YXZ'));
      const eye = new THREE.Vector3(a.x - L.W / 2, L.deck + 1.7, a.z - L.D / 2 - 0.45).applyQuaternion(Q), p0 = toRender(flight.pos[0] + eye.x, flight.pos[1] + eye.y, flight.pos[2] + eye.z);
      shipView.cock = { id: flight.ship.id, eye: [a.x, L.deck + 1.7, a.z - 0.45] };
      { const f = flight, al = f.altitude(), n = (v, w) => String(Math.max(0, Math.round(v))).padStart(w, '0');      // the console's figures: the same as the tape under the screen
        cockpitReadout([`ALT ${al > 99999 ? n(al / 1000, 4) + 'k' : n(al, 5)}`, `SPD ${n(f.airspeed * 3.6, 4)}`, `HDG ${n(((f.facing * 57.2958) % 360 + 360) % 360, 3)}`, `THR ${f.throttle < -0.01 ? 'R' + n(-f.throttle * 100, 2) : n(f.throttle * 100, 3)}`, `LIFT ${n(f.hover * 100, 3)}`]); }      // (render/ships.js: the hull cut away ahead of you, a windscreen in its place)
      camera.position.set(...p0); camera.quaternion.copy(Q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.08)); camera.updateMatrixWorld();
    } else if (!shot) {
      shipView.cock = null;
      // driving, the camera rides on its own softer springs: you see the car move over a bump, not the whole world
      if (ride) { const gap = ctrl.pos[1] - (rideCamY ?? ctrl.pos[1]); rideCamY = Math.abs(gap) > 4 ? ctrl.pos[1] : (rideCamY ?? ctrl.pos[1]) + gap * Math.min(1, dt * 7); cam.update(dt, [ctrl.pos[0], rideCamY, ctrl.pos[2]], toRender); }
      else { rideCamY = null;
        if (tankV) { const d0 = cam.dist; cam.dist = 11; cam.update(dt, [tankV.pos[0], tankV.pos[1] + 1.3, tankV.pos[2]], toRender); cam.dist = d0; }
        else cam.map = tiltIn ? tiltIn.dk.toLevel : null, cam.update(dt, crouchK > 0.01 || proneK > 0.01 ? [ctrl.pos[0], ctrl.pos[1] - 0.5 * crouchK - 1.15 * proneK, ctrl.pos[2]] : ctrl.pos, toRender);
        // through the sight: the eye at it, looking where you aim (and where its wander takes it)
        if (scoped()) { const y = cam.yaw + sway[0], pt = cam.pitch + sway[1], d = [Math.sin(y) * Math.cos(pt), -Math.sin(pt), Math.cos(y) * Math.cos(pt)];
          let e; if (tankV) { const V = tankV, b = armor.pivot(V), fx = Math.sin(V.turret), fz = Math.cos(V.turret); e = [b[0] + fx * 2.2, b[1] + 0.5, b[2] + fz * 2.2]; }
          else e = [ctrl.pos[0] + Math.sin(y) * 0.12, ctrl.pos[1] + (ctrl.grounded && ctrl.feel ? 1.6 - (ctrl.feel.sink || 0) : 1.6) - 0.52 * crouchK - 1.3 * proneK, ctrl.pos[2] + Math.cos(y) * 0.12];
          const a = toRender(...e), b2 = toRender(e[0] + d[0], e[1] + d[1], e[2] + d[2]); camera.position.set(...a); camera.lookAt(...b2); camera.updateMatrixWorld(); }
      }
    }
    { const rb = !flight && !ride ? ringHere() : null;      // in a ring: you, and the eye on you, are where that bit of floor really is, turning with it
      if (rb) {
        bendAt(world, rb, meridian, t, ctrl.pos[0], ctrl.pos[1], ctrl.pos[2], toRender, ringBend);
        camera.updateMatrixWorld(); _rm.multiplyMatrices(ringBend, camera.matrixWorld).decompose(camera.position, camera.quaternion, _rs); camera.updateMatrixWorld();
        avatar.object.updateMatrix(); _rm.multiplyMatrices(ringBend, avatar.object.matrix).decompose(avatar.object.position, avatar.object.quaternion, avatar.object.scale);
      } }
    { const hide = !!tankV || scoped(); if (hide && avatar.object.visible) { avatar.object.visible = false; hidAvatar = true; } else if (!hide && hidAvatar) { avatar.object.visible = true; hidAvatar = false; } }      // (in the tank, or your eye at the sight: you're not in your own view)
    war.step(dt, !!myCraft); combatView.update(war, toRender); drawMarkers();
    strikeTick(dt);
    { const nat = townSociety(planet, s)?.nation; front.step(dt, player.soldier ? nationsOf(planet)[player.soldier.nation] || nat : nat, flight ? flight.pos : ctrl.pos);
      for (const e of front.drain()) {
        if (e.type === 'front') { const R = battleRec(e.F, true); if (R) { front.air = R.battle.air; front.sky = R.battle.sky; } if (liveWar) front.pin = e.F;
          if (battleNear([e.F.x, 0, e.F.z], 9500)) ui.toast(`<b>The front.</b> ${esc(e.F.a.name)} and ${esc(e.F.b.name)} are at ${e.F.state === 'war' ? 'war' : 'it along the border'} here.${R ? ' ' + esc(battleSay(R.battle, clock.now())) + '.' : ''}`, 'bad', 9000); }
        else if (e.type === 'sky') { const R = front.F && battleRec(front.F), won = e.winner === 'ours'; if (R) { R.battle.sky = e.winner; warMove(front.F.b.id, 'sky', null, won ? 3 : -3); }
          if (battleNear([front.F.x, 0, front.F.z], 9500)) ui.toast(won ? `<b>The sky over the line is ours.</b> ${esc(front.F.b.name)} has nothing left to put up: our gunships have their men to themselves.` : `<b>We've lost the sky.</b> Nothing of ours is left to go up: their gunships are coming for our men.`, won ? '' : 'bad', 10000);
          if (run?.area === 'air' && !run.endAt) { run.sky = e.winner; run.endAt = clock.now() + 7; } }
        else if (e.type === 'gunship' && (infantry.F || run?.area === 'air')) chud.log(e.side === 'ours' ? 'One of our gunships is going in on their line' : 'Enemy gunship coming in on our line', e.side === 'ours' ? '' : 'bad');
      }
      // rounds from the air into the ground where the men are (sim/aircombat.js ground): the battle below takes them
      if (war.ground.length) { for (const g of war.ground) if (infantry.F && Math.hypot(g.p[0] - infantry.F.x, g.p[2] - infantry.F.z) < 600) { const mine = g.by === myCraft, n = infantry.strafe(g.p, 4.5, g.by.side === 'raider' ? 'theirs' : 'ours', mine); fx.dust?.(g.p, 6, [0.4, 0.36, 0.3]); if (mine && n && run?.area === 'air') run.strafed += n; } war.ground.length = 0; }
      const fresh = war.events.slice(war._k || 0); war._k = war.events.length; if (war.events.length > 1500) { war.events.splice(0, 1000); war._k -= 1000; }      // (the air war's event list was never emptied: read it from where we left off, and keep it short)
      // hits are done to the metal where they struck (render/damage.js); yours show at the sight, theirs on the edge of your view
      for (const e of fresh) {
        if (e.type === 'killed' && e.by === myCraft) { hud.hitMark(true); if (e.craft.fixed && strikeView) strikeView.mine++; }
        if (e.type !== 'hit') continue;
        const mine = e.craft === myCraft, id = mine ? flight?.ship.id : 'war' + e.craft.id, col = LIVERY[mine ? ((flight?.ship.colour | 0) % LIVERY.length + LIVERY.length) % LIVERY.length : e.craft.side === 'raider' ? 0 : 4];
        if (id && !e.craft.fixed) shipDamage.hit(id, e.craft.model, new THREE.Color(col[0], col[1], col[2]), toRender(...e.at), e.dir, e.dmg);
        if (e.by === myCraft) hud.hitMark();
        if (mine) { const v = new THREE.Vector3(...toRender(...e.at)).project(camera); hud.hurt(Math.atan2(-v.y * (v.z > 1 ? -1 : 1), v.x * (v.z > 1 ? -1 : 1))); fx.shake = Math.max(fx.shake, Math.min(0.6, e.dmg / 60)); }
      }
      // smoke from what's been hurt: a damaged craft trails it, worse the worse it is; torn-off pieces smoke as they fall
      for (const c of war.craft) { if (!c.alive || c.hp > c.maxHp * 0.6) continue; if (Math.random() < dt * (c.hp < c.maxHp * 0.3 ? 9 : 4)) war.booms.push({ p: c.f.pos.slice(), t: 0, smoke: true, s: c.hp < c.maxHp * 0.3 ? 0.45 : 0.28 }); }
      shipDamage.update(dt, p => war.booms.push({ p: fromRender(...p), t: 0, smoke: true, s: 0.3 }), (x, z) => { const q = fromRender(x, 0, z); return world.groundAt(q[0], q[2], 1e5).h - origin[1]; });
      if (flight?.issued && !flight.issued.sky) { for (const e of fresh) if (e.type === 'killed' && e.by === myCraft && e.craft.side === 'raider') soldierKill();
        if (flight.onGround || !front.F && Math.hypot(flight.pos[0] - flight.issued.x, flight.pos[2] - flight.issued.z) > 20000) endDeployment(); } }
    { const F = front.F, d = F ? Math.hypot(ctrl.pos[0] - F.x, ctrl.pos[2] - F.z) : 1e9, onFoot = !flight && !ride, reach = flight ? 5200 : 2600;      // (from the air the battle below is going on too, and seen from further off)
      // the battle for this front goes on wherever you are (liveWar): begun when the front's first there, never stopped for your being away;
      // what you're near enough to see is drawn, sounded and told, the rest is only fought. (Without liveWar, as it was: only while you're by it.)
      const near = !!F && d < reach + (infantry.F === F && battleSeen ? 900 : 0); battleSeen = near;
      if (F && !cloudW && (liveWar || near && !ride) && landY(F.x, F.z) > planet.seaLevel + 1) { if (infantry.F !== F) { battleSync(true); battleStart(F, !near); } }
      else if (infantry.F && (!F || !liveWar && (!near || ride))) { battleSync(true); infantry.end(); battle = null; sortieHud.classList.add('hidden'); }
      if (!near) sortieHudOff();
      airWarm(dt, near);
      if (player.footDuty && (!F || d > 4500)) { player.footDuty = null; store.touchPlayer(); if (groundRun) groundEnd(); else ui.toast('You\'re off the line. Report to the security chief to go back.', '', 6000); }
      const side = infantry.F && near && onFoot && player.soldier && nationsOf(planet)[player.soldier.nation] === infantry.F.a ? 'ours' : null;
      const you = { pos: ctrl.pos, side, alive: player.hp > 0, tank: tankV, low: Math.max(crouchK, proneK * 1.6) };
      gunTick();
      if (battle && infantry.F) battleTick(dt, side, near); else battle = null;
      if (infantry.F && (!battle || battle.over) && !groundRun?.endAt) { const R = battleRec(infantry.F); if (R && clock.now() >= R.battle.t && R.battle.n !== battleN) { battleStart(infantry.F); if (near) ui.toast(`<b>They're coming again.</b> A new battle for the ${esc(infantry.F.b.name)} line.`, 'bad', 8000); } }      // (the lull's over: the next battle for the same ground begins)
      infantry.step(dt, near ? you : null); armor.step(dt, near ? you : null);
      if (infantryView.group.visible !== near) { infantryView.group.visible = near; if (infantryView.line) infantryView.line.visible = near; if (armorView.group) armorView.group.visible = near; }
      if (near) { if (infantryView.line) infantryView.line.visible = true; infantryView.update(infantry, dt, t); armorView.hide = tankV && scoped() ? tankV.id : null; armorView.update(armor, dt, ctrl.pos); }
      if (tankV && (tankV.dead || !infantry.F)) { const V = tankV; leaveTank(); if (V.dead) { hurtPlayer(35, 'your tank brewing up'); chud.log(`Your ${V.T.name} is knocked out: you bail out`, 'bad'); } }
      if (infantry.F && near) armorFx(dt);
      if (infantry.F && Math.random() < dt * 14) for (const P of infantry.props) if (P.kind === 'fire' && Math.hypot(P.pos[0] - ctrl.pos[0], P.pos[2] - ctrl.pos[2]) < 900) { fx.flame(P.pos, P.size); if (Math.random() < 0.5) fx.smoke([P.pos[0], P.pos[1] + P.size, P.pos[2]], P.size * 3, [2, 1], 0.05, 0.45); }
      if (groundRun?.endAt && clock.now() >= groundRun.endAt) { groundEnd(); battle = null; sortieHud.classList.add('hidden'); }
      for (const e of infantry.drain()) { if (!near) continue;
        if (e.type === 'line' && !groundRun) ui.toast(`<b>The line.</b> Sandbags and wire where ${esc(e.F.a.name)} meets ${esc(e.F.b.name)}: soldiers of both sides, three objectives on the border.`, 'bad', 9000);
        if (e.type === 'taken') { ui.toast(`<b>${e.O.name} objective taken.</b>${e.you && side ? ' You were on it.' : ''}`, '', 5000); if (groundRun && side && infantry.obj.every(O => O.owner === 'ours')) { groundRun.won = true; groundRun.endAt = clock.now() + 5; ui.toast('<b>All three objectives are ours.</b> The line here is taken.', '', 8000); }
          if (e.you && side) { if (groundRun) groundRun.taken++; const pay = 200 + 50 * player.soldier.rank; player.credits = (player.credits ?? 0) + pay; store.touchPlayer(); ui.toast(`A bonus for the objective: <b>${pay} cr</b>.`, '', 4000); } }
        if (e.type === 'lost') ui.toast(`<b>${e.O.name} objective lost</b> to ${esc(infantry.F.b.name)}.`, 'bad', 5000);
        if (e.type === 'down' && e.by === 'player') { if (e.M.side === 'theirs' && player.soldier) { chud.log(`You put down a ${infantry.F.b.name} rifleman`, 'you'); soldierKill(); } else if (e.M.side === 'ours') ui.toast('That was one of ours.', 'bad', 4000); }
        else if (e.type === 'down' && Math.hypot(e.M.pos[0] - ctrl.pos[0], e.M.pos[2] - ctrl.pos[2]) < 70) chud.log(e.M.side === 'ours' ? `${infantry.F.a.name} soldier down` : `${infantry.F.b.name} soldier down`, e.M.side === 'ours' ? 'bad' : '');
        if (e.type === 'gunout') { const ours = e.O.owner === 'ours'; ui.toast(ours ? `<b>Our gun on ${e.O.name} is knocked out.</b>` : `<b>Their gun on ${e.O.name} is knocked out.</b> Get onto it before they put another up.`, ours ? 'bad' : '', 6000); if (e.by === 'player' && !ours && groundRun) groundRun.guns = (groundRun.guns || 0) + 1; }
        if (e.type === 'nade') { damageBuildings(e.p, e.R * 0.8); fx.blast(e.p, 2.2); fx.dustRing(e.p, e.R * 0.8); sound.boom(e.p, 3.5); const d = Math.hypot(e.p[0] - ctrl.pos[0], e.p[2] - ctrl.pos[2]); fx.shake = Math.max(fx.shake, Math.max(0, 0.7 - d / 40)); }
      }
      if (infantry.F) {
        // what you hear of it: every shot from where it was fired (the nearest few each moment), the snap of the ones that come close
        for (const S of infantry.shots) { if (S.n <= lastHeard) continue; lastHeard = Math.max(lastHeard, S.n); if (infantry.town) try { shotGlass(S.from, S.to); } catch (e) { console.warn(e); }
          const d = Math.hypot(S.from[0] - ctrl.pos[0], S.from[2] - ctrl.pos[2]); if (d < 260 && (shotsHeard += 1) < 14) sound.shot(S.from);
          const ax = S.to[0] - S.from[0], az = S.to[2] - S.from[2], L = Math.hypot(ax, az) || 1, f = Math.max(0, Math.min(1.15, ((ctrl.pos[0] - S.from[0]) * ax + (ctrl.pos[2] - S.from[2]) * az) / (L * L))), off = Math.hypot(S.from[0] + ax * f - ctrl.pos[0], S.from[2] + az * f - ctrl.pos[2]);
          if (S.stop && Math.hypot(S.to[0] - ctrl.pos[0], S.to[2] - ctrl.pos[2]) < 120) fx.dust(S.to, 3, [0.6, 0.55, 0.45]);      // (the round into what was in its way: a puff off it)
          if (!S.hit && off < 3 && d > 4) { sound.crack([S.from[0] + ax * f, 0, S.from[2] + az * f]); infantry.felt(0.05); fx.shake = Math.max(fx.shake, 0.08); } }
        shotsHeard = Math.max(0, shotsHeard - dt * 14);
        // what they dropped, if you walk over it
        for (const k of infantry.take(ctrl.pos)) { if (k === 'cell') { shield = SHIELD; player.hp = Math.min(hpCap(player), player.hp + 20); chud.log('Cell: shield and health up', 'you'); sound.blip(700); } else { nades = Math.min(5, nades + 1); chud.log('Grenade', 'you'); sound.blip(520); } store.touchPlayer(); }
        // back at the rally point you're issued what you've used
        const R = player.footDuty; if (R && Math.hypot(ctrl.pos[0] - R.rx, ctrl.pos[2] - R.rz) < 12 && (nades < 3 || rockets < 3)) { nades = 3; rockets = 3; chud.log('Resupplied', 'you'); }
      } }
    fleetWar.step(dt, raid); { const fe = fleetWar.drain(); fleetWarView.update(dt, fleetWar, toRender, groundY, fe, camera);
      for (const e of fe) { const C = fleet.find(c => c.model === e.C); if (!C) continue;
        if (e.type === 'launch') ui.toast(`The <b>${esc(C.name)}</b> is launching ${e.n} fighters.`, '', 5000);
        else if (e.type === 'salvo' && !raid?.saidSalvo) { raid && (raid.saidSalvo = true); ui.toast(`The <b>${esc(C.name)}</b> opens its missile cells.`, 'bad', 5000); }
        else if (e.type === 'sortie') ui.toast(`The <b>${esc(C.name)}</b> leaves station on a bombing run.`, '', 6000);
        else if (e.type === 'home') ui.toast(`The <b>${esc(C.name)}</b> is back on station.`, '', 4000); } }
    if (myCraft && !myCraft.alive && flight) { const low = sortie && flight.altitude() < 120; if (low) dieFlow('shot down too low to get out', 'overkill'); else { eject(); if (sortie) sortieEnd('ejected'); } }
    if (sortie) skyTick(dt);
    sched.tick(dt, t, homeCtx);
    if (!inSpace && !cloudW) { const v = flight ? flight.vel : ride?.vel || [0, 0, 0]; terrain.update(ctrl.pos[0], ctrl.pos[2], 5, flight ? ctrl.pos[1] - roughY(ctrl.pos[0], ctrl.pos[2]) : 0, v[0] || 0, v[2] || 0); }
    if (!inSpace) cityView.update(ctrl.pos, 1 - (sky.state.day ?? 1));
    homeTown.town.group.visible = Math.hypot(ctrl.pos[0] - homeS.cx, ctrl.pos[2] - homeS.cz) < 7000;   // (the town is a speck from the city)
    { const me = flight ? null : ride ? ride.pos : ctrl.pos, blocks = me ? [me] : []; for (const D of wrecks.list.values()) if (!D.ride && (D.hits.length || D.burnt) && Math.abs(D.pos[0] - ctrl.pos[0]) < 300 && Math.abs(D.pos[2] - ctrl.pos[2]) < 300) blocks.push(D.pos); cityTraffic.update(clock.now(), dt, ctrl.pos, 1 - (sky.state.day ?? 1), toRender, blocks, town.group.visible ? trafficNear(planet, s, clock.now(), ctrl.pos[0], ctrl.pos[2], 320, cityTraffic.life.delayOf).filter(v => !v.parked).map(v => { const r = townRedAhead(s, v.pos[0], v.pos[2], Math.sin(v.facing), Math.cos(v.facing), clock.now()); return r ? { ...v, stop: Math.max(0, r.d) } : v; }) : []); }
    showCityLights();
    roadLimit = ride ? (roadRules ||= new RoadRules({ planet, store, signalAt, say: h => ui.toast(h, 'bad', 5000) })).step(dt, clock.now(), ride, town.group.visible ? s : null, cityView.city, mayhem) : null;
    if (!cityRooms) { cityRooms = new CityInteriors(planet, homeS, cityView.city, world, cityView, propLib); root.add(cityRooms.group);
      mayhem = new Mayhem({ world, store, planet, city: cityView.city, view: cityTraffic }); mayhem.onAlarm = (A, n) => { if (n && A.kind !== 'trespassing') ui.toast(`<i>“${SHOUTS[Math.floor(A.t * 7) % SHOUTS.length]}”</i>`, 'bad', 2600); }; mayhem.peopleNear = (t, x, z, r, max) => { const here = world.locate(...ctrl.pos)?.b?.item; return peopleNear(t, x, z, r, max).filter(w => !w.indoors || w.indoors === here); };   // (whoever's indoors sees only what happens indoors, with them)
      cityView.isBroken = (B, idx) => mayhem.brokenProp(B, idx); }
    if (!paused) stepMayhem(dt);
    // walking onto a guarded place: nobody asked you in
    if (!paused && mayhem && !flight) { let g = null; sitesNear(planet, ctrl.pos[0], ctrl.pos[2], 100, S => { if (S.guarded && Math.hypot(S.x - ctrl.pos[0], S.z - ctrl.pos[2]) < 58) g = S; }); if (g && clock.now() > (trespassAt ?? 0)) { const first = trespassAt === null; trespassAt = clock.now() + 25; const seen = mayhem.crime(clock.now(), 'trespassing', 0.9, ctrl.pos); if (first || seen) ui.toast(`You're inside <b>${esc(g.label)}</b> with no business being here${seen ? ', and they\'ve seen you' : ''}.`, 'bad', 6000); } }
    if (!goods && propLib) { goods = new Goods(propLib, planet, s, store, world); goods.gone = b => fallen(bState(b)); root.add(goods.group); } goods?.update(clock.now(), ctrl.pos);
    if (!inSpace) cityRooms.update(ctrl.pos);
    vesperStreets?.update(flight ? flight.pos : ctrl.pos);
    if (!siteRooms && propLib) { siteRooms = new SiteInteriors(planet, homeS, world, outposts, propLib, store, k => cityView.kit(k)); root.add(siteRooms.group); } if (!inSpace) siteRooms?.update(ctrl.pos, clock.now()); setWindowGlow(1 - (sky.state.day ?? 1));
    { const agl = flight ? ctrl.pos[1] - roughY(ctrl.pos[0], ctrl.pos[2]) : 0, v = flight ? flight.vel : ride?.vel, spd = v ? Math.hypot(v[0] || 0, v[2] || 0) : 0;
      aloft = agl > 300; sea.rough = agl > 1500;
      towns.speed = spd;
      if (!inSpace) flora.update(ctrl.pos[0], ctrl.pos[2], agl, spd);
      if (!inSpace) rocks.update(ctrl.pos[0], ctrl.pos[2], agl, spd); }
    if (!fauna) fauna = window.__fauna = new FaunaSim(planet, { resolve: (x, z, y, r) => world.resolve(x, z, y + 0.1, r, 1.4, true), isDead: id => { const v = store.getDelta('fauna:' + id); return v && v.until > clock.now(); }, markDead: (id, secs) => store.patchDelta('fauna:' + id, { until: clock.now() + secs }), onStruck: A => { hurtPlayer?.(14 + A.sp.size * 6); ctrl.knock(Math.sin(A.facing) * 7, Math.cos(A.facing) * 7, 3.5, 0.7); } });
    if (ride && ride.speed > 5) fauna.struck(ride.pos[0], ride.pos[2], ride.speed);
    runOver(t);
    if (!inSpace) { fauna.update(dt, ctrl.pos[0], ctrl.pos[2], ctrl.pos[1]); faunaView.update(dt, fauna, ctrl.pos[0], ctrl.pos[2]); }
    if (!inSpace) { { const v = flight ? flight.vel : ride?.vel; outposts.update(ctrl.pos[0], ctrl.pos[2], flight ? ctrl.pos[1] - roughY(ctrl.pos[0], ctrl.pos[2]) : 0, v ? Math.hypot(v[0] || 0, v[2] || 0) : 0); } rivers.update(ctrl.pos[0], ctrl.pos[2], dt); harbour?.update(ctrl.pos[0], ctrl.pos[2], clock.now(), dt); }
    if (!flight || flight.altitude() < 60) grass.update(ctrl.pos[0], ctrl.pos[2], dt, weatherAt(planet, t).wind, cam.yaw + (cam.cur != null && cam.cur < 1 ? 0 : 0)); grass.group.visible = (!flight || flight.altitude() < 60) && !params.has('nograss');
    const camW = [camera.position.x + origin[0], camera.position.y + origin[1], camera.position.z + origin[2]];
    const wx = params.has('weather') ? { ...weatherAt(planet, t), ...JSON.parse(params.get('weather')) } : weatherAt(planet, t);
    const skyState = sky.update(t, new THREE.Vector3(rp[0], rp[1], rp[2]), camera.position, wx, ctrl.pos[1] - altRef);
    if (cloudW && !flight && ctrl.pos[1] < cloudOf(planet).deck + 40) {      // fell off a deck, down into the clouds: you come round back on your town's deck, hurt
      const n = homeS.nodes[0], [fx, fz] = homeS.toWorld(n.u + 3, n.v + 3); ctrl.pos = [fx, homeS.h + 0.3, fz]; ctrl.vel = [0, 0, 0]; ride = null; ctrl.mode = 'walk';
      player.hp = Math.max(10, (player.hp ?? 100) - 45); store.touchPlayer(); ui.toast('You fell into the clouds. Someone fished you out with a skimmer: you wake back in town, bruised.', 'bad', 9000);
    }
    gangTick(dt);
    // what the fleet's or the front's blasts hit burns for a while, then smoulders (scorch/… deltas, main.js groundBlast)
    if ((scorchTick -= dt) <= 0) { scorchTick = 0.25; const t = clock.now();
      for (const b of s.buildings || []) { const D = store.getDelta('scorch/' + b.key); if (!D) continue; const age = t - D.t; if (age > planet.dayLength) continue;
        const [x, z] = s.toWorld(b.O[0] + b.ex[0] * b.w / 2 + b.ez[0] * b.d / 2, b.O[1] + b.ex[1] * b.w / 2 + b.ez[1] * b.d / 2), top = s.h + (b.floors || 2) * 3.2, hot = age < planet.dayLength / 12;
        if (Math.hypot(x - ctrl.pos[0], z - ctrl.pos[2]) > 1500) continue;
        if (hot) { fx.flame([x, top, z], 3); fx.burnLight?.([x, top, z], 2.5, 1); } fx.smoke([x, top + 1, z], hot ? 6 : 3, weatherAt(planet, t).wind, hot ? 0.05 : 0.14, hot ? 0.55 : 0.3); } }
    if (skyIsles) skyIsles.update(ctrl.pos[0], ctrl.pos[1], ctrl.pos[2], dt, skyState.dir, origin, THREE.MathUtils.smoothstep(skyState.dir.y, -0.12, 0.08));
    { const alt = ctrl.pos[1] - altRef; terrainFar.value.set(8000, 15700, alt > 2500 ? alt : 0); { const fadeOn = alt > 2500, tm = terrain.material; if (tm.transparent !== fadeOn) { tm.transparent = fadeOn; tm.needsUpdate = true; root.traverse(o => { if (o.userData.land) o.renderOrder = fadeOn ? -1 : 6; }); } } inSpace = alt > 45000; root.visible = !inSpace; sea.visible = alt < 7000 && !cloudW; if (weatherView.clouds) weatherView.clouds.visible = alt < 22000;
      globeView.update(dt, ctrl.pos[0], ctrl.pos[2], rp[0], rp[2], alt, skyState.dir, camera, origin[1]);
      const far = alt > 2500 ? Math.max(60000, globeOf(planet).R * 2.4 + alt * 3) : 60000; if (camera.far !== far) { camera.far = far; camera.updateProjectionMatrix(); } sky.stars.scale.setScalar(far > 60000 ? far * 0.92 / 40000 : 1); }
    weatherView.update(dt, wx, skyState, camera, origin, !!world.locate(...ctrl.pos)?.room && !(flight && !cockpitView));   // under a roof: no rain
    sea.update(dt, camera, origin, wx.wind); terrainTime.value += dt; terrainWind.value.set(wx.wind[0], wx.wind[1]);
    prints.update(dt, ctrl, wx.wind);
    if (player.waypoint) {
      const wp = player.waypoint, d = Math.hypot(wp.x - ctrl.pos[0], wp.z - ctrl.pos[2]);
      if (d < 6) { ui.toast(`You've arrived: ${esc(wp.label)}.`); player.waypoint = null; store.touchPlayer(); beam.visible = false; }
      else { const r = toRender(wp.x, wp.y, wp.z); beam.position.set(r[0], r[1], r[2]); beam.visible = true; }
    } else beam.visible = false;
    // interior lighting follows the room you are in
    const loc = world.locate(...ctrl.pos);
    if (loc?.room) {
      const r = loc.room.rect, c = b2w(loc.b, (r[0] + r[2]) / 2, (loc.k + 1) * loc.plan.H - 0.5, (r[1] + r[3]) / 2);
      const lp = toRender(...c); roomLight.position.set(lp[0], lp[1], lp[2]);
      roomLight.intensity = lightOn(store, loc.b.key, loc.k, loc.room.i) ? 6 + 10 * (1 - (sky.state.day ?? 1)) : 0;
    } else roomLight.intensity = 0;
    if (!flight && !ride && ringHere()) { const up = _rp.set(0, 1, 0).transformDirection(ringBend); roomLight.position.copy(avatar.object.position).addScaledVector(up, 3.2); roomLight.intensity = 3 + 16 * (1 - (sky.state.day ?? 1)); }     // (in a ring, the street lamps and the windows light you)
    if (!paused) {
      const di = nearestDoor(), lad = nearLadder();
      const ua = forceHold === 0 && ctrl.mode === 'walk' && !lad ? usableAhead() : null;
      const nv = !ride && !ua && hotwire === 0 ? nearVehicle() : null;
      const rpn = !ride && !flight && !ua ? nearRamp() : null;
      if (flight) {
        const why = flight.onGround ? flight.landingProblem() : null, f = flight;
        ui.showPrompt(`<span class="fltape"><b>${Math.round(f.airspeed * 3.6)}</b> km/h · <b>${f.altitude() > 20000 ? `${Math.round(f.altitude() / 1000).toLocaleString()}</b> km` : `${Math.round(f.altitude())}</b> m`} · ${f.vel[1] >= 0 ? '↑' : '↓'}${Math.abs(f.vel[1]).toFixed(1)} m/s · thr <b>${f.throttle < -0.01 ? 'REV ' + Math.round(-f.throttle * 100) : Math.round(f.throttle * 100)}%</b>${f.hover > 0.05 ? ` · lift ${Math.round(f.hover * 100)}%` : ''} · α ${(f.aoa * 57.3).toFixed(0)}° · ${f.gload.toFixed(1)} g${f.assist ? '' : ' · <b class="late">ASSIST OFF</b>'}${myCraft ? ` · hull <b class="${myCraft.hp / myCraft.maxHp < 0.35 ? 'late' : ''}">${Math.max(0, Math.round(myCraft.hp / myCraft.maxHp * 100))}%</b>${myCraft.guns ? ` · msl ${myCraft.missiles} · flares ${myCraft.flares}` : ''}` : ''}${war.missiles.some(m => m.target === myCraft) ? ' · <b class="late">MISSILE</b>' : ''}${f.stalled ? ' · <b class="late">STALL</b>' : Math.abs(f.aoa) > 0.22 && !f.onGround && f.airspeed > f.vs * 0.45 ? ' · <b class="warnc">stall warning</b>' : ''}</span>
          <small>${f.onGround && why ? `can't land: ${why}` : ''}${docking ? ` · docking with the ${esc(docking.C.name)}` : (() => { const q = !f.onGround && dockTarget(); return q ? ` · <kbd>E</kbd> dock with the ${esc(q.C.name)}` : ''; })()}</small>`);
      }
      else if (rampHold > 0) {}
      else if (rpn) ui.showPrompt(shipIsYours(rpn.sh, player) ? `<kbd>E</kbd> ${rpn.down ? 'Raise' : 'Lower'} the ramp — the ${esc(rpn.sh.name)}` : rpn.down ? `The ${esc(rpn.sh.name)} · ${esc(rpn.sh.ownerName)}${rpn.sh.forSale ? ` · for sale, ${PRICES[rpn.sh.model]} cr` : ''}` : `The ${esc(rpn.sh.name)} · ramp locked · hold <kbd>F</kbd> force`);
      else if (ride) { const k = Math.round(Math.abs(ride.speed) * 3.6), L = roadLimit; ui.showPrompt(`<b${L && k > L + 8 ? ' style="color:#ff7a66"' : ''}>${k} km/h</b>${L ? ` <span style="display:inline-block;margin-left:8px;min-width:22px;padding:1px 5px;border:2px solid #e0453a;border-radius:12px;background:#fff;color:#111;font-weight:700;text-align:center">${L}</span>` : ''}`); }
      else if (hotwire > 0) {}
      else if (onLine() && !tankV && armor.list.some(V => !V.dead && V.side === 'ours' && V.crew === 'ai' && armor.inHull(V, ctrl.pos[0], ctrl.pos[2], 2.2))) { const V = armor.list.find(V => !V.dead && V.side === 'ours' && V.crew === 'ai' && armor.inHull(V, ctrl.pos[0], ctrl.pos[2], 2.2)); ui.showPrompt(`The ${V.T.name} · climb in`); }
      else if (tankV) ui.showPrompt(null);
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
    ui.quiet = !flight && (t - lastShotAt < 12 || performance.now() / 1000 - lastAttack < 8 || !!mayhem?.officers.length || !!(pursuit && pursuit.state !== 'return'));
    const cp = cityPlace(cityView.city, ctrl.pos[0], ctrl.pos[2]);
    ui.updateHud({ planet, s: (d => d > s.R + 3000 ? { ...s, name: `${Math.round(d / 1000).toLocaleString()} km from ${s.name}` } : s)(surfaceDistance(globeOf(planet), s.cx, s.cz, ctrl.pos[0], ctrl.pos[2])), player, t, located: loc, atWork, cell: holdingCell(planet, s, polity), weather: wx, pos: ctrl.pos, cityAt: cp && { label: cp.label, city: cityView.city.name } });
    frames++;
    if (now - fpsT > 1000) {
      fps = frames; frames = 0; fpsT = now;
      const info = renderer.info.render;
      ui.debug(`${fps} fps · ${info.calls} calls · ${(info.triangles / 1e3).toFixed(0)}k tris · tiles ${terrain.count} (+${terrain.pending}) · pos ${camW.map(v => v.toFixed(0)).join(',')} · jobs ${store.jobs.length} · deltas ${store.deltas.size}`);
    }
    if (performance.now() - lastSave > 10000) { lastSave = performance.now(); save(); }
    waterTick -= dt; if (waterTick <= 0) { waterTick = 1.5; const [wx0, wz0] = ctrl.pos; let nearW = ctrl.pos[1] < planet.seaLevel + 90; for (const r of [150, 450, 900]) for (let k = 0; k < 8 && !nearW; k++) { const a = k * 0.785; if ((flight ? rawHeight : surfaceHeight)(planet, wx0 + Math.cos(a) * r, wz0 + Math.sin(a) * r) < planet.seaLevel + 1) nearW = true; } sea.waterNear = nearW; }
    // a fight on foot, as you see and hear it (ui/combathud.js, render/sound.js)
    { const line = fighting(), armed = heldRanged() && !flight && !ride && ctrl.mode === 'walk'; sound.listen(ctrl.pos, cam.yaw);
      const barks = []; if (line && infantry.F) for (const b of infantry.barks) { const M = b.M; if (Math.hypot(M.pos[0] - ctrl.pos[0], M.pos[2] - ctrl.pos[2]) > 70) continue; const v = new THREE.Vector3(...toRender(M.pos[0], M.pos[1] + 2.1, M.pos[2])).project(camera); if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue; barks.push({ x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, text: b.text, side: M.side, life: 2.2 - b.t }); }
      const W = WEAPONS[player.weapon];
      const sc = scoped(); let pip = null;
      if (tankV) { const b = armor.pivot(tankV), g = armor.gunDir(tankV), ap = tankV.aimPt, dd = ap ? Math.max(20, Math.hypot(ap[0] - b[0], ap[1] - b[1], ap[2] - b[2])) : 300, v = new THREE.Vector3(...toRender(b[0] + g[0] * dd, b[1] + g[1] * dd, b[2] + g[2] * dd)).project(camera); if (v.z < 1) pip = { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; }
      chud.draw({ on: !paused && (line || armed || !!tankV), armed: (armed || !!tankV) && (document.pointerLockElement === renderer.domElement || params.has('auto')), spread: sc ? (W?.spread || 0.02) * 0.08 + bloom * 0.45 : (W?.spread || 0.02) * (1 - 0.65 * aimK) * (ctrl.speed > 2.5 ? 1.6 : 1) + bloom, fov: camera.fov * Math.PI / 180, aiming: aimK > 0.5, hp: player.hp, shield: line ? shield : 0, shieldMax: line ? SHIELD : 0, nades: line && !tankV ? nades : 0, rockets: line && !tankV ? rockets : 0, obj: line ? infantry.obj : null, barks,
        scope: aimK > 0.25 && (armed || tankV) ? { k: Math.max(0, Math.min(1, (aimK - 0.25) / 0.6)), tank: !!tankV, zoom: zoomNow(), breath, holding, gasp: gasp > 0 } : null,
        tank: tankV ? { hp: tankV.hp, maxHp: tankV.maxHp, reload: Math.max(0, Math.min(1, 1 - tankV.reload / tankV.T.reload)), pip, speed: tankV.speed, name: tankV.T.name } : null }, dt); }
    if (fx.shake > 0.01) { const k = fx.shake * fx.shake * 0.28, T = performance.now() * 0.05; camera.position.x += Math.sin(T * 1.13) * k; camera.position.y += Math.sin(T * 1.71 + 1) * k; camera.position.z += Math.sin(T * 0.93 + 2) * k; }
    if (!params.has('norefl') && !cloudW) sea.renderReflection(renderer, scene, camera, [ringView.group, fx.group, grass.group, weatherView.rain, crowd.group, vehView.group, rocks.group, faunaView.group, prints.group, flora.group].filter(Boolean));
    renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = (shadowTick++ & 1) === 0 || !!ride || !!flight || ctrl.speed > 3 || !!ringHere();     // (in a ring everything's turning: a map a frame stale shakes everyone in it)     // (every other frame only while nothing near you is moving fast: at speed a stale map shakes the car's own shadows)
    // If this machine can't keep up, draw fewer pixels rather than drop frames; go back up when it can
    { const nowR = performance.now(); rezN++; if (!rezT) rezT = nowR; if (nowR - rezT > 1200) { const fps = rezN * 1000 / (nowR - rezT); rezT = nowR; rezN = 0; const top = Math.min(devicePixelRatio, 2), floor = params.has('auto') ? Math.min(1, top) : Math.max(0.75, top * 0.5);
      // (a quick step down when it's slow, a slow one back up when there's room; a level that proved too much isn't tried again for a minute, so it doesn't hunt)
      if ((document.hasFocus?.() !== false || params.has('auto')) && !paused) { let want = resolution; if (fps > 58) { if (++rezUp >= 4) { rezUp = 0; if (resolution + 0.1 < rezCap || nowR > rezCapT) want = resolution + 0.1; } } else rezUp = 0;
        if (fps < 30) want = resolution * 0.8; else if (fps < 47) want = resolution - 0.1; if (want < resolution) { rezCap = resolution; rezCapT = nowR + 60000; }
        want = Math.max(floor, Math.min(top, want)); if (Math.abs(want - resolution) > 0.01) { resolution = want; renderer.setPixelRatio(resolution); } } } }
    if (ftl) {      // in FTL: the tunnel, not the world; coming out, the world goes on being built behind it until the ground under you is there
      if (paused && !cloudW && !inSpace) terrain.update(ctrl.pos[0], ctrl.pos[2], 8, flight ? ctrl.pos[1] - roughY(ctrl.pos[0], ctrl.pos[2]) : 0, 0, 0);
      ftl.render(dt);
      if (ftlOut && ((ftlOut.t += dt) > 1.2 && terrain.pending < 3 || ftlOut.t > 30)) {
        renderer.compile(scene, camera); ftl.dispose(); window.__ftlDone = performance.now(); ftl = null; paused = false; ui.hush = false; ftlFlash(1100); if (ftlOut.say) ui.toast(ftlOut.say, '', 10000); ftlOut = null;
      }
    } else { fogCull(); cullFix(); if ((lightTick++ & 255) === 0) lightPool.adopt(); lightPool.update(camera); renderer.render(scene, camera); if (flight && !docking && !paused && !ftl) hud.draw(flight, myCraft, war, camera, toRender, aimDir, dt); else hud.hide(); }
  }
  ftlPumpOff = true; requestAnimationFrame(safeFrame);
  window.ORBIS = { toRender, fromRender, probe, damageBuildings, bState, rebuilding: false, rebuildN: 0, wreckAt: (model, x, z, yaw = 0.4) => { const hk = hulkOf({ ...restPose(model, x, z, yaw, landY, 0.5), t: clock.now() }); hulks.push(hk); return hk; }, get tiltIn() { return tiltIn; }, hulks, shipDamage, shipView, shipDamageState: id => shipDamage.state(id), takeOffForTest: id => takeOff(allShips(clock.now()).find(x => x.id === id)), get terrain() { return terrain; }, vesperStreets, thrustView, crowd, dockTarget, startDock, getDocking: () => docking, capitalView, ringView, vesperB, vesperLift, ringStructs, ringHere, ringStop, meridianLift, get fleet() { return fleet; }, globeView, crossCut, roadView, towns, homeTown, get currentTown() { return currentTown; }, homeS, homeCtx, enterTown, riverFeed, camera, Flight, setFlightForTest: f => { flight = f; }, setRideForTest: r => { ride = r; ctrl.mode = 'ride'; }, vehView, shipView, rocks, prints, flora, wrecks, wreckView, fx, trafficGone, crashRec, get fauna() { return { clear: () => fauna.clear(), spawnTest: (...a) => fauna.spawnTest(...a), sim: fauna, view: faunaView }; }, peopleNearTest: (...a) => peopleNear(...a), get avatar() { return avatar; }, sites: () => siteRooms, get ladders() { return ladders; }, store, planet, get s() { return s; }, ctrl, cam, clock, world, get town() { return town; }, get doorView() { return doorView; }, scene, renderer, ready: false, save, get pop() { return pop; }, get residents() { return residents; }, crowd, getAgents: () => agents, get ctx() { return ctx; }, get polity() { return polity; }, showWork, getPursuit: () => pursuit, startPursuit, cell: holdingCell(planet, s, polity), ui, get propView() { return propView; }, use: { usableAhead, useThing, statusOf, labelOf }, showInventory, getRide: () => ride, getVehicles: () => vehicles, getFlight: () => flight, war, getRaid: () => raid, raidTick, startRaid: () => raidTick(clock.now(), true), fleetWar, front, deploy: () => deployFlow(), deployFoot: () => deployFlow(true), infantry, combat: { aim: v => { aimHeld = v; }, fire: v => { trigger = v; }, throwGrenade: () => throwGrenade(), launcher: () => fireLauncher(), board: () => tankToggle(), get tank() { return tankV; }, get scoped() { return scoped(); }, crouch: v => { crouched = v; }, get state() { return { crouchK, shield, nades, rockets, aimK, bloom, hp: player.hp, zoom: zoomNow(), breath }; } }, armor, holo: () => holoFlow(), ftlJump: to => ftlJump(to), get inSpace() { return inSpace; }, endDeployment: () => endDeployment(), gangs: () => gangsOf(planet, s, pop), townSociety: () => townSociety(planet, s), weatherView, attack, getBodies: () => bodies, cityView, cityTraffic, liftNear, outposts, getMayhem: () => mayhem, takeCar, getRide2: () => ride,  getCityRooms: () => cityRooms, city: getCity(planet), cityPlace, hurtPlayer, setCockpitView: v => { cockpitView = v; }, getShips: () => ships, syncShips, memorials, syncStones, people: { acting, get brawl() { return brawl; }, get scrap() { return scrap; }, brawlNow() { nextBrawl = 0; } }, get proned() { return proned; }, setProne: v => { proned = v; }, bodyContact, planetWar, hulks, get strikeView() { return strikeView; }, get sortie() { return sortie; }, warTable, warZones, warMove, dreadBegin, dreadEnd, camp, get run() { return run; }, skyBegin, sortieEnd, get groundRun() { return groundRun; }, get battle() { return battle; }, groundBegin, groundEnd, get myCraft() { return myCraft; } };
  // let a few frames settle (shadows, env map) before declaring ready for screenshots
  if (params.get('auto') === 'arrive') arrival();
  if (params.get('auto') === 'line') lineStart();
  warTune();
  if (liveWar) { const nat = myNation(), Fs = nat ? frontsOf(planet, nat) : []; front.pin = Fs.find(onLand) || Fs[0] || null; }      // (the war's going on from the first: the battle on a front of ours is fought wherever you are)
  if (!awayDue) setTimeout(() => { window.ORBIS.ready = true; document.title = 'READY'; }, 1500);
  // while you read what happened while you were away the world is already up and drawing behind it, so "Carry on" puts you straight in
  if (awayDue) { await ui.away(report, planet); paused = false; if (bootHold) bootHold.until = performance.now() + 12000; setTimeout(() => { window.ORBIS.ready = true; document.title = 'READY'; }, 1500); }
  if (AREA === 'war') setTimeout(() => warTable(), awayDue ? 300 : 1800); else if (AREA === 'sky') skyBegin(); else if (AREA === 'ground') groundBegin();
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
