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
  '--window-size=1280,800', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--use-angle=metal', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
    for (let i = 0; i < 240; i++) { await sleep(500); t = await ev('document.title').catch(e => 'evalerr'); if (t === 'READY') return true; if (t.startsWith('ERROR')) break; }
    console.log('   title:', t, errs.slice(0, 3)); return false;
  };
  console.log('[new life]');
  check(await load('auto=new&seed=00c0ffee00b0a7e5'), 'world loads');
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
  console.log('[errors]'); check(errs.length === 0, 'no page exceptions ' + errs.slice(0, 3).join(' | '));
  // clean up the slot
  await ev(`(async () => { await new Promise(r => { const q = indexedDB.deleteDatabase('orbis-${slot}'); q.onsuccess = q.onerror = q.onblocked = r; }); return 1; })()`).catch(() => {});
  ws.close();
} finally { chrome.kill(); await sleep(300); try { rmSync(profile, { recursive: true, force: true }); } catch {} }
console.log(fails ? `\n${fails} failure(s)` : '\nall green'); process.exit(fails ? 1 : 0);
