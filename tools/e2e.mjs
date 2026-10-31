// End-to-end check in the real browser with the real IndexedDB backend:
//   new life → walk to a locked building → E (refused) → hold F (forced) → walk inside →
//   save → reload (continue) → door still broken, incident in the log, player inside →
//   simulate 2 days away (rewind realTime) → reload → door repaired, away report lists it.
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8517, CDP = 9334, slot = 'e2e' + process.pid;
const profile = join(tmpdir(), 'orbis-e2e-' + process.pid);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`,
  '--window-size=1280,800', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--use-angle=metal', '--no-first-run', 'about:blank'], { stdio: 'ignore', detached: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
try {
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${CDP}/json/version`); break; } catch { await sleep(200); } }
  const target = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map(), errs = [];
  ws.onmessage = m => { const x = JSON.parse(m.data); if (x.id) pend.get(x.id)?.(x); if (x.method === 'Runtime.exceptionThrown') errs.push(x.params.exceptionDetails.exception?.description); };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(expr + ' → ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result.result.value; };
  const key = async (code, type) => ev(`dispatchEvent(new KeyboardEvent('${type}', { code: '${code}' })), 1`);
  const load = async q => {
    await send('Runtime.enable');
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?slot=${slot}&${q}` });
    let t = '';
    for (let i = 0; i < 480; i++) { await sleep(500); t = await ev('document.title').catch(e => 'evalerr'); if (t === 'READY') return true; if (t.startsWith('ERROR')) break; }
    console.log('   title:', t, errs.slice(0, 3)); return false;
  };
  console.log('[new life]');
  if (!check(await load('auto=new&seed=00c0ffee00b0a7e5'), 'world loads')) throw new Error('world did not load — machine busy? rerun');
  // pick a residents-only building that is not the player's home; stand on its doorstep facing in
  const target0 = await ev(`(async () => {
    const { s, store, ctrl, cam, town } = ORBIS;
    const { doorstep } = await import('./js/gen/place.js');
    const d = town.doors.find(d => d.door.kind === 'exterior' && d.b.access === 'residents' && d.b.key !== store.player.home && d.plan.F > 1);
    const ds = doorstep(s, d.b, d.plan);
    ctrl.pos = ds.pos; ctrl.facing = ds.facing; cam.yaw = ds.facing;
    window.__t = d; return { key: d.b.key, door: d.door.id };
  })()`);
  await sleep(600);
  await key('KeyE', 'keydown'); await key('KeyE', 'keyup'); await sleep(300);
  check((await ev(`document.querySelector('.toasts').textContent`)).includes('residents only'), 'E on a locked door is refused');
  // walk forward into the closed door: must stay outside
  await key('KeyW', 'keydown'); await sleep(1500); await key('KeyW', 'keyup');
  check(!(await ev(`!!ORBIS.world.locate(...ORBIS.ctrl.pos)?.b`)), 'closed door blocks walking in');
  await key('KeyF', 'keydown'); await sleep(2600); await key('KeyF', 'keyup');
  check(await ev(`!!ORBIS.store.getDelta(__t.b.key + '/door:' + __t.door.id)?.broken`), 'holding F breaks the lock (delta written)');
  check(await ev(`ORBIS.store.events.some(e => e.type === 'forced_entry' && e.building === __t.b.key)`), 'incident logged');
  await sleep(1200);
  await key('KeyW', 'keydown'); await sleep(2500); await key('KeyW', 'keyup'); await sleep(300);
  const inside = await ev(`ORBIS.world.locate(...ORBIS.ctrl.pos)?.b?.key || null`);
  check(inside === target0.key, 'walked inside through the forced door (' + inside + ')');
  // climb the stairs: stand in the core at the ground-floor landing, walk up the flight
  const climb = await ev(`(async () => {
    const { s, ctrl, cam, planet } = ORBIS;
    const { buildingToWorld } = await import('./js/gen/place.js');
    const b = __t.b, core = __t.plan.doors.find(d => d.kind === 'core' && d.k === 0);
    const p = buildingToWorld(s, b, core.x + 0.9, 0, core.z);
    ctrl.pos = p; ctrl.vel = [0, 0, 0];
    cam.yaw = Math.atan2(b.ez[0] * s.cos - b.ez[1] * s.sin, b.ez[0] * s.sin + b.ez[1] * s.cos);
    return __t.plan.H;
  })()`);
  await sleep(400);
  await key('KeyW', 'keydown'); await sleep(5000); await key('KeyW', 'keyup'); await sleep(300);
  const up = await ev(`(() => { const l = ORBIS.world.locate(...ORBIS.ctrl.pos); return { k: l?.k, y: ORBIS.ctrl.pos[1] - ORBIS.world.base }; })()`);
  check(up.k === 1 && Math.abs(up.y - climb) < 0.05, `walked up the stairs to floor 2 (floor index ${up.k}, height ${up.y?.toFixed(2)} m)`);
  // back down into the entrance room for the rest of the test
  await ev(`(async () => { const { s, ctrl } = ORBIS; const { buildingToWorld } = await import('./js/gen/place.js'); const d = __t.plan.doors[__t.plan.entrance]; ctrl.pos = buildingToWorld(s, __t.b, d.x, 0, 2.0); ctrl.vel = [0,0,0]; })()`);
  await sleep(300);
  const posBefore = await ev(`ORBIS.ctrl.pos.map(v => +v.toFixed(2))`);
  await ev(`ORBIS.save()`);
  console.log('[reload: continue]');
  check(await load('auto=continue'), 'reload loads');
  check(await ev(`!!ORBIS.store.getDelta('${target0.key}/door:${target0.door}')?.broken`), 'door still broken after reload');
  const posAfter = await ev(`ORBIS.ctrl.pos.map(v => +v.toFixed(2))`);
  check(Math.hypot(posAfter[0] - posBefore[0], posAfter[2] - posBefore[2]) < 0.5, `player position restored (${posBefore} → ${posAfter})`);
  check(await ev(`ORBIS.world.locate(...ORBIS.ctrl.pos)?.b?.key === '${target0.key}'`), 'still inside that building');
  check(await ev(`ORBIS.doorView.lockState[ORBIS.town.doors.findIndex(d => d.b.key === '${target0.key}' && d.door.id === ${target0.door})] === 'broken'`), 'door renders as broken');
  console.log('[two days away]');
  // pretend the player left two (planet) days ago, resting
  await ev(`(async () => { const s = ORBIS.store; await ORBIS.save(); s.player.activity = 'rest'; s.meta.realTime -= 2 * ORBIS.planet.dayLength * 1000; s.touchPlayer(); s.dirty.meta = true; await s.flush(); })()`);
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?slot=${slot}&auto=continue` });
  let report = '';
  for (let i = 0; i < 120 && !report; i++) { await sleep(500); report = await ev(`document.querySelector('.panel.away')?.textContent || ''`).catch(() => ''); }
  check(report.includes('While you were away'), 'away report shown');
  check(/repaired/.test(report), 'report lists the repair the owner made');
  check(/\d+(\.\d)? (h|days) passed/.test(report), 'report states the elapsed time');
  await ev(`document.querySelector('.panel.away button').click(), 1`);
  for (let i = 0; i < 40; i++) { await sleep(250); if (await ev('document.title') === 'READY') break; }
  check(!(await ev(`!!ORBIS.store.getDelta('${target0.key}/door:${target0.door}')?.broken`)), 'door is repaired in the world state');
  check(await ev(`ORBIS.store.player.fatigue < 0.05`), 'resting two days left the character rested');
  console.log('[residents]');
  const r = await ev(`(async () => {
    const O = ORBIS, P = O.store.player, pop = O.pop;
    const { canOpen } = await import('./js/world/doors.js');
    const { whereAt } = await import('./js/gen/schedule.js');
    const parents = P.family.parents.map(id => pop.byId.get(id));
    const t = O.clock.now();
    // a unit door in the player's own building vs. some other apartment
    const mine = O.town.doors.find(d => d.door.access === 'unit' && P.keys.includes(d.b.key + '#u' + d.door.unit));
    const other = O.town.doors.find(d => d.door.access === 'unit' && !P.keys.includes(d.b.key + '#u' + d.door.unit));
    const parentHome = parents.length ? whereAt(pop, parents[0], (Math.floor(t / O.planet.dayLength + 0.3) + 1 - 0.3 + 2.5 / 24) * O.planet.dayLength) : null;
    const ev = O.store.events.find(e => e.type === 'forced_entry');
    return { people: pop.people.length, parents: parents.length, parentsReal: parents.every(Boolean),
      parentAsleepAtHome: parentHome ? parentHome.activity === 'sleeping' && parentHome.bKey === pop.unitByKey.get(parents[0].home).b.key : null,
      mineOk: mine ? canOpen(O.store, O.planet, P, mine.b, mine.door, t).ok : 'n/a', otherOk: other ? canOpen(O.store, O.planet, P, other.b, other.door, t).ok : 'n/a',
      drawn: O.getAgents().length, witnessesField: Array.isArray(ev?.witnesses) };
  })()`);
  check(r.people > 150, 'town has residents (' + r.people + ')');
  check(r.parents > 0 && r.parentsReal, 'your parents are real residents (' + r.parents + ')');
  check(r.parentAsleepAtHome === true, 'at 02:30 your parent is asleep in their own home');
  check(r.mineOk === true || r.mineOk === 'n/a', 'your key opens your apartment (' + r.mineOk + ')');
  check(r.otherOk === false, 'a stranger\'s apartment stays locked');
  check(r.witnessesField, 'the incident records its witnesses');
  console.log('[errors]'); check(errs.length === 0, 'no page exceptions ' + errs.slice(0, 3).join(' | '));
  // clean up the slot
  await ev(`(async () => { await new Promise(r => { const q = indexedDB.deleteDatabase('orbis-${slot}'); q.onsuccess = q.onerror = q.onblocked = r; }); return 1; })()`).catch(() => {});
  ws.close();
} finally {
  try { process.kill(-chrome.pid, 'SIGKILL'); } catch { chrome.kill(); }   // whole group: helpers too
  await sleep(300); try { rmSync(profile, { recursive: true, force: true }); } catch {} }
console.log(fails ? `\n${fails} failure(s)` : '\nall green'); process.exit(fails ? 1 : 0);
