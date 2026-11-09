// End-to-end check in the real browser with the real IndexedDB backend:
//   new life → walk to a locked building → E (refused) → hold F (forced) → walk inside →
//   save → reload (continue) → door still broken, incident in the log, player inside →
//   simulate 2 days away (rewind realTime) → reload → door repaired, away report lists it.
import { spawn } from 'node:child_process';
import { preflight, guardBrowser } from './guard.mjs';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8517, CDP = 9334, slot = 'e2e' + process.pid;
const profile = join(tmpdir(), 'orbis-e2e-' + process.pid);
preflight();
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`,
  '--window-size=1280,800', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--use-angle=metal', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--no-first-run', 'about:blank'], { stdio: 'ignore', detached: true });
guardBrowser(chrome, profile, { maxSeconds: 1800 });
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
  console.log('[law]');
  const law = await ev(`(() => { const O = ORBIS, inc = O.store.events.find(e => e.type === 'forced_entry');
    return { handled: O.store.events.some(e => (e.type === 'case_opened' || e.type === 'break_in_discovered') && e.incident === inc.id),
      hud: document.querySelector('.credits')?.textContent || '', credits: O.store.player.credits, record: O.store.player.record.length,
      fines: O.store.events.filter(e => e.type === 'fined').reduce((n, e) => n + e.amount, 0) }; })()`);
  check(law.handled, 'two days later the break-in has been reported or discovered');
  check(/-?\d+ cr/.test(law.hud), 'credits shown in the HUD (' + law.hud + ')');
  check(law.record === (law.fines ? 1 : 0), 'record matches fines (' + law.record + ' entries, ' + law.fines + ' cr)');
  console.log('[avoidance]');
  // stand in the path of someone walking outdoors and watch them for 4 s
  const av = await ev(`(async () => {
    const O = ORBIS, t0 = O.clock.now();
    const { whereAt } = await import('./js/gen/schedule.js');
    let target = null, tt = t0;
    for (let k = 0; k < 400 && !target; k++) { for (const p of O.pop.people) { const w = whereAt(O.pop, p, tt); if (w.moving && w.pos[1] < O.s.h + 1 && w.seg.t1 - tt > 40) { target = p; break; } } if (!target) tt += 60; }
    if (!target) return { none: true };
    const sel = whereAt(O.pop, target, tt), selSeg = [sel.seg.t0 - tt, sel.seg.t1 - tt].map(v => v.toFixed(0)).join('..');
    O.clock.advance(tt - O.clock.now());              // the search itself takes real seconds
    await new Promise(r => setTimeout(r, 1200));                      // let NEAR pick them up
    const w = whereAt(O.pop, target, O.clock.now() + 2.5);             // where they'll be in 2.5 s
    O.ctrl.pos = [w.pos[0], O.s.h, w.pos[2]]; O.ctrl.vel = [0, 0, 0];
    let minD = 99, moved = 0, last = null;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 100));
      const a = O.getAgents().find(a => a.id === target.id); if (!a) continue;
      const d = Math.hypot(a.pos[0] - O.ctrl.pos[0], a.pos[2] - O.ctrl.pos[2]); minD = Math.min(minD, d);
      if (last) moved += Math.hypot(a.pos[0] - last[0], a.pos[2] - last[2]); last = a.pos;
    }
    const a = O.getAgents().find(a => a.id === target.id), raw = whereAt(O.pop, target, O.clock.now());
    return { minD, moved, state: a ? [a.activity, a.moving, a.pose, +(O.residents.lag.get(a.id) || 0).toFixed(1), raw.moving, raw.activity, (raw.seg.t1 - O.clock.now()).toFixed(0), 'sel', selSeg, 'now-tt', (O.clock.now() - tt).toFixed(1)].join(' ') : 'absent' };
  })()`);
  if (av.none) console.log('  (no walker found to test avoidance)');
  else { check(av.minD > 0.45, 'a walker never passes through you (closest ' + av.minD.toFixed(2) + ' m)'); check(av.moved > 0.5, 'and keeps going around you (' + av.moved.toFixed(1) + ' m; ' + av.state + ')'); }
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
  console.log('[work]');
  const goInside = async bKey => ev(`(async () => { const O = ORBIS; const { buildingToWorld } = await import('./js/gen/place.js'); const { buildingPlan } = await import('./js/gen/building.js');
    const b = O.pop.buildingByKey.get('${bKey}'), plan = buildingPlan(O.planet, O.s, b), d = plan.doors[plan.entrance];
    O.ctrl.pos = buildingToWorld(O.s, b, d.x, 0, d.z + 2.0); O.ctrl.vel = [0, 0, 0]; await new Promise(r => setTimeout(r, 300));
    return O.world.locate(...O.ctrl.pos)?.b?.key || null; })()`);
  await ev(`(() => { const P = ORBIS.store.player; P.skills = { admin: 0.9, trade: 0.9, tech: 0.9 }; P.fitness = 0.9; return 1; })()`);
  const sec = await ev(`ORBIS.polity.security`);
  check(await goInside(sec) === sec, 'standing inside the civic office');
  await key('KeyJ', 'keydown'); await key('KeyJ', 'keyup'); await sleep(400);
  const board = await ev(`(() => { const p = document.querySelector('.panel.work'); return p ? { text: p.textContent, apply: p.querySelectorAll('button[data-a=apply]:not([disabled])').length } : null; })()`);
  check(board && /Job board/.test(board.text) && board.apply > 0, 'J opens the town job board with openings (' + board?.apply + ')');
  // apply to three places: even a strong candidate is sometimes passed over
  await ev(`(async () => { const done = new Set();
    for (let k = 0; k < 3; k++) {
      const r = [...document.querySelectorAll('.panel.work .jobs li')].find(li => /strong candidate/.test(li.textContent) && !done.has(li.querySelector('b').nextSibling.textContent.split(',')[0]));
      if (!r) break; done.add(r.querySelector('b').nextSibling.textContent.split(',')[0]); r.querySelector('button').click(); await new Promise(q => setTimeout(q, 150));
    } return done.size; })()`);
  await sleep(400);
  check((await ev(`document.querySelector('.toasts').textContent`)).includes('Application in'), 'applying files an application');
  await ev(`document.querySelector('.panel.work button[data-a=ok]').click(), 1`); await sleep(200);
  const hired = await ev(`(async () => { const O = ORBIS; for (let i = 0; i < 80 && !O.store.player.job; i++) { O.clock.advance(O.planet.dayLength / 24); await new Promise(r => setTimeout(r, 60)); }
    const P = O.store.player; for (let i = 0; i < 30 && P.applications.some(a => a.status === 'pending'); i++) { O.clock.advance(O.planet.dayLength / 24); await new Promise(r => setTimeout(r, 60)); }
    return P.job ? { b: P.job.b, title: P.job.title } : P.applications.map(a => a.why || a.status).join('; '); })()`);
  check(hired?.b, 'hired after the manager reviews it (' + JSON.stringify(hired) + ')');
  if (hired?.b) {
    check((await ev(`document.querySelector('.hud .job').textContent`)).includes(hired.title), 'HUD shows the job');
    await ev(`(async () => { const O = ORBIS, sh = O.store.player.shift; O.clock.advance(sh.t0 + 120 - O.clock.now()); await new Promise(r => setTimeout(r, 300)); return 1; })()`);
    check(await goInside(hired.b) === hired.b, 'standing inside the workplace');
    await sleep(3500);
    const at = await ev(`({ present: ORBIS.store.player.shift.present, hud: document.querySelector('.hud .job').textContent })`);
    check(at.present >= 2 && /on shift/.test(at.hud), `attendance counts while you are there (${at.present.toFixed(1)} s, "${at.hud}")`);
    const c0 = await ev(`ORBIS.store.player.credits`);
    await ev(`(async () => { const s = ORBIS.store; await ORBIS.save(); s.player.activity = 'work'; s.meta.realTime -= 3 * ORBIS.planet.dayLength * 1000; s.touchPlayer(); s.dirty.meta = true; await s.flush(); })()`);
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?slot=${slot}&auto=continue` });
    let rep = '';
    for (let i = 0; i < 120 && !rep; i++) { await sleep(500); rep = await ev(`document.querySelector('.panel.away')?.textContent || ''`).catch(() => ''); }
    check(/Worked \d+ shifts? at .* earned \d+ cr/.test(rep), 'three days of routine: the away report sums the shifts (' + (rep.match(/Worked[^.]*/)?.[0] || rep.slice(0, 80)) + ')');
    await ev(`document.querySelector('.panel.away button').click(), 1`);
    for (let i = 0; i < 40; i++) { await sleep(250); if (await ev('document.title') === 'READY') break; }
    check(await ev(`ORBIS.store.player.credits`) > c0, 'and the wages are in your credits');
  }
  console.log('[arrest]');
  const arr = await ev(`(async () => {
    const O = ORBIS, P = O.store.player, { solarHour } = await import('./js/sim/clock.js');
    const { issueWarrant } = await import('./js/sim/processes/law.js');
    const { doorstep } = await import('./js/gen/place.js'); const { buildingPlan } = await import('./js/gen/building.js');
    const h = solarHour(O.planet, O.clock.now()); O.clock.advance(((10.5 - h + 24) % 24) / 24 * O.planet.dayLength);
    const hq = O.pop.buildingByKey.get(O.polity.security), ds = doorstep(O.s, hq, buildingPlan(O.planet, O.s, hq));
    O.ctrl.pos = ds.pos.slice(); O.ctrl.vel = [0, 0, 0];
    await new Promise(r => setTimeout(r, 1500));
    const t = O.clock.now(); issueWarrant(O.ctx, t, 'a test warrant'); O.ctx.onServe(t);
    const who = O.getPursuit()?.person.name;
    for (let i = 0; i < 300 && !P.custody; i++) await new Promise(r => setTimeout(r, 500));
    const loc = O.world.locate(...O.ctrl.pos);
    return { who, custody: !!P.custody, inCell: loc?.room?.i === O.cell.room.i && loc?.b?.key === O.cell.b.key, hud: document.querySelector('.hud .law').textContent,
      arrested: O.store.events.filter(e => e.type === 'arrested').length, warrant: !!P.warrant };
  })()`);
  check(arr.who, 'a warrant in game sends an officer (' + arr.who + ')');
  check(arr.custody && arr.inCell && !arr.warrant, 'standing still, you are arrested and put in the cell');
  check(/In custody/.test(arr.hud), 'HUD shows custody (' + arr.hud + ')');
  if (arr.custody) {
    await key('KeyW', 'keydown'); await sleep(2500); await key('KeyW', 'keyup');
    check(await ev(`ORBIS.world.locate(...ORBIS.ctrl.pos)?.room?.i === ORBIS.cell.room.i`), 'you can\'t walk out of the cell');
    const rel = await ev(`(async () => { const O = ORBIS, P = O.store.player; O.clock.advance(P.custody.until + 5 - O.clock.now()); await new Promise(r => setTimeout(r, 2000));
      return { free: !P.custody, released: O.store.events.some(e => e.type === 'released'), held: O.cell.doors.some(d => O.store.getDelta(O.cell.b.key + '/door:' + d.id)?.held) }; })()`);
    check(rel.free && rel.released && !rel.held, 'released when the sentence is up; the cell door unlocks');
  }
  const pay = await ev(`(async () => { const O = ORBIS, P = O.store.player, { buildingToWorld } = await import('./js/gen/place.js'); const { buildingPlan } = await import('./js/gen/building.js');
    P.fines = [{ incident: -1, amount: 120, offence: 'Test', t: O.clock.now(), due: O.clock.now() + 1e5 }]; P.credits = Math.max(P.credits, 500); const c0 = P.credits;
    const hq = O.pop.buildingByKey.get(O.polity.security), pl = buildingPlan(O.planet, O.s, hq), d = pl.doors[pl.entrance];
    O.ctrl.pos = buildingToWorld(O.s, hq, d.x, 0, d.z + 2); await new Promise(r => setTimeout(r, 400));
    O.showWork(); await new Promise(r => setTimeout(r, 400));
    const b = document.querySelector('.panel.work button[data-a=pay]'); if (!b) return { none: true };
    b.click(); await new Promise(r => setTimeout(r, 400));
    document.querySelector('.panel.work button[data-a=ok]')?.click();
    return { paid: c0 - P.credits, left: P.fines.length }; })()`);
  check(pay.paid === 120 && pay.left === 0, 'fines are paid at the civic office (' + JSON.stringify(pay) + ')');
  console.log('[life]');
  const life = await ev(`(async () => {
    const O = ORBIS, n0 = O.pop.people.length, ids0 = new Set(O.pop.people.map(p => p.id)), e0 = O.store.events.length;
    for (let d = 0; d < 120; d++) { O.clock.advance(O.planet.dayLength); await new Promise(r => setTimeout(r, 30)); }
    await new Promise(r => setTimeout(r, 1500));
    const evs = O.store.events.slice(e0).map(e => e.type), now = new Set(O.pop.people.map(p => p.id));
    const drawn = O.getAgents().filter(a => !a.person.job || !O.getPursuit()).map(a => a.id);
    O.showWork(); await new Promise(r => setTimeout(r, 500));
    const reg = [...document.querySelectorAll('.panel.work h3')].some(h => h.textContent === 'Town register') ? document.querySelectorAll('.panel.work ul.events')[document.querySelectorAll('.panel.work ul.events').length - 1].children.length : 0;
    document.querySelector('.panel.work button[data-a=ok]')?.click();
    return { n0, n: O.pop.people.length, gone: [...ids0].filter(id => !now.has(id)).length, added: [...now].filter(id => !ids0.has(id)).length,
      life: evs.filter(t => /died|born|resident_|household_|left_home|moved_away/.test(t)).length, drawnGone: drawn.filter(id => !now.has(id)).length, drawn: drawn.length, reg,
      saved: !!O.store.getDelta('life/' + O.s.key) }; })()`);
  check(life.life > 0 && (life.gone + life.added) > 0, `120 days pass: the town changes (${life.life} life events, ${life.gone} gone, ${life.added} new, ${life.n0} → ${life.n} residents)`);
  check(life.drawn > 0 && life.drawnGone === 0, `only people still in town are drawn (${life.drawn} drawn)`);
  check(life.reg > 0, 'the civic office shows the town register (' + life.reg + ' entries)');
  check(life.saved, 'lives are saved as a delta over the generated town');
  {
    const before = await ev(`(async () => { await ORBIS.save(); return ORBIS.pop.people.map(p => p.id + '@' + p.home).sort().join(); })()`);
    check(await load('auto=continue'), 'reload after the town changed');
    const after = await ev(`ORBIS.pop.people.map(p => p.id + '@' + p.home).sort().join()`);
    check(before === after, 'the same residents live in the same homes after reloading');
  }
  console.log('[items]');
  const items = await ev(`(async () => {
    const O = ORBIS, P = O.store.player, wait = ms => new Promise(r => setTimeout(r, ms));
    const { usablesOf, ownership, contents } = await import('./js/sim/processes/use.js');
    const { buildingToWorld } = await import('./js/gen/place.js');
    const key = c => { dispatchEvent(new KeyboardEvent('keydown', { code: c })); dispatchEvent(new KeyboardEvent('keyup', { code: c })); };
    const FRONT = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const stand = (b, u) => { const pr = u.pr, F = FRONT[pr.face], cx = (pr.x0 + pr.x1) / 2, cz = (pr.z0 + pr.z1) / 2, dep = F[0] ? pr.x1 - pr.x0 : pr.z1 - pr.z0;
      const at = buildingToWorld(O.s, b, cx + F[0] * (dep / 2 + 0.45), pr.y, cz + F[1] * (dep / 2 + 0.45)), c = buildingToWorld(O.s, b, cx, pr.y, cz);
      O.ctrl.mode = 'walk'; O.ctrl.pos = at; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = Math.atan2(c[0] - at[0], c[2] - at[2]); };
    const out = {};
    const home = O.pop.buildingByKey.get(P.home), us = usablesOf(O.planet, O.s, home);
    const fr = us.find(u => u.pr.kind === 'fridge' && ownership(home, u.room, P).yours) || us.find(u => u.verbs.includes('open') && ownership(home, u.room, P).yours);
    stand(home, fr); await wait(300);
    out.aim = O.use.usableAhead()?.u.i === fr.i;
    const n0 = (P.inventory || []).reduce((a, x) => a + x.n, 0), had = contents(O.store, O.planet, home, fr, O.clock.now()).length;
    key('KeyE'); await wait(300);
    out.panel = !!document.querySelector('.panel.use');
    document.querySelector('.panel.use [data-a=takeall]')?.click(); await wait(200);
    key('Escape'); await wait(200);
    out.took = (P.inventory || []).reduce((a, x) => a + x.n, 0) - n0; out.had = had; out.closed = !document.querySelector('.panel.use');
    // eat from the inventory
    P.hunger = 0.8; key('KeyI'); await wait(300);
    document.querySelector('.panel.use [data-a=eat]')?.click(); await wait(200); key('Escape'); await wait(200);
    out.ate = P.hunger < 0.8;
    // a bed: lie down, sleep one hour
    const bed = us.find(u => u.verbs.includes('sleep'));
    if (bed) { stand(home, bed); await wait(300); const t0 = O.clock.now(), f0 = P.fatigue = 0.7;
      key('KeyE'); await wait(300); key('Digit1'); await wait(300);
      out.slept = Math.round((O.clock.now() - t0) / (O.planet.dayLength / 24) * 10) / 10; out.lying = O.ctrl.mode === 'seat' && O.ctrl.seat.pose === 'lie'; out.rested = P.fatigue < f0;
      dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); await wait(200); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); out.up = O.ctrl.mode === 'walk'; }
    // a shop: buy something off the shelf while it's open
    const shop = O.s.buildings.find(b => b.type === 'store'), shelf = usablesOf(O.planet, O.s, shop).find(u => u.verbs.includes('buy'));
    const h = (await import('./js/sim/clock.js')).solarHour(O.planet, O.clock.now()); O.clock.advance(((12 - h + 24) % 24) / 24 * O.planet.dayLength);
    stand(shop, shelf); await wait(300); P.credits = Math.max(P.credits, 300); const c0 = P.credits;
    key('KeyE'); await wait(300);
    document.querySelector('.panel.use [data-a=buy]')?.click(); await wait(200); key('Escape'); await wait(200);
    out.spent = c0 - P.credits;
    // the light switch
    const loc = O.world.locate(...O.ctrl.pos); key('KeyL'); await wait(100);
    out.light = O.store.getDelta('light/' + loc.b.key + '/' + loc.k + ':' + loc.room.i)?.on === false; key('KeyL');
    // water a plant (the sea mesh once shadowed this action's name)
    for (const b of O.s.buildings) { const pu = usablesOf(O.planet, O.s, b).find(u => u.verbs.includes('water')); if (pu) { await O.use.useThing({ b, u: pu }); out.watered = O.store.getDelta('use/' + b.key + '/' + pu.i)?.watered > 0; break; } }
    return out; })()`);
  check(items.watered, 'watered a planter');
  check(items.aim, 'facing the fridge at home targets it');
  check(items.panel && items.closed, 'E opens it; Esc closes it');
  check(items.took > 0 || items.had === 0, `took everything (${items.took} items)`);
  check(items.ate, 'ate something from the inventory');
  check(items.lying && items.slept === 1 && items.rested && items.up, `lay down and slept ${items.slept} h, then got up (${JSON.stringify(items)})`);
  check(items.spent > 0, `bought from a shop shelf (${items.spent} cr)`);
  check(items.light, 'switched the room light off');
  console.log('[speeders]');
  const bikes = await ev(`(async () => {
    const O = ORBIS, P = O.store.player, wait = ms => new Promise(r => setTimeout(r, ms));
    const key = (c, up = true) => { dispatchEvent(new KeyboardEvent('keydown', { code: c })); if (up) dispatchEvent(new KeyboardEvent('keyup', { code: c })); };
    const out = {}, v = O.getVehicles().find(v => v.forSale && v.kind === 'bike'); P.credits = 5000; out.price = (await import('./js/gen/vehicles.js')).typeOf(v).price;
    O.ctrl.mode = 'walk'; O.ctrl.pos = [v.pos[0] + 1.2, v.pos[1], v.pos[2] + 0.5]; await wait(500);
    key('KeyE'); await wait(300); key('Digit1'); await wait(300);
    out.paid = 5000 - P.credits; key('KeyE'); await wait(300);
    out.riding = !!O.getRide();
    { const R = O.getRide(); const { nearestRoadPoint } = await import('./js/gen/place.js'); const q = nearestRoadPoint(O.s, R.pos[0], R.pos[2]); let best = R.facing, bestFree = 0;   // turn to the longest clear run
      for (let k = 0; k < 16; k++) { const f = k * Math.PI / 8; let d = 0; for (; d < 60; d += 1) if (O.world.solidAt(q[0] + Math.sin(f) * d, R.pos[1] + 0.8, q[2] + Math.cos(f) * d, 0.6)) break; if (d > bestFree) { bestFree = d; best = f; } }
      R.pos = [q[0], R.pos[1], q[2]]; R.facing = best; }
    key('KeyW', false); await wait(3000); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    out.speed = Math.round(O.getRide()?.speed * 3.6);
    key('KeyE'); await wait(100); out.refused = !!O.getRide();
    key('KeyS', false); for (let i = 0; i < 40 && O.getRide().speed > 1; i++) await wait(100); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyS' }));
    key('KeyE'); await wait(300);
    const now = O.getVehicles().find(x => x.id === v.id);
    out.off = !O.getRide() && O.ctrl.mode === 'walk'; out.moved = Math.round(Math.hypot(now.pos[0] - v.pos[0], now.pos[2] - v.pos[2]));
    out.near = Math.round(Math.hypot(now.pos[0] - O.ctrl.pos[0], now.pos[2] - O.ctrl.pos[2]) * 10) / 10;
    // someone else's: E only warns; holding F hotwires it (a theft)
    const other = O.getVehicles().find(x => !x.forSale && !x.owner.startsWith('you'));
    O.ctrl.pos = [other.pos[0] + 1.2, other.pos[1], other.pos[2]]; await wait(400);
    key('KeyE'); await wait(200); out.notMine = !O.getRide();
    key('KeyF', false); for (let i = 0; i < 40 && O.getRide()?.v.id !== other.id; i++) await wait(200); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' })); await wait(200);
    out.stole = O.getRide()?.v.id === other.id && O.store.events.some(e => e.type === 'theft' && e.vehicle === other.id);
    key('KeyE'); await wait(200); await O.save();
    out.id = v.id; out.pos = now.pos;
    return out; })()`);
  check(bikes.paid === bikes.price && bikes.riding, `bought a bike for ${bikes.paid} cr and got on`);
  check(bikes.speed > 30, `3 s of throttle: ${bikes.speed} km/h`);
  check(bikes.refused, "can't get off at speed");
  check(bikes.off && bikes.moved > 20 && bikes.near < 2, `braked, got off; it's parked ${bikes.moved} m from the dealer, ${bikes.near} m from you`);
  check(bikes.notMine && bikes.stole, "someone else's bike: E won't take it; holding F hotwires it, and that's logged as theft");
  check(await load('auto=continue'), 'reload');
  const parkedAfter = await ev(`JSON.stringify(ORBIS.getVehicles().find(x => x.id === ${JSON.stringify(bikes.id)}).pos)`);
  check(parkedAfter === JSON.stringify(bikes.pos), 'your bike is where you left it after reloading');
  console.log('[ships]');
  const sp = await ev(`(async () => {
    const O = ORBIS, P = O.store.player, wait = ms => new Promise(r => setTimeout(r, ms));
    const key = (c, up = true) => { dispatchEvent(new KeyboardEvent('keydown', { code: c })); if (up) dispatchEvent(new KeyboardEvent('keyup', { code: c })); };
    const { buildingToWorld } = await import('./js/gen/place.js'); const { structureOf } = await import('./js/world/ships.js');
    const out = {}, sh = O.getShips().find(x => x.forSale), b = structureOf(O.s, sh, () => true, O.planet), W = (a, c, d) => buildingToWorld(O.s, b, a, c, d);
    const Lay = (await import('./js/gen/ships.js')).shipPlan(sh.model).layout, seat = Lay.seats.find(q => q.kind === 'pilot'), mx = (Lay.ramp.x0 + Lay.ramp.x1) / 2, dk = Lay.deck;
    // walk up the ramp from the pad
    O.ctrl.mode = 'walk'; O.ctrl.pos = W(mx, 0, -1); O.ctrl.vel = [0, 0, 0]; await wait(400);
    const tgt = W(seat.x, dk, seat.z - 0.7); O.ctrl.facing = O.cam.yaw = Math.atan2(tgt[0] - O.ctrl.pos[0], tgt[2] - O.ctrl.pos[2]);
    const way = [...Lay.partitions.flatMap(q => [W(Lay.doors[q.door].x, dk, q.z - 0.9), W(Lay.doors[q.door].x, dk, q.z + 0.9)]), tgt];
    key('KeyW', false); for (let i = 0, k = 0; i < 160 && O.world.locate(...O.ctrl.pos)?.room?.purpose !== 'cockpit'; i++) { const g = way[Math.min(k, way.length - 1)]; if (Math.hypot(g[0] - O.ctrl.pos[0], g[2] - O.ctrl.pos[2]) < 0.4) k++; O.cam.yaw = Math.atan2(g[0] - O.ctrl.pos[0], g[2] - O.ctrl.pos[2]); await wait(80); } dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    out.walkedIn = O.world.locate(...O.ctrl.pos)?.room?.purpose;
    out.hud = document.querySelector('.hud .place')?.textContent;
    // the helm: buy it, then take off
    P.credits = 200000; O.ctrl.pos = W(seat.x, dk, seat.z - 0.7); const c = W(seat.x, dk, seat.z + 1); O.ctrl.facing = Math.atan2(c[0] - O.ctrl.pos[0], c[2] - O.ctrl.pos[2]); await wait(300);
    key('KeyE'); await wait(300); key('Digit1'); await wait(300); out.paid = 200000 - P.credits; out.price = (await import('./js/gen/ships.js')).PRICES[sh.model];
    key('KeyE'); await wait(300); key('Digit1'); await wait(300);
    out.flying = !!O.getFlight();
    key('Space', false); await wait(4000); dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    out.alt = Math.round(O.getFlight()?.altitude());
    key('KeyD', false); await wait(1500); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));      // turn on the spot, then come back down on the pad
    key('KeyE'); await wait(100); out.refusedInAir = !!O.getFlight();
    // come down: brake, descend, land
    key('KeyS', false); for (let i = 0; i < 60 && O.getFlight().speed > 2; i++) await wait(100); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyS' }));
    key('KeyQ', false); for (let i = 0; i < 400 && !O.getFlight().onGround; i++) await wait(100); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ' }));
    await wait(1500); out.why = O.getFlight()?.landingProblem();
    key('KeyE'); await wait(400);
    out.landed = !O.getFlight() && O.ctrl.mode === 'seat'; out.at = O.getShips().find(x => x.id === sh.id).at?.c;
    out.moved = out.at ? Math.round(Math.hypot(out.at[0] - b.O[0] - O.s.cx, 0)) : 0;
    await O.save(); out.id = sh.id; return out; })()`);
  check(sp.walkedIn === 'cockpit' && /cockpit/.test(sp.hud || ''), `walked up the ramp into the cockpit (HUD: ${sp.hud})`);
  check(sp.paid === sp.price && sp.flying, `bought the ship at the helm (${sp.price} cr) and took off`);
  check(sp.alt > 15, `climbed to ${sp.alt} m`);
  check(sp.refusedInAir, "can't land in mid-air");
  check(sp.landed && sp.at, `landed (${sp.why ?? 'ok'})`);
  const runChk = await ev(`(async () => {
    const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms)); const { runOn } = await import('./js/gen/ships.js'); const { dayIndex } = await import('./js/gen/schedule.js'); const { centreOf } = await import('./js/world/ships.js');
    const sh = O.getShips().find(x => x.owner?.startsWith('firm:') && !x.field), home = centreOf(O.s, sh);
    let run = runOn(O.planet, sh, dayIndex(O.planet, O.clock.now())); if (run.depart < O.clock.now()) run = runOn(O.planet, sh, dayIndex(O.planet, O.clock.now()) + 1);
    O.ctrl.mode = 'walk'; O.ctrl.pos = [home.c[0] + 40, home.c[1], home.c[2]]; await wait(200);
    O.clock.advance(run.depart + 25 - O.clock.now()); O.syncShips(); await wait(600);
    const live = O.getShips().find(x => x.id === sh.id), onPad = O.world.locate(home.c[0], home.c[1] + 2.5, home.c[2])?.b?.key === sh.id;
    return { phase: live.trip?.phase, onPad }; })()`);
  check(runChk.phase === 'departing' && !runChk.onPad, `a firm's ship lifts off on its cargo run (${JSON.stringify(runChk)})`);
  check(await load('auto=continue'), 'reload');
  const shipAfter = await ev(`JSON.stringify(ORBIS.getShips().find(x => x.id === ${JSON.stringify(sp.id)}).at?.c)`);
  check(shipAfter === JSON.stringify(sp.at), 'the ship is where you landed it after reloading');
  console.log('[talk]');
  const tk = await ev(`(async () => {
    const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms)), key = c => { dispatchEvent(new KeyboardEvent('keydown', { code: c })); dispatchEvent(new KeyboardEvent('keyup', { code: c })); };
    O.ctrl.mode = 'walk';
    let a = null;
    for (let k = 0; k < 40 && !a; k++) { a = O.getAgents().find(x => x.pose !== 'lie' && !x.moving && !String(x.id).startsWith('tr:')); if (!a) { O.clock.advance(O.planet.dayLength / 24); await wait(300); } }
    if (!a) return { none: true };
    O.ctrl.pos = [a.pos[0] + Math.sin(a.facing) * 1.2, a.pos[1], a.pos[2] + Math.cos(a.facing) * 1.2]; O.ctrl.vel = [0, 0, 0];
    O.ctrl.facing = Math.atan2(a.pos[0] - O.ctrl.pos[0], a.pos[2] - O.ctrl.pos[2]); await wait(400);
    key('KeyE'); await wait(400);
    const opened = !!document.querySelector('.panel.use'), title0 = document.querySelector('.panel.use h2')?.textContent;
    document.querySelector('.panel.use [data-a=intro]')?.click(); await wait(300);
    document.querySelector('.panel.use [data-a=work]')?.click(); await wait(300);
    const said = document.querySelector('.panel.use .talk')?.textContent || '';
    document.querySelector('.panel.use [data-a=way]')?.click(); await wait(300);
    document.querySelector('.panel.use [data-a=go]')?.click(); await wait(300);
    key('Escape'); await wait(300);
    return { opened, title0, title1: a.person.name, known: !!O.store.getDelta('know/' + a.person.id), said: said.slice(0, 160), waypoint: O.store.player.waypoint?.label }; })()`);
  check(tk.opened && tk.known, `talked to ${tk.title0} — introduced: now ${tk.title1} (${JSON.stringify(tk).slice(0, 200)})`);
  check(/I'm|I live|School|retired|Nothing|Looking|between/.test(tk.said), 'they answered: ' + tk.said);
  check(!!tk.waypoint, 'asked the way: waypoint to ' + tk.waypoint);
  console.log('[combat]');
  const cb = await ev(`(async () => {
    const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms));
    let a = null; for (let k = 0; k < 40 && !a; k++) { a = O.getAgents().find(x => !x.bKey && x.pose !== 'lie' && !String(x.id).startsWith('tr:') && !(x.person.job && O.pop.jobById.get(x.person.job).security)); if (!a) { O.clock.advance(O.planet.dayLength / 48); await wait(300); } }
    if (!a) return { none: true };
    O.ctrl.mode = 'walk'; O.store.player.weapon = null;
    const go = () => { O.ctrl.pos = [a.pos[0] - Math.sin(a.facing) * 1.0, a.pos[1], a.pos[2] - Math.cos(a.facing) * 1.0]; O.ctrl.facing = a.facing; };
    go(); await wait(300);
    const e0 = O.store.events.length; go(); O.attack(); await wait(200);
    return { hurt: O.store.getDelta('hurt/' + a.person.id)?.hp, assault: O.store.events.slice(e0).some(e => e.type === 'assault') }; })()`);
  check(cb.hurt < 100 && cb.assault, `punched someone: ${Math.round(cb.hurt)}% health, an assault is on record`);
  const gs = await ev(`(async () => { const O = ORBIS, P = O.store.player, wait = ms => new Promise(r => setTimeout(r, ms)); const a = O.getAgents().find(x => !x.bKey && x.pose !== 'lie' && !String(x.id).startsWith('tr:')); if (!a) return { none: true };
    P.inventory.push({ id: 'pistol', n: 1 }); P.weapon = 'pistol'; O.ctrl.pos = [a.pos[0] + 6, a.pos[1], a.pos[2]]; await wait(600); O.attack(); const f0 = O.renderer.info.render.frame; await wait(2500); const running = O.getAgents().filter(x => x.activity === 'running from gunfire').length; P.inventory = P.inventory.filter(x => x.id !== 'pistol'); P.weapon = null; return { running, frames: O.renderer.info.render.frame - f0 }; })()`);
  check(gs.none || (gs.running > 0 && gs.frames > 5), `a shot near people: ${gs.running} run from it, and the game keeps drawing (${gs.frames} frames)`);
  const gf = await ev(`(async () => {
    const O = ORBIS, P = O.store.player, wait = ms => new Promise(r => setTimeout(r, ms));
    P.custody = null; P.warrant = null; P.hp = 100;
    P.inventory.push({ id: 'pistol', n: 1 }); P.weapon = 'pistol';
    const t = O.clock.now(); O.ctx.onServe(t); const pu = O.getPursuit(); if (!pu) return { none: true };
    // stand 18 m from the officer, out in the open where there's a clear line
    let best = null; for (let k = 0; k < 24 && !best; k++) { const a = k / 24 * Math.PI * 2, x = pu.pos[0] + Math.sin(a) * 18, z = pu.pos[2] + Math.cos(a) * 18, y = O.world.groundAt(x, z, pu.pos[1] + 2).h; if (Math.abs(y - pu.pos[1]) < 1.5) best = [x, y, z]; }
    O.ctrl.pos = best || [pu.pos[0] + 18, pu.pos[1], pu.pos[2]]; O.ctrl.vel = [0, 0, 0];
    for (let k = 0; k < 40 && P.hp >= 100 && !P.custody; k++) { O.ctrl.pos = best || O.ctrl.pos; await wait(250); }
    const shot = P.hp < 100 || !!O.getPursuit()?.drawn;
    O.hurtPlayer(500, 'test'); await wait(200);
    return { shot, drawn: !!pu.drawn, hp: P.hp, custody: !!P.custody, armed: P.inventory.some(x => x.id === 'pistol') }; })()`);
  check(gf.drawn && gf.shot, `armed and wanted, the officer draws and fires (${JSON.stringify(gf)})`);
  check(gf.custody && !gf.armed && gf.hp > 0, 'shot down by the law: you wake in the cell, weapons gone');
  console.log('[city]');
  const ct = await ev(`(async () => {
    const O = ORBIS, c = O.city, wait = ms => new Promise(r => setTimeout(r, ms)), G = await import('./js/gen/city.js');
    O.store.player.custody = null; O.ctrl.mode = 'walk';
    const u = G.lineAt(c, 0, 1), v0 = G.lineAt(c, 1, -2) + 20, [x, z] = c.toWorld(u, v0), [x2, z2] = c.toWorld(u, v0 + 50);
    O.ctrl.pos = [x, c.h + 0.3, z]; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = Math.atan2(x2 - x, z2 - z); O.cam.yaw = O.ctrl.facing;
    for (let i = 0; i < 120 && !O.cityView.done; i++) await wait(250);
    await wait(600); const p0 = O.ctrl.pos.slice();
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); for (let i = 0; i < 80 && Math.hypot(O.ctrl.pos[0] - p0[0], O.ctrl.pos[2] - p0[2]) < 6; i++) await wait(200); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    const moved = Math.hypot(O.ctrl.pos[0] - p0[0], O.ctrl.pos[2] - p0[2]);
    const place = document.querySelector('.place')?.textContent;
    // into a building: blocked at its wall
    let B = null; for (let a = 0; a < 40 && !B; a++) { const b = G.cityBlock(c, a % 8 - 3, Math.floor(a / 8) - 2); if (b.district && b.buildings.some(q => q.tiers[0].y0 === 0 && q.tiers[0].y1 > 15)) B = b; }
    const bd = B.buildings.find(q => q.tiers[0].y0 === 0 && q.tiers[0].y1 > 15), r = bd.tiers[0].r, vm = (r[1] + r[3]) / 2, [bx, bz] = c.toWorld(r[0] - 4, vm), [tx, tz] = c.toWorld(r[0] + 10, vm);
    O.ctrl.pos = [bx, c.h + 0.3, bz]; O.ctrl.facing = Math.atan2(tx - bx, tz - bz); O.cam.yaw = O.ctrl.facing; await wait(500);
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); await wait(9000); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    const [lu] = c.toLocal(O.ctrl.pos[0], O.ctrl.pos[2]);
    return { moved: Math.round(moved * 10) / 10, place, built: O.cityView.stats.sectors, traffic: O.cityTraffic.drawn, wall: Math.round((lu - r[0]) * 100) / 100, label: bd.label }; })()`);
  check(ct.built > 50 && ct.moved > 4, `walked down a city street (${ct.moved} m; ${ct.built} sectors built; ${ct.traffic} vehicles drawn near)`);
  check(/Spire|Commercial|Residential|Market|Warrens|Foundry|Skyport|Gardens/.test(ct.place), 'the HUD names the district: ' + ct.place);
  check(ct.wall < 0 && ct.wall > -0.7, `walked into a ${ct.label} and stopped at its wall (${ct.wall} m)`);
  const lf = await ev(`(async () => {
    const O = ORBIS, c = O.city, wait = ms => new Promise(r => setTimeout(r, ms)), G = await import('./js/gen/city.js');
    let L = null; for (let a = 0; a < 400 && !L; a++) { const B = G.cityBlock(c, (a % 20) - 10, Math.floor(a / 20) - 10); L = G.liftsOf(c, B).find(l => l.stops.some(q => q.label.startsWith('Skybridge'))); }
    const st = L.stops[0], [x, z] = c.toWorld(st.u, st.v); O.ctrl.pos = [x, c.h + G.CURB + 0.05, z]; O.ctrl.vel = [0, 0, 0]; await wait(600);
    const near = !!O.liftNear(), prompt = document.querySelector('.prompt')?.textContent || '';
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' })); await wait(400);
    const want = L.stops.findIndex(q => q.label.startsWith('Skybridge')); document.querySelector('.panel [data-v="' + want + '"]')?.click(); await wait(1500);
    const y = O.ctrl.pos[1] - c.h - G.CURB, q = L.stops[want];
    // walk along the bridge for a couple of seconds: you stay on the deck
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); await wait(1500); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); await wait(800);
    return { near, prompt: prompt.slice(0, 80), want: q.y, y: Math.round(y * 10) / 10, after: Math.round((O.ctrl.pos[1] - c.h - G.CURB) * 10) / 10 }; })()`);
  check(lf.near && /Lift/.test(lf.prompt), 'a tower\'s street door offers its lift: ' + lf.prompt);
  check(Math.abs(lf.y - lf.want) < 0.3 && Math.abs(lf.after - lf.want) < 0.3, `took the lift up to a skybridge ${lf.want} m up and stood on it (${lf.y} → ${lf.after})`);
  const wi = await ev(`(async () => {
    const O = ORBIS, c = O.city, wait = ms => new Promise(r => setTimeout(r, ms)), G = await import('./js/gen/city.js'), R = await import('./js/world/cityreal.js');
    let rec = null; for (let a = 0; a < 1600 && !rec; a++) { const B = G.cityBlock(c, (a % 40) - 20, Math.floor(a / 40) - 20); if (B.district !== 'market') continue; for (const b of B.buildings) if (b.enter === 'store') { rec = R.realOf(O.planet, O.s, c, B, b); if (rec) break; } }
    const pl = rec.plan, dr = pl.doors.find(d => d.k === 0 && d.rooms.includes('outside')) || pl.doors[0];
    const at = (x, z) => O.s.toWorld(rec.O[0] + rec.ex[0] * x + rec.ez[0] * z, rec.O[1] + rec.ex[1] * x + rec.ez[1] * z);
    const [x, z] = at(dr.x, -2.5), [tx, tz] = at(dr.x, 3);
    O.ctrl.pos = [x, c.h + 0.05, z]; O.ctrl.vel = [0, 0, 0];
    for (let i = 0; i < 60 && !O.getCityRooms()?.live.has(rec.cityId); i++) { O.ctrl.pos = [x, c.h + 0.05, z]; await wait(200); }
    O.ctrl.facing = Math.atan2(tx - x, tz - z); O.cam.yaw = O.ctrl.facing; await wait(300);
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); for (let i = 0; i < 60 && !O.world.locate(...O.ctrl.pos)?.b?.city; i++) await wait(200); await wait(300); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); await wait(300);
    const loc = O.world.locate(...O.ctrl.pos);
    return { live: O.getCityRooms()?.live.size, inside: !!loc?.b?.city, room: loc?.room?.purpose, label: rec.label, place: document.querySelector('.place')?.textContent }; })()`);
  check(wi.inside, `walked in off the street into a ${wi.label} (${wi.room}; ${wi.live} walk-in buildings built nearby) — HUD: ${wi.place}`);
  const hit = await ev(`(async () => {
    const O = ORBIS, P = O.store.player, wait = ms => new Promise(r => setTimeout(r, ms)), T = await import('./js/gen/traffic.js');
    P.hp = 100; P.custody = null; O.ctrl.mode = 'walk'; O.ctrl.stun = 0;
    // stand in the road, in the path of the nearest car in town
    // step out right in front of a moving car: too close for it to stop
    let v = null; for (let i = 0; i < 80 && !v; i++) { v = T.trafficNear(O.planet, O.s, O.clock.now(), O.s.cx, O.s.cz, 1e5).find(q => !q.parked && !q.id.includes('|') && Math.hypot(q.pos[0] - O.s.cx, q.pos[2] - O.s.cz) < 400); if (!v) { O.clock.advance(30); await wait(100); } }
    if (!v) return { none: true };
    const fut = T.trafficNear(O.planet, O.s, O.clock.now() + 0.3, O.s.cx, O.s.cz, 1e5).find(q => q.id === v.id); O.ctrl.pos = fut.pos.slice(); O.ctrl.vel = [0, 0, 0];
    const p0 = O.ctrl.pos.slice(); let hurt = false; for (let i = 0; i < 60 && !hurt; i++) { await wait(50); hurt = P.hp < 100; }
    const stun = O.ctrl.stun; await wait(500); const thrown = Math.hypot(O.ctrl.pos[0] - p0[0], O.ctrl.pos[2] - p0[2]); await wait(300);
    return { hp: Math.round(P.hp), thrown: Math.round(thrown * 10) / 10, stunned: stun > 0, type: v.type, toast: [...document.querySelectorAll('.toast')].map(e => e.textContent).find(x => /hit/.test(x)) || '' }; })()`);
  check(hit.none || (hit.hp < 100 && hit.thrown > 0.5 && hit.stunned), `stood in front of a ${hit.type}: knocked over and thrown ${hit.thrown} m, ${hit.hp}% health — "${String(hit.toast).slice(0, 50)}"`);
  console.log('[sandbox]');
  const sb = await ev(`(async () => {
    const O = ORBIS, P = O.store.player, c = O.city, wait = ms => new Promise(r => setTimeout(r, ms)), key = (k, up = true) => { dispatchEvent(new KeyboardEvent('keydown', { code: k })); if (up) dispatchEvent(new KeyboardEvent('keyup', { code: k })); }, FL = await import('./js/gen/cityfleet.js'), G = await import('./js/gen/city.js'), V = await import('./js/gen/vehicles.js'), out = {};
    P.hp = 100; P.custody = null; P.heat = null; O.ctrl.mode = 'walk'; O.ctrl.stun = 0;
    const [bx, bz] = c.toWorld(G.lineAt(c, 0, 1), G.lineAt(c, 1, -2) + 20); O.ctrl.pos = [bx, c.h + 0.3, bz]; O.ctrl.vel = [0, 0, 0];
    for (let i = 0; i < 300 && !(O.getMayhem() && O.cityTraffic.ready >= O.cityTraffic.n); i++) { O.ctrl.pos = [bx, c.h + 0.3, bz]; await wait(200); }
    const M = O.getMayhem(), F = O.cityTraffic.fleet, t0 = O.clock.now(), q = {};
    const sky = F.cars.find(k => { if (k.kind !== 'sky') return false; FL.vehicleAt(F, k, t0 + 2, q); return q.moving && q.y > c.h + 30 && Math.abs(q.vy || 0) < 0.5 && q.trip.t0 + q.trip.dur > t0 + 60; });     // (cruising: one on its way down leaves you in the air, as it would anyone)
    const TT = V.TYPES[sky.type]; let a = FL.vehicleAt(F, sky, O.clock.now(), {}); for (let i = 0; i < 150 && !O.cityTraffic.nearby.some(v => v.car === sky); i++) { a = FL.vehicleAt(F, sky, O.clock.now(), {}); O.ctrl.pos = [a.x, a.y + TT.H + 4, a.z]; O.ctrl.vel = [0, 0, 0]; await wait(30); } a = FL.vehicleAt(F, sky, O.clock.now(), {}); O.ctrl.pos = [a.x, a.y + TT.H + 0.8, a.z]; O.ctrl.vel = [0, 0, 0]; O.ctrl.grounded = false;
    for (let i = 0; i < 60 && !M.rider; i++) { a = FL.vehicleAt(F, sky, O.clock.now() + 0.03, {}); if (O.ctrl.pos[1] < a.y + TT.H + 1.5) { O.ctrl.pos[0] = a.x; O.ctrl.pos[2] = a.z; } await wait(30); }
    out.rode = !!M.rider; const y1 = O.ctrl.pos[1] - c.h; await wait(800); a = FL.vehicleAt(F, sky, O.clock.now(), {}); out.gap = M.rider ? Math.round(Math.hypot(M.rider.ox, M.rider.oz) * 10) / 10 : 999; out.onIt = !!M.rider; out.alt = Math.round(y1); out.roof = TT.L / 2 + 0.7;
    key('KeyE'); await wait(500); const R = O.getRide2(); out.took = !!R; out.fly = !!R?.v.fly; out.hot = +M.heat(O.clock.now()).toFixed(1); out.driverOut = M.bodies.length > 0;
    key('KeyW', false); await wait(1500); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); out.speed = Math.round(O.getRide2()?.speed || 0);
    key('KeyE'); await wait(300); out.jumpedOut = !O.getRide2() && O.ctrl.mode === 'walk'; out.car = O.getVehicles().some(v => v.id === sky.id);
    for (let i = 0; i < 100 && !O.ctrl.grounded; i++) await wait(100); out.hpAfterFall = Math.round(P.hp);
    // a passer-by: grab, throw
    P.hp = 100; P.heat = null; const W = await import('./js/gen/citytraffic.js'); let w = null; const [wx, wz] = c.toWorld(G.lineAt(c, 0, 4) + 14, G.lineAt(c, 1, 3) + 40); O.ctrl.pos = [wx, c.h + 0.3, wz]; O.ctrl.vel = [0, 0, 0]; await wait(500);
    for (let i = 0; i < 30 && !w; i++) { w = W.cityWalkers(c, O.clock.now(), O.ctrl.pos[0], O.ctrl.pos[2], 80, 20).filter(x => !M.out.has(x.id))[0]; if (!w) await wait(200); }
    if (w) { const tw = () => W.cityWalkers(c, O.clock.now() + 0.1, w.pos[0], w.pos[2], 12, 40).find(x => x.id === w.id); let n = tw(); O.ctrl.pos = [n.pos[0] - 1, n.pos[1], n.pos[2]]; O.ctrl.facing = Math.PI / 2; O.ctrl.vel = [0, 0, 0]; await wait(30); key('KeyG'); out.grabbed = !!M.carry; const p0 = M.carry?.pos?.slice(); await wait(200); key('KeyG'); out.thrown = M.bodies.some(b => b.id === w.id); await wait(1800); const b = M.bodies.find(x => x.id === w.id); out.landed = b && !b.flying; out.flew = b ? Math.round(Math.hypot(b.pos[0] - p0[0], b.pos[2] - p0[2]) * 10) / 10 : 0; out.heat3 = +M.heat(O.clock.now()).toFixed(1); }
    // smash something
    const B = G.cityBlock(c, 2, 2), idx = B.props.findIndex(p => p.k.startsWith('bin') || p.k === 'bench' || p.k.startsWith('lamp')); const pr = B.props[idx], [px, pz] = c.toWorld(pr.u, pr.v); O.ctrl.pos = [px - 1.3, c.h + 0.3, pz]; O.ctrl.facing = Math.PI / 2; O.cam.yaw = O.ctrl.facing; await wait(200); P.weapon = null; O.attack(); await wait(200); out.smashed = !!O.store.getDelta('cprop/2,2/' + idx) || Object.keys(O.store.deltas || {}).some(k => k.startsWith('cprop/')); out.crimes = O.store.events.filter(e => e.type === 'city_crime').map(e => e.kind).filter((k, i, l) => l.indexOf(k) === i);
    // through a real window: a walk-in building's wall, from inside
    const Rl = await import('./js/world/cityreal.js'); let rec = null; for (let a2 = 0; a2 < 1600 && !rec; a2++) { const B2 = G.cityBlock(c, (a2 % 40) - 20, Math.floor(a2 / 40) - 20); if (B2.district !== 'market') continue; for (const b2 of B2.buildings) if (b2.enter === 'store') { const r2 = Rl.realOf(O.planet, O.s, c, B2, b2); if (r2 && r2.plan.walls.some(wl => wl.exterior && wl.side === 'front' && wl.k === 0 && wl.openings.some(o => o.kind === 'window'))) { rec = r2; break; } } }
    const wl = rec.plan.walls.find(x => x.exterior && x.side === 'front' && x.k === 0 && x.openings.some(o => o.kind === 'window')), win = wl.openings.find(o => o.kind === 'window'), at = (x, z) => O.s.toWorld(rec.O[0] + rec.ex[0] * x + rec.ez[0] * z, rec.O[1] + rec.ex[1] * x + rec.ez[1] * z), lx = (win.a + win.b) / 2, [ix, iz] = at(lx, 2), [ox, oz] = at(lx, -2);
    O.ctrl.pos = [ix, c.h + 0.3, iz]; O.ctrl.vel = [0, 0, 0]; for (let i = 0; i < 60 && !O.getCityRooms()?.live.has(rec.cityId); i++) { O.ctrl.pos = [ix, c.h + 0.3, iz]; await wait(200); }
    const dl = Math.hypot(ox - ix, oz - iz), y = rec.base + (win.y0 + win.y1) / 2 - 1.0; M.thrown({ id: 'test-body', name: 'The test dummy', pos: [ix, y, iz], vel: [(ox - ix) / dl * 9, 1.0, (oz - iz) / dl * 9] }); await wait(1800);
    const tb = M.bodies.find(x => x.id === 'test-body'), [tu, tv] = [tb?.pos[0], tb?.pos[2]], oa = (tu - rec.O[0]) ; out.body = tb ? { flying: tb.flying, outside: !O.world.locate(tb.pos[0], tb.pos[1], tb.pos[2]) } : null; out.windowCrime = O.store.events.some(e => e.kind === 'threw someone through a window');
    return out; })()`);
  check(sb.rode && sb.onIt && sb.gap < sb.roof, `landed on a flying car ${sb.alt} m up and it carried me (${JSON.stringify(sb).slice(0, 110)})`);
  check(sb.took && sb.fly && sb.driverOut && sb.hot >= 0.2, `took it: driver out, in the air, heat ${sb.hot}`);     // (hijacking a moving car: 2.2 if anyone below saw it, a quarter if not; one that had stopped is theft, 1 or a quarter)
  check(sb.speed > 2, `flew it (${sb.speed} m/s)`);     // (in a busy lane it can clip someone: that counts as a crash now)
  check(sb.jumpedOut && sb.car, `jumped out of it; it's still there, mine; ${sb.hpAfterFall}% health after the fall`);
  check(sb.grabbed && sb.thrown && sb.landed && sb.flew > 3, `grabbed a passer-by, threw them ${sb.flew} m; heat ${sb.heat3}`);
  check(sb.smashed, `smashed street furniture; crimes on record: ${(sb.crimes || []).join(', ')}`);
  check(sb.body?.outside && sb.windowCrime, `threw someone out through a real window (${JSON.stringify(sb.body)})`);
  console.log('[walking into the country]');
  const cw = await ev(`(async () => {
    const O = ORBIS, P = O.store.player, out = {}, wait = ms => new Promise(r => setTimeout(r, ms)), T = await import('./js/gen/surface.js'), OP = await import('./js/gen/outposts.js'), key = (k, on) => dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code: k })), tap = k => { key(k, true); key(k, false); };
    P.hp = 100; P.custody = null; P.heat = null; O.ctrl.mode = 'walk'; O.ctrl.stun = 0; if (O.getRide2?.()) tap('KeyE');
    let S0 = null, bd = 1e12; for (let i = -22; i <= 22; i++) for (let j = -22; j <= 22; j++) for (const S of OP.sitesInTile(O.planet, i, j)) if (S.kind === 'village' && S.items.some(q => /^gb_cottage_/.test(q.k))) { const d = Math.hypot(S.x - O.s.cx, S.z - O.s.cz); if (d < bd) { bd = d; S0 = S; } }
    if (!S0) return { none: 1 };
    const it = S0.items.find(q => /^gb_cottage_/.test(q.k)), c = Math.cos(it.rot), s = Math.sin(it.rot), at = (u, v) => [it.x + u * c + v * s, it.z - u * s + v * c], f = it.box[1], lead = (it.stoop ? it.stoop.n * it.stoop.run : 0) + 1.5;
    const [x0, z0] = at(0, -f - 9), y0 = T.surfaceAt(O.planet, x0, z0).h + 0.3; O.ctrl.pos = [x0, y0, z0]; O.ctrl.vel = [0, 0, 0];
    const liveOf = () => [...O.sites().live.values()].find(l => l.it.x === it.x && l.it.z === it.z);
    for (let i = 0; i < 80 && !liveOf(); i++) { O.ctrl.pos = [x0, y0, z0]; await wait(150); }
    const L = liveOf(); if (!L) return { notLive: O.sites()?.live.size };
    out.live = true; const dr = L.rec.plan.doors[L.rec.plan.entrance], u = dr.x - L.rec.w / 2;
    const [fx, fz] = at(u, -f - lead), fy = T.surfaceAt(O.planet, fx, fz).h + 0.1, [dx, dz] = at(u, -f); const face = Math.atan2(dx - fx, dz - fz);
    const walkIn = async () => { O.ctrl.pos = [fx, fy, fz]; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = face; O.cam.yaw = face; await wait(200); key('KeyW', true); for (let i = 0; i < 40 && !O.world.locate(...O.ctrl.pos)?.room; i++) { O.cam.yaw = face; await wait(100); } key('KeyW', false); await wait(200); return O.world.locate(...O.ctrl.pos); };
    let loc = await walkIn(); out.shutOut = !loc?.room;
    O.ctrl.pos = [dx - Math.sin(face) * 1.0, it.y + 0.05, dz - Math.cos(face) * 1.0]; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = face; await wait(300);
    tap('KeyE'); await wait(300); out.refused = [...document.querySelectorAll('.toast')].map(e => e.textContent).some(x => /Locked/.test(x));
    key('KeyF', true); for (let i = 0; i < 50 && !O.store.getDelta(L.rec.key + '/door:' + dr.id)?.broken; i++) await wait(100); key('KeyF', false); out.forced = !!O.store.getDelta(L.rec.key + '/door:' + dr.id)?.broken; out.crime = O.store.events.some(e => e.type === 'city_crime' && e.kind === 'breaking in');
    await wait(500); loc = await walkIn(); out.inside = !!loc?.room; out.room = loc?.room?.purpose; out.y = +(O.ctrl.pos[1] - it.y).toFixed(2); out.hud = document.querySelector('.place')?.textContent;
    // the model went, and comes back when you leave
    out.hidden = O.sites().live.size > 0 && it.live === true;
    // someone who sees a crime runs from it: pick a moment when someone's out, and look at them just after
    { const VL = await import('./js/gen/villagers.js'), M = O.getMayhem(), hour = O.planet.dayLength / 24; let t2 = O.clock.now(), a0 = null;
      for (let h = 0; h < 60 && !out.scared?.flag; h++, t2 += hour) for (const w of VL.siteWalkers(O.planet, t2, S0.x, S0.z, 140, 20).filter(w => !w.indoors && !w.uniform)) { a0 = w; M.alarm = { t: t2, at: [w.pos[0] - 3, w.pos[2]], kind: 'test' }; const after = O.peopleNearTest(t2 + 3, w.pos[0], w.pos[2], 40, 40).find(q => q.id === w.id); M.alarm = null; if (after) { out.scared = { ran: +Math.hypot(after.pos[0] - w.pos[0], after.pos[2] - w.pos[2]).toFixed(1), flag: !!after.scared, away: after.pos[0] > w.pos[0] }; if (out.scared.flag) break; } } }
    O.ctrl.pos = [x0 + 400, T.surfaceAt(O.planet, x0 + 400, z0).h + 0.3, z0]; for (let i = 0; i < 10; i++) await wait(100); out.gone = !liveOf();
    O.ctrl.pos = [x0, y0, z0]; for (let i = 0; i < 40 && !liveOf(); i++) { O.ctrl.pos = [x0, y0, z0]; await wait(100); } const dd = O.store.getDelta(L.rec.key + '/door:' + dr.id); out.stillBroken = !!dd?.broken;
    return out; })()`);
  check(cw.live, `a village house near me became a real building (${JSON.stringify(cw).slice(0, 120)})`);
  check(cw.shutOut && cw.refused, 'its shut, locked door stopped me and said so');
  check(cw.forced && cw.crime, 'I broke the lock, and that went on record');
  check(cw.inside, `walked up the steps and into the ${cw.room} (${cw.y} above the floor; HUD "${cw.hud}")`);
  check(cw.gone && cw.stillBroken, 'went away and came back: the lock is still broken');
  check(cw.scared?.flag && cw.scared.ran > 5 && cw.scared.away, `someone who saw it ran from it (${JSON.stringify(cw.scared)})`);
  // ---- crashes: a real car, driven at a real wall
  console.log('[crashes]');
  const cr = await ev(`(async () => { const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms)), out = {}, key = (c, d = true) => { document.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { code: c, bubbles: true })); dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { code: c })); };
    const P = O.store.player; P.hp = 100; P.heat = null; const C = O.city, G = await import('./js/gen/city.js'); const [u, v] = [G.lineAt(C, 0, 2), G.lineAt(C, 1, 2)], [x, z] = C.toWorld(u, v), y = C.h + 0.3;
    // a straight street, a block ahead: find the wall by driving at it
    const yaw = Math.atan2(...C.toWorld(u + 40, v).map((q, i) => q - [x, z][i])) + 0.75; O.ctrl.pos = [x, y, z]; await wait(1500);
    const car = O.getVehicles().find(q => q.type === 'sedan') || O.getVehicles().find(q => q.type !== 'speeder' && !q.fly); const id = car.id, keep = car.pos.slice(); car.pos = [x, y, z]; car.facing = yaw; O.ctrl.pos = [x + 1, y, z]; O.ctrl.mode = 'walk'; await wait(200);
    const { Ride } = await import('./js/player/ride.js');
    const R = new Ride(O.world, O.planet, { ...car, pos: [x, y, z], facing: yaw }); O.setRideForTest(R); const hits = []; R.speed = 30;
    for (let i = 0; i < 400 && hits.length < 1; i++) { await wait(40); const D = O.wrecks.get(id); if (D?.hits?.length) hits.push(D.hits[D.hits.length - 1]); if (!O.getRide2()) break; }
    const D = O.wrecks.get(id); out.hit = !!D?.hits?.length; out.depth = D?.hits?.[0]?.depth; out.hp = D?.hp; out.dv = R.impact; await wait(500);
    const W = O.wreckView.items.get(id); out.model = !!W; if (W) { const q = W.parts.find(p => p.moved.some(v => v)); out.moved = q ? q.moved.reduce((a, v) => a + v, 0) : 0; }
    out.hurt = P.hp < 100; out.sparks = O.fx.glow.life.some(v => v > 0) || O.fx.dark.life.some(v => v > 0);
    // light it and let it go up
    if (D) { O.wrecks.rnd = () => 0.1; O.wrecks.ignite(D); out.fire = D.fire > 0; D.fuse = 0.3; await wait(1200); out.blew = D.exploded; out.burnt = D.burnt; out.throwable = !O.getRide2() || true; }
    // on foot: into a parked car, and up on its roof
    { O.setRideForTest(null); O.ctrl.mode = 'walk'; O.ctrl.stun = 0; const T = await import('./js/gen/surface.js'), Vq = await import('./js/gen/vehicles.js'), v = O.getVehicles().find(q => q.id !== id && !O.wrecks.get(q.id) && Vq.typeOf(q).L > 3 && !q.fly), ty = Vq.typeOf(v), fx = Math.sin(v.facing), fz = Math.cos(v.facing), sx = -fz, sz = fx, px = v.pos[0] + sx * (ty.W / 2 + 1.4), pz = v.pos[2] + sz * (ty.W / 2 + 1.4), hold0 = O.ctrl.pos; O.ctrl.pos = [px, v.pos[1] + 0.1, pz]; O.ctrl.vel = [0, 0, 0]; await wait(400); O.ctrl.pos = [v.pos[0] + sx * 0.1, v.pos[1] + 0.1, v.pos[2] + sz * 0.1]; O.ctrl.vel = [0, 0, 0]; await wait(500); out.walkStopped = Math.abs((O.ctrl.pos[0] - v.pos[0]) * sx + (O.ctrl.pos[2] - v.pos[2]) * sz); out.alongCar = Math.abs((O.ctrl.pos[0] - v.pos[0]) * fx + (O.ctrl.pos[2] - v.pos[2]) * fz); out.carHw = ty.W / 2; out.carHl = ty.L / 2;
      O.ctrl.pos = [v.pos[0], v.pos[1] + ty.H + 0.3, v.pos[2]]; O.ctrl.vel = [0, 0, 0]; O.ctrl.grounded = false; await wait(700); out.onRoof = O.ctrl.pos[1] - v.pos[1]; out.carH = ty.H; O.ctrl.pos = hold0; O.ctrl.vel = [0, 0, 0]; await wait(200); }
    // thrown off a bike
    { const [bx, bz] = C.toWorld(u + 3, v + 3), Rb = new Ride(O.world, O.planet, { type: 'speeder', colour: 1, id: 'tb', pos: [bx, y, bz], facing: yaw }); P.hp = 100; O.setRideForTest(Rb); Rb.speed = 30; for (let i = 0; i < 300 && O.getRide2(); i++) await wait(40); out.thrown = !O.getRide2(); out.bikeHurt = P.hp < 100; await wait(400); O.ctrl.mode = 'walk'; }
    // a ship flown into the ground
    { const sh = O.getShips()[0], ox = O.ctrl.pos[0], oz = O.ctrl.pos[2], F = new O.Flight(O.world, O.planet, sh, [ox, O.world.groundAt(ox, oz, 9999).h + 28, oz], 1); P.hp = 100; F.onGround = false; F.assist = false; F.hover = 0; F.throttle = 0; F.vel = [0, -70, 0]; O.wrecks.rnd = () => 0.99; O.setFlightForTest(F); for (let i = 0; i < 200 && O.getFlight(); i++) await wait(40); const Ds = O.wrecks.get('ship:' + sh.id); out.shipOut = !O.getFlight(); out.shipHits = Ds?.hits?.length; out.shipDead = Ds?.dead; out.shipHp = Ds?.hp; out.shipDepth = Ds?.hits?.map(h => h.depth); await wait(400); P.hp = 100; }
    return out; })()`);
  check(cr.walkStopped >= cr.carHw * 0.9 || cr.alongCar >= cr.carHl * 0.9, `a parked car pushes you out of it (${cr.walkStopped?.toFixed(2)} m from its centre line, half its width ${cr.carHw?.toFixed(2)})`);
  check(cr.onRoof > cr.carH * 0.8, `stood on its roof (${cr.onRoof?.toFixed(2)} m up a ${cr.carH} m car)`);
  check(cr.thrown && cr.bikeHurt, 'crashed a bike and was thrown off it');
  check(cr.shipOut && cr.shipHits > 0 && cr.shipDead, `flew a ship into the ground: wrecked, and out of it (${cr.shipHits} hits, ${cr.shipHp} hp, ${cr.shipDepth}, out ${cr.shipOut})`);
  check(cr.hit && cr.depth > 0.05, `drove into a wall and it dented the car (${JSON.stringify(cr).slice(0, 180)})`);
  check(cr.model && cr.moved > 20, `the model's own metal moved (${cr.moved} points)`);
  check(cr.hurt, 'and it hurt');
  check(cr.fire && cr.blew && cr.burnt > 0.3, 'set alight it went up and left a burnt wreck');
  console.log('[errors]'); check(errs.length === 0, 'no page exceptions ' + errs.slice(0, 3).join(' | '));
  // clean up the slot
  await ev(`(async () => { await new Promise(r => { const q = indexedDB.deleteDatabase('orbis-${slot}'); q.onsuccess = q.onerror = q.onblocked = r; }); return 1; })()`).catch(() => {});
  ws.close();
} finally {
  try { process.kill(-chrome.pid, 'SIGKILL'); } catch { chrome.kill(); }   // whole group: helpers too
  await sleep(300); try { rmSync(profile, { recursive: true, force: true }); } catch {} }
console.log(fails ? `\n${fails} failure(s)` : '\nall green'); process.exit(fails ? 1 : 0);
