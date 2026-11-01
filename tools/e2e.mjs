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
const check = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; return c; };
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
  console.log('[errors]'); check(errs.length === 0, 'no page exceptions ' + errs.slice(0, 3).join(' | '));
  // clean up the slot
  await ev(`(async () => { await new Promise(r => { const q = indexedDB.deleteDatabase('orbis-${slot}'); q.onsuccess = q.onerror = q.onblocked = r; }); return 1; })()`).catch(() => {});
  ws.close();
} finally {
  try { process.kill(-chrome.pid, 'SIGKILL'); } catch { chrome.kill(); }   // whole group: helpers too
  await sleep(300); try { rmSync(profile, { recursive: true, force: true }); } catch {} }
console.log(fails ? `\n${fails} failure(s)` : '\nall green'); process.exit(fails ? 1 : 0);
