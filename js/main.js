// ORBIS — boot and game loop. Wires the modules together; owns no game rules itself.
//   core/  seeds, noise, addresses       gen/   pure world generation
//   world/ persistent changes            sim/   time, scheduler, processes
//   render/ three.js views of gen data   player/ motion, camera, collision
import * as THREE from 'three';
import { seedHex, seedFromHex, makeSeed } from './core/hash.js';
import { HOMEWORLD } from './core/address.js';
import { makePlanet } from './gen/planet.js';
import { getSettlement } from './gen/settlement.js';
import { buildingPlan } from './gen/building.js';
import { newCharacter } from './gen/character.js';
import { doorstep, nearestRoadPoint, buildingToWorld } from './gen/place.js';
import { WorldStore, GEN_VERSION } from './world/store.js';
import { IDBBackend } from './world/store-idb.js';
import { MemoryBackend } from './world/store-mem.js';
import { canOpen, doorState } from './world/doors.js';
import { GameClock, EPOCH, solarHour, within } from './sim/clock.js';
import { Scheduler, TIER } from './sim/scheduler.js';
import { registerDoorJobs, openDoor, closeDoor, forceDoor } from './sim/processes/doors.js';
import { advanceBody, moveSpeedFactor } from './sim/processes/character.js';
import { catchUp } from './sim/offline.js';
import { TerrainStreamer } from './render/terrain.js';
import { SkySystem } from './render/sky.js';
import { buildSettlementMesh, poolMaterial } from './render/settlement-mesh.js';
import { DoorView } from './render/doors.js';
import { materials, occupancy, WINDOW_TYPES } from './render/materials.js';
import { CollisionWorld } from './player/collision.js';
import { Controller } from './player/controller.js';
import { FollowCamera } from './player/camera.js';
import { createPlaceholderAvatar } from './player/avatar.js';
import { UI } from './ui/ui.js';

const params = new URLSearchParams(location.search);
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
  const sched = new Scheduler(store); registerDoorJobs(sched);
  const ctx = { store, sched, planet };

  let report = null;
  if (fresh) {
    const serial = store.meta.nextCharacter++;
    const p = newCharacter(U, planet, s, serial, EPOCH);
    const home = s.buildings.find(b => b.key === p.home);
    const ds = doorstep(s, home, buildingPlan(planet, s, home));
    p.pos = ds.pos; p.facing = ds.facing;
    store.setPlayer(p);
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
  materials();
  ui.loading('Weathering the surface…', 0.05);
  await tick();

  const sky = new SkySystem(renderer, scene, planet);
  const terrain = new TerrainStreamer(planet, root);
  const town = await buildSettlementMesh(planet, s, f => ui.loading(`Building ${s.name}…`, 0.1 + 0.6 * f));
  root.add(town.group);
  const doorView = new DoorView(s, town.doors);
  town.group.add(doorView.mesh);
  const doorIndex = new Map(town.doors.map((d, i) => [d.b.key + '#' + d.door.id, i]));
  const world = new CollisionWorld(planet, s, (b, id) => doorView.isPassable(doorIndex.get(b.key + '#' + id)));
  const water = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x14303a, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.92 }));
  water.position.y = planet.seaLevel; scene.add(water);

  const player = store.player;
  const ctrl = new Controller(world, player.pos);
  ctrl.facing = player.facing || 0;
  const avatar = createPlaceholderAvatar();
  scene.add(avatar.object);
  const cam = new FollowCamera(camera, world, renderer.domElement);
  cam.yaw = ctrl.facing;
  const roomLight = new THREE.PointLight(0xffe2c0, 0, 14, 1.6); scene.add(roomLight);

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
  sched.add(TIER.NEAR, { update: dt => { advanceBody(player, 'idle', dt, planet); store.touchPlayer(); } });
  sched.add(TIER.ACTIVE, { update: dt => doorView.update(dt) });

  // ---- input
  const keys = new Set();
  let paused = false, forceHold = 0, jumpQueued = false, lastSave = performance.now();
  addEventListener('keydown', e => {
    if (paused) return;
    keys.add(e.code);
    if (e.code === 'Space') jumpQueued = true;
    if (e.code === 'KeyE') interact();
    if (e.code === 'Escape') openMenu();
    if (e.code === 'F3') { ui.toggleDebug(); e.preventDefault(); }
    if (e.code === 'KeyT' && e.shiftKey) { clock.advance(planet.dayLength / 24); ui.toast('Skipped one hour <small>(developer time-skip — scheduled events still run in order)</small>'); }
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  renderer.domElement.addEventListener('click', () => { if (!paused) renderer.domElement.requestPointerLock?.(); });
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && !paused && window.ORBIS.ready && !params.has('cam')) openMenu(); });

  const save = async () => {
    player.pos = ctrl.pos.slice(); player.facing = ctrl.facing;
    store.meta.gameTime = clock.now(); store.meta.realTime = Date.now();
    store.touchPlayer(); store.dirty.meta = true;
    await store.flush();
  };
  addEventListener('pagehide', () => { save(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

  // nearest door in reach on the player's level
  const nearestDoor = () => {
    let best = -1, bd = 2.2;
    const [px, py, pz] = ctrl.pos;
    for (let i = 0; i < town.doors.length; i++) {
      const c = doorView.centre(i), wx = c[0] + s.cx, wz = c[2] + s.cz;
      if (Math.abs(wx - px) > 4 || Math.abs(wz - pz) > 4) continue;
      if (Math.abs(c[1] - town.doors[i].door.height / 2 - py) > 1.2) continue;
      const d = Math.hypot(wx - px, wz - pz) - town.doors[i].door.width / 2 + 0.5;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  const insideBuilding = b => { const loc = world.locate(...ctrl.pos); return loc?.b === b; };
  function interact() {
    const i = nearestDoor(); if (i < 0) return;
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
  if (shot) applyShot(shot, { s, planet, ctrl, cam, town, doorView, store, sched, clock, world });

  // ---- loop
  ui.closePanel(); ui.showHud(true);
  if (report && (report.elapsed > 60 || report.events.length)) { paused = true; await ui.away(report, planet); paused = false; }
  if (!fresh && store.meta.gen !== GEN_VERSION) ui.toast(`This save was made with world generator v${store.meta.gen}; this build is v${GEN_VERSION}. Changes you made may not line up with the regenerated world.`, 'warn', 12000);
  if (fresh) ui.toast(`You are <b>${player.name}</b>, ${player.age}, of ${s.name} on ${planet.name}. Your home is behind you — your key opens it.`, '', 9000);
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
        run: keys.has('ShiftLeft') || keys.has('ShiftRight'), jump: jumpQueued, yaw: cam.yaw,
      };
      jumpQueued = false;
      for (let sub = 0, n = Math.ceil(dt / (1 / 120)); sub < n; sub++) ctrl.step(dt / n, input, moveSpeedFactor(player));
      // force a locked door by holding F
      const di = keys.has('KeyF') ? nearestDoor() : -1;
      if (di >= 0) {
        const { b, door } = town.doors[di], st = doorState(store, planet, b, door, t);
        if (st.locked && !st.broken) {
          forceHold += dt;
          ui.showPrompt(`Forcing the lock… <i class="meter"><b style="width:${Math.min(100, forceHold / 1.8 * 100)}%"></b></i>`);
          if (forceHold > 1.8) {
            forceHold = 0;
            forceDoor(store, sched, planet, s, b, door, t, player);
            doorView.refresh(store, planet, t);
            ui.toast(`You broke the lock. <small>An incident was recorded against you. (Authorities and witnesses are not simulated yet.)</small>`, 'bad', 7000);
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
    avatar.update(dt, ctrl.speed, ctrl.grounded);
    avatar.setOpacity?.(Math.min(1, Math.max(0, (cam.cur - 0.6) / 0.9)));
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
      roomLight.intensity = 6 + 10 * (1 - (sky.state.day ?? 1));
    } else roomLight.intensity = 0;
    if (!paused) {
      const di = nearestDoor();
      if (di >= 0 && forceHold === 0) {
        const { b, door } = town.doors[di], st = doorState(store, planet, b, door, t);
        const res = canOpen(store, planet, player, b, door, t);
        const what = door.kind === 'interior' || door.kind === 'core' ? 'door' : `${b.owner}`;
        ui.showPrompt(st.open ? `<kbd>E</kbd> Close ${what}` : st.broken ? `<kbd>E</kbd> Open ${what} <small>(lock broken)</small>`
          : res.ok || (door.kind !== 'interior' && insideBuilding(b)) ? `<kbd>E</kbd> Open ${what}${res.key ? ' <small>(your key)</small>' : ''}` : `${res.why} · <kbd>E</kbd> try · hold <kbd>F</kbd> force`);
      } else if (forceHold === 0) ui.showPrompt(null);
    }
    ui.updateHud({ planet, s, player, t, located: loc });
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
  window.ORBIS = { store, planet, s, ctrl, cam, clock, world, town, doorView, scene, renderer, ready: false, save };
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
