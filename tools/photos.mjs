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
  ws.onmessage = m => { const x = JSON.parse(m.data); if (x.id) pend.get(x.id)?.(x); if (x.method === 'Runtime.exceptionThrown') errs.push(x.params.exceptionDetails.exception?.description); };
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
  const hold = async (ms, fn) => { const end = Date.now() + ms; while (Date.now() < end) { await fn(); await sleep(350); } };

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
  console.log(errs.length ? '   ERRORS ' + errs.slice(0, 3).join(' | ').slice(0, 600) : '   no errors');
  ws.close();
} finally { stop(); }
process.exit(0);
