// The round planet, in the real browser: up to orbit, over every cut of the unfolded globe, and the far side.
import { spawn } from 'node:child_process';
import { preflight, guardBrowser } from './guard.mjs';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8517, CDP = 9340, slot = 'orbit' + process.pid;
const profile = join(tmpdir(), 'orbis-orbit-' + process.pid);
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
  await send('Runtime.enable'); await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?slot=${slot}&auto=new&seed=00c0ffee00b0a7e5&hour=10&fly` });
  let T = ''; for (let i = 0; i < 240; i++) { await sleep(500); T = await ev('document.title').catch(() => ''); if (T === 'READY' || T.startsWith('ERROR')) break; } check(T === 'READY', 'loads at the helm: ' + T);
  await ev(`(async () => { window.__G = await import('./js/gen/globe.js'); window.__T = await import('./js/gen/terrain.js'); window.__g = __G.globeOf(ORBIS.planet); return 1; })()`);
  const info = await ev(`({ R: __g.R, L: __g.L })`); console.log('   radius', info.R / 1000, 'km');
  const up = (y, n) => ev(`(() => { const f = ORBIS.getFlight(); f.pos[1] = ${y}; f.vel = [Math.sin(f.facing) * 150, 0, Math.cos(f.facing) * 150]; return 1; })()`);
  const orbitShot = async n => { const a = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 }); writeFileSync(`out/orbit-${n}.jpg`, Buffer.from(a.result.data, 'base64')); };
  // up through the air
  for (const [n, y] of [['12km', 12000], ['100km', 100000], ['2000km', 2e6], ['30000km', 3e7]]) { await up(y); await sleep(n === '30000km' ? 5000 : 3000); await orbitShot(n); }
  check(await until(`ORBIS.globeView.done >= 6`, 30000), 'the whole planet has been drawn');
  // climbing on its own power: hold Space
  await ev(`(() => { const f = ORBIS.getFlight(); f.pos[1] = 1500 + ORBIS.world.groundAt(f.pos[0], f.pos[2], 1e4).h; f.vel = [0, 0, 0]; f.throttle = 0; return 1; })()`); const r0 = await ev(`ORBIS.getFlight().pos[1]`); await key('Space', 'keydown'); await sleep(6000); await key('Space', 'keyup'); const risen = await ev(`ORBIS.getFlight().pos[1]`) - r0; console.log('    Space for 6 s: up', Math.round(risen), 'm');
  check(risen > 300, 'the ship climbs when told');
  await up(60000); await ev(`(() => { const f = ORBIS.getFlight(); f.throttle = 1; return 1; })()`); await sleep(6000); const quick = await ev(`ORBIS.getFlight().airspeed`); console.log('    full throttle in space for 6 s:', Math.round(quick), 'm/s'); check(quick > 1500, 'and goes fast out of the air');
  await ev(`(() => { ORBIS.getFlight().throttle = 0.3; return 1; })()`);
  // over every cut of the unfolded globe, high and low: you carry on across it, the same way
  const cuts = await ev(`(() => { const out = []; for (const F of __g.faces) for (let k = 0; k < 4; k++) { if (F.sides[k].same) continue; const [sx, sz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][k]; out.push([F.i, k, sx, sz]); } return out; })()`);
  let across = 0;
  for (const [fi, k, sx, sz] of cuts) for (const y of [3000, 60000]) {
    const r = await ev(`(async () => { const O = ORBIS, f = O.getFlight(), G = __g, F = G.faces[${fi}], L = G.L, tx = ${sz}, tz = ${sx}, off = 0.13 * L, x = F.x + ${sx} * (L / 2 - 800) + tx * off, z = F.z + ${sz} * (L / 2 - 800) + tz * off, sp = 400;
      f.pos[0] = x; f.pos[1] = ${y} + Math.max(0, __T.rawHeight(O.planet, x, z)); f.pos[2] = z; f.vel = [${sx} * sp, 0, ${sz} * sp]; const yaw = Math.atan2(${sx}, ${sz}), c0 = O.camera.position.clone(); f.q = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]; f.syncEuler(); f.throttle = 0.3;
      const P0 = __G.toSphere(G, x, z).slice(), fr0 = __G.frameAt(G, x, z), dir0 = [0, 1, 2].map(i => fr0.ex[i] * ${sx} + fr0.ez[i] * ${sz});
      let was = __G.faceAt(G, f.pos[0], f.pos[2])?.i, crossed = null, jump = 0, prev = P0.slice(); const t0 = performance.now();
      while (performance.now() - t0 < 12000) { await new Promise(r => requestAnimationFrame(r)); const P = __G.toSphere(G, f.pos[0], f.pos[2]).slice(); jump = Math.max(jump, Math.hypot(P[0] - prev[0], P[1] - prev[1], P[2] - prev[2]) * G.R); prev = P; const now = __G.faceAt(G, f.pos[0], f.pos[2])?.i; if (now !== undefined && now !== was) { crossed = now; if (performance.now() - t0 > 100) { await new Promise(r => setTimeout(r, 600)); break; } } }
      const fr1 = __G.frameAt(G, f.pos[0], f.pos[2]), vl = Math.hypot(f.vel[0], f.vel[2]) || 1, dir1 = [0, 1, 2].map(i => fr1.ex[i] * f.vel[0] / vl + fr1.ez[i] * f.vel[2] / vl), head = [0, 1, 2].map(i => fr1.ex[i] * Math.sin(f.facing) + fr1.ez[i] * Math.cos(f.facing));
      const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      return { crossed, jump: Math.round(jump), onMap: !!__G.faceAt(G, f.pos[0], f.pos[2]), vdot: +dot(dir0, dir1).toFixed(2), hdot: +dot(dir0, head).toFixed(2), speed: Math.round(Math.hypot(...f.vel)), ship: !!O.getFlight() }; })()`);
    const ok = r.crossed !== null && r.onMap && r.jump < 500 && r.vdot > 0.75 && r.hdot > 0.75; if (ok) across++; else console.log('   face', fi, 'side', k, 'at', y, JSON.stringify(r));
    await ev(`(() => { const f = ORBIS.getFlight(); if (f) { f.pos[1] = 60000; f.vel = [0, 0, 0]; } return 1; })()`);
  }
  check(across === cuts.length * 2, `across all ${cuts.length} cuts, high and low, without a jump: ${across} crossings`);
  // the far side: find land a long way from home; the ground there is real, and the time of day is its own
  const far = await ev(`(() => { const G = __g, O = ORBIS; let best = null; for (let k = 0; k < 3000 && !best; k++) { const a = k * 2.399963, y = 0.5 - k / 3000, r = Math.sqrt(1 - y * y), [x, z] = __G.fromSphere(G, [-Math.cos(a) * r, y, -Math.abs(Math.sin(a)) * r]); if (__G.wellInside(G, x, z, 90000) && __T.rawHeight(O.planet, x, z) > 40) best = [x, z]; } return best; })()`);
  const h0 = await ev(`ORBIS.clock ? ORBIS.ui && document.querySelector('.clock, .time')?.textContent || '' : ''`);
  await ev(`(() => { const f = ORBIS.getFlight(), [x, z] = ${JSON.stringify(far)}; f.pos[0] = x; f.pos[2] = z; f.pos[1] = 600 + __T.rawHeight(ORBIS.planet, x, z); f.vel = [Math.sin(f.facing) * 90, 0, Math.cos(f.facing) * 90]; f.throttle = 0.5; return 1; })()`);
  await sleep(14000); const fs = await ev(`(() => { const O = ORBIS, f = O.getFlight(); return f ? { alt: Math.round(f.altitude()), km: Math.round(__G.surfaceDistance(__g, 0, 0, f.pos[0], f.pos[2]) / 1000), sh: +O.planet.hourShift.toFixed(3), lat: +(O.planet.latHere * 57.3).toFixed(0), hud: document.querySelector('.where')?.textContent?.slice(0, 40), tiles: 1 } : null; })()`);
  console.log('   far side:', JSON.stringify(fs)); await orbitShot('farside');
  check(fs && fs.km > 8000, 'a long way from home');
  check(fs && Math.abs(fs.sh) > 0.1, 'and it is another time of day there');
  check(!errs.length, 'no errors ' + errs.slice(0, 3).join(' | ').slice(0, 500));
  await ev(`(async () => { await new Promise(r => { const q = indexedDB.deleteDatabase('orbis-${slot}'); q.onsuccess = q.onerror = q.onblocked = r; }); return 1; })()`).catch(() => {});
  ws.close();
} finally {
  try { process.kill(-chrome.pid, 'SIGKILL'); } catch { chrome.kill(); }   // whole group: helpers too
  await sleep(300); try { rmSync(profile, { recursive: true, force: true }); } catch {} }
console.log(fails ? `\n${fails} failure(s)` : '\nall green'); process.exit(fails ? 1 : 0);
