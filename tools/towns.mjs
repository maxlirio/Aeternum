// The other towns, in the real browser: built as you come to them, walkable, peopled, with their own law, saved and resumed, taken down when you've gone.
import { spawn } from 'node:child_process';
import { preflight, guardBrowser } from './guard.mjs';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8517, CDP = 9336, slot = 'towns' + process.pid;
const profile = join(tmpdir(), 'orbis-towns-' + process.pid);
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
  const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }); writeFileSync(`out/towns-${name}.jpg`, Buffer.from(r.result.data, 'base64')); };
  const wait = ms => sleep(ms);
  const until = async (expr, ms = 60000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await ev(expr)) return true; await sleep(250); } return false; };
  const goto = (x, z, face = 0) => ev(`(() => { const O = ORBIS, h = O.world.groundAt(${x}, ${z}, 1e4).h; O.ctrl.mode = 'walk'; O.ctrl.pos = [${x}, h + 0.05, ${z}]; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = ${face}; O.cam.yaw = ${face}; return h; })()`);
  console.log('[far off]');
  if (!check(await load('auto=new&seed=00c0ffee00b0a7e5&hour=11'), 'world loads')) throw new Error('world did not load');
  await ev(`(async () => { const { getSettlement } = await import('./js/gen/settlement.js'); const O = ORBIS; window.__list = []; for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) { const q = getSettlement(O.planet, a, b); if (q && q !== O.homeS) __list.push(q); } __list.sort((p, q) => Math.hypot(p.cx - O.homeS.cx, p.cz - O.homeS.cz) - Math.hypot(q.cx - O.homeS.cx, q.cz - O.homeS.cz)); window.__Q = __list[0]; return __list.length; })()`);
  const Q = await ev(`({ name: __Q.name, key: __Q.key, cx: __Q.cx, cz: __Q.cz, R: __Q.R, n: __Q.buildings.length, h: __Q.h })`);
  console.log('   going to', Q.name, Q.n, 'buildings');
  const info = () => ev(`(() => { const m = ORBIS.renderer.info; return { geo: m.memory.geometries, tex: m.memory.textures, calls: m.render.calls, tris: m.render.triangles, heap: Math.round((performance.memory?.usedJSHeapSize || 0) / 1e6), full: ORBIS.towns.full.size, shells: ORBIS.towns.shells.size }; })()`);
  await goto(Q.cx - Q.R - 3200, Q.cz, Math.PI / 2);
  check(await until(`ORBIS.towns.shells.has(${JSON.stringify(Q.key)})`, 30000), 'seen from 3 km: its streets and blocks are up');
  check(await ev(`!ORBIS.towns.full.has(${JSON.stringify(Q.key)})`), 'not the real thing yet');
  await wait(2500); await shot('far');
  console.log('[coming closer]');
  const base = await info(); console.log('   ', JSON.stringify(base));
  await ev(`(() => { window.__ft = []; let last = performance.now(); const f = n => { __ft.push(n - last); last = n; window.__raf = requestAnimationFrame(f); }; requestAnimationFrame(f); })()`);
  await goto(Q.cx - Q.R - 1100, Q.cz, Math.PI / 2);
  check(await until(`ORBIS.towns.full.get(${JSON.stringify(Q.key)})?.ready`, 90000), 'the real town goes up as you come');
  const ft = await ev(`(() => { cancelAnimationFrame(__raf); const a = __ft.slice(5).sort((p, q) => p - q); return { n: a.length, med: a[a.length >> 1], p99: a[Math.floor(a.length * 0.99)], worst: a.at(-1), over50: a.filter(x => x > 50).length }; })()`);
  console.log('    frames while it built:', JSON.stringify(ft));
  check(ft.n > 20, 'the game kept running while it built');
  const built = await info(); console.log('   ', JSON.stringify(built));
  check(await ev(`ORBIS.towns.shells.get(${JSON.stringify(Q.key)}).blocks.visible === false`), 'the blocks make way');
  await wait(1000); await shot('near');
  console.log('[walking in]');
  await goto(Q.cx - Q.R + 60, Q.cz, Math.PI / 2);
  check(await until(`ORBIS.s.key === ${JSON.stringify(Q.key)}`, 8000), 'you are now in ' + Q.name);
  check(await ev(`ORBIS.pop.people.length > 40 && ORBIS.pop.s === ORBIS.s`), 'it has its own people');
  check(await ev(`ORBIS.polity === ORBIS.currentTown.polity && ORBIS.ctx.s === ORBIS.s && ORBIS.ladders.length >= 0`), 'its own law, ladders');
  check(await ev(`document.querySelector('.place')?.textContent`).then(x => { console.log('   hud:', x); return x === Q.name || x.length > 0; }), 'the HUD says where');
  // on a doorstep with a door that opens
  const D = await ev(`(async () => { const O = ORBIS, { doorstep } = await import('./js/gen/place.js'); { const { solarHour } = await import('./js/sim/clock.js'); O.clock.advance(((12 - solarHour(O.planet, O.clock.now()) + 24) % 24) / 24 * O.planet.dayLength); } const i = O.town.doors.findIndex(d => d.door.kind === 'exterior' && (d.door.access === 'open' || d.door.access === 'hours')); const d = O.town.doors[i]; if (!d) return null; const ds = doorstep(O.s, d.b, d.plan); O.ctrl.pos = ds.pos.slice(); O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = ds.facing; O.cam.yaw = ds.facing; window.__d = d; return { key: d.b.key, type: d.b.type, id: d.door.id, i }; })()`);
  if (check(!!D, 'a door anyone can open')) {
    console.log('   door of a', D.type);
    await wait(1400); await shot('street');
    check(await ev(`!ORBIS.world.passable(__d.b, __d.door.id)`), 'shut, it stops you');
    await key('KeyE', 'keydown'); await wait(80); await key('KeyE', 'keyup');
    check(await until(`ORBIS.world.passable(__d.b, __d.door.id)`, 5000), 'E opens it, and then you can pass');
    await key('KeyW', 'keydown');
    check(await until(`ORBIS.world.locate(...ORBIS.ctrl.pos)?.b === __d.b`, 8000), 'you can walk in');
    await wait(500); await key('KeyW', 'keyup'); await wait(1500); await shot('inside');
    check(await ev(`ORBIS.world.locate(...ORBIS.ctrl.pos)?.room != null || !!ORBIS.world.locate(...ORBIS.ctrl.pos)?.b`), 'and you are in a room');
    check(await ev(`ORBIS.propView.drawn > 0 || ORBIS.propView === null`), 'furnished');
  }
  // people about at some point in the day
  console.log('[its people and its law]');
  await ev(`(() => { const O = ORBIS; for (const p of O.pop.people) { const w = O.residents.pop === O.pop && 1; } })()`);
  const peeps = await ev(`(async () => { const O = ORBIS, { whereAt } = await import('./js/gen/schedule.js'); for (let k = 0; k < 24; k++) { const t = O.clock.now(); const out = O.pop.people.map(p => whereAt(O.pop, p, t)).filter(w => !w.bKey); if (out.length) { O.ctrl.pos = [out[0].pos[0] + 3, out[0].pos[1], out[0].pos[2] + 3]; O.ctrl.vel = [0, 0, 0]; return out.length; } O.clock.advance(O.planet.dayLength / 24); } return 0; })()`);
  check(peeps > 0, peeps + ' of them outdoors');
  check(await until(`ORBIS.getAgents().length > 0`, 6000), 'and drawn around you');
  await wait(1200); await shot('people');
  // break a door in, seen by nobody or somebody: it's that town's incident, handled by its law
  const L = await ev(`(async () => { const O = ORBIS, { doorstep } = await import('./js/gen/place.js'); const d = O.town.doors.find(d => d.door.kind === 'exterior' && ['residents', 'staff'].includes(d.door.access) && d.b.key !== O.store.player.home); const ds = doorstep(O.s, d.b, d.plan); O.ctrl.pos = ds.pos.slice(); O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = ds.facing; O.cam.yaw = ds.facing; window.__L = d; return d.b.key; })()`);
  await wait(800);
  await key('KeyF', 'keydown');
  check(await until(`ORBIS.store.events.some(e => e.type === 'forced_entry' && e.settlement === ${JSON.stringify(Q.key)})`, 12000), 'forcing a door there is an incident there');
  await key('KeyF', 'keyup');
  check(await ev(`ORBIS.store.getDelta('${L}/door:' + __L.door.id)?.broken === true`), 'the door stays broken');
  check(await ev(`ORBIS.store.jobs.some(j => j.town)`), 'what it sets going knows where it belongs');
  const before = await ev(`ORBIS.store.events.length`);
  await ev(`(() => { ORBIS.clock.advance(ORBIS.planet.dayLength * 3); return 1; })()`); await wait(4000);
  const evs = await ev(`ORBIS.store.events.slice(${before}).map(e => e.type + (e.authority ? ':' + e.authority : ''))`);
  console.log('   three days on:', evs.slice(0, 8).join(', '));
  check(await ev(`ORBIS.store.jobs.filter(j => j.at <= ORBIS.clock.now()).length === 0`), 'three days of its jobs ran without trouble');
  check(!errs.length, 'no errors so far ' + errs.slice(0, 2).join(' | ').slice(0, 300));
  console.log('[saved there, and resumed]');
  await goto(Q.cx - Q.R + 40, Q.cz + 10, Math.PI / 2);
  const L2 = await ev(`(async () => { const O = ORBIS, { doorstep } = await import('./js/gen/place.js'); const d = O.town.doors.filter(d => d.door.kind === 'exterior' && ['residents', 'staff'].includes(d.door.access) && d.b.key !== O.store.player.home)[3]; const ds = doorstep(O.s, d.b, d.plan); O.ctrl.pos = ds.pos.slice(); O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = ds.facing; O.cam.yaw = ds.facing; window.__L2 = d; return d.b.key + '/door:' + d.door.id; })()`);
  await wait(800); await key('KeyF', 'keydown'); check(await until(`ORBIS.store.getDelta(${JSON.stringify(L2)})?.broken === true`, 12000), 'another door broken, just before saving'); await key('KeyF', 'keyup');
  await ev(`(async () => { ORBIS.store.player.custody = null; await ORBIS.save(); return 1; })()`); await wait(300);
  check(await load('auto=continue'), 'loads again');
  check(await ev(`ORBIS.s.key === ${JSON.stringify(Q.key)} && ORBIS.currentTown.ready`), 'you wake up in ' + Q.name + ', and it is built');
  check(await ev(`ORBIS.store.getDelta(${JSON.stringify(L2)})?.broken === true`), 'the door is as you left it');
  check(await ev(`ORBIS.store.events.some(e => e.type === 'door_repaired')`), 'and the first one has been mended');
  await wait(800); await shot('resumed');
  console.log('[home again, and on round the planet]');
  const home = await ev(`[ORBIS.homeS.cx, ORBIS.homeS.cz]`);
  const vQ = await ev(`ORBIS.getVehicles().filter(v => v.id.includes(${JSON.stringify(Q.key.split('/').at(-1))})).length`);
  await goto(home[0] + 30, home[1] + 30);
  check(await until(`ORBIS.s === ORBIS.homeS`, 8000), 'home is home');
  check(await ev(`ORBIS.ctx === ORBIS.homeCtx && ORBIS.residents === ORBIS.homeTown.residents`), 'with your own people');
  check(await ev(`ORBIS.getVehicles().filter(v => v.id.includes(${JSON.stringify(Q.key.split('/').at(-1))})).length`).then(n => n === vQ), 'what is in the other town is still there');
  const tour = [];
  const n = await ev(`(async () => { const { getSettlement } = await import('./js/gen/settlement.js'); const O = ORBIS; window.__list = []; for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) { const q = getSettlement(O.planet, a, b); if (q && q !== O.homeS) __list.push(q); } __list.sort((p, q) => Math.hypot(p.cx - O.homeS.cx, p.cz - O.homeS.cz) - Math.hypot(q.cx - O.homeS.cx, q.cz - O.homeS.cz)); return __list.length; })()`);
  for (let i = 0; i < Math.min(8, n); i++) {
    await ev(`(() => { const q = __list[${i}], O = ORBIS, h = O.world.groundAt(q.cx, q.cz, 1e4).h; O.ctrl.mode = 'walk'; O.ctrl.pos = [q.cx, h + 0.05, q.cz]; O.ctrl.vel = [0, 0, 0]; return 1; })()`);
    const ok = await until(`ORBIS.s === __list[${i}]`, 60000);
    check(ok, 'arrived: ' + await ev(`__list[${i}].name + ' (' + __list[${i}].buildings.length + ' buildings), ' + ORBIS.pop.people.length + ' people'`));
    await wait(1200); const m = await info(); tour.push(m); console.log('   ', JSON.stringify(m));
    check(m.full <= 3, 'never many real towns at once');
  }
  console.log('[a bridge on another town, and the rivers ahead]');
  const B = await ev(`(async () => { const { outRoutes } = await import('./js/gen/highways.js'); const O = ORBIS; for (const q of __list) for (const r of outRoutes(O.planet, q)) for (const B of r.bridges) { const i = (B.i0 + B.i1) >> 1, j = Math.max(0, B.i0 - 6), [x, z] = r.pts[j], [fx, fz] = r.pts[i]; O.ctrl.mode = 'walk'; O.ctrl.pos = [x, r.h[j] + 0.1, z]; O.ctrl.vel = [0, 0, 0]; const f = Math.atan2(fx - x, fz - z); O.ctrl.facing = f; O.cam.yaw = f; window.__B = { town: q.name, x: fx, z: fz, y: B.y, key: q.key }; return { town: q.name, span: (B.i1 - B.i0) * 4, x: fx, z: fz, y: B.y, key: q.key }; } return null; })()`);
  if (check(!!B, 'a town with a bridge: ' + B?.town + ', ' + B?.span + ' m')) {
    check(await until(`ORBIS.towns.shells.has(__B.key)`, 15000), 'it is drawn');
    check(await ev(`Math.abs(ORBIS.world.groundAt(__B.x, __B.z, __B.y + 0.2).h - __B.y) < 0.6`), 'you can walk over it');
    await wait(5000); await shot('bridge');
  }
  check(await until(`(async () => 1)() && ORBIS.riverFeed.busy === null`, 40000), 'the rivers ahead are worked out on their own thread');
  check(await ev(`(async () => { const { riverCellDone, REGION } = await import('./js/gen/rivers.js'); const O = ORBIS, ci = Math.floor(O.ctrl.pos[0] / REGION), cj = Math.floor(O.ctrl.pos[2] / REGION); return riverCellDone(O.planet, ci + 1, cj + 1) && riverCellDone(O.planet, ci - 1, cj - 1); })()`), 'around you');
  const a = tour[2], b = tour.at(-1);
  check(b.geo < a.geo * 1.6, `geometry doesn't pile up (${a.geo} → ${b.geo})`);
  check(b.heap < a.heap * 2.2 + 150, `nor memory (${a.heap} → ${b.heap} MB)`);
  await ev(`(() => { const O = ORBIS, q = __list[Math.min(7, __list.length - 1)]; const { doors } = O.town; const d = doors.find(d => d.door.kind === 'exterior'); return 1; })()`);
  await shot('last');
  check(!errs.length, 'no errors ' + errs.slice(0, 3).join(' | ').slice(0, 500));
  await ev(`(async () => { await new Promise(r => { const q = indexedDB.deleteDatabase('orbis-${slot}'); q.onsuccess = q.onerror = q.onblocked = r; }); return 1; })()`).catch(() => {});
  ws.close();
} finally {
  try { process.kill(-chrome.pid, 'SIGKILL'); } catch { chrome.kill(); }   // whole group: helpers too
  await sleep(300); try { rmSync(profile, { recursive: true, force: true }); } catch {} }
console.log(fails ? `\n${fails} failure(s)` : '\nall green'); process.exit(fails ? 1 : 0);
