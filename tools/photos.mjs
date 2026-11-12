// A set of photographs of the game as it stands, into out/photos/. Headless, one browser, cleaned up afterwards.
import { spawn } from 'node:child_process';
import { preflight, guardBrowser } from './guard.mjs';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = +(process.env.PORT || 8517), CDP = 9341, slot = 'photos' + process.pid, SEED = process.env.SEED || '00c0ffee00b0a7e5';
const only = process.argv.slice(2);
const want = n => !only.length || only.includes(n);
const profile = join(tmpdir(), 'orbis-photos-' + process.pid);
preflight(); mkdirSync('out/photos', { recursive: true });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`,
  '--window-size=1600,900', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--use-angle=metal', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--no-first-run', 'about:blank'], { stdio: 'ignore', detached: true });
guardBrowser(chrome, profile, { maxSeconds: 480 });
const stop = () => { try { process.kill(-chrome.pid, 'SIGKILL'); } catch { try { chrome.kill('SIGKILL'); } catch {} } try { rmSync(profile, { recursive: true, force: true }); } catch {} };
for (const sig of ['SIGALRM', 'SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { stop(); process.exit(124); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${CDP}/json/version`); break; } catch { await sleep(200); } }
  const target = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map(), errs = [];
  ws.onmessage = m => { const x = JSON.parse(m.data); if (x.id) pend.get(x.id)?.(x); if (x.method === 'Runtime.exceptionThrown') errs.push(x.params.exceptionDetails.exception?.description); if (x.method === 'Runtime.consoleAPICalled' && x.params.type === 'error') errs.push(x.params.args.map(a => a.value || a.description).join(' ').slice(0, 900)); };
  const send = (method, params = {}) => new Promise((r, rej) => { const i = ++id, to = setTimeout(() => { pend.delete(i); rej(new Error('STUCK ' + method + ' ' + String(params.expression || '').slice(0, 100))); }, 120000); pend.set(i, x => { clearTimeout(to); r(x); }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(e.slice(0, 200) + ' → ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result.result.value; };
  const load = async q => { await send('Runtime.enable'); await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?slot=${slot}&auto=new&seed=${SEED}&${q}` }); let t = ''; for (let i = 0; i < 240; i++) { await sleep(500); t = await ev('document.title').catch(() => ''); if (t === 'READY' || t.startsWith('ERROR')) break; } if (t !== 'READY') throw new Error('no load: ' + t + ' ' + errs[0]);
    await ev(`(async () => { const st = document.createElement('style'); st.textContent = 'body > *:not(canvas) { visibility: hidden !important; } canvas { visibility: visible !important; }'; document.head.append(st); window.__G = await import('./js/gen/globe.js'); window.__T = await import('./js/gen/terrain.js'); window.__N = await import('./js/gen/network.js'); window.__g = __G.globeOf(ORBIS.planet); window.__Rs = __N.linksOfTown(ORBIS.planet, ORBIS.homeS); return 1; })()`); };
  const shot = async n => { const a = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88 }); writeFileSync(`out/photos/${n}.jpg`, Buffer.from(a.result.data, 'base64')); console.log('  ', n); };
  // the ship held still at a place, pointing a way, camera at an angle; ship shown or not
  const place = (x, y, z, { yaw = 0, pitch = 0, dist = null, camYaw = 0, ship = false, agl = false, nose = 0 } = {}) => ev(`(() => { const O = ORBIS, f = O.getFlight(), x = ${x}, z = ${z}, y = ${y} + (${agl} ? Math.max(O.planet.seaLevel || 0, __T.rawHeight(O.planet, x, z)) : 0); f.pos[0] = x; f.pos[1] = y; f.pos[2] = z; f.vel = [Math.sin(${yaw}) * 60, 0, Math.cos(${yaw}) * 60]; f.throttle = 0.3; const c = Math.cos(${yaw} / 2), s = Math.sin(${yaw} / 2); f.q = [0, s, 0, c]; f.syncEuler(); O.cam.pitch = ${pitch}; O.cam.yaw = f.facing + ${camYaw}; ${dist !== null ? `O.cam.dist = ${dist};` : ''} O.shipView.group.visible = ${ship}; return Math.round(y); })()`);

  await load('hour=10&fly');
  const roads = await ev(`__Rs.map(r => ({ km: r.length / 1000, bridges: r.bridges.length, n: r.pts.length }))`); console.log('   roads from home', JSON.stringify(roads));
  // keeps the world moving slowly while a picture settles
  const hold = async (ms, fn) => { const end = Date.now() + ms; let i = 0; while (Date.now() < end || (i++ < 400 && await ev('ORBIS.terrain.pending > 0 && ORBIS.ctrl.pos[1] < 40000').catch(() => false))) { await fn(); await sleep(350); } };

  if (want('planet')) {
    const up = async (n, y, opts, ms = 3500) => { await hold(ms, () => place(0, y, 0, opts)); await shot(n); };
    await up('01-ship-above-land', 700, { ship: true, pitch: 0.18, dist: 34, camYaw: 0.5, agl: true }, 6000);
    await up('02-climbing-12km', 12000, { pitch: 0.12, dist: 40, ship: true, camYaw: 0.5 }, 5000);
    await up('03-edge-of-space-40km', 40000, { pitch: 0.1, dist: 40, ship: true, camYaw: 0.5 });
    for (let i = 0; i < 200 && !(await ev('ORBIS.globeView.finished')); i++) await sleep(500);
    console.log('   sharpest planet picture in', await ev('Math.round(performance.now() / 1000)'), 's since load');
    await up('04-low-orbit-300km', 300000, { pitch: 0.28, dist: 40, ship: true, camYaw: 0.4 });
    await up('05-high-orbit-3000km', 3e6, { pitch: 0.86, dist: 40, ship: true, camYaw: 0.4 }, 4000);
    await up('06-whole-planet-20000km', 2e7, { pitch: 1.37 }, 3000);
  }
  if (want('sky12')) {
    const P = () => place(0, 12000, 0, { pitch: 0.5, dist: 40, ship: false, camYaw: 0.5 });
    await hold(7000, P); await shot('x12-a'); console.log('   ', await ev(`JSON.stringify({ tiles: ORBIS.terrain.tiles.size, pend: ORBIS.terrain.pending, globe: ORBIS.globeView.group.visible, cloud: ORBIS.scene.fog.density, tr: ORBIS.terrain.material.transparent })`));
    await ev(`(() => { ORBIS.scene.traverse(o => { if (o.renderOrder === 2 && o.isMesh) o.material.visible = false; }); return 1; })()`); await hold(1500, P); await shot('x12-noclouds'); console.log('   mats', await ev(`JSON.stringify(ORBIS.globeView.mats.map(m => [m.uniforms.map.value.image.width, m.uniforms.thick?.value]).slice(0, 2))`)); await ev(`(() => { ORBIS.terrain.parent.visible = false; for (const t of ORBIS.terrain.tiles.values()) if (t.mesh) t.mesh.visible = false; return 1; })()`); await hold(1000, P); await shot('x12-noland');
  }
  if (want('scan')) {
    for (let i = 0; i < 80 && !(await ev('ORBIS.capitalView.models.meridian_decks ? 1 : 0')); i++) { await ev(`(() => { const O = ORBIS, C = O.fleet[0], f = O.getFlight(); f.pos[0] = C.x; f.pos[1] = C.y + 300; f.pos[2] = C.z; return 1; })()`); await sleep(500); }
    console.log('   scan', await ev(`(() => { const out = []; for (const { g, slot } of ORBIS.capitalView.models.meridian_decks || []) { const P = g.attributes.position, I = g.index; for (let t = 0; t < I.count; t += 3) { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9; for (let k = 0; k < 3; k++) { const i = I.getX(t + k), x = P.getX(i), y = P.getY(i), z = P.getZ(i); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } if (x1 - x0 < 0.3 && x0 > 16 && x1 < 18 && z1 - z0 > 6) out.push([slot, +x0.toFixed(2), +x1.toFixed(2), +y0.toFixed(2), +y1.toFixed(2), +z0.toFixed(1), +z1.toFixed(1)]); } } return JSON.stringify(out.slice(0, 24)); })()`));
  }
  if (want('top')) { await hold(5000, () => place(0, 700, 0, { ship: true, pitch: 0.86, dist: 26, camYaw: 0.4, agl: true })); await shot('12-ship-from-above'); }
  if (want('farside')) {
    const far = await ev(`(() => { const G = __g, O = ORBIS; for (let k = 0; k < 3000; k++) { const a = k * 2.399963, y = 0.5 - k / 3000, r = Math.sqrt(1 - y * y), [x, z] = __G.fromSphere(G, [-Math.cos(a) * r, y, -Math.abs(Math.sin(a)) * r]); if (__G.wellInside(G, x, z, 90000) && __T.rawHeight(O.planet, x, z) > 40) return [x, z]; } return null; })()`);
    await hold(12000, () => place(far[0], 900, far[1], { pitch: 0.1, ship: true, dist: 34, camYaw: 0.5, agl: true }));
    console.log('   far side', await ev(`Math.round(__G.surfaceDistance(__g, 0, 0, ${far[0]}, ${far[1]}) / 1000) + ' km from home'`));
    await shot('07-far-side');
  }
  if (want('roads')) {
    // straight down the road from the air, at a third of the way along, and over a bridge if there is one
    const seg = await ev(`(() => { const W = __Rs[0], i = Math.floor(W.pts.length * 0.4), a = W.pts[i], b = W.pts[i + 8]; return [a[0], a[1], Math.atan2(b[0] - a[0], b[1] - a[1])]; })()`);
    await hold(9000, () => place(seg[0], 170, seg[1], { yaw: seg[2], pitch: 0.34, dist: 60, agl: true }));
    await shot('08-road-from-the-air');
    const end = await ev(`(() => { const W = __Rs[0], i = Math.floor(W.pts.length * 0.85), a = W.pts[i], b = W.pts[i + 8]; return [a[0], a[1], Math.atan2(b[0] - a[0], b[1] - a[1])]; })()`);
    await hold(10000, () => place(end[0], 240, end[1], { yaw: end[2], pitch: 0.2, dist: 40, agl: true }));
    await shot('09-road-into-the-next-town');
  }
  if (want('ground')) {
    await load('hour=16');
    const walk = (x, z, yaw, { pitch = 0.08, dist = 5.5 } = {}) => ev(`(() => { const O = ORBIS, x = ${x}, z = ${z}, h = O.world.groundAt(x, z, 1e4).h; O.ctrl.mode = 'walk'; O.ctrl.pos = [x, h + 0.02, z]; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = ${yaw}; O.cam.yaw = ${yaw}; O.cam.pitch = ${pitch}; O.cam.dist = ${dist}; return h; })()`);
    const pick = f => ev(`(() => { const W = __Rs[0], i = Math.floor(W.pts.length * ${f}), a = W.pts[i], b = W.pts[i + 6]; return [a[0], a[1], Math.atan2(b[0] - a[0], b[1] - a[1])]; })()`);
    let p = await pick(0.5); await hold(8000, () => walk(p[0], p[1], p[2])); await shot('10-standing-on-the-road');
    const br = await ev(`(() => { for (const W of __Rs) if (W.bridges.length) { const B = W.bridges[0], i = B.from ?? B.i0 ?? null; return { keys: Object.keys(B), i, W: __Rs.indexOf(W) }; } return null; })()`); console.log('   bridge', JSON.stringify(br));
    await hold(5000, () => ev(`(() => { const O = ORBIS, s = O.homeS; O.ctrl.mode = 'walk'; O.ctrl.pos = [s.cx, O.world.groundAt(s.cx, s.cz, 1e4).h + 0.02, s.cz]; O.ctrl.vel = [0, 0, 0]; O.cam.pitch = 0.08; O.cam.dist = 5.5; return 1; })()`));
    await shot('11-home-town-street');
  }
  if (want('ships')) {
    let paintN = Number(process.env.PAINT0 || 0);
    for (const m of (process.env.SHIPS || 'racer0,gunship0,dropship0,hauler0,miner0,ferry0,explorer0,runabout0').split(',')) {
      await load('hour=15&fly=' + m + '&paint=' + (paintN++ % 7));
      const got = await ev(`ORBIS.getFlight()?.sh?.model || ORBIS.getFlight()?.ship?.model || '?'`).catch(() => '?'); console.log('   flying', got);
      await hold(3000, () => place(0, 600, 0, { ship: true, pitch: 0.2, dist: 26, agl: true }));
      // the camera trails the ship in flight: for a picture, swing it round. Same target, other side.
      await ev(`(() => { const O = ORBIS, R = O.renderer, r0 = R.render.bind(R), d = new O.camera.position.constructor(); window.__orbit = [0, 0, 0]; R.render = (sc, ca) => { if (ca === O.camera && window.__orbit) { ca.getWorldDirection(d); const dist = O.cam.dist, c = ca.position.clone().addScaledVector(d, dist), yaw = O.getFlight().facing + window.__orbit[0], el = window.__orbit[1], L = window.__orbit[2]; ca.position.set(c.x + Math.sin(yaw) * Math.cos(el) * L, c.y + Math.sin(el) * L, c.z + Math.cos(yaw) * Math.cos(el) * L); ca.lookAt(c); ca.updateMatrixWorld(); } r0(sc, ca); if (ca === O.camera) { } }; return 1; })()`);
      const L = await ev(`Math.max(13, ORBIS.getFlight().L.D * 1.2)`), views = [['front', 0.75, 0.16], ['side', 1.6, 0.05], ['aft', 2.5, 0.28], ['top', 0.4, 0.95]];
      for (const [n, ya, el] of views) { await ev(`(window.__orbit = [${ya}, ${el}, ${L}], 1)`); await hold(1200, () => place(0, 600, 0, { ship: true, pitch: 0.2, dist: 26, agl: true })); await shot('ship-' + m + '-' + n); if (process.env.ONEVIEW && n === 'front') break; }
    }
  }
  if (want('fleet')) {
    await load('hour=' + (process.env.HOUR || 15) + '&fly');
    for (let i = 0; i < 60 && !(await ev('ORBIS.capitalView.models.longshore ? 1 : 0')); i++) await sleep(500);
    const look = (C, off, ship = false) => ev(`(() => { const O = ORBIS, C = O.fleet.find(c => c.model === '${C}'), f = O.getFlight(), c = Math.cos(C.yaw), s = Math.sin(C.yaw), [a, b, d] = ${JSON.stringify(off)}, x = C.x + a * c + d * s, z = C.z - a * s + d * c, y = C.y + b, yaw = Math.atan2(C.x - x, C.z - z), pt = Math.atan2(C.y - y, Math.hypot(C.x - x, C.z - z)); f.pos[0] = x; f.pos[1] = y; f.pos[2] = z; f.vel = [0, 0, 0]; f.throttle = 0; f.q = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]; f.syncEuler(); O.cam.dist = 1; O.cam.pitch = -pt; O.cam.yaw = yaw; O.shipView.group.visible = ${ship}; return 1; })()`);
    for (const [C, views] of [['bastion', { bow: [420, 90, 800], beam: [950, 60, -60], aft: [-340, 170, -880], top: [260, 760, 200], close: [260, 70, -560], deck: [120, 150, -340] }], ['meridian', { bow: [640, 200, 1200], beam: [1400, 120, 0], aft: [-500, 200, -1300], close: [300, 60, 720], ring: [520, 140, 300] }], ['halcyon', { bow: [420, 90, 700], beam: [950, 60, -30], aft: [-420, 180, -700], top: [340, 620, 80] }], ['longshore', { bow: [420, 160, 1250], beam: [1300, 200, -60], aft: [-420, 180, -1380], close: [200, 90, 900], stern: [160, 60, -1050] }], ['anvil', { bow: [1500, 500, 2900], aft: [-1400, 700, -3000], top: [900, 1700, -300] }], ['vesper', { bow: [2200, 600, 4300], aft: [-2000, 900, -4300], top: [1500, 2200, -600] }], ['tiller', { bow: [1200, 500, 3700], aft: [-1300, 500, -3400], top: [1000, 1500, 300] }], ['sable', { bow: [900, 500, 2000], aft: [-900, 400, -1800], top: [500, 1500, 100] }]])
      for (const [n, off] of Object.entries(views)) { if (process.env.VIEWS && !process.env.VIEWS.split(',').includes(C + '-' + n)) continue; await hold(2500, () => look(C, off)); await shot('fleet-' + C + '-' + n); }
  }
  if (want('decks')) {
    await load('hour=' + (process.env.HOUR || 15) + '&fly=runabout0');
    for (let i = 0; i < 80 && !(await ev('ORBIS.capitalView.models.longshore ? 1 : 0')); i++) await sleep(500);
    for (const C of ['bastion', 'meridian', 'longshore', 'halcyon']) {
      // land on the deck like anyone would: lined up outside, then set down inside. Report what the game says.
      const R = await ev(`(async () => { const O = ORBIS, C = O.fleet.find(c => c.model === '${C}'), f = O.getFlight(), at = C.ship.at, fx = Math.sin(at.facing), fz = Math.cos(at.facing), D = C.deckD, wait = ms => new Promise(r => setTimeout(r, ms)), x = at.c[0] - fx * D * 0.22, z = at.c[2] - fz * D * 0.22; f.pos[0] = x; f.pos[1] = at.c[1] + 4.4; f.pos[2] = z; f.vel = [0, 0, 0]; f.throttle = 0; f.onGround = false; const y = at.facing; f.q = [0, Math.sin(y / 2), 0, Math.cos(y / 2)]; f.syncEuler(); O.cam.dist = 26; O.cam.pitch = 0.1; dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' })); for (let i = 0; i < 180 && !f.onGround; i++) await wait(100); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ' })); await wait(800); const out = { onGround: f.onGround, y: +(f.pos[1] - at.c[1]).toFixed(2), impact: f.impact, problem: f.landingProblem?.(), inDeck: O.world.locate(f.pos[0], f.pos[1] + 2, f.pos[2])?.room?.label || O.world.locate(f.pos[0], f.pos[1] + 2, f.pos[2])?.room?.purpose };
        // walk it: stand on the deck beyond the ship, through the hatch, down to the far end
        const stand = (d, h = 1) => [at.c[0] + fx * d, at.c[1] + h + 0.05, at.c[2] + fz * d]; const fl0 = O.setFlightForTest; O.setFlightForTest(null); O.ctrl.mode = 'walk'; O.shipView.group.visible = true; O.ctrl.pos = stand(-D / 2 + 40); O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = y; O.cam.yaw = y; O.cam.pitch = 0.12; O.cam.dist = 4.5; O.syncAvatar?.(); await wait(600); out.floor = +(O.ctrl.pos[1] - at.c[1]).toFixed(2); out.room0 = O.world.locate(...O.ctrl.pos)?.room?.label; dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); let rooms = new Set(); for (let i = 0; i < 60; i++) { O.cam.yaw = y; await wait(100); const l = O.world.locate(...O.ctrl.pos)?.room?.label; if (l) rooms.add(l); } dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); out.rooms = [...rooms]; out.walked = +Math.hypot(O.ctrl.pos[0] - stand(-D / 2 + 40)[0], O.ctrl.pos[2] - stand(-D / 2 + 40)[2]).toFixed(1); out.yEnd = +(O.ctrl.pos[1] - at.c[1]).toFixed(2); O.setFlightForTest(f); O.ctrl.mode = 'pilot'; return out; })()`);
      console.log('   ', C, JSON.stringify(R)); await sleep(2500); await shot('deck-' + C + '-hangar');
      await ev(`(async () => { const O = ORBIS, C = O.fleet.find(c => c.model === '${C}'), at = C.ship.at, fx = Math.sin(at.facing), fz = Math.cos(at.facing), f = O.getFlight(); f.pos[0] = at.c[0] - fx * 400; f.pos[2] = at.c[2] - fz * 400; f.vel = [0, 0, 0]; f.pos[1] = at.c[1]; const y = at.facing; f.q = [0, Math.sin(y / 2), 0, Math.cos(y / 2)]; f.syncEuler(); O.cam.dist = 26; O.cam.pitch = 0.05; return 1; })()`); await sleep(1500); await shot('deck-' + C + '-approach');
    }
  }
  if (want('inside')) {
    await load('hour=' + (process.env.HOUR || 15) + '&fly=runabout0');
    for (let i = 0; i < 80 && !(await ev('ORBIS.capitalView.models.longshore ? 1 : 0')); i++) await sleep(500);
    for (const C of (process.env.FLEET || 'bastion,meridian,longshore,halcyon').split(',')) {
      const rooms = await ev(`(() => { const O = ORBIS, C = O.fleet.find(c => c.model === '${C}'), at = C.ship.at, fx = Math.sin(at.facing), fz = Math.cos(at.facing), f = O.getFlight(); window.__f = f; f.pos[0] = at.c[0] - fx * 60; f.pos[1] = at.c[1] + 2; f.pos[2] = at.c[2] - fz * 60; f.vel = [0, 0, 0]; f.throttle = 0; O.setFlightForTest(null); O.ctrl.mode = 'walk'; O.shipView.group.visible = false; return O.world.locate ? C.ship.layoutRooms || null : null; })()`);
      for (let i = 0; i < 120 && !(await ev(`ORBIS.capitalView.models.${C}_decks ? 1 : 0`)); i++) await sleep(500);      // (each ship's insides load when you come near it)
      const L = JSON.parse(await (await fetch('http://127.0.0.1:' + PORT + '/assets/ships/capital.json')).text())[C + '_decks'];
      if (process.env.DBG) { await sleep(3000); console.log('   dbg', await ev(`(() => { const O = ORBIS, C = O.fleet.find(c => c.model === '${C}'), V = O.capitalView, g = C.decks; return JSON.stringify({ models: Object.keys(V.models), n: V.models['${C}_decks']?.length, decks: !!g, vis: g?.visible, kids: g?.children.length, pos: g?.position?.toArray(), cam: O.camera.position.toArray(), player: O.ctrl.pos, at: C.ship.at.c, slots: V.models['${C}_decks']?.map(m => m.slot + ':' + m.g.attributes.position.count) }); })()`)); }
      for (const R of L.rooms) { const [x0, z0, x1, z1] = R.rect, mid = (z0 + z1) / 2, tag = R.label.replace(/[^a-z]+/g, '-'), big = R.purpose === 'hold';
        for (const [n, zz, back] of big ? [['in', z0 + 8, 0], ['out', z1 - 4, 1]] : [['', z0 + 4.5, 0]]) {
          const stand = () => ev(`(() => { const O = ORBIS, C = O.fleet.find(c => c.model === '${C}'), at = C.ship.at, fx = Math.sin(at.facing), fz = Math.cos(at.facing), lx = Math.cos(at.facing), lz = -Math.sin(at.facing), d = ${zz} - C.deckD / 2, sx = ${big ? -6 : 0}, x = at.c[0] + fx * d + lx * sx, z = at.c[2] + fz * d + lz * sx; O.setFlightForTest(null); O.ctrl.mode = 'walk'; O.ctrl.pos = [x, at.c[1] + 1.05, z]; O.ctrl.vel = [0, 0, 0]; const y = at.facing + ${back ? Math.PI : 0}; O.ctrl.facing = y; O.cam.yaw = y; O.cam.pitch = ${big ? 0.02 : 0.0}; O.cam.dist = 2.6; return 1; })()`);
          await hold(1800, stand); if (process.env.DBG) console.log('   dbg2', await ev(`(() => { const O = ORBIS, C = O.fleet.find(c => c.model === '${C}'), g = C.decks; g?.updateWorldMatrix(true, true); return JSON.stringify({ decks: !!g, vis: g?.visible, grp: O.capitalView.group.visible, kids: g?.children.length, pos: g?.position?.toArray(), yaw: g?.rotation.y, cam: O.camera.position.toArray(), player: O.ctrl.pos, deckW: C.deckW, deckD: C.deckD, atc: C.ship.at.c, facing: C.ship.at.facing, mat: g?.children[0]?.material?.type, bs: (g?.children[2]?.geometry?.computeBoundingBox(), g?.children[2]?.geometry.boundingBox) }); })()`)); await shot('in-' + C + '-' + tag + (n ? '-' + n : ''));
        }
      }
      await ev(`(() => { const O = ORBIS; O.setFlightForTest(window.__f); O.ctrl.mode = 'pilot'; return 1; })()`);
    }
  }
  if (want('rings')) {
    await load('hour=' + (process.env.HOUR || 11) + '&fly=runabout0');
    for (let i = 0; i < 80 && !(await ev('ORBIS.capitalView.models.meridian_ring0 ? 1 : 0')); i++) await sleep(500);
    // in each ring: stand at a spoke's foot, look down the way, up the curve, across; report what the game says about where you are and what holds you down
    const spots = JSON.parse(process.env.SPOTS || '[[0,0,-4,0,0.05,"street"],[0,0,-30,0,0.32,"up"],[0,0,-60,1.57,0.1,"across"],[1,2,-40,0,0.12,"glade"],[1,2,-40,3.14,0.25,"back"],[2,3,-60,0,0.12,"fields"],[0,1,-90,0,0.08,"canal"]]');
    for (const [ri, k, ds, turn, pitch, tag] of spots) {
      const R = await ev(`(async () => { const O = ORBIS, b = O.ringStructs[${ri}], g = b.plan.ring, wait = ms => new Promise(r => setTimeout(r, ms)); O.setFlightForTest(null); O.ctrl.mode = 'walk';
        const sk = (${k} + 0.5) * g.C / 6 + ${ds}, lx = ${tag === 'canal' ? 17.5 : tag === 'street' ? 17 : 20}, p = [b.O[0] + b.ex[0] * lx + b.ez[0] * sk, b.O[1] + b.ex[1] * lx + b.ez[1] * sk], [x, z] = O.homeS.toWorld(p[0], p[1]); O.ctrl.pos = [x, b.base + 1.0, z]; O.ctrl.vel = [0, 0, 0];
        const [fx, fz] = O.world.fromBVec(b, 0, 1), [ax, az] = O.world.fromBVec(b, 1, 0), yaw = Math.atan2(fx, fz) + ${turn}; O.ctrl.facing = yaw; O.cam.yaw = yaw; O.cam.pitch = ${pitch}; O.cam.dist = 3.2; await wait(2500);
        return { here: O.ringHere()?.key, room: O.world.locate(...O.ctrl.pos)?.room?.label, y: +(O.ctrl.pos[1] - b.base).toFixed(2), grounded: O.ctrl.grounded, spin: O.ctrl.spin && +(O.ctrl.spin.w2 * O.ctrl.spin.R).toFixed(2), vis: O.ringView.group.visible, built: O.ringView.built }; })()`);
      const perf = await ev(`new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r({ ms: +((performance.now() - t0) / n).toFixed(1), tris: ORBIS.renderer.info.render.triangles, calls: ORBIS.renderer.info.render.calls }); }; requestAnimationFrame(f); })`);
      console.log('   ring', tag, JSON.stringify(R), JSON.stringify(perf)); await sleep(1500); await shot('ring-' + tag);
    }
    // the lift: from the Meridian's promenade into the Commons
    const L = await ev(`(async () => { const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms)), M = O.meridianLift(); if (!M) return 'no decks'; O.ctrl.pos = [M.at[0], M.at[1] + 0.05, M.at[2]]; O.ctrl.vel = [0, 0, 0]; await wait(800); const lf = O.liftNear(); return lf ? lf.L.stops.map(q => q.label) : 'no lift here'; })()`);
    console.log('   lift', JSON.stringify(L));
  }
  if (want('jets')) {
    await load('hour=' + (process.env.HOUR || 15) + '&fly=' + (process.env.SHIP || 'runabout0'));
    await ev(`(() => { const O = ORBIS, R = O.renderer, r0 = R.render.bind(R), d = new O.camera.position.constructor(); window.__orbit = null; R.render = (sc, ca) => { if (ca === O.camera && window.__orbit) { ca.getWorldDirection(d); const dist = O.cam.dist, c = ca.position.clone().addScaledVector(d, dist), yaw = O.getFlight().facing + window.__orbit[0], el = window.__orbit[1], L = window.__orbit[2]; ca.position.set(c.x + Math.sin(yaw) * Math.cos(el) * L, c.y + Math.sin(el) * L, c.z + Math.cos(yaw) * Math.cos(el) * L); ca.lookAt(c); ca.updateMatrixWorld(); } r0(sc, ca); }; return 1; })()`);
    const setup = (js, orbit) => ev(`(async () => { const O = ORBIS, f = O.getFlight(), wait = ms => new Promise(r => setTimeout(r, ms)); window.__orbit = ${JSON.stringify(orbit)}; ${js}; await wait(2500); return { thr: f.throttle, hover: +f.hover.toFixed(2), agl: Math.round(f.altitude()), gear: O.shipView.gearOf(f.ship.id) }; })()`);
    const shots = [
      ['cruise', `f.pos[1] = Math.max(f.pos[1], 900); f.throttle = 1; f.vtol = false`, [2.7, 0.15, 26]],
      ['burner', `f.throttle = 1; dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }))`, [2.3, 0.05, 22]],
      ['hover', `dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' })); const g = O.world.groundAt(f.pos[0], f.pos[2], 1e4).h; f.pos[1] = g + 7; f.vel = [0, 0, 0]; f.throttle = 0; f.vtol = true; f.onGround = false; f.q = (await import('./js/player/flight.js')).fromEuler(f.facing, 0, 0)`, [1.6, 0.08, 20]],
      ['landed', `const g = O.world.groundAt(f.pos[0], f.pos[2], 1e4).h; for (let i = 0; i < 80 && !f.onGround; i++) { dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' })); await wait(100); } dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ' }))`, [1.9, 0.1, 15]],
      ['damaged', `const c = O.war.craft.find(c => c.f === f); if (c) c.hp = c.maxHp * 0.12; f.onGround = false; f.pos[1] += 900; f.throttle = 0.8; f.vtol = false`, [2.6, 0.12, 28]],
    ];
    for (const [tag, js, orbit] of shots) { const r = await setup(js, orbit); console.log('   jets', tag, JSON.stringify(r)); await shot('jets-' + tag); }
  }
  if (want('cockpit')) {
    await load('hour=14&fly=' + (process.env.SHIP || 'runabout0'));
    for (const [tag, roll, pitch] of [['level', 0, 0], ['bank', 0.7, 0.1]]) {
      await ev(`(ORBIS.setCockpitView(true), 1)`);
      await hold(1500, () => ev(`(async () => { const O = ORBIS, f = O.getFlight(), F = await import('./js/player/flight.js'); f.q = F.fromEuler(f.facing, ${pitch}, ${roll}); f.w = [0, 0, 0]; f.syncEuler(); f.vel = [Math.sin(f.facing) * 120, 0, Math.cos(f.facing) * 120]; f.pos[1] = Math.max(f.pos[1], 1200); return 1; })()`));
      await shot('cockpit-' + tag);
    }
  }
  if (want('dock')) {
    await load('hour=15&fly=runabout0');
    for (let i = 0; i < 80 && !(await ev('ORBIS.capitalView.models.longshore ? 1 : 0')); i++) await sleep(500);
    for (const [C, off] of (process.env.DOCKS ? JSON.parse(process.env.DOCKS) : [['bastion', [600, 120, 500]], ['vesper', [1400, 200, -900]], ['meridian', [-700, -80, -900]], ['longshore', [400, 60, 0]]])) {
      const R = await ev(`(async () => { const O = ORBIS, C = O.fleet.find(c => c.model === '${C}'), f = O.getFlight(), wait = ms => new Promise(r => setTimeout(r, ms)), c = Math.cos(C.yaw), s = Math.sin(C.yaw), [a, b, d] = ${JSON.stringify(off)};
        f.pos[0] = C.x + a * c + d * s; f.pos[1] = C.y + b; f.pos[2] = C.z - a * s + d * c; f.vel = [0, 0, 0]; f.onGround = false; f.throttle = 0.4; await wait(300);
        const tg = O.dockTarget(); if (!tg || tg.C.model !== '${C}') return { target: tg?.C?.model || null };
        out.landWhy = O.getFlight()?.landingProblem(); out.atDock = { onG: O.getFlight()?.onGround, sp: +O.getFlight()?.speed.toFixed(2), y: local(O.getFlight().pos)[1] };
      dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' })); const t0 = performance.now(); let hit = 0;
        let maxTop = -99, roof = 0; for (let i = 0; i < 1500 && O.getDocking(); i++) { await wait(100); if (O.getFlight().impact > 0) hit++; const D = O.getDocking(); if (D && D.s > D.sIn - 5) { const fl = O.getFlight(); maxTop = Math.max(maxTop, fl.pos[1] + (fl.L.H ?? 5) - D.deckY); } if (D && !window.__appShot && D.s > D.sMid - 30) { window.__appShot = 1; window.__pause = true; break; } }
        window.__appShot = 0;
        const fl = O.getFlight(), loc = O.world.locate(fl.pos[0], fl.pos[1] + 1, fl.pos[2]);
        const D = O.getDocking(); return { paused: !!D, target: tg.C.model, secs: Math.round((performance.now() - t0) / 1000), done: !D, at: D ? +(D.s / D.end).toFixed(2) : null, onGround: fl.onGround, room: loc?.room?.label, key: loc?.b?.key, deckLocal: (() => { const b = [...O.world.loose.map(q => q.b), ...[...O.world.grid.values()].flat()].find(q => q.key === tg.C.ship.id); if (!b) return 'no decks'; const [lx, lz] = O.world.toB(b, fl.pos[0], fl.pos[2]); return [+lx.toFixed(1), +lz.toFixed(1), +(fl.pos[1] - b.base).toFixed(2)]; })(), hits: hit, problem: fl.landingProblem() }; })()`);
      if (R.paused) { await shot('dockapp-' + C); const R2 = await ev(`(async () => { const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms)); let maxTop = -99, hit = 0; for (let i = 0; i < 1500 && O.getDocking(); i++) { await wait(100); const D = O.getDocking(), fl = O.getFlight(); if (fl.impact > 0) hit++; if (D && D.s > D.sIn - 5) maxTop = Math.max(maxTop, fl.pos[1] + (fl.L.H ?? 5) - D.deckY); } const fl = O.getFlight(), loc = O.world.locate(fl.pos[0], fl.pos[1] + 1, fl.pos[2]); return { done: !O.getDocking(), onGround: fl.onGround, room: loc?.room?.label, hits: hit, topOverDeckThroughDoors: +maxTop.toFixed(2), problem: fl.landingProblem() }; })()`); Object.assign(R, R2); }
      console.log('   dock', C, JSON.stringify(R)); await shot('dock-' + C);
    }
  }
  if (want('bodies')) {
    // nobody walks through anything: sample everyone on foot near you, count who's inside something solid or inside someone else
    for (const where of (process.env.WHERE || 'town,city').split(',')) for (const off of ['nojostle', '']) {
      await load('hour=12' + (off ? '&' + off : ''));
      if (where === 'city') console.log('   to the city', await ev(`(async () => { const O = ORBIS, C = O.city, [x, z] = O.world.resolve(C.cx + 40, C.cz + 40, 0, 0.4); O.ctrl.pos = [x, O.world.groundAt(x, z, 400).h + 0.1, z]; O.ctrl.vel = [0, 0, 0]; await new Promise(r => setTimeout(r, 4000)); return JSON.stringify({ at: O.ctrl.pos.map(Math.round), walkers: (window.__walkers || []).length }); })()`));
      const R = await ev(`(async () => { const O = ORBIS, w = O.world, wait = ms => new Promise(r => setTimeout(r, ms)); await wait(3000); let n = 0, solid = 0, pair = 0, t0 = performance.now(), frames = 0; const ex = [];
        for (let i = 0; i < 60; i++) { await wait(150); const L = O.getAgents().concat(window.__walkers || []).filter(a => a.moving && a.pose !== 'lie');
          for (const a of L) { n++; const q = w.resolve(a.pos[0], a.pos[2], a.pos[1] + 0.05, 0.18, 1.7, true); if (Math.hypot(q[0] - a.pos[0], q[1] - a.pos[2]) > 0.02) { solid++; if (ex.length < 4) ex.push([String(a.id).slice(0, 18), a.pos.map(v => +v.toFixed(1))]); } }
          for (let x = 0; x < L.length; x++) for (let y = x + 1; y < L.length; y++) if (Math.abs(L[x].pos[1] - L[y].pos[1]) < 1 && Math.hypot(L[x].pos[0] - L[y].pos[0], L[x].pos[2] - L[y].pos[2]) < 0.36) pair++; }
        return { samples: n, insideSolid: solid, overlappingPairs: pair, ex }; })()`);
      console.log('   bodies', where, off || 'jostle', JSON.stringify(R));
      if (!off) console.log('   walk into someone', await ev(`(async () => { const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms)), c = O.ctrl; const L = O.getAgents().concat(window.__walkers || []).filter(a => a.pose !== 'lie' && Math.abs(a.pos[1] - c.pos[1]) < 3).sort((a, b) => Math.hypot(a.pos[0] - c.pos[0], a.pos[2] - c.pos[2]) - Math.hypot(b.pos[0] - c.pos[0], b.pos[2] - c.pos[2])); const a = L[0]; if (!a) return 'nobody';
        let min = 99; for (let i = 0; i < 40; i++) { const b = O.getAgents().concat(window.__walkers || []).find(q => q.id === a.id); if (!b) break; const d = Math.hypot(b.pos[0] - c.pos[0], b.pos[2] - c.pos[2]); if (i === 0) { c.pos = [b.pos[0] - 2.5, b.pos[1] + 0.05, b.pos[2]]; c.vel = [0, 0, 0]; } O.cam.yaw = Math.atan2(b.pos[0] - c.pos[0], b.pos[2] - c.pos[2]); c.facing = O.cam.yaw; dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); await wait(60); if (i > 2) min = Math.min(min, d); }
        dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); return JSON.stringify({ who: String(a.id).slice(0, 20), minGap: +min.toFixed(2) }); })()`));
    }
  }
  if (want('climbfix')) {
    // the arms and head through a climb: every frame, each elbow's bend, each forearm's roll and how far the head is tipped back on the chest; then close views
    await load('hour=11');
    for (let i = 0; i < 120 && !(await ev('window.__body ? 1 : 0')); i++) await sleep(500);
    const R = await ev(`(async () => { const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms)), H = await import('./js/gen/holds.js'), c = O.ctrl, w = O.world;
      let got = null; const s = O.s;
      for (const b of s.buildings) { if (b.type === 'house') continue; const fl = []; const [x0, , z0] = (await import('./js/gen/place.js')).buildingToWorld(s, b, 0, 0, 0); H.facesNear(w, x0, w.groundAt(x0, z0, 1e4).h, z0, 30, f => { if (f.town === b) fl.push(f); });
        for (const f of fl) { if (f.w < 6) continue; const a = f.w * 0.5, x = f.o[0] + f.t[0] * a + f.n[0] * 0.45, z = f.o[1] + f.t[1] * a + f.n[1] * 0.45, y = w.groundAt(x, z, f.y0 + 1).h; if (Math.abs(y - f.y0) > 0.3) continue;
          c.mode = 'walk'; c.pos = [x, y, z]; c.vel = [0, 0, 0]; c.facing = Math.atan2(-f.n[0], -f.n[1]); if (c.grabWall()) { got = f; break; } }
        if (got) break; }
      if (!got) return { none: true };
      const rig = O.avatar.rig, V = () => new THREE.Vector3(), T = await import('three'); const THREE = T;
      const flex = s => { const a = rig.arms[s][0].getWorldPosition(new THREE.Vector3()), b = rig.arms[s][1].getWorldPosition(new THREE.Vector3()), c2 = rig.arms[s][2].getWorldPosition(new THREE.Vector3()); return 180 - a.sub(b).angleTo(c2.sub(b)) * 180 / Math.PI; };
      const upOf = b => new THREE.Vector3(0, 1, 0).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()));
      const S = { lf: [], rf: [], ltw: [], rtw: [], head: [], headDrop: [], gap: [] };
      for (let i = 0; i < 40; i++) { if (i % 10 === 0) dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); if (i % 10 === 6) dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); await wait(110);
        S.lf.push(flex('l')); S.rf.push(flex('r')); S.ltw.push((rig.hands.l.lastTw || 0) * 57.3); S.rtw.push((rig.hands.r.lastTw || 0) * 57.3);
        const hd = rig.head, sp = rig.spine[2]; S.head.push(upOf(hd).angleTo(upOf(sp)) * 57.3);
        const hp = hd.getWorldPosition(new THREE.Vector3()), sh = rig.arms.l[0].getWorldPosition(new THREE.Vector3()).add(rig.arms.r[0].getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5); S.headDrop.push((hp.y - sh.y) * 100); const Wl = O.ctrl.wall?.limb; if (Wl?.lh.hold && Wl.lf.hold) S.gap.push((Math.min(Wl.lh.hold.p[1], Wl.rh.hold.p[1]) - Math.max(Wl.lf.hold.p[1], Wl.rf.hold.p[1])) * 100); }
      dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); await wait(1200);
      const st = a => ({ min: +Math.min(...a).toFixed(0), max: +Math.max(...a).toFixed(0), mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(0) });
      return { ...Object.fromEntries(Object.entries(S).map(([k, v]) => [k, st(v)])), ltwAll: S.ltw.map(x => Math.round(x)).join(' '), rtwAll: S.rtw.map(x => Math.round(x)).join(' '), lfAll: S.lf.map(x => Math.round(x)).join(' '), gapAll: S.gap.map(x => Math.round(x)).join(' '), relaxed: O.ctrl.wall?.relaxed, strictN: O.ctrl.wall?.strictN }; })()`);
    console.log('   arms/head', JSON.stringify(R));
    await ev(`(() => { const O = ORBIS, R = O.renderer, r0 = R.render.bind(R); R.render = (sc, ca) => { const C = window.__shotCam; if (ca === O.camera && C) { ca.position.set(...O.toRender(...C.pos)); ca.lookAt(...O.toRender(...C.look)); ca.updateMatrixWorld(); } return r0(sc, ca); }; return 1; })()`);
    const views = [['headback', 0, 0.75, 1.3, 0.55], ['lelbow', -0.9, 0.55, 0.9, 0.5], ['relbow', 0.9, 0.55, 0.9, 0.5], ['headside', 1.3, 0.6, 0.6, 0.55]];
    for (const [tag, side, up, back, lookUp] of views) {
      await ev(`(async () => { const O = ORBIS, W = O.ctrl.wall, P = W.pose(), n = W.normal, R = W.right(), at = P.pelvis;
        window.__shotCam = { pos: [at[0] + n[0] * ${back} + R[0] * ${side}, at[1] + ${up}, at[2] + n[2] * ${back} + R[2] * ${side}], look: [at[0] + R[0] * ${side} * 0.25, at[1] + ${lookUp}, at[2] + R[2] * ${side} * 0.25] };
        await new Promise(r => setTimeout(r, 600)); return 1; })()`);
      await shot('climbfix-' + tag);
    }
    await ev('(window.__shotCam = null, 1)');
  }
  if (want('climbstrain')) {
    // How far the skin is from its standing shape: every edge of the body mesh measured in the idle pose, then through a climb; per body part,
    // how much the edges stretch or squash (|posed/idle - 1|), and a few lengths across the body
    await load('hour=11');
    for (let i = 0; i < 120 && !(await ev('window.__body ? 1 : 0')); i++) await sleep(500);
    await sleep(1500);
    const R = await ev(`(async () => { const O = ORBIS, THREE = await import('three'), wait = ms => new Promise(r => setTimeout(r, ms)), H = await import('./js/gen/holds.js'), c = O.ctrl, w = O.world;
      let body = null; O.avatar.object.traverse(o => { if (o.isSkinnedMesh && /body/i.test(o.name)) body = o; });
      const g = body.geometry, idx = g.index.array, N = g.attributes.position.count, sw = g.attributes.skinWeight, si = g.attributes.skinIndex, bones = body.skeleton.bones;
      const dom = new Array(N); for (let i = 0; i < N; i++) { let b = 0, wm = 0; for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > wm) { wm = sw.getComponent(i, k); b = si.getComponent(i, k); } dom[i] = bones[b].name.replace(/_0?\\d$|_[lr]$/g, '').replace(/_0\\d/, '').replace(/_[lr]$/, ''); }
      const E = new Set(); for (let t = 0; t < idx.length; t += 3) for (const [a, b] of [[idx[t], idx[t + 1]], [idx[t + 1], idx[t + 2]], [idx[t + 2], idx[t]]]) E.add(a < b ? a * 1e6 + b : b * 1e6 + a);
      const edges = [...E].map(k => [Math.floor(k / 1e6), k % 1e6]);
      const snap = () => { body.updateMatrixWorld(true); body.skeleton.update(); const P = new Float32Array(N * 3), v = new THREE.Vector3(); for (let i = 0; i < N; i++) { body.getVertexPosition(i, v); v.applyMatrix4(body.matrixWorld); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; } return P; };
      const L = (P, a, b) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
      const idle = snap(), L0 = edges.map(([a, b]) => L(idle, a, b));
      // landmarks on the skin, picked in the idle pose: the top of each shoulder, the back of the neck, the small of the back, the widest of
      // the waist and the hips, the crown; the same vertices measured again on the wall
      const rig = O.avatar.rig, bp = b => b.getWorldPosition(new THREE.Vector3()), fw = new THREE.Vector3(0, 0, 1).applyQuaternion(O.avatar.object.getWorldQuaternion(new THREE.Quaternion())), lf = new THREE.Vector3(1, 0, 0).applyQuaternion(O.avatar.object.getWorldQuaternion(new THREE.Quaternion())), V = i => new THREE.Vector3(idle[i * 3], idle[i * 3 + 1], idle[i * 3 + 2]);
      const pick = (near, rad, score, parts) => { let best = -1, bs = -Infinity; for (let i = 0; i < N; i++) { if (!parts.includes(dom[i])) continue; const v = V(i); if (v.distanceTo(near) > rad) continue; const sc = score(v); if (sc > bs) { bs = sc; best = i; } } return best; };
      const ua = { l: bp(rig.arms.l[0]), r: bp(rig.arms.r[0]) }, nk = bp(rig.neck || rig.head), pv = bp(rig.pelvis), s1 = bp(rig.spine[0]), hd = bp(rig.head);
      const T = ['spine', 'clavicle', 'upperarm', 'neck'], Pv = ['pelvis', 'thigh', 'spine'];
      const LM = { shL: pick(ua.l, 0.12, v => v.dot(lf) + v.y * 0.3, T), shR: pick(ua.r, 0.12, v => -v.dot(lf) + v.y * 0.3, T), c7: pick(nk, 0.12, v => -v.dot(fw), ['neck', 'spine']), sacrum: pick(pv, 0.15, v => -v.dot(fw) - Math.abs(v.y - pv.y) * 2, Pv), waistL: pick(s1, 0.25, v => v.dot(lf) - Math.abs(v.y - s1.y) * 4, ['spine']), waistR: pick(s1, 0.25, v => -v.dot(lf) - Math.abs(v.y - s1.y) * 4, ['spine']), hipL: pick(pv, 0.3, v => v.dot(lf) - Math.abs(v.y - pv.y + 0.08) * 4, Pv), hipR: pick(pv, 0.3, v => -v.dot(lf) - Math.abs(v.y - pv.y + 0.08) * 4, Pv), crown: pick(hd, 0.3, v => v.y, ['head']) };
      const D = (P, a, b) => +(L(P, LM[a], LM[b]) * 100).toFixed(1);
      const props = P => ({ shoulders: D(P, 'shL', 'shR'), waist: D(P, 'waistL', 'waistR'), hips: D(P, 'hipL', 'hipR'), back: D(P, 'c7', 'sacrum'), neckToCrown: D(P, 'c7', 'crown'), shToHipL: D(P, 'shL', 'hipL'), shToHipR: D(P, 'shR', 'hipR') });
      window.__props = { idle: props(idle) };
      const strain = (P) => { const by = {}; edges.forEach(([a, b], j) => { if (L0[j] < 1.5e-3) return; const s = Math.abs(L(P, a, b) / L0[j] - 1), r = dom[a]; (by[r] ||= []).push(s); }); const out = {}; for (const [r, a] of Object.entries(by)) { a.sort((x, y) => x - y); out[r] = [a[Math.floor(a.length * 0.5)], a[Math.floor(a.length * 0.95)], a[a.length - 1]].map(x => +(x * 100).toFixed(1)); } return out; };
      // the reference: the body's own run, as authored
      dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' })); await wait(1500); const runF = []; for (let i = 0; i < 6; i++) { await wait(90); runF.push(strain(snap())); } dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' })); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); await wait(900);
      const runAgg = {}; for (const f of runF) for (const [r, v] of Object.entries(f)) { const a = runAgg[r] ||= [0, 0, 0]; v.forEach((x, k) => a[k] = Math.max(a[k], x)); }
      let got = null; const s = O.s;
      for (const b of s.buildings) { if (b.type === 'house') continue; const fl = []; const [x0, , z0] = (await import('./js/gen/place.js')).buildingToWorld(s, b, 0, 0, 0); H.facesNear(w, x0, w.groundAt(x0, z0, 1e4).h, z0, 30, f => { if (f.town === b) fl.push(f); });
        for (const f of fl) { if (f.w < 6) continue; const a = f.w * 0.5, x = f.o[0] + f.t[0] * a + f.n[0] * 0.45, z = f.o[1] + f.t[1] * a + f.n[1] * 0.45, y = w.groundAt(x, z, f.y0 + 1).h; if (Math.abs(y - f.y0) > 0.3) continue;
          c.mode = 'walk'; c.pos = [x, y, z]; c.vel = [0, 0, 0]; c.facing = Math.atan2(-f.n[0], -f.n[1]); if (c.grabWall()) { got = f; break; } }
        if (got) break; }
      if (!got) return { none: true };
      const frames = []; let worst = null;
      for (let i = 0; i < 30; i++) { if (i % 10 === 0) dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); if (i % 10 === 6) dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); await wait(150);
        if (i % 3 === 2) { const st = strain(snap()); frames.push(st); (window.__st ||= []).push(O.ctrl.wall?.state + ':' + (O.ctrl.wall?.moving || '-')); } }
      dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); await wait(1200); const fin = snap(); frames.push(strain(fin)); window.__props.wall = props(fin);
      // per part: the worst over the climb of each statistic
      const agg = {}; for (const f of frames) for (const [r, v] of Object.entries(f)) { const a = agg[r] ||= [0, 0, 0]; v.forEach((x, k) => a[k] = Math.max(a[k], x)); }
      // the arm alone: raised to each height, and the collarbone with it; the flank and the shoulders measured each time (synchronously, nothing else moves)
      const sweep = []; { const ua2 = rig.arms.r[0], cl = rig.clavicles?.r, sp = rig.spine[2], q0u = ua2.quaternion.clone(), q0c = cl?.quaternion.clone(), Fw = new THREE.Vector3(0, 0, 1).applyQuaternion(O.avatar.object.getWorldQuaternion(new THREE.Quaternion())), Rt = new THREE.Vector3(-1, 0, 0).applyQuaternion(O.avatar.object.getWorldQuaternion(new THREE.Quaternion()));
        const aim = (bone, child, dir) => { const a = bone.getWorldPosition(new THREE.Vector3()), b = child.getWorldPosition(new THREE.Vector3()), c0 = b.sub(a).normalize(), q = new THREE.Quaternion().setFromUnitVectors(c0, dir), wq = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(q), pq = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert(); bone.quaternion.copy(pq.multiply(wq)); bone.updateMatrixWorld(true); };
        for (const cdeg of [0, 15, 30]) for (const edeg of [60, 90, 120, 150, 170]) { if (cl) { cl.quaternion.copy(q0c); cl.updateMatrixWorld(true); if (cdeg) { const wq = cl.getWorldQuaternion(new THREE.Quaternion()).premultiply(new THREE.Quaternion().setFromAxisAngle(Fw, -cdeg * Math.PI / 180)); const pq = cl.parent.getWorldQuaternion(new THREE.Quaternion()).invert(); cl.quaternion.copy(pq.multiply(wq)); cl.updateMatrixWorld(true); } }
          ua2.quaternion.copy(q0u); ua2.updateMatrixWorld(true); const e = edeg * Math.PI / 180, dir = new THREE.Vector3(0, -Math.cos(e), 0).addScaledVector(Fw, Math.sin(e) * 0.6).addScaledVector(Rt, Math.sin(e) * 0.4).normalize(); aim(ua2, rig.arms.r[1], dir);
          const P = snap(); sweep.push(cdeg + '/' + edeg + ': flank ' + D(P, 'shR', 'hipR') + ' shoulders ' + D(P, 'shL', 'shR') + ' c7-shR ' + D(P, 'c7', 'shR')); }
        ua2.quaternion.copy(q0u); if (cl) cl.quaternion.copy(q0c); ua2.updateMatrixWorld(true); sweep.push('idle: flank ' + D(idle, 'shR', 'hipR') + ' c7-shR ' + D(idle, 'c7', 'shR')); }
      return { sweep, props: window.__props, perFrame: frames.map(f => ['pelvis', 'upperarm', 'hand', 'spine'].map(r => f[r]?.[1]).join('/')).join('  '), states: window.__st, edges: edges.length, parts: Object.fromEntries(Object.entries(agg).sort((a, b) => b[1][1] - a[1][1]).map(([r, v]) => [r, { climb: v, run: runAgg[r] }])) }; })()`);
    console.log('   strain % [median, p95, max] worst over the climb', JSON.stringify(R));
    await ev(`(() => { const O = ORBIS, R = O.renderer, r0 = R.render.bind(R); R.render = (sc, ca) => { const C = window.__shotCam; if (ca === O.camera && C) { ca.position.set(...O.toRender(...C.pos)); ca.lookAt(...O.toRender(...C.look)); ca.updateMatrixWorld(); } return r0(sc, ca); }; return 1; })()`);
    await ev(`(async () => { const O = ORBIS, W = O.ctrl.wall, P = W.pose(), n = W.normal, at = P.pelvis; window.__shotCam = { pos: [at[0] + n[0] * 6, at[1] + 0.45, at[2] + n[2] * 6], look: [at[0], at[1] + 0.45, at[2]] }; O.camera.fov = 14; O.camera.updateProjectionMatrix(); await new Promise(r => setTimeout(r, 600)); return 1; })()`);
    await shot('climbstrain-back');
    await ev('(window.__shotCam = null, 1)');
  }
  if (want('climbreal')) {
    // the ADVENTURER body on a real town wall: up it a few holds, then the hands up close (what each is on, and how far its skin is from it)
    await load('hour=11');
    for (let i = 0; i < 120 && !(await ev('window.__body ? 1 : 0')); i++) await sleep(500);
    await ev(`(() => { const O = ORBIS; O.ctrl.facing += 1.9; O.cam.yaw = O.ctrl.facing; return 1; })()`); await sleep(1500); await shot('climbreal-stand');
    await ev(`(async () => { dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); await new Promise(r => setTimeout(r, 1700)); return 1; })()`); await shot('climbreal-walk');
    await ev(`(async () => { dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' })); await new Promise(r => setTimeout(r, 1500)); return 1; })()`); await shot('climbreal-run');
    await ev(`(async () => { dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' })); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); await new Promise(r => setTimeout(r, 800)); return 1; })()`);
    const R = await ev(`(async () => { const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms)), H = await import('./js/gen/holds.js'), c = O.ctrl, w = O.world;
      let got = null;
      // walk the town: the first wall in front of a spot that the climber can take
      const s = O.s; for (const b of s.buildings) { if (b.type === 'house') continue; const fl = []; const [x0, , z0] = (await import('./js/gen/place.js')).buildingToWorld(s, b, 0, 0, 0); H.facesNear(w, x0, w.groundAt(x0, z0, 1e4).h, z0, 30, f => { if (f.town === b) fl.push(f); });
        for (const f of fl) { if (f.w < 6) continue; const a = f.w * 0.5, x = f.o[0] + f.t[0] * a + f.n[0] * 0.45, z = f.o[1] + f.t[1] * a + f.n[1] * 0.45, y = w.groundAt(x, z, f.y0 + 1).h; if (Math.abs(y - f.y0) > 0.3) continue;
          c.mode = 'walk'; c.pos = [x, y, z]; c.vel = [0, 0, 0]; c.facing = Math.atan2(-f.n[0], -f.n[1]); if (c.grabWall()) { got = f; break; } }
        if (got) break; }
      if (!got) return { none: true };
      for (let i = 0; i < 4; i++) { dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); await wait(900); }
      dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); await wait(1500);
      return { face: got.key, y: +(c.pos[1] - got.y0).toFixed(2), mode: c.mode, body: window.__body }; })()`);
    console.log('   climb', JSON.stringify(R));
    await ev(`(() => { const O = ORBIS, R = O.renderer, r0 = R.render.bind(R); R.render = (sc, ca) => { const C = window.__shotCam; if (ca === O.camera && C) { ca.position.set(...O.toRender(...C.pos)); ca.lookAt(...O.toRender(...C.look)); ca.updateMatrixWorld(); } return r0(sc, ca); }; return 1; })()`);
    const views = [['back', 0, 0.35, 3.2], ['lhand', -0.55, 1.12, 0.45], ['rhand', 0.55, 1.12, 0.45], ['side', 1.6, 0.6, 1.6]];
    for (const [tag, side, up, back] of views) {
      const G = await ev(`(async () => { const O = ORBIS, W = O.ctrl.wall; if (!W) return 'nowall'; const P = W.pose(), n = W.normal, R = W.right(), k = '${tag}' === 'lhand' ? 'lh' : 'rh', L = P.limbs[k], at = '${tag}'.endsWith('hand') ? L.p : P.pelvis;
        const cx = at[0] + n[0] * ${back} + R[0] * ${side}, cy = at[1] + (${up} - ('${tag}'.endsWith('hand') ? 1.0 : 0)), cz = at[2] + n[2] * ${back} + R[2] * ${side}; window.__shotCam = { pos: [cx, cy, cz], look: [at[0], at[1] - ('${tag}'.endsWith('hand') ? 0.05 : -0.3), at[2]] };
        await new Promise(r => setTimeout(r, 600)); return JSON.stringify({ hold: L.kind, grip: L.grip }); })()`);
      console.log('   ', tag, G); await shot('climbreal-' + tag);
    }
    await ev('(window.__shotCam = null, 1)');
  }
  if (want('undock')) {
    // dock in a great ship, step out, take off again, and fly out of its bay: where does the ship go?
    await load('hour=15&fly=runabout0&still');
    for (let i = 0; i < 80 && !(await ev('ORBIS.capitalView.models.longshore ? 1 : 0')); i++) await sleep(500);
    const C = process.env.DOCK || 'bastion';
    const R = await ev(`(async () => { const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms)), C = O.fleet.find(c => c.model === '${C}'), f = O.getFlight(), c = Math.cos(C.yaw), s = Math.sin(C.yaw), [a, b, d] = [600, 120, 500];
      f.pos[0] = C.x + a * c + d * s; f.pos[1] = C.y + b; f.pos[2] = C.z - a * s + d * c; f.vel = [0, 0, 0]; f.onGround = false; f.throttle = 0.4; await wait(300); O.startDock(O.dockTarget().C);
      for (let i = 0; i < 3000 && O.getDocking(); i++) await wait(50);
      const id = O.getFlight().ship.id, local = p => { const dx = p[0] - C.x, dz = p[2] - C.z; return [dx * c - dz * s, p[1] - C.y, dx * s + dz * c].map(v => +v.toFixed(1)); }, out = { docked: local(O.getFlight().pos) };
      dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); await wait(80); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' })); await wait(1500);
      out.afterE = { mode: O.ctrl.mode, flying: !!O.getFlight() };
      O.takeOffForTest(id); await wait(500); const F = O.getFlight(); out.state = { docking: !!O.getDocking(), mode: O.ctrl.mode, paused: !!window.__paused, onG: F?.onGround, hover: F?.hover, thr: F?.throttle, vtol: F?.vtol, ui: document.querySelector('.panel:not([hidden]), .modal:not([hidden]), dialog[open]')?.className || null }; out.takeoff = { flying: !!F, at: F && local(F.pos), onGround: F?.onGround, facing: F && +F.facing.toFixed(2), bayYaw: +C.yaw.toFixed(2) };
      const track = []; { const h0 = O.war.hit.bind(O.war); O.war.hit = (c2, d2, by) => { if (c2.pilot === 'player') { const Cp = (window.__capMod ||= null); out.hits = (out.hits || []).concat([{ d: +d2.toFixed(1), imp: +(c2.f.impact || 0).toFixed(1), at: local(c2.f.pos), vel: c2.f.vel.map(v => +v.toFixed(1)), ground: +(c2.f.pos[1] - O.world.groundAt(c2.f.pos[0], c2.f.pos[2], c2.f.pos[1] + 2).h).toFixed(1), solid: O.world.solidAt(c2.f.pos[0], c2.f.pos[1], c2.f.pos[2], 3) }]); } return h0(c2, d2, by); }; } const press = (k, on) => dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code: k }));
      press('Space', true); await wait(1500); press('Space', false); track.push(local(F.pos));
      press('KeyW', true); for (let i = 0; i < 48; i++) { await wait(250); const F2 = O.getFlight(); if (!F2) { out.ended = { why: window.__flightEnd, mode: O.ctrl.mode, toast: [...document.querySelectorAll('.toast, #toast, .toasts > *')].map(e => e.innerText).join(' | ').slice(0, 300), at: local(O.ctrl.pos) }; break; } if (F2.impact > 0.5 || i % 4 === 3) track.push([...local(F2.pos), 'thr' + F2.throttle.toFixed(2), 'hov' + (F2.hover || 0).toFixed(2), 'paused' + (O.isPaused?.() ?? '?'), 'imp' + (+(F2.impact || 0).toFixed(1)), 'hp' + O.war.craft.find(c => c.pilot === 'player')?.hp, O.war.rounds.length + 'r' + O.war.missiles.length + 'm', F2.dead ? 'DEAD' : '', +F2.airspeed.toFixed(0)]); } press('KeyW', false);
      out.track = track; out.impact = O.getFlight()?.impact; return out; })()`);
    console.log('   undock', JSON.stringify(R));
  }
  if (want('dogfight')) {
    // a raider held in the air ahead; your guns into it: the sight, then the damage on it close up
    await load('hour=14&fly=interceptor&still');
    await sleep(2500);
    await ev(`(() => { const O = ORBIS, R = O.renderer, r0 = R.render.bind(R); R.render = (sc, ca) => { const C = window.__shotCam; if (ca === O.camera && C) { ca.position.set(...O.toRender(...C.pos)); ca.lookAt(...O.toRender(...C.look)); ca.updateMatrixWorld(); } return r0(sc, ca); }; return 1; })()`);
    const R = await ev(`(async () => { const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms)), f = O.getFlight(), W = O.war; f.pos[1] = O.world.groundAt(f.pos[0], f.pos[2], 1e4).h + 1500; f.onGround = false; f.vel = [Math.sin(f.facing) * 160, 0, Math.cos(f.facing) * 160]; f.throttle = 0.7; await wait(800);
      const fw = f.fwd, P = [f.pos[0] + fw[0] * 260, f.pos[1] + fw[1] * 260 + 4, f.pos[2] + fw[2] * 260], T = W.spawn('${process.env.FOE || 'gunship0'}', 'raider', P, f.facing, 140); T.hp = T.maxHp = 2000; T.guns = 0; T.missiles = 0;
      window.__T = T; O.fleetWar.step = () => {}; { const st = T.f.step.bind(T.f); T.f.step = (dt, inp) => { const v0 = T.f.vel.slice(), p0 = T.f.pos.slice(); st(dt, inp); if (T.f.impact > 20 && !window.__imp) window.__imp = { dt, v0: v0.map(x => +x.toFixed(1)), v1: T.f.vel.map(x => +x.toFixed(1)), p0: p0.map(x => +x.toFixed(1)), p1: T.f.pos.map(x => +x.toFixed(1)), imp: T.f.impact, onG: T.f.onGround, belly: T.f.belly }; }; } const me = W.craft.find(c => c.pilot === 'player'); let shots = 0;
      for (let i = 0; i < 160; i++) { W.craft = W.craft.filter(c => c === me || c === T); if (T.alive) { (window.__tl ||= []).push([i, +T.f.airspeed.toFixed(0), +(T.f.impact || 0).toFixed(0), +T.hp.toFixed(0), +(T.f.pos[1] - O.world.groundAt(T.f.pos[0], T.f.pos[2], 1e5).h).toFixed(0)]); } const d = [T.f.pos[0] - f.pos[0], T.f.pos[1] - f.pos[1], T.f.pos[2] - f.pos[2]], l = Math.hypot(...d); const { fromEuler } = await import('./js/player/flight.js'); f.q = fromEuler(Math.atan2(d[0], d[2]), Math.asin(d[1] / l), 0); f.syncEuler(); if (l > 120) { W.fireGuns(me, 0.016); shots++; } f.vel = [d[0] / l * (T.f.airspeed + (l - 150) * 0.8), d[1] / l * (T.f.airspeed + (l - 150) * 0.8), d[2] / l * (T.f.airspeed + (l - 150) * 0.8)]; await wait(60); }
      await wait(400); const ev2 = W.events.filter(e => e.type === 'hit' && e.craft === T).length; return { imp: window.__imp, tl: (window.__tl || []).slice(-6), evs: W.events.filter(e => e.craft === T).map(e => e.type + ':' + (e.by ? e.by.pilot || e.by.side : '-') + ':' + (e.dmg || '')).slice(0, 12), hp: T.hp, shots, hits: ev2, dmg: O.war && (await import('./js/render/damage.js')) && 1, state: O.shipDamageState?.('war' + T.id) }; })()`);
    console.log('   dogfight', JSON.stringify(R));
    console.log('   dmgdraw', await ev(`(() => { const O = ORBIS, T = window.__T, D = O.shipDamage.ships.get('war' + T.id); if (!D) return 'none'; D.g.updateMatrixWorld(true); const p = new D.g.position.constructor().setFromMatrixPosition(D.g.matrixWorld); const A = D.meshes.map(m => { const b = m.mesh.geometry.attributes.aBurn.array; let mx = 0, n = 0; for (const x of b) { if (x > mx) mx = x; if (x > 0.3) n++; } let moved = 0; const P = m.mesh.geometry.attributes.position.array; for (let i = 0; i < P.length; i++) moved = Math.max(moved, Math.abs(P[i] - m.pos0[i])); return [+mx.toFixed(2), n, +moved.toFixed(3), P.length / 3]; }); const mineD = O.shipDamage.ships.has(O.getFlight().ship.id), myHits = O.war.events.filter(e => e.type === 'hit' && e.craft.pilot === 'player').map(e => e.by?.side || e.by?.pilot || '-').slice(0, 5); const inst = Object.values(O.shipView.models[T.model].hull).map(h => h.im.count); return JSON.stringify({ mineD, myHits, A: A.length, inst, hitsR: D.hits, vis: D.g.visible, kids: D.g.children.length, at: p.toArray().map(v => +v.toFixed(1)), want: O.toRender(...T.f.pos).map(v => +v.toFixed(1)), alive: T.alive, inWar: O.war.craft.includes(T), model: T.model, hasModel: !!O.shipView.models[T.model], prog: O.renderer.info.programs.filter(p => p.name.includes('scorched') || true).length, mat: D.meshes[0].mesh.material.type }); })()`));
    await shot('dogfight-sight');
    await ev('(ORBIS.war.booms = ORBIS.war.booms.filter(b => !b.smoke), window.__freeze = true, 1)'); for (const [tag, off] of [['near-a', [9, 4, 15]], ['near-b', [-9, 5, 14]], ['near-c', [3, -4, 13]]]) {
      await ev(`(() => { const F = window.__T.f, o = ${JSON.stringify(off)}; window.__shotCam = { get pos() { const T = F.pos, fw = F.fwd, up = F.up, lf = F.left; return [0, 1, 2].map(i => T[i] - fw[i] * o[2] + up[i] * o[1] + lf[i] * o[0]); }, get look() { return F.pos; } }; return 1; })()`); await sleep(500); await shot('dogfight-' + tag);
    }
    await ev('(window.__shotCam = null, 1)');
  }
  if (want('fps')) {
    // frames per second on foot in town: the placeholder body, the ADVENTURER body
    for (const q of (process.env.FPSQ || 'body=placeholder,').split(',')) {
      await load('hour=12&' + q); await sleep(4000);
      const R = await ev(`(async () => { let n = 0, on = true; const f = () => { n++; if (on) requestAnimationFrame(f); }; requestAnimationFrame(f); await new Promise(r => setTimeout(r, 4000)); on = false; return { fps: +(n / 4).toFixed(1), body: window.__body || 'placeholder', tris: ORBIS.renderer.info.render.triangles, calls: ORBIS.renderer.info.render.calls }; })()`);
      console.log('   fps', q || 'adventurer', JSON.stringify(R));
    }
  }
  if (want('dockpit')) {
    // docking seen from the pilot's seat: on the bay's line, at the doors, inside, and down
    await load('hour=15&fly=runabout0');
    for (let i = 0; i < 80 && !(await ev('ORBIS.capitalView.models.longshore ? 1 : 0')); i++) await sleep(500);
    const C = process.env.DOCK || 'bastion';
    await ev(`(async () => { const O = ORBIS, C = O.fleet.find(c => c.model === '${C}'), f = O.getFlight(), c = Math.cos(C.yaw), s = Math.sin(C.yaw), [a, b, d] = [600, 120, 500];
      f.pos[0] = C.x + a * c + d * s; f.pos[1] = C.y + b; f.pos[2] = C.z - a * s + d * c; f.vel = [0, 0, 0]; f.onGround = false; f.throttle = 0.4; O.setCockpitView(true); await new Promise(r => setTimeout(r, 300)); O.startDock(O.dockTarget().C); return 1; })()`);
    for (const [tag, cond] of [['line', 'D.s > D.sMid + 10'], ['doors', 'D.s > D.sIn - 8'], ['inside', 'D.s > D.sIn + 20'], ['settle', 'D.settle']]) {
      const R = await ev(`(async () => { const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms)); for (let i = 0; i < 2000; i++) { const D = O.getDocking(); if (!D) return { gone: 1 }; if (${cond}) break; await wait(50); } const D = O.getDocking(), f = O.getFlight(); window.__pause = true; return { s: +D.s.toFixed(1), v: +D.v.toFixed(2), sIn: +D.sIn.toFixed(1), end: +D.end.toFixed(1), hover: f.hover, thr: f.throttle, pitch: +D.pitch.toFixed(3), y: +(f.pos[1] - D.deckY).toFixed(2) }; })()`);
      console.log('   dockpit', tag, JSON.stringify(R)); await shot('dockpit-' + tag); await ev('(window.__pause = false, 1)');
    }
  }
  if (want('worlds')) {
    // other worlds of the universe (gen/genome.js): each one from the street, from the edge of town looking out, and from the air
    for (const N of (process.env.PLANETS || '0,1,2,3,4,5').split(',')) {
      await load('hour=' + (process.env.HOUR || 15) + '&fly=runabout0&planet=' + N);
      const G = await ev(`JSON.stringify((g => ({ arch: g.arch, weird: +g.weird.toFixed(2), keys: g.keys, trees: g.flora.trees, ways: g.culture.ways, nations: g.society.nations.map(n => n.name + ' (' + n.gov + ')'), primary: g.society.primary }))(ORBIS.planet.genome))`);
      console.log('   world', N, G);
      const go = async (tag, js, wait = 3500) => { await ev(`(async () => { const O = ORBIS, s = O.homeS, wait = ms => new Promise(r => setTimeout(r, ms)); ${js}; await wait(${wait}); return 1; })()`); await shot('world' + N + '-' + tag); };
      // from the air: up over the edge of town, looking out over the country
      await go('air', `const f = O.getFlight(); if (!f) return; const a = 0.7, R = (s.R || 300) + 200; f.pos[0] = s.cx + Math.sin(a) * R; f.pos[2] = s.cz + Math.cos(a) * R; f.pos[1] = Math.max(O.world.groundAt(f.pos[0], f.pos[2], 1e4).h, O.planet.genome.cloud ? s.h - 300 : -1e9) + 420; f.vel = [Math.sin(a) * 60, 0, Math.cos(a) * 60]; f.throttle = 0.5; f.facing = a; const F = await import('./js/player/flight.js'); f.q = F.fromEuler(a, -0.32, 0); f.w = [0, 0, 0]; f.syncEuler(); O.setCockpitView(false)`, 4500);
      await go('high', `const f = O.getFlight(); if (!f) return; const a = 2.4; f.pos[0] = s.cx + Math.sin(a) * 3000; f.pos[2] = s.cz + Math.cos(a) * 3000; f.pos[1] = Math.max(O.world.groundAt(f.pos[0], f.pos[2], 1e4).h, O.planet.genome.cloud ? s.h - 300 : -1e9) + 1600; f.vel = [Math.sin(a) * 80, 0, Math.cos(a) * 80]; f.facing = a; const F = await import('./js/player/flight.js'); f.q = F.fromEuler(a, -0.22, 0); f.w = [0, 0, 0]; f.syncEuler()`, 5000);
      // on foot: the edge of town looking out, then in the street
      await go('edge', `O.setFlightForTest(null); O.ctrl.mode = 'walk'; const a = 2.1, R = (s.R || 300) + 140, x = s.cx + Math.sin(a) * R, z = s.cz + Math.cos(a) * R; O.ctrl.pos = [x, O.world.groundAt(x, z, 1e4).h + 0.05, z]; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = a; O.cam.yaw = a; O.cam.pitch = 0.04; O.cam.dist = 5`, 5000);
      if (await ev('ORBIS.planet.genome.cloud ? 1 : 0')) {      // a cloud world: stand at the deck's rail looking out over the drop, and look up at the town from beneath
        await go('rim', `O.setFlightForTest(null); O.ctrl.mode = 'walk'; const K = await import('./js/gen/skyisles.js'), P = K.skyPlan(O.planet, s), D = P.decks[0], a = (P.decks[1]?.a ?? 0.6) + 0.5, e = K.deckEdge(D, a) - 4, x = D.x + Math.cos(a) * e, z = D.z + Math.sin(a) * e; O.ctrl.pos = [x, D.h + 0.05, z]; O.ctrl.vel = [0, 0, 0]; const yaw = Math.atan2(Math.cos(a), Math.sin(a)); O.ctrl.facing = yaw; O.cam.yaw = yaw; O.cam.pitch = -0.18; O.cam.dist = 6`, 5000);
        await go('bridge', `const K = await import('./js/gen/skyisles.js'), P = K.skyPlan(O.planet, s), B = P.bridges[0], x = B.a[0] + (B.b[0] - B.a[0]) * 0.45, z = B.a[1] + (B.b[1] - B.a[1]) * 0.45; O.ctrl.pos = [x, B.a[2] + (B.b[2] - B.a[2]) * 0.45 + 0.1, z]; O.ctrl.vel = [0, 0, 0]; const yaw = Math.atan2(B.b[0] - B.a[0], B.b[1] - B.a[1]); O.ctrl.facing = yaw; O.cam.yaw = yaw; O.cam.pitch = 0.05; O.cam.dist = 6`, 4000);
      }
      // the world's creatures: one of each species, side by side on open ground just outside town
      await go('beasts', `O.setFlightForTest(null); O.ctrl.mode = 'walk'; const F = await import('./js/gen/fauna.js'), sps = F.speciesOf(O.planet), a = 2.1, R = (s.R || 300) + 60, x0 = s.cx + Math.sin(a) * R, z0 = s.cz + Math.cos(a) * R, px = Math.cos(a), pz = -Math.sin(a); O.fauna.clear();
        let off = -sps.reduce((t, S) => t + S.size * 1.6, 0) / 2; for (const S of sps) { off += S.size * 0.8; O.fauna.spawnTest(S, x0 + px * off, z0 + pz * off, 1, a + Math.PI / 2); off += S.size * 0.8; }
        const cx = x0 + Math.sin(a) * 14, cz = z0 + Math.cos(a) * 14; O.ctrl.pos = [cx, O.world.groundAt(cx, cz, 1e4).h + 0.05, cz]; O.ctrl.vel = [0, 0, 0]; const yaw = a + Math.PI; O.ctrl.facing = yaw; O.cam.yaw = yaw; O.cam.pitch = 0.12; O.cam.dist = 7`, 5000);
      await go('street', `const b = s.buildings[Math.floor(s.buildings.length / 3)], [x, z] = s.toWorld(b.O[0] + b.ex[0] * b.w / 2 - b.ez[0] * 6, b.O[1] + b.ex[1] * b.w / 2 - b.ez[1] * 6); O.ctrl.pos = [x, O.world.groundAt(x, z, 1e4).h + 0.05, z]; O.ctrl.vel = [0, 0, 0]; const a = Math.atan2(b.ez[0], b.ez[1]) + 0.5; O.ctrl.facing = a; O.cam.yaw = a; O.cam.pitch = 0.08; O.cam.dist = 5`, 4000);
    }
  }
  if (want('towns')) {
    // each world's towns as its people shape them (gen/forms.js): low over the roofs, and down a street
    for (const N of (process.env.PLANETS || '0,1,2').split(',')) {
      await load('hour=' + (process.env.HOUR || 15) + '&fly=runabout0&planet=' + N);
      console.log('   world', N, await ev(`(async () => { const F = await import('./js/gen/forms.js'), W = F.formsOf(ORBIS.planet); return W.main.kind + ' ' + W.main.roof + ' / ' + W.second.kind; })()`));
      const go = async (tag, js, wait = 3500) => { await ev(`(async () => { const O = ORBIS, s = O.homeS, wait = ms => new Promise(r => setTimeout(r, ms)); ${js}; await wait(${wait}); return 1; })()`); await shot('town' + N + '-' + tag); };
      await go('low', `O.setFlightForTest(null); O.ctrl.mode = 'walk'; const r = s.roads[0], u = (r.a[0] + r.b[0]) / 2, v = (r.a[1] + r.b[1]) / 2, [x, z] = s.toWorld(u, v); O.ctrl.pos = [x, O.world.groundAt(x, z, 1e4).h + 0.05, z]; O.ctrl.vel = [0, 0, 0]; const yaw = 0.7; O.ctrl.facing = yaw; O.cam.yaw = yaw; O.cam.pitch = 0.42; O.cam.dist = 140`, 7000);
      if (process.env.CITY) await go('city', `O.setFlightForTest(null); O.ctrl.mode = 'walk'; const c = O.city, a = 0.8, x = c.cx + Math.sin(a) * (c.R * 0.55), z = c.cz + Math.cos(a) * (c.R * 0.55); O.ctrl.pos = [x, c.h + 0.5, z]; O.ctrl.vel = [0, 0, 0]; const yaw = a + Math.PI; O.ctrl.facing = yaw; O.cam.yaw = yaw; O.cam.pitch = 0.32; O.cam.dist = 220`, 9000);
      await go('street', `O.setFlightForTest(null); O.ctrl.mode = 'walk'; const r = s.roads.slice().sort((p, q) => Math.hypot(q.b[0] - q.a[0], q.b[1] - q.a[1]) - Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]))[0], u = r.a[0] + (r.b[0] - r.a[0]) * 0.3, v = r.a[1] + (r.b[1] - r.a[1]) * 0.3, du = r.b[0] - r.a[0], dv = r.b[1] - r.a[1], [x, z] = s.toWorld(u, v), dx = du * s.cos - dv * s.sin, dz = du * s.sin + dv * s.cos; O.ctrl.pos = [x, O.world.groundAt(x, z, 1e4).h + 0.05, z]; O.ctrl.vel = [0, 0, 0]; const yaw = Math.atan2(dx, dz) + 0.25; O.ctrl.facing = yaw; O.cam.yaw = yaw; O.cam.pitch = 0.12; O.cam.dist = 4`, 6000);
    }
  }
  if (want('harbour')) {
    // a town built out over the sea: seen from the water, its piles and quay, boats coming and going
    await load('hour=' + (process.env.HOUR || 15) + '&fly=runabout0&planet=' + (process.env.PLANET || 18));
    const T = await ev(`(async () => { const S = await import('./js/gen/settlement.js'); for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) { const s = S.getSettlement(ORBIS.planet, i, j); if (s?.onWater) return { cx: s.cx, cz: s.cz, R: s.R, h: s.h, name: s.name }; } return null; })()`);
    console.log('   water town', JSON.stringify(T));
    if (T) for (const [tag, d, up, a] of [['approach', 420, 60, 0.6], ['quay', 150, 8, 2.2], ['above', 250, 260, 4]]) {
      await ev(`(async () => { const O = ORBIS, f = O.getFlight(), wait = ms => new Promise(q => setTimeout(q, ms)), F = await import('./js/player/flight.js'), T = ${JSON.stringify(T)}, a = ${a};
        const x = T.cx + Math.sin(a) * (T.R + ${d}), z = T.cz + Math.cos(a) * (T.R + ${d}), yaw = Math.atan2(T.cx - x, T.cz - z);
        for (let i = 0; i < 50; i++) { f.pos = [x, T.h + ${up}, z]; f.vel = [0, 0, 0]; f.vtol = true; f.facing = yaw; f.q = F.fromEuler(yaw, -0.08, 0); f.w = [0, 0, 0]; f.syncEuler(); O.cam.dist = 24; await wait(100); } return 1; })()`);
      await shot('harbour-' + tag);
    }
  }
  if (want('ftlclick')) {
    // the jump the way a player makes it: E at 6 km, a world clicked, Engage pressed; frames through the jump and the arrival
    await load('hour=11&fly=runabout0' + (process.env.FROM ? '&' + process.env.FROM : ''));
    await ev(`(async () => { const st = document.createElement('style'); st.textContent = '.holo, .holo * { visibility: visible !important; }'; document.head.append(st); const O = ORBIS, f = O.getFlight(), F = await import('./js/player/flight.js'), wait = ms => new Promise(q => setTimeout(q, ms)); for (let i = 0; i < 20; i++) { f.pos[1] = 6200; f.vel = [Math.sin(f.facing) * 80, 0, Math.cos(f.facing) * 80]; f.q = F.fromEuler(f.facing, 0, 0); f.w = [0, 0, 0]; f.syncEuler(); await wait(100); } dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); await wait(80); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' })); return 1; })()`);
    await sleep(1500); console.log('   map open', await ev(`!!document.querySelector('.holo')`)); await shot('ftlc-map');
    await ev(`(() => { document.querySelector('.holo [data-a=open]').click(); return 1; })()`); await sleep(700);
    console.log('   world picked', await ev(`(() => { const cv = document.querySelector('.holo canvas'), r = cv.getBoundingClientRect(); for (let y = 0; y < r.height; y += 3) for (let x = 0; x < r.width; x += 3) { cv.dispatchEvent(new MouseEvent('click', { clientX: r.left + x, clientY: r.top + y })); const b = document.querySelector('.holo [data-a=jump]'); if (b && !b.disabled) return document.querySelector('.holo h2').textContent; } return null; })()`));
    if (process.env.FULL) await ev(`(() => { Storage.prototype.setItem = function () { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); }; return 1; })()`);     // (as on the live origin, whose storage the other sites have filled)
    await ev(`(() => { document.querySelector('.holo [data-a=jump]').click(); return 1; })()`);
    for (const ms of [500, 1200, 1300]) { await sleep(ms); await shot('ftlc-jump-' + ms).catch(() => console.log('   (navigating)')); }
    let t = '', n = 0; const t0 = Date.now(); for (let i = 0; i < 300; i++) { await sleep(400); t = await ev(`location.search.includes('arrive') ? document.title : 'jumping'`).catch(() => 'nav'); if (t === 'READY' || t.startsWith('ERROR')) break; if (i === 40) console.log('   still', t); if (i % 4 === 2 && n < 8) await shot('ftlc-load-' + n++).catch(() => {}); }
    console.log('   after', t, ((Date.now() - t0) / 1000).toFixed(1) + ' s');
    for (let i = 0; i < 80 && !(await ev('window.__ftlDone ? 1 : 0').catch(() => 0)); i++) { await sleep(250); if (i % 8 === 4 && n < 12) await shot('ftlc-load-' + n++).catch(() => {}); }
    console.log('   out of the tunnel', ((Date.now() - t0) / 1000).toFixed(1) + ' s');
    for (const [k, ms] of [[1, 300], [2, 700], [3, 700], [4, 900], [5, 1500]]) { await sleep(ms); await shot('ftlc-arrive-' + k).catch(() => {}); }
    console.log('   arrived', await ev(`JSON.stringify({ planet: ORBIS.planet.name, flying: !!ORBIS.getFlight(), alt: Math.round(ORBIS.getFlight()?.pos[1] || 0) })`));
  }
  if (want('reloadfly')) {
    // you were flying when you left: load that save again (it used to break before the air war was set up)
    await load('hour=11&fly=runabout0');
    console.log('   saved', await ev(`(async () => { const f = ORBIS.getFlight(); f.pos[1] += 800; await new Promise(r => setTimeout(r, 1500)); await ORBIS.save(); return JSON.stringify({ piloting: ORBIS.store.player.piloting }); })()`));
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?slot=${slot}&auto=continue&seed=${SEED}&hour=11` });
    let t = ''; for (let i = 0; i < 200; i++) { await sleep(500); t = await ev('document.title').catch(() => ''); if (t === 'READY' || t.startsWith('ERROR')) break; }
    console.log('   reloaded', t, await ev(`JSON.stringify({ flying: !!ORBIS.getFlight?.(), broke: document.body.innerText.includes('Something broke') })`).catch(e => String(e).slice(0, 200)));
    await shot('reloadfly');
  }
  if (want('fast')) {
    // flying very fast: low, high, and in the black; frames as it goes, and per-frame figures (how far the ship jumps on screen, frame times)
    for (const [tag, alt, v] of (process.env.RUNS ? JSON.parse(process.env.RUNS) : [['low', 400, 900], ['mid', 9000, 4000], ['high', 30000, 12000], ['space', 60000, 30000]])) {
      await load('hour=11&fly=' + (process.env.MODEL || 'interceptor') + (process.env.Q ? '&' + process.env.Q : ''));     // (a fresh ship each time: a long run can meet someone's missile)
      console.log('  ', tag, await ev(`(async () => { const O = ORBIS, f = O.getFlight(), F = await import('./js/player/flight.js'), wait = ms => new Promise(q => setTimeout(q, ms));
        const sh = [], ft = []; let last = performance.now();
        for (let i = 0; i < 60; i++) { const g = Math.max(O.world.groundAt(f.pos[0], f.pos[2], 1e4).h, O.planet.seaLevel); f.pos[1] = g + ${alt}; f.vel = [Math.sin(f.facing) * ${v}, 0, Math.cos(f.facing) * ${v}]; f.throttle = 1; f.q = F.fromEuler(f.facing, 0, 0); f.w = [0, 0, 0]; f.syncEuler();
          await new Promise(r => requestAnimationFrame(r)); const n = performance.now(); ft.push(n - last); last = n;
          { const p = O.avatar.object.position.clone(); p.project(O.camera); sh.push([p.x, p.y, p.z]); } }
        const d = sh.slice(1).map((p, i) => Math.hypot(p[0] - sh[i][0], p[1] - sh[i][1])); const slow = ft.map((v, i) => [i, v | 0]).filter(q => q[1] > 100); ft.sort((a, b) => a - b);
        return JSON.stringify({ frameMed: ft[30]|0, frameMax: ft[59]|0, screenJumpMax: d.length ? +Math.max(...d).toFixed(3) : 'n/a', screenSpread: sh.length ? [Math.min(...sh.map(p => p[1])).toFixed(2), Math.max(...sh.map(p => p[1])).toFixed(2)] : 'n/a', alt: Math.round(f.pos[1]), slow }); })()`));
      if (process.env.PROF) { await send('Profiler.enable'); await send('Profiler.start');
        await ev(`(async () => { const O = ORBIS, f = O.getFlight(), F = await import('./js/player/flight.js'); for (let i = 0; i < 80; i++) { const g = Math.max(O.world.groundAt(f.pos[0], f.pos[2], 1e4).h, O.planet.seaLevel); f.pos[1] = g + ${alt}; f.vel = [Math.sin(f.facing) * ${v}, 0, Math.cos(f.facing) * ${v}]; f.q = F.fromEuler(f.facing, 0, 0); f.w = [0, 0, 0]; f.syncEuler(); await new Promise(r => requestAnimationFrame(r)); } return 1; })()`);
        const P = (await send('Profiler.stop')).result.profile, self = new Map(), dts = P.timeDeltas, cnt = new Map();
        P.samples.forEach((id, i) => cnt.set(id, (cnt.get(id) || 0) + (dts[i] || 0)));
        console.log('   threads', await ev(`JSON.stringify({ pool: ORBIS.terrain.pool?.length || 0, inflight: ORBIS.terrain.inflight?.size, tiles: ORBIS.terrain.count, queue: ORBIS.terrain.queue.length })`));
        { const par = new Map(), byId = new Map(P.nodes.map(n => [n.id, n])); for (const n of P.nodes) for (const c of n.children || []) par.set(c, n.id);
          const inc = new Map(); for (const n of P.nodes) { const t = cnt.get(n.id) || 0; if (!t) continue; const seen = new Set(); for (let id = n.id; id != null; id = par.get(id)) { const c = byId.get(id).callFrame, k = (c.functionName || '(anon)') + ' ' + c.url.split('/').slice(-2).join('/') + ':' + c.lineNumber; if (seen.has(k)) continue; seen.add(k); inc.set(k, (inc.get(k) || 0) + t); } }
          for (const want of (process.env.CALLERS || 'surfaceHeight,surfaceAt').split(',')) { const by = new Map(); for (const n of P.nodes) { if (n.callFrame.functionName !== want) continue; const pid = par.get(n.id), pc = pid != null && byId.get(pid).callFrame; if (!pc) continue; const tot = (function sum(id) { const x = byId.get(id); return (cnt.get(id) || 0) + (x.children || []).reduce((a, c) => a + sum(c), 0); })(n.id); const k = pc.functionName + ' ' + pc.url.split('/').slice(-2).join('/') + ':' + pc.lineNumber; by.set(k, (by.get(k) || 0) + tot); } console.log('   callers of', want, [...by].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => (v / 1000 | 0) + 'ms ' + k).join(' | ')); }
          { let t = 0, best = [0, 0, 0], st = -1, t0 = 0; const idle = id => /^\((idle|program|garbage collector)\)$/.test(byId.get(id).callFrame.functionName);
            P.samples.forEach((id, i) => { t += P.timeDeltas[i] || 0; if (!idle(id)) { if (st < 0) { st = i; t0 = t; } if (t - t0 > best[2]) best = [st, i, t - t0]; } else st = -1; });
            const w = new Map(); for (let i = best[0]; i <= best[1]; i++) { const seen = new Set(); for (let id = P.samples[i]; id != null; id = par.get(id)) { const c = byId.get(id).callFrame, k = (c.functionName || '(anon)') + ' ' + c.url.split('/').slice(-2).join('/') + ':' + c.lineNumber; if (seen.has(k)) continue; seen.add(k); w.set(k, (w.get(k) || 0) + (P.timeDeltas[i] || 0)); } }
            console.log('   longest busy stretch', (best[2] / 1000 | 0) + ' ms:', [...w].filter(([k]) => !k.includes('three.module') && !/^\(|safeFrame|frame js/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => (v / 1000 | 0) + ' ' + k).join(' | ')); }
          console.log('   inclusive', inc.size, P.nodes.length); [...inc].filter(([k]) => !k.includes('three.module') && !k.startsWith('(')).sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([k, v]) => console.log('     ', (v / 1000 | 0) + ' ms', k)); }
        for (const n of P.nodes) { const c = n.callFrame, k = (c.functionName || '(anon)') + ' ' + c.url.split('/').slice(-2).join('/') + ':' + c.lineNumber; self.set(k, (self.get(k) || 0) + (cnt.get(n.id) || 0)); }
        const tot = [...self.values()].reduce((a, b) => a + b, 0); console.log('   profile', tag, (tot / 1000 | 0) + ' ms'); [...self].sort((a, b) => b[1] - a[1]).slice(0, 22).forEach(([k, v]) => console.log('     ', (v / 1000 | 0) + ' ms', k)); }
      await shot('fast-' + tag + '-a'); await sleep(400); await shot('fast-' + tag + '-b');
      console.log('   after', tag, await ev(`JSON.stringify({ flying: !!ORBIS.getFlight(), toasts: [...document.querySelectorAll('.toast')].map(e => e.textContent).slice(-8) })`));
    }
  }
  if (want('cockpits')) {
    // what the pilot sees: each ship flown, the view from the seat, level and in daylight
    for (const M of (process.env.MODELS || 'shuttle,freighter,courier,patrol,yacht,runabout0,racer0,dropship0,gunship0,explorer0,hauler0,ferry0,arrow0,manta0,wraith0,miner0,interceptor,striker,needle,warden,shade').split(',')) {
      await load('hour=12&fly=' + M);
      await ev(`(async () => { const O = ORBIS, f = O.getFlight(), F = await import('./js/player/flight.js'), wait = ms => new Promise(q => setTimeout(q, ms)); if (!f) return 0; O.setCockpitView(true); for (let i = 0; i < 25; i++) { f.pos[1] = Math.max(O.world.groundAt(f.pos[0], f.pos[2], 1e4).h, O.planet.seaLevel) + 250; f.vel = [Math.sin(f.facing) * 60, 0, Math.cos(f.facing) * 60]; f.q = F.fromEuler(f.facing, 0, 0); f.w = [0, 0, 0]; f.syncEuler(); await wait(100); } return 1; })()`);
      await shot('cockpit-' + M);
      if (process.env.DEBUG) { console.log(await ev(`(() => { const V = ORBIS.shipView, g = V.cockG; return JSON.stringify({ has: !!g, vis: g?.visible, n: g?.children.length, cock: V.cock, plane: V.cockPlane && [V.cockPlane.normal.toArray().map(v => +v.toFixed(2)), +V.cockPlane.constant.toFixed(1)], clip: ORBIS.renderer.localClippingEnabled, mats: g?.children.slice(0, 3).map(m => m.material.clippingPlanes?.length) }); })()`)); await ev(`(() => { ORBIS.shipView.cockG.visible = false; ORBIS.shipView.endCockpit = () => {}; ORBIS.shipView.drawCockpit = () => {}; return 1; })()`); await sleep(800); await shot('cockpit-' + M + '-nocock'); }
    }
  }
  if (want('ftl')) {
    // interstellar: up out of the air, the holo map (ui/holomap.js), a jump, and out of it over another world
    await load('hour=11&fly=runabout0' + (process.env.FROM ? '&' + process.env.FROM : ''));
    await ev(`(async () => { const O = ORBIS, f = O.getFlight(), F = await import('./js/player/flight.js'), wait = ms => new Promise(q => setTimeout(q, ms)); for (let i = 0; i < 30; i++) { f.pos[1] = 60000; f.vel = [0, 0, 0]; f.q = F.fromEuler(0.4, 0.3, 0); f.w = [0, 0, 0]; f.syncEuler(); await wait(100); } return O.inSpace; })()`);
    await shot('ftl-space');
    await ev(`(() => { const st = document.createElement('style'); st.textContent = '.holo, .holo * { visibility: visible !important; }'; document.head.append(st); ORBIS.holo(); return 1; })()`); await sleep(1500); await shot('ftl-map-stars');
    await ev(`(async () => { const h = document.querySelector('.holo'), b = h.querySelector('[data-a=open]'); b.click(); return 1; })()`); await sleep(800);
    await ev(`(async () => { const cv = document.querySelector('.holo canvas'), r = cv.getBoundingClientRect(); for (let y = 0; y < r.height; y += 4) for (let x = 0; x < r.width; x += 4) { const e = new MouseEvent('click', { clientX: r.left + x, clientY: r.top + y }); cv.dispatchEvent(e); if (document.querySelector('.holo [data-a=jump]')) return 1; } return 0; })()`); await sleep(900); await shot('ftl-map-world');
    await ev(`(() => { document.querySelector('.holo [data-a=close]')?.click(); document.querySelector('.holo')?.remove(); return 1; })()`);
    const to = { system: +(process.env.SYS || 4), body: +(process.env.BODY || 1) };
    await ev(`(() => { setTimeout(() => ORBIS.ftlJump(${JSON.stringify(to)}), 10); return 1; })()`); await sleep(1800); await shot('ftl-jump');
    let t = ''; for (let i = 0; i < 240; i++) { await sleep(500); t = await ev(`location.search.includes('arrive') ? document.title : 'jumping'`).catch(() => ''); if (t === 'READY' || t.startsWith('ERROR')) break; }
    await sleep(800); await shot('ftl-arrive');
    console.log('   arrived', t, await ev(`JSON.stringify({ planet: ORBIS.planet.name, url: location.search, flying: !!ORBIS.getFlight(), alt: Math.round(ORBIS.getFlight()?.pos[1] || 0), credits: ORBIS.store.player.credits, name: ORBIS.store.player.name, toast: document.querySelector('.toasts').textContent.slice(0, 200) })`));
    await ev(`(async () => { const f = ORBIS.getFlight(), wait = ms => new Promise(q => setTimeout(q, ms)); for (let i = 0; i < 40; i++) { f.pos[1] = Math.max(f.pos[1] - 1400, 2500); await wait(100); } return 1; })()`); await sleep(4000); await shot('ftl-descend');
  }
  if (want('line')) {
    // the war on foot (sim/infantry.js): report for duty on the line, watch the squads go at it
    for (const N of (process.env.PLANETS || '4').split(',')) {
      await load('hour=' + (process.env.HOUR || 14) + '&planet=' + N);
      const ok = await ev(`(async () => { const O = ORBIS, F = await import('./js/sim/front.js'), soc = O.townSociety(); if (!soc || !F.frontsOf(O.planet, soc.nation).length) return 0; O.store.player.soldier = { nation: soc.nation.id, rank: 0, kills: 0 }; try { await O.deployFoot(); } catch (e) { return 'ERR ' + e.message + ' ' + e.stack.slice(0, 300); } return 1; })()`); console.log('   deploy', ok, await ev(`(async () => { const O = ORBIS, F = await import('./js/sim/front.js'), soc = O.townSociety(), f = F.frontsOf(O.planet, soc.nation)[0], x = f.x - Math.sin(f.dir) * 340, z = f.z - Math.cos(f.dir) * 340; return JSON.stringify({ f: [Math.round(f.x), Math.round(f.z)], g: O.world.groundAt(x, z, 1e5).h, sea: O.planet.seaLevel, soldier: O.store.player.soldier, duty: O.store.player.footDuty }); })()`));
      if (!ok) { console.log('   world', N, 'no front'); continue; }
      for (const [tag, secs, js] of [['line-rally', 6, 'O.cam.pitch = 0.12; O.cam.dist = 5'], ['line-fight', 50, 'O.cam.pitch = 0.06; O.cam.dist = 3.4'], ['line-high', 4, 'O.cam.pitch = 0.42; O.cam.dist = 70'], ['line-close', 1, 'const M = O.infantry.men.find(m => m.side === "ours" && m.hp > 0 && !m.moving && m.aim > 0.5) || O.infantry.men.find(m => m.hp > 0); const x = M.pos[0] + Math.sin(M.facing + 1.2) * 3.2, z = M.pos[2] + Math.cos(M.facing + 1.2) * 3.2; O.ctrl.pos = [x, O.world.groundAt(x, z, 1e5).h + 0.1, z]; O.ctrl.facing = Math.atan2(M.pos[0] - x, M.pos[2] - z); O.cam.yaw = O.ctrl.facing; O.cam.pitch = 0.02; O.cam.dist = 1.6']]) {
        await ev(`(async () => { const O = ORBIS, wait = ms => new Promise(q => setTimeout(q, ms)), I = O.infantry; for (let i = 0; i < ${secs} * 10; i++) { await wait(100); } if (I.F && '${tag}' === 'line-fight') { const M = I.men.find(m => m.side === 'ours' && m.hp > 0 && m.state === 'hold') || I.men.find(m => m.side === 'ours' && m.hp > 0), ux = Math.sin(I.F.dir), uz = Math.cos(I.F.dir), x = M ? M.pos[0] - ux * 6 + uz * 2 : I.F.x - ux * 110, z = M ? M.pos[2] - uz * 6 - ux * 2 : I.F.z - uz * 110; O.ctrl.pos = [x, O.world.groundAt(x, z, 1e5).h + 0.1, z]; await wait(2500); } O.ctrl.facing = I.F ? I.F.dir : 0; O.cam.yaw = O.ctrl.facing; ${'${js}'}; O.ctrl.vel = [0, 0, 0]; O.store.player.hp = 100; await wait(1200); return 1; })()`.replace('${js}', js));
        const st = await ev(`(() => { const I = ORBIS.infantry, O = ORBIS, B = O.front.F; return { pos: O.ctrl.pos.map(Math.round), front: B ? [Math.round(B.x), Math.round(B.z), Math.round(Math.hypot(O.ctrl.pos[0] - B.x, O.ctrl.pos[2] - B.z))] : null, duty: O.store.player.footDuty, toast: document.querySelector('.toasts')?.textContent.slice(-300), mode: O.ctrl.mode, fl: !!O.getFlight(), ride: !!O.getRide(), at: !!I.F, men: I.men.length, ours: I.men.filter(m => m.side === 'ours' && m.hp > 0).length, theirs: I.men.filter(m => m.side === 'theirs' && m.hp > 0).length, down: I.men.filter(m => m.hp <= 0).length, obj: I.obj.map(o => o.owner + ':' + o.prog.toFixed(2)), shots: I.shots.length }; })()`);
        console.log('   ', tag, JSON.stringify(st)); await shot(tag + N);
      }
    }
  }
  if (want('war')) {
    // a world at war: enlist, report for duty, and fly at the front (sim/front.js)
    for (const N of (process.env.PLANETS || '0,1,2,3,4,5,6,7,8,9').split(',')) {
      await load('hour=' + (process.env.HOUR || 14) + '&planet=' + N);
      const info = await ev(`(async () => { const O = ORBIS, F = await import('./js/sim/front.js'), soc = O.townSociety(); const fr = soc ? F.frontsOf(O.planet, soc.nation) : []; return { arch: O.planet.genome.arch, nation: soc?.nation.name, gov: soc?.govLabel, industry: soc?.industryLabel, gangs: O.gangs().map(g => g.name + ' (' + g.members.length + ')'), fronts: fr.map(f => f.b.name + ' ' + f.state + ' ' + Math.round(Math.hypot(f.x, f.z) / 1000) + ' km') }; })()`);
      console.log('   world', N, JSON.stringify(info));
      if (!info.fronts.length) continue;
      await ev(`(async () => { const O = ORBIS, soc = O.townSociety(); O.store.player.soldier = { nation: soc.nation.id, rank: 0, kills: 0 }; O.deploy(); return 1; })()`);
      for (const [tag, secs] of [['front', 6], ['fight', 10]]) {
        await ev(`(async () => { const wait = ms => new Promise(q => setTimeout(q, ms)); for (let i = 0; i < ${secs} * 10; i++) { const f = ORBIS.getFlight(); if (f) { f.throttle = 0.6; } await wait(100); } return 1; })()`);
        const st = await ev(`(() => { const B = ORBIS.front; return { at: !!B.F, ours: B.ours.length, theirs: B.theirs.length, craters: ORBIS.planet.craters.length, flying: !!ORBIS.getFlight() }; })()`);
        console.log('   war', tag, JSON.stringify(st)); await shot('war-' + tag);
      }
      break;
    }
  }
  if (want('battle')) {
    // a raid, and the great ships answering it: Anvil's beams and missiles, Bastion's fighters, Sable's run
    await load('hour=' + (process.env.HOUR || 15) + '&fly=runabout0' + (process.env.PLANET ? '&planet=' + process.env.PLANET : ''));
    await ev(`(async () => { const O = ORBIS; O.startRaid(); return 1; })()`);
    const R = await ev(`(() => { const r = ORBIS.getRaid(); return r ? { bearing: r.bearing, target: r.target, n: r.raiders.length } : null; })()`);
    console.log('   raid', JSON.stringify(R));
    // bring the raiders in close to the Anvil, and watch from off its quarter: the beams, the cells opening, the missiles going
    await ev(`(() => { const O = ORBIS, A = O.fleet.find(c => c.model === 'anvil'), r = O.getRaid() || {}; for (let i = 0; i < 5; i++) (r.raiders ||= []).push(O.war.spawn('needle', 'raider', [A.x + 1800 + i * 240, A.y - 200 + i * 50, A.z + 1400 - i * 180], -2.3, 140)); return 1; })()`);
    for (const [tag, secs] of [['beam', 0.5], ['cells', 1.4], ['missiles', 2.6], ['after', 5]]) {
      await ev(`(async () => { const O = ORBIS, A = O.fleet.find(c => c.model === 'anvil'), f = O.getFlight(), wait = ms => new Promise(q => setTimeout(q, ms)); if (!f) return 0;
        const px = A.x + 3400, pz = A.z + 2600, py = A.y + 150, yaw = Math.atan2(A.x + 1500 - px, A.z + 1200 - pz); const F = await import('./js/player/flight.js');
        for (let i = 0; i < ${secs} * 10; i++) { f.pos = [px, py, pz]; f.vel = [0, 0, 0]; f.vtol = true; f.facing = yaw; f.q = F.fromEuler(yaw, -0.04, 0); f.w = [0, 0, 0]; f.syncEuler(); O.setCockpitView(false); O.cam.dist = 26; await wait(100); } return 1; })()`);
      const st = await ev(`(() => { const W = ORBIS.fleetWar; return { beams: W.beams.length, missiles: W.missiles.length, sliding: W.missiles.filter(m => m.phase === 'slide' && m.t > 0).length, raiders: ORBIS.getRaid()?.raiders.filter(c => c.alive).length }; })()`);
      console.log('   battle', tag, JSON.stringify(st)); await shot('battle-' + tag);
    }
  }
  if (want('vesper')) {
    await load('hour=' + (process.env.HOUR || 16) + '&fly=runabout0');
    for (let i = 0; i < 80 && !(await ev('ORBIS.capitalView.models.vesper ? 1 : 0')); i++) await sleep(500);
    for (const [tag, back, turn, pitch, dist] of [['terrace', 14, 0.9, 0.12, 5], ['shopfront', 7, 0, 0.05, 3.5], ['shop', -5, 3.14, 0.08, 2.2]]) {
      const R = await ev(`(async () => { const O = ORBIS, V = await import('./js/gen/vesper.js').then(m => m.vesperCity()), wait = ms => new Promise(r => setTimeout(r, ms)); O.setFlightForTest(null); O.ctrl.mode = 'walk';
        const u = V.units.find(q => q.type === 'store' && q.label !== 'workshop' && q.ez[1] === 1 && q.id > 600), b = O.vesperB, d = ${back}, x = u.O[0] + u.ex[0] * u.w / 2, z = u.O[1] - d;
        let at = b.toWorld(x, V.DY, z); O.ctrl.pos = [at[0], at[1] + 0.3, at[2]]; O.ctrl.vel = [0, 0, 0]; await wait(2500);
        const live = O.vesperStreets.live.get(u.id); if (live && d < 0) { const rec = live.rec, dr = rec.plan.doors[rec.plan.entrance], [wx, wz] = O.homeS.toWorld(rec.O[0] + rec.ex[0] * dr.x + rec.ez[0] * 4, rec.O[1] + rec.ex[1] * dr.x + rec.ez[1] * 4); O.ctrl.pos = [wx, rec.base + 0.1, wz]; }
        const o = b.toWorld(0, 0, 0), q = b.toWorld(0, 0, 1), yaw = Math.atan2(q[0] - o[0], q[2] - o[2]) + ${turn}; O.ctrl.facing = yaw; O.cam.yaw = yaw; O.cam.pitch = ${pitch}; O.cam.dist = ${dist}; await wait(2500);
        const loc = O.world.locate(...O.ctrl.pos); return { live: O.vesperStreets.live.size, real: !!live, room: loc?.room?.label || loc?.room?.purpose, label: u.label }; })()`);
      console.log('   vesper', tag, JSON.stringify(R)); await shot('vesper-' + tag);
    }
    const spots = [['roof', 'roof', 0, -0.25, 6], ['plaza', 'plaza', 3.14, 0.12, 6]];
    for (const [tag, where, turn, pitch, dist] of spots) {
      const R = await ev(`(async () => { const O = ORBIS, b = O.vesperB, V = await import('./js/gen/vesper.js').then(m => m.vesperCity()), wait = ms => new Promise(r => setTimeout(r, ms)); O.setFlightForTest(null); O.ctrl.mode = 'walk';
        const Lf = V.lifts.slice().sort((a, c) => V.towers[c.tower].h - V.towers[a.tower].h)[${tag === 'roof2' ? 3 : 0}], at = '${where}' === 'plaza' ? b.toWorld(V.plaza[0], V.DY, V.plaza[1] - 6) : b.toWorld(...Lf['${where}' === 'roof' ? 'roof' : 'street']);
        O.ctrl.pos = [at[0], at[1] + 0.3, at[2]]; O.ctrl.vel = [0, 0, 0]; const o = b.toWorld(0, 0, 0), q = b.toWorld(0, 0, 1), yaw = Math.atan2(q[0] - o[0], q[2] - o[2]) + ${turn}; O.ctrl.facing = yaw; O.cam.yaw = yaw; O.cam.pitch = ${pitch}; O.cam.dist = ${dist}; await wait(3000);
        return { grounded: O.ctrl.grounded, y: +(O.ctrl.pos[1] - at[1]).toFixed(2), lift: O.liftNear()?.L?.stops?.map(s => s.label) }; })()`);
      console.log('   vesper', tag, JSON.stringify(R)); await shot('vesper-' + tag);
    }
  }
  if (want('survey')) {
    await load('hour=' + (process.env.HOUR || 14));
    const go = async (tag, js) => { const r = await ev(`(async () => { const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms)); O.setFlightForTest?.(null); O.ctrl.mode = 'walk'; ${js}; await wait(3500); return 1; })()`).catch(e => String(e).slice(0, 200)); console.log('   survey', tag, r); await shot('survey-' + tag); };
    // inside a building in town, the hab's ground floor
    await go('inside', `const s = O.homeS, b = s.buildings.find(q => q.type === 'store') || s.buildings[0], [x, z] = s.toWorld(b.O[0] + b.ex[0] * b.w / 2 + b.ez[0] * 3, b.O[1] + b.ex[1] * b.w / 2 + b.ez[1] * 3); O.ctrl.pos = [x, O.world.groundAt(x, z, 1e4).h + 0.05, z]; O.ctrl.vel = [0, 0, 0]; const yaw = Math.atan2(b.ez[0], b.ez[1]); O.ctrl.facing = yaw; O.cam.yaw = yaw + 0.3; O.cam.pitch = 0.1; O.cam.dist = 2.5`);
    // a parked car up close
    await go('car', `const V = O.getVehicles().find(v => !v.city && v.pos) ; const [x, y, z] = V.pos; O.ctrl.pos = [x + 3.5, O.world.groundAt(x + 3.5, z + 2, 1e4).h + 0.05, z + 2]; O.ctrl.vel = [0, 0, 0]; const yaw = Math.atan2(x - O.ctrl.pos[0], z - O.ctrl.pos[2]); O.ctrl.facing = yaw; O.cam.yaw = yaw; O.cam.pitch = 0.15; O.cam.dist = 3`);
    // the megacity at street level
    await go('city', `const c = O.cityView.city, [x, z] = c.toWorld(40, 60); O.ctrl.pos = [x, O.world.groundAt(x, z, 1e4).h + 0.05, z]; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = 0.4; O.cam.yaw = 0.4; O.cam.pitch = 0.12; O.cam.dist = 4`);
    await go('city2', `O.ctrl.facing = 2.2; O.cam.yaw = 2.2; O.cam.pitch = 0.3; O.cam.dist = 4`);
    // animals
    await go('fauna', `const F = O.fauna; F.spawnTest?.(O.ctrl.pos[0] + 6, O.ctrl.pos[2] + 4); const s = O.homeS; const x = s.cx + 900, z = s.cz + 300; O.ctrl.pos = [x, O.world.groundAt(x, z, 1e4).h + 0.05, z]; F.spawnTest?.(x + 5, z + 5); O.ctrl.facing = 0.8; O.cam.yaw = 0.8; O.cam.pitch = 0.1; O.cam.dist = 3`);
  }
  if (want('cabin')) {
    await load('hour=' + (process.env.HOUR || 14));
    const list = await ev(`ORBIS.getShips().filter(sh => !sh.fleet && !sh.flying).slice(0, 12).map(sh => [sh.id, sh.model])`);
    const seen = new Set(); let n = 0;
    for (const [id, model] of list) {
      if (seen.has(model) || n >= 4) continue; seen.add(model); n++;
      const r = await ev(`(async () => { const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms)); O.syncShips(); const b = O.world.near ? null : null; const S = [...(O.world.loose || [])].map(q => q.b).concat([...O.world.grid.values()].flat()).find(q => q.key === '${id}'); if (!S) return 'not placed'; const L = S.plan.layout, [hx0, hz0, hx1, hz1] = L.hull, R = L.rooms[0], z = (R.rect[1] + R.rect[3]) / 2 - 1, u = S.O[0] + S.ex[0] * (hx0 + hx1) / 2 + S.ez[0] * z, v = S.O[1] + S.ex[1] * (hx0 + hx1) / 2 + S.ez[1] * z, T = O.world.townOf(S), [x, zz] = T.toWorld(u, v); O.ctrl.mode = 'walk'; O.ctrl.pos = [x, S.base + L.deck + 0.05, zz]; O.ctrl.vel = [0, 0, 0]; const [fx, fz] = O.world.fromBVec(S, 0, 1), yaw = Math.atan2(fx, fz); O.ctrl.facing = yaw; O.cam.yaw = yaw; O.cam.pitch = 0.05; O.cam.dist = 2.4; await wait(2500); return { room: O.world.locate(...O.ctrl.pos)?.room?.label }; })()`);
      console.log('   cabin', model, JSON.stringify(r)); await shot('cabin-' + model);
    }
  }
  if (want('town')) {
    await load('hour=' + (process.env.HOUR || 16));
    const walk = (x, z, yaw, pitch = 0.05, dist = 6) => ev(`(() => { const O = ORBIS, x = ${x}, z = ${z}, h = O.world.groundAt(x, z, 1e4).h; O.ctrl.mode = 'walk'; O.ctrl.pos = [x, h + 0.02, z]; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = ${yaw}; O.cam.yaw = ${yaw}; O.cam.pitch = ${pitch}; O.cam.dist = ${dist}; return h; })()`);
    // the next town along the road: built of designed buildings, not the home city
    const end = await ev(`(() => { const W = __Rs[0], a = W.pts[W.pts.length - 1]; return a; })()`);
    const B = await ev(`(() => { const T = ORBIS.currentTown, s = ORBIS.homeS; const L = s?.buildings || []; const hs = ORBIS.homeS; const cx = b => [hs.cx + b.O[0] + b.ex[0] * b.w / 2 + b.ez[0] * b.d / 2, hs.cz + b.O[1] + b.ex[1] * b.w / 2 + b.ez[1] * b.d / 2]; return { town: Object.keys(T || {}).slice(0, 14), n: L.length, list: L.slice(0, 120).map(b => [...cx(b), Math.atan2(b.ez[0], b.ez[1]), b.type, b.d]) }; })()`);
    console.log('   town', JSON.stringify(B.town), B.n, JSON.stringify(B.list.slice(0, 2)));
    const seen = {}; let k = 0;
    for (const [x, z, yaw, type, d] of B.list) { if (seen[type] || x == null) continue; seen[type] = 1; const a = yaw + 0.55, D = d / 2 + 11, px = x - Math.sin(a) * D, pz = z - Math.cos(a) * D; await hold(5000, () => walk(px, pz, a, 0.02, 3)); await shot('town-' + type); if (++k >= 5) break; }
  }
  if (want('village')) {
    await load('hour=' + (process.env.HOUR || 16) + '&fly');
    const walk = (x, z, yaw, pitch = 0.05, dist = 3) => ev(`(() => { const O = ORBIS, x = ${x}, z = ${z}, h = O.world.groundAt(x, z, 1e4).h; O.setFlightForTest?.(null); O.ctrl.mode = 'walk'; O.ctrl.pos = [x, h + 0.02, z]; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = ${yaw}; O.cam.yaw = ${yaw}; O.cam.pitch = ${pitch}; O.cam.dist = ${dist}; return h; })()`);
    // the nearest town that isn't home: walk there until it's built
    await hold(6000, () => ev('1'));
    const near = await ev(`(async () => { const { getSettlement } = await import('./js/gen/settlement.js'); const O = ORBIS, h = O.homeS; let best = null, bd = 1e12; for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) { const s = getSettlement(O.planet, h.rx + a, h.rz + b); if (!s || s === h) continue; const d = Math.hypot(s.cx - h.cx, s.cz - h.cz); if (d < bd) { bd = d; best = s; } } return best ? [best.cx, best.cz, best.key] : null; })()`);
    console.log('   town at', JSON.stringify(near));
    await hold(16000, () => walk(near[0], near[1], 0, 0.1, 6));
    const got = await ev(`(() => { const O = ORBIS, T = O.towns.full.get(${JSON.stringify(near[2])}); if (!T) return null; const s = T.s, L = s.buildings || []; const cx = b => [s.cx + b.O[0] + b.ex[0] * b.w / 2 + b.ez[0] * b.d / 2, s.cz + b.O[1] + b.ex[1] * b.w / 2 + b.ez[1] * b.d / 2]; return { ready: T.ready, n: L.length, list: L.slice(0, 80).map(b => [...cx(b), Math.atan2(b.ez[0], b.ez[1]), b.design?.shape || b.type, b.d]) }; })()`);
    console.log('   village', got ? got.n : 'none', JSON.stringify(got?.list?.slice(0, 2)));
    if (got) { const seen = {}; let k = 0; for (const [x, z, yaw, type, d] of got.list) { if (seen[type] || x == null) continue; seen[type] = 1; const a = yaw + 0.5, D = d / 2 + 9, px = x - Math.sin(a) * D, pz = z - Math.cos(a) * D; await hold(6000, () => walk(px, pz, a)); await shot('village-' + type); if (++k >= 4) break; } }
  }
  if (want('hamlet')) {
    await load('hour=' + (process.env.HOUR || 11) + '&fly');
    const walk = (x, z, yaw, pitch = 0.05, dist = 3) => ev(`(() => { const O = ORBIS, x = ${x}, z = ${z}, h = O.world.groundAt(x, z, 1e4).h; O.setFlightForTest?.(null); O.ctrl.mode = 'walk'; O.ctrl.pos = [x, h + 0.02, z]; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = ${yaw}; O.cam.yaw = ${yaw}; O.cam.pitch = ${pitch}; O.cam.dist = ${dist}; return h; })()`);
    const sites = await ev(`(async () => { const G = await import('./js/gen/outposts.js'), O = ORBIS, h = O.homeS, out = []; G.sitesNear(O.planet, h.cx, h.cz, 30000, S => { const b = S.buildings || S.houses || S.parts || []; out.push({ x: S.x, z: S.z, kind: S.kind || S.type, n: b.length, keys: Object.keys(S).slice(0, 12), d: Math.hypot(S.x - h.cx, S.z - h.cz) }); }); return out.sort((a, b) => b.n - a.n).slice(0, 6); })()`);
    console.log('   sites', JSON.stringify(sites).slice(0, 700));
    let k = 0; for (const S of sites.slice(0, 3)) { await hold(9000, () => walk(S.x + 22, S.z - 18, -0.9, 0.04, 4)); await shot('hamlet-' + (k++) + '-' + S.kind); }
    const items = await ev(`(async () => { const G = await import('./js/gen/outposts.js'), O = ORBIS, h = O.homeS; let V = null; G.sitesNear(O.planet, h.cx, h.cz, 30000, S => { if (S.kind === 'village' && (!V || Math.abs(S.x - ${sites[0].x}) < 1)) V = V || S; }); return V.items.filter(i => String(i.kind || i.k || i.model || '').startsWith('gb_')).slice(0, 3).map(i => [i.x, i.z, i.rot || 0]); })()`);
    console.log('   houses', JSON.stringify(items));
    k = 0; for (const [x, z, rot] of items) { const a = rot + 3.6, px = x - Math.sin(a) * 12, pz = z - Math.cos(a) * 12; await hold(5000, () => walk(px, pz, a, 0.0, 2.5)); await shot('house-' + (k++)); }
  }
  if (want('trees')) {
    await load('hour=11');
    const pos = await ev(`(async () => { const F = await import('./js/gen/flora.js').catch(() => null); const O = ORBIS, h = O.homeS; return [h.cx + 1500, h.cz + 400]; })()`);
    const walk = (x, z, yaw, pitch = 0.04, dist = 6) => ev(`(() => { const O = ORBIS, x = ${x}, z = ${z}, h = O.world.groundAt(x, z, 1e4).h; O.ctrl.mode = 'walk'; O.ctrl.pos = [x, h + 0.02, z]; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = ${yaw}; O.cam.yaw = ${yaw}; O.cam.pitch = ${pitch}; O.cam.dist = ${dist}; return h; })()`);
    const near = await ev(`(async () => { const F = await import('./js/gen/plants.js').catch(() => null); return null; })()`);
    await hold(9000, () => walk(pos[0], pos[1], 0.6)); await shot('trees-a');
    await hold(6000, () => walk(pos[0] - 900, pos[1] + 1400, 2.1)); await shot('trees-b');
  }
  if (want('stair')) {
    await load('hour=12&fly=runabout0');
    for (let i = 0; i < 80 && !(await ev('ORBIS.capitalView.models.longshore ? 1 : 0')); i++) await sleep(500);
    const L = JSON.parse(await (await fetch('http://127.0.0.1:' + PORT + '/assets/ships/capital.json')).text());
    for (const C of ['halcyon', 'meridian']) { const S = L[C + '_decks'].stairs[0], [a, b] = S.flights[1], x = (a + b) / 2;
      const r = await ev(`(async () => { const O = ORBIS, C = O.fleet.find(c => c.model === '${C}'), at = C.ship.at, wait = ms => new Promise(r => setTimeout(r, ms)), f = at.facing, fx = Math.sin(f), fz = Math.cos(f), lx = Math.cos(f), lz = -Math.sin(f), W = (X, Z) => [at.c[0] + fx * (Z - C.deckD / 2) + lx * (X - C.deckW / 2), at.c[2] + fz * (Z - C.deckD / 2) + lz * (X - C.deckW / 2)]; const fl = O.getFlight(); O.setFlightForTest(null); O.ctrl.mode = 'walk'; O.shipView.group.visible = false; const [px, pz] = W(${x}, ${S.foot} - 2); O.ctrl.pos = [px, at.c[1] + 1.05, pz]; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = f; O.cam.yaw = f; O.cam.pitch = 0.1; O.cam.dist = 4; await wait(800); const y0 = O.ctrl.pos[1] - at.c[1]; dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); let top = y0; for (let i = 0; i < 70; i++) { O.cam.yaw = f; await wait(100); top = Math.max(top, O.ctrl.pos[1] - at.c[1]); } dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); await wait(400); const end = O.ctrl.pos[1] - at.c[1]; return { y0: +y0.toFixed(2), top: +top.toFixed(2), end: +end.toFixed(2), want: ${S.by} }; })()`);
      console.log('   stair', C, JSON.stringify(r)); await shot('stair-' + C); }
  }
  if (want('lights')) {
    await load('hour=11');
    const J = await ev(`(async () => { const R = await import('./js/gen/roadrules.js'), s = ORBIS.homeS, L = R.townSignals(s); return L.slice(0, 40).map(S => ({ x: S.x, z: S.z, hv: S.hv, hu: S.hu, arms: S.arms })); })()`); console.log('   lights', J.length);
    const S = J.find(q => q.arms.vm && q.arms.vp && q.arms.up && q.arms.um) || J[0], yawV = await ev('Math.atan2(-ORBIS.homeS.sin, ORBIS.homeS.cos)'), bw = await ev(`[-ORBIS.homeS.sin, ORBIS.homeS.cos]`);
    const walk = (x, z, yaw, pitch, dist) => ev(`(() => { const O = ORBIS, x = ${x}, z = ${z}, h = O.world.groundAt(x, z, 1e4).h; O.ctrl.mode = 'walk'; O.ctrl.pos = [x, h + 0.02, z]; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = ${yaw}; O.cam.yaw = ${yaw}; O.cam.pitch = ${pitch}; O.cam.dist = ${dist}; return h; })()`);
    await hold(6000, () => walk(S.x - bw[0] * 22 + bw[1] * 1.8, S.z - bw[1] * 22 - bw[0] * 1.8, yawV, 0.12, 6)); await shot('lights-junction');
    await hold(3000, () => walk(S.x - bw[0] * 16 + bw[1] * 12, S.z - bw[1] * 16 - bw[0] * 12, yawV - 0.6, 0.5, 26)); await shot('lights-from-above');
    await hold(3000, () => walk(S.x - bw[0] * (S.hv + 9) + bw[1] * 1.5, S.z - bw[1] * (S.hv + 9) - bw[0] * 1.5, yawV, -0.32, 2.5)); await shot('lights-close');
  }
  if (want('land')) {
    await load('hour=16');
    const walk = (x, z, yaw, { pitch = 0.08, dist = 5.5 } = {}) => ev(`(() => { const O = ORBIS, x = ${x}, z = ${z}, h = O.world.groundAt(x, z, 1e4).h; O.ctrl.mode = 'walk'; O.ctrl.pos = [x, h + 0.02, z]; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = ${yaw}; O.cam.yaw = ${yaw}; O.cam.pitch = ${pitch}; O.cam.dist = ${dist}; return h; })()`);
    // the steepest ground within reach of the road, looked at from below it
    const st = await ev(`(async () => { const S = await import('./js/gen/surface.js'), W = __Rs[0], a = W.pts[Math.floor(W.pts.length * 0.4)]; let best = null; for (let i = -24; i <= 24; i++) for (let j = -24; j <= 24; j++) { const x = a[0] + i * 40, z = a[1] + j * 40, h = S.surfaceAt(ORBIS.planet, x, z).h, gx = S.surfaceAt(ORBIS.planet, x + 8, z).h - h, gz = S.surfaceAt(ORBIS.planet, x, z + 8).h - h, sl = Math.hypot(gx, gz) / 8; if (!S.surfaceAt(ORBIS.planet, x, z).road && !S.surfaceAt(ORBIS.planet, x, z).roadW && sl < 1.4 && (!best || sl > best.sl)) best = { x, z, sl, gx, gz, h }; } return best; })()`);
    console.log('   steepest', JSON.stringify(st));
    const down = Math.hypot(st.gx, st.gz) || 1, ux = st.gx / down, uz = st.gz / down, yaw = Math.atan2(ux, uz);
    await hold(7000, () => walk(st.x - ux * 90, st.z - uz * 90, yaw, { pitch: -0.1 })); await shot('13-rock-face-90m');
    await hold(4000, () => walk(st.x - ux * 22, st.z - uz * 22, yaw, { pitch: -0.05 })); await shot('14-rock-face-22m');
    await hold(4000, () => walk(st.x - ux * 3, st.z - uz * 3, yaw, { pitch: 0.05, dist: 3 })); await shot('15-rock-at-arms-length');
  }
  if (want('probe')) {
    await load('hour=16');
    const a = await ev(`(async () => { const S = await import('./js/gen/surface.js'), T = await import('./js/gen/terrain.js'), W = __Rs[0], a = W.pts[Math.floor(W.pts.length * 0.4)]; let n = 0, tear = 0, worst = 0, at = null; for (let i = -300; i <= 300; i++) for (let j = -300; j <= 300; j += 1) { const x = a[0] + i * 3, z = a[1] + j * 3, h = S.surfaceAt(ORBIS.planet, x, z).h, g = Math.abs(S.surfaceAt(ORBIS.planet, x + 1, z).h - h); n++; if (g > 2.5) tear++; if (g > worst) { worst = g; at = [x, z, h]; } } return { n, tear, worst, at }; })()`);
    console.log('   ground jumps over 1 m:', JSON.stringify(a));
    const [x, z] = a.at;
    const walk = (yaw) => ev(`(() => { const O = ORBIS, x = ${x} - Math.sin(${yaw}) * 26, z = ${z} - Math.cos(${yaw}) * 26, h = O.world.groundAt(x, z, 1e4).h; O.ctrl.mode = 'walk'; O.ctrl.pos = [x, h + 0.02, z]; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = ${yaw}; O.cam.yaw = ${yaw}; O.cam.pitch = 0.2; O.cam.dist = 7; return h; })()`);
    await hold(6000, () => walk(0.7)); await shot('p1-worst-jump');
    await ev(`(() => { ORBIS.renderer.shadowMap.enabled = false; ORBIS.scene.traverse(o => { if (o.isDirectionalLight) o.castShadow = false; if (o.material) o.material.needsUpdate = true; }); return 1; })()`);
    await hold(3000, () => walk(0.7)); await shot('p2-no-shadows');
  }
  console.log(errs.length ? '   ERRORS ' + errs.slice(0, 3).join(' | ').slice(0, 600) : '   no errors');
  ws.close();
} finally { stop(); }
process.exit(0);
