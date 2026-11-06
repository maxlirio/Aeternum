// A set of photographs of the game as it stands, into out/photos/. Headless, one browser, cleaned up afterwards.
import { spawn } from 'node:child_process';
import { preflight, guardBrowser } from './guard.mjs';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8517, CDP = 9341, slot = 'photos' + process.pid, SEED = process.env.SEED || '00c0ffee00b0a7e5';
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
  const hold = async (ms, fn) => { const end = Date.now() + ms; let i = 0; while (Date.now() < end || (i++ < 400 && await ev('ORBIS.terrain.pending > 0').catch(() => false))) { await fn(); await sleep(350); } };

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
    let paintN = 0;
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
