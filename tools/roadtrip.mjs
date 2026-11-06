// A trip down the road from home to the next town, in the real browser.
import { spawn } from 'node:child_process';
import { preflight, guardBrowser } from './guard.mjs';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8517, CDP = 9337, slot = 'roadtrip' + process.pid;
const profile = join(tmpdir(), 'orbis-roadtrip-' + process.pid);
preflight();
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`,
  '--window-size=1280,800', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--use-angle=metal', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--no-first-run', 'about:blank'], { stdio: 'ignore', detached: true });
guardBrowser(chrome, profile, { maxSeconds: 900 });
// a time limit (SIGALRM) or a kill must not leave this browser running: it holds memory and skews the next run
for (const sig of ['SIGALRM', 'SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { try { process.kill(-chrome.pid, 'SIGKILL'); } catch { try { chrome.kill('SIGKILL'); } catch {} } try { rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(124); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; return c; };
try {
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${CDP}/json/version`); break; } catch { await sleep(200); } }
  const target = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map(), errs = [];
  ws.onmessage = m => { const x = JSON.parse(m.data); if (x.id) pend.get(x.id)?.(x); if (x.method === 'Runtime.exceptionThrown') errs.push(x.params.exceptionDetails.exception?.description); };
  const send = (method, params = {}) => new Promise((r, rej) => { const i = ++id, to = setTimeout(() => { pend.delete(i); rej(new Error(`STUCK: no reply from the page in 5 minutes (${method}: ${String(params.expression || '').slice(0, 120)})`)); }, 300000); pend.set(i, x => { clearTimeout(to); r(x); }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(expr + ' → ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result.result.value; };
  const key = async (code, type) => ev(`dispatchEvent(new KeyboardEvent('${type}', { code: '${code}' })), 1`);
  const load = async q => {
    await send('Runtime.enable');
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?slot=${slot}&${q}` });
    let t = '';
    for (let i = 0; i < 480; i++) { await sleep(500); t = await ev('document.title').catch(e => 'evalerr'); if (t === 'READY') return true; if (t.startsWith('ERROR')) break; }
    console.log('   title:', t, errs.slice(0, 3)); return false;
  };
  const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }); writeFileSync(`out/trip-${name}.jpg`, Buffer.from(r.result.data, 'base64')); };
  const wait = ms => sleep(ms);
  const until = async (expr, ms = 60000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await ev(expr)) return true; await sleep(250); } return false; };
  const goto = (x, z, face = 0) => ev(`(() => { const O = ORBIS, h = O.world.groundAt(${x}, ${z}, 1e4).h; O.ctrl.mode = 'walk'; O.ctrl.pos = [${x}, h + 0.05, ${z}]; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = ${face}; O.cam.yaw = ${face}; return h; })()`);
  if (!check(await load('auto=new&seed=00c0ffee00b0a7e5&hour=10'), 'world loads')) throw new Error('no world');
  const R = await ev(`(async () => { const { linksOfTown } = await import('./js/gen/network.js'); const O = ORBIS, L = linksOfTown(O.planet, O.homeS); window.__R = L[0]; window.__Rs = L; return { n: L.length, km: L[0].length / 1000, ends: L[0].ends, bridges: L[0].bridges.length }; })()`);
  console.log('   home has', R.n, 'roads; first is', R.km.toFixed(1), 'km to', R.ends.join(' / ').replace(/galaxy:0\/sector:0,0,0\/system:0\/body:3\//g, ''), R.bridges, 'bridges');
  check(R.n >= 1, 'home is on the road map');
  const at = async f => ev(`(() => { const O = ORBIS, W = __R, i = Math.floor(${f} * (W.pts.length - 2)), a = W.pts[i], b = W.pts[i + 1], h = O.world.groundAt(a[0], a[1], W.h[i] + 1).h, y = Math.atan2(b[0] - a[0], b[1] - a[1]); O.ctrl.mode = 'walk'; O.ctrl.pos = [a[0], h + 0.02, a[1]]; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = y; O.cam.yaw = y; return [Math.abs(h - W.h[i]).toFixed(2), a[0] | 0, a[1] | 0]; })()`);
  await ev(`(() => { window.__ft = []; let last = performance.now(); const f = n => { __ft.push(n - last); last = n; window.__raf = requestAnimationFrame(f); }; requestAnimationFrame(f); })()`);
  // along it at about 40 m/s: a screenshot at each stage, ground and road agreeing the whole way
  let worstGap = 0; const STEPS = 60;
  for (let k = 0; k <= STEPS; k++) { const [g] = await at(k / STEPS); worstGap = Math.max(worstGap, +g); await sleep(R.km * 1000 / 40 / STEPS * 250 / 4); if ([6, 20, 35, 50, 60].includes(k)) { await sleep(1500); await shot('road' + k); } }
  const ft = await ev(`(() => { cancelAnimationFrame(__raf); const a = __ft.slice(5).sort((p, q) => p - q); return { n: a.length, med: a[a.length >> 1], p99: a[Math.floor(a.length * 0.99)], worst: a.at(-1), over100: a.filter(x => x > 100).length }; })()`);
  console.log('    frames:', JSON.stringify(ft), 'ground vs road worst', worstGap, 'm');
  check(worstGap < 6, 'you are on the road the whole way');
  check(await until(`ORBIS.roadView.shown.has(__R) && !!ORBIS.roadView.shown.get(__R)`, 15000), 'it is drawn');
  const cars = await ev(`(async () => { const { trafficNear } = await import('./js/gen/traffic.js'); const O = ORBIS; let n = 0, ids = []; for (let f = 0.1; f < 1; f += 0.1) { const a = __R.pts[Math.floor(f * __R.pts.length)]; const c = trafficNear(O.planet, O.s, O.clock.now(), a[0], a[1], 700).filter(v => v.id.includes('|')); n += c.length; } return n; })()`);
  check(cars > 0, cars + ' sightings of cars on the road');
  check(!errs.length, 'no errors ' + errs.slice(0, 3).join(' | ').slice(0, 500));
  await ev(`(async () => { await new Promise(r => { const q = indexedDB.deleteDatabase('orbis-${slot}'); q.onsuccess = q.onerror = q.onblocked = r; }); return 1; })()`).catch(() => {});
  ws.close();
} finally {
  try { process.kill(-chrome.pid, 'SIGKILL'); } catch { chrome.kill(); }   // whole group: helpers too
  await sleep(300); try { rmSync(profile, { recursive: true, force: true }); } catch {} }
console.log(fails ? `\n${fails} failure(s)` : '\nall green'); process.exit(fails ? 1 : 0);
