// Headless-Chrome screenshots of the real game, via the DevTools protocol.
//   node tools/shots.mjs [name...]   → out/shots/<name>.png
// Uses an isolated in-memory save (?store=mem) and a fixed seed so shots are repeatable.
// Kills only the Chrome it started (own --user-data-dir).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8517, CDP = 9333;
const SHOTS = {
  aerial: 'cam=aerial&hour=15', far: 'cam=far&hour=9', street: 'cam=street&hour=10', door: 'cam=door&hour=16',
  interior: 'cam=interior&hour=13', stairs: 'cam=stairs&hour=13', night: 'cam=aerial&hour=22', dusk: 'cam=street&hour=19',
  play: 'hour=11', people: 'cam=people&hour=17.3', work: 'cam=work&hour=11', patrol: 'cam=patrol&hour=10.3', sleep: 'cam=sleep&hour=2.5',
};
// shots that need the game driven a little after load (run in the page once READY)
const inside = `const { buildingToWorld } = await import('./js/gen/place.js'); const { buildingPlan } = await import('./js/gen/building.js');
  const into = k => { const b = O.pop.buildingByKey.get(k), pl = buildingPlan(O.planet, O.s, b), d = pl.doors[pl.entrance]; O.ctrl.pos = buildingToWorld(O.s, b, d.x, 0, d.z + 2); O.ctrl.vel = [0, 0, 0]; };`;
const SCRIPTS = {
  jobs: `const O = ORBIS; ${inside} O.store.player.skills.tech = 0.4; into(O.polity.security); await new Promise(r => setTimeout(r, 500)); O.showWork();`,
  shift: `const O = ORBIS; ${inside} const { applyFor } = await import('./js/sim/processes/work.js'); const { vacancies } = await import('./js/gen/careers.js');
    const P = O.store.player; P.skills = { admin: .9, trade: .9, tech: .9 }; P.fitness = .9;
    applyFor(O.ctx, vacancies(O.pop, O.store, O.clock.now())[0], O.clock.now());
    for (let i = 0; i < 80 && !P.job; i++) { O.clock.advance(O.planet.dayLength / 24); await new Promise(r => setTimeout(r, 50)); }
    O.clock.advance(P.shift.t0 + 600 - O.clock.now()); into(P.job.b); await new Promise(r => setTimeout(r, 2500)); document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' })); dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' }));`,
};
const warrant = `const { issueWarrant } = await import('./js/sim/processes/law.js'); const { doorstep } = await import('./js/gen/place.js');
    const hq = O.pop.buildingByKey.get(O.polity.security), ds = doorstep(O.s, hq, buildingPlan(O.planet, O.s, hq));
    O.ctrl.pos = ds.pos.slice(); await new Promise(r => setTimeout(r, 800));
    const t = O.clock.now(); issueWarrant(O.ctx, t, 'unpaid fine'); O.ctx.onServe(t);
    for (let i = 0; i < 400; i++) { const q = O.getPursuit(); if (!q || O.store.player.custody || Math.hypot(q.pos[0] - O.ctrl.pos[0], q.pos[2] - O.ctrl.pos[2]) < WITHIN) break; O.ctrl.pos = ds.pos.slice(); O.ctrl.speed = 4; await new Promise(r => setTimeout(r, 250)); }
    const q = O.getPursuit(); if (q) { O.ctrl.facing = Math.atan2(q.pos[0] - O.ctrl.pos[0], q.pos[2] - O.ctrl.pos[2]); O.cam.yaw = O.ctrl.facing + 0.5; O.cam.pitch = 0.12; O.cam.dist = 3.5; }`;
SCRIPTS.arrest = `const O = ORBIS; ${inside} ${warrant.replace('WITHIN', '9')}`;
SCRIPTS.cell = `const O = ORBIS; ${inside} ${warrant.replace('WITHIN', '0')} for (let i = 0; i < 200 && !O.store.player.custody; i++) await new Promise(r => setTimeout(r, 250)); O.cam.yaw += 2.4; O.cam.dist = 2.6; await new Promise(r => setTimeout(r, 1500));`;
SCRIPTS.register = `const O = ORBIS; ${inside} for (let d = 0; d < 200; d++) { O.clock.advance(O.planet.dayLength); if (d % 20 === 0) await new Promise(r => setTimeout(r, 20)); }
    into(O.polity.security); await new Promise(r => setTimeout(r, 800)); O.showWork(); await new Promise(r => setTimeout(r, 300)); document.querySelector('.panel.work').scrollTop = 1e5;`;
SCRIPTS.family = `const O = ORBIS; const { catchUp } = await import('./js/sim/offline.js'); const t = O.clock.now();
    let r = null, T = t; for (let k = 0; k < 40 && !(r && r.events.some(e => e.rel)); k++) { r = catchUp(O.ctx, T, T + 60 * O.planet.dayLength, 'idle'); T += 60 * O.planet.dayLength; }
    O.clock.advance(T - O.clock.now()); r.tFrom = t; r.elapsed = T - t; r.events = O.store.eventsBetween(t, T); O.ui.away(r, O.planet);`;
SCRIPTS.kin = SCRIPTS.family.replace('O.ui.away(r, O.planet);', "O.ui.closePanel(); dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' }));");
SHOTS.register = 'hour=11'; SHOTS.family = 'hour=11'; SHOTS.kin = 'hour=11';
SCRIPTS.road = `const O = ORBIS; const { outRoutes } = await import('./js/gen/highways.js'); const { surfaceHeight } = await import('./js/gen/surface.js');
    const r = outRoutes(O.planet, O.s)[Number(new URLSearchParams(location.search).get('road') || 0)], i = Math.floor(r.pts.length * 0.3), [x, z] = r.pts[i], [x2, z2] = r.pts[i + 12];
    O.ctrl.pos = [x, surfaceHeight(O.planet, x, z) + 0.2, z]; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = Math.atan2(x2 - x, z2 - z); O.cam.yaw = O.ctrl.facing; O.cam.pitch = 0.05; O.cam.dist = 6;
    await new Promise(r => setTimeout(r, 4000));`;
SCRIPTS.road1 = SCRIPTS.road.replace("|| 0", "|| 1");
SCRIPTS.roaddbg = SCRIPTS.road1 + " O.scene.traverse(o => { if (o.isMesh && !o.parent?.name?.startsWith('settlement') && o.parent !== O.scene) o.visible = false; }); O.cam.pitch = 0.6; O.cam.dist = 40; await new Promise(r => setTimeout(r, 800));";
SHOTS.roaddbg = 'hour=10&road=1';
SCRIPTS.ladder = `const O = ORBIS; const P = O.ctrl.pos; const l = O.ladders.slice().sort((a, b) => Math.hypot(a.foot[0] - P[0], a.foot[2] - P[2]) - Math.hypot(b.foot[0] - P[0], b.foot[2] - P[2]))[0];
    O.ctrl.pos = l.foot.slice(); await new Promise(r => setTimeout(r, 500)); dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); await new Promise(r => setTimeout(r, 4500)); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    O.cam.yaw = l.facing + 2.4; O.cam.pitch = 0.1; O.cam.dist = 5; await new Promise(r => setTimeout(r, 600));`;
SCRIPTS.roof = SCRIPTS.ladder.replace('4500', '20000').replace('l.facing + 2.4', 'l.facing + 3.1').replace('O.cam.pitch = 0.1', 'O.cam.pitch = 0.35');
SHOTS.ladder = 'hour=15'; SHOTS.roof = 'hour=15';
SHOTS.peoplebox = SHOTS.people + '&boxprops'; SHOTS.interiorbox = SHOTS.interior + '&boxprops';
SHOTS.road = 'hour=10&road=0'; SHOTS.road1 = 'hour=10&road=1';
SHOTS.jobs = 'hour=11'; SHOTS.shift = 'hour=11'; SHOTS.arrest = 'hour=10.5'; SHOTS.cell = 'hour=10.5';
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS);
for (const n of want) if (n.startsWith('booth')) SHOTS[n] = '';
const seed = process.env.SEED || '00c0ffee00b0a7e5';
mkdirSync('out/shots', { recursive: true });
const profile = join(tmpdir(), 'orbis-shots-' + process.pid);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, '--window-size=1600,900',
  '--disable-gpu-vsync', '--disable-frame-rate-limit', '--use-angle=metal', '--enable-unsafe-swiftshader', '--no-first-run', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
let stderr = ''; chrome.stderr.on('data', d => { stderr += d; });
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  let ver;
  for (let i = 0; i < 50 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json(); } catch { await sleep(200); } }
  for (const name of want) {
    const target = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    let id = 0; const pending = new Map(); const logs = [];
    ws.onmessage = m => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
      if (msg.method === 'Runtime.exceptionThrown') logs.push('EXC ' + JSON.stringify(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text).slice(0, 400));
      if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) logs.push(msg.params.type + ' ' + msg.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 300));
      if (msg.method === 'Network.loadingFailed') logs.push('NETFAIL ' + msg.params.errorText);
    };
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Runtime.enable'); await send('Network.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
    // booth[:variant] → the asset booth (tools/booth.html): every variant on a grid, or one up close
    // boothm:<material> → one surface; GALLERY=1 hides the booth's label
    const bq = name.includes(':') ? (name.startsWith('boothm') ? '?m=' : '?v=') + name.split(':')[1] + (process.env.GALLERY ? '&clean' : '') : '';
    const url = name.startsWith('booth') ? `http://127.0.0.1:${PORT}/tools/booth.html${bq}`
      : `http://127.0.0.1:${PORT}/?store=mem&auto=new&seed=${seed}&${SHOTS[name]}`;
    const t0 = Date.now();
    await send('Page.navigate', { url });
    let ready = false;
    while (Date.now() - t0 < 120000) {
      const r = await send('Runtime.evaluate', { expression: 'document.title' });
      const title = r.result?.result?.value || '';
      if (title === 'READY') { ready = true; break; }
      if (title.startsWith('ERROR')) { logs.push(title); break; }
      await sleep(500);
    }
    if (SCRIPTS[name]) { const r = await send('Runtime.evaluate', { expression: `(async () => { ${SCRIPTS[name]} })()`, awaitPromise: true }); if (r.result?.exceptionDetails) logs.push('SCRIPT ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400)); }
    await sleep(2500);
    const info = await send('Runtime.evaluate', { expression: 'JSON.stringify({ r: window.ORBIS?.renderer?.info?.render, ui: document.querySelector(".debug")?.textContent })' });
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`out/shots/${name.replace(':', '-')}.png`, Buffer.from(shot.result.data, 'base64'));
    console.log(`${name}: ${ready ? 'ok' : 'NOT READY'} ${((Date.now() - t0) / 1000).toFixed(1)}s ${info.result?.result?.value || ''}`);
    for (const l of logs.slice(0, 12)) console.log('   ', l);
    ws.close();
    await fetch(`http://127.0.0.1:${CDP}/json/close/${target.id}`);
  }
} finally {
  try { process.kill(-chrome.pid, 'SIGKILL'); } catch { chrome.kill(); }   // whole group: helpers too
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  if (process.env.DEBUG) console.log(stderr.slice(-2000));
}
