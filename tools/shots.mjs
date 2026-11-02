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

// using things at home: stand at a piece of furniture (by kind) and press E
const useAt = (kind, after = '') => `const O = ORBIS, P = O.store.player, wait = ms => new Promise(r => setTimeout(r, ms));
    const { usablesOf, ownership } = await import('./js/sim/processes/use.js'); const { buildingToWorld } = await import('./js/gen/place.js');
    const FRONT = [[0, -1], [1, 0], [0, 1], [-1, 0]], home = O.pop.buildingByKey.get(P.home);
    const u = usablesOf(O.planet, O.s, home).find(u => u.pr.kind === '${kind}' && ownership(home, u.room, P).yours) || usablesOf(O.planet, O.s, home).find(u => u.pr.kind === '${kind}');
    const pr = u.pr, F = FRONT[pr.face], cx = (pr.x0 + pr.x1) / 2, cz = (pr.z0 + pr.z1) / 2, dep = F[0] ? pr.x1 - pr.x0 : pr.z1 - pr.z0;
    const at = buildingToWorld(O.s, home, cx + F[0] * (dep / 2 + 0.45), pr.y, cz + F[1] * (dep / 2 + 0.45)), c = buildingToWorld(O.s, home, cx, pr.y, cz);
    O.ctrl.pos = at; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = Math.atan2(c[0] - at[0], c[2] - at[2]); O.cam.yaw = O.ctrl.facing + 0.6; O.cam.pitch = 0.35; O.cam.dist = 3;
    await wait(1200); dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' })); await wait(800); ${after}`;
SCRIPTS.fridge = useAt('fridge'); SCRIPTS.prompt = useAt('fridge', "dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })); await wait(300); O.ui.closePanel();").replace("dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }))", '0');
SCRIPTS.inbed = useAt('bed', "O.ui.closePanel(); dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })); await wait(300); O.cam.yaw = O.ctrl.facing + 2.2; O.cam.pitch = 0.6; O.cam.dist = 3.2; await wait(1500);");
SCRIPTS.onsofa = useAt('sofa', "O.cam.yaw = O.ctrl.facing + 2.6; O.cam.pitch = 0.3; O.cam.dist = 3; await wait(1500);");
SCRIPTS.cook = useAt('counter');
SHOTS.fridge = 'hour=19'; SHOTS.prompt = 'hour=19'; SHOTS.inbed = 'hour=22'; SHOTS.onsofa = 'hour=19'; SHOTS.cook = 'hour=19';

// a speeder: buy one at the dealer, get on, ride off down the street
SCRIPTS.speeder = `const O = ORBIS, P = O.store.player, wait = ms => new Promise(r => setTimeout(r, ms)), key = (c, up = true) => { dispatchEvent(new KeyboardEvent('keydown', { code: c })); if (up) dispatchEvent(new KeyboardEvent('keyup', { code: c })); };
    const v = O.getVehicles().find(v => v.forSale); P.credits = 5000;
    O.ctrl.pos = [v.pos[0] + 1.2, v.pos[1], v.pos[2] + 0.5]; await wait(800); key('KeyE'); await wait(400); key('Digit1'); await wait(400); key('KeyE'); await wait(300);
    key('KeyW', false); const ride = new URLSearchParams(location.search).get('secs') || 3; await wait(ride * 1000); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    O.cam.pitch = 0.18; O.cam.yaw = O.ctrl.facing + 0.5; await wait(600);`;
SCRIPTS.parked = `const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms)); const v = O.getVehicles().find(v => v.forSale);
    O.ctrl.pos = [v.pos[0] - Math.sin(v.facing) * 3 + Math.cos(v.facing) * 2, v.pos[1], v.pos[2] - Math.cos(v.facing) * 3 - Math.sin(v.facing) * 2]; O.ctrl.facing = v.facing; O.cam.yaw = v.facing + 1.1; O.cam.pitch = 0.3; O.cam.dist = 4; await wait(1500);`;
SHOTS.speeder = 'hour=10&secs=3'; SHOTS.parked = 'hour=10';

// ships: the one for sale on its pad, inside it, and flying it
const shipAt = (x, y, z, then = '') => `const O = ORBIS, P = O.store.player, wait = ms => new Promise(r => setTimeout(r, ms)), key = (c, up = true) => { dispatchEvent(new KeyboardEvent('keydown', { code: c })); if (up) dispatchEvent(new KeyboardEvent('keyup', { code: c })); };
    const { buildingToWorld } = await import('./js/gen/place.js'); const { structureOf } = await import('./js/world/ships.js');
    const sh = O.getShips().find(x => x.forSale), b = structureOf(O.s, sh, () => true, O.planet), W = (a, c, d) => buildingToWorld(O.s, b, a, c, d);
    const at = W(${x}, ${y}, ${z}); O.ctrl.mode = 'walk'; O.ctrl.pos = at; O.ctrl.vel = [0, 0, 0]; await wait(600); ${then}`;
SCRIPTS.ship = shipAt(-6, 0, -9, "const c = W(5, 2, 10); O.ctrl.facing = Math.atan2(c[0] - O.ctrl.pos[0], c[2] - O.ctrl.pos[2]); O.cam.yaw = O.ctrl.facing - 0.25; O.cam.pitch = 0.12; O.cam.dist = 5; await wait(2500);");
SCRIPTS.shipside = shipAt(18, 0, 14, "const c = W(5, 2, 10); O.ctrl.facing = Math.atan2(c[0] - O.ctrl.pos[0], c[2] - O.ctrl.pos[2]); O.cam.yaw = O.ctrl.facing; O.cam.pitch = 0.15; O.cam.dist = 5; await wait(2500);");
SCRIPTS.cockpit = shipAt(5, 1.6, 14.4, "const c = W(5, 2.5, 18.5); O.ctrl.facing = Math.atan2(c[0] - O.ctrl.pos[0], c[2] - O.ctrl.pos[2]); O.cam.yaw = O.ctrl.facing; O.cam.pitch = 0.2; O.cam.dist = 2.2; await wait(2500);");
SCRIPTS.hold = shipAt(5, 1.6, 10.5, "const c = W(5, 2, 5); O.ctrl.facing = Math.atan2(c[0] - O.ctrl.pos[0], c[2] - O.ctrl.pos[2]); O.cam.yaw = O.ctrl.facing; O.cam.pitch = 0.2; O.cam.dist = 2.4; await wait(2500);");
SCRIPTS.flying = shipAt(5, 1.6, 16.1, `P.credits = 20000; const c = W(5, 1.6, 18); O.ctrl.facing = Math.atan2(c[0] - O.ctrl.pos[0], c[2] - O.ctrl.pos[2]); await wait(300);
    key('KeyE'); await wait(400); key('Digit1'); await wait(400); key('KeyE'); await wait(400); key('Digit1'); await wait(400);
    key('Space', false); await wait(5000); dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })); key('KeyW', false); await wait((+new URLSearchParams(location.search).get('secs') || 5) * 1000); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    O.cam.pitch = 0.22; await wait(800);`);
SCRIPTS.pilotview = SCRIPTS.flying + ' O.setCockpitView(true); await wait(1200);';
SHOTS.pilotview = 'hour=10&secs=3';
SCRIPTS.forest = `const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms)); const { floraNear } = await import('./js/gen/flora.js');
    let best = null, n = 0; for (let R = 300; R < 4000 && !best; R += 300) floraNear(O.planet, O.s.cx, O.s.cz, R, q => { if (!best && q.sp === 'broadleaf' && Math.hypot(q.x - O.s.cx, q.z - O.s.cz) > R - 300) { let k = 0; floraNear(O.planet, q.x, q.z, 25, w => { if (w.sp !== 'shrub') k++; }); if (k > 9) best = q; } });
    if (best) { O.ctrl.pos = [best.x + 9, best.y + 0.2, best.z + 4]; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = Math.atan2(best.x - O.ctrl.pos[0], best.z - O.ctrl.pos[2]); O.cam.yaw = O.ctrl.facing + 0.4; O.cam.pitch = 0.08; O.cam.dist = 5; }
    await wait(5000);`;
SHOTS.forest = 'hour=15';
SCRIPTS.freighter = `const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms)); const f = O.getShips().find(x => x.model === 'freighter');
    const k = +(new URLSearchParams(location.search).get('view') || 0), a = f.at.facing + [2.4, 1.3, 3.6][k], r = [28, 26, 30][k];
    O.ctrl.pos = [f.at.c[0] + Math.sin(a) * r, f.at.c[1], f.at.c[2] + Math.cos(a) * r]; O.ctrl.vel = [0, 0, 0]; await wait(500);
    O.ctrl.facing = Math.atan2(f.at.c[0] - O.ctrl.pos[0], f.at.c[2] - O.ctrl.pos[2]); O.cam.yaw = O.ctrl.facing; O.cam.pitch = 0.12; O.cam.dist = 6; await wait(4000);`;
SCRIPTS.freighter2 = SCRIPTS.freighter; SHOTS.freighter = 'hour=10&view=0'; SHOTS.freighter2 = 'hour=10&view=1';
SHOTS.ship = 'hour=10'; SHOTS.shipside = 'hour=10'; SHOTS.cockpit = 'hour=10'; SHOTS.hold = 'hour=10'; SHOTS.flying = 'hour=10&secs=5';
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
    if (process.env.GALLERY) await send('Runtime.evaluate', { expression: "document.querySelector('.toasts')?.remove()" });
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
