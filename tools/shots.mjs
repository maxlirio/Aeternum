// Headless-Chrome screenshots of the real game, via the DevTools protocol.
//   node tools/shots.mjs [name...]   → out/shots/<name>.png
// Uses an isolated in-memory save (?store=mem) and a fixed seed so shots are repeatable.
// Kills only the Chrome it started (own --user-data-dir).
import { spawn } from 'node:child_process';
import { preflight, guardBrowser } from './guard.mjs';
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
    let best = null, n = 0; for (let R = 300; R < 4000 && !best; R += 300) floraNear(O.planet, O.s.cx, O.s.cz, R, q => { if (!best && (q.sp === 'oak' || q.sp === 'parasol' || q.sp === 'bottle' || q.sp === 'birch') && Math.hypot(q.x - O.s.cx, q.z - O.s.cz) > R - 300) { let k = 0; floraNear(O.planet, q.x, q.z, 25, w => { if (w.sp !== 'shrub' && w.sp !== 'boulder') k++; }); if (k > 9) best = q; } });
    if (best) { O.ctrl.pos = [best.x + 9, best.y + 0.2, best.z + 4]; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = Math.atan2(best.x - O.ctrl.pos[0], best.z - O.ctrl.pos[2]); O.cam.yaw = O.ctrl.facing + 0.4; O.cam.pitch = 0.08; O.cam.dist = 5; }
    await wait(5000);`;
SHOTS.forest = 'hour=15';
SCRIPTS.raid = `const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms)); const A = await import('./js/sim/aircombat.js');
    const k = A.raidIndex(O.planet, O.clock.now()) + 1, R = A.raidAt(O.planet, O.s, k); O.clock.advance(R.t + 1 - O.clock.now()); O.raidTick(O.clock.now());
    const dur = +(new URLSearchParams(location.search).get('secs') || 22); await wait(dur * 1000);
    const live = O.war.craft.filter(c => c.alive && c.side === 'raider'), c = live[0] || O.war.craft[0];
    O.ctrl.pos = [c.f.pos[0] - 260, Math.max(c.f.pos[1] - 140, O.s.h + 5), c.f.pos[2] - 260];
    const yaw = Math.atan2(c.f.pos[0] - O.ctrl.pos[0], c.f.pos[2] - O.ctrl.pos[2]); O.ctrl.facing = yaw; O.cam.yaw = yaw; O.cam.pitch = -0.4; O.cam.dist = 3; document.querySelector('.toasts')?.remove(); await wait(600);`;
SHOTS.raid = 'hour=15&secs=22';
SCRIPTS.dogfight = `const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms)), P = O.store.player, key = (c, up = true) => { dispatchEvent(new KeyboardEvent('keydown', { code: c })); if (up) dispatchEvent(new KeyboardEvent('keyup', { code: c })); };
    const { structureOf } = await import('./js/world/ships.js'); const { buildingToWorld } = await import('./js/gen/place.js'); const { shipPlan } = await import('./js/gen/ships.js');
    const sh = O.getShips().find(x => x.forSale), b = structureOf(O.s, sh, () => true, O.planet), L = shipPlan(sh.model).layout, seat = L.seats.find(q => q.kind === 'pilot');
    P.credits = 999999; O.ctrl.pos = buildingToWorld(O.s, b, seat.x, L.deck, seat.z - 0.7); const c = buildingToWorld(O.s, b, seat.x, L.deck, seat.z + 1); O.ctrl.facing = Math.atan2(c[0] - O.ctrl.pos[0], c[2] - O.ctrl.pos[2]); await wait(300);
    key('KeyE'); await wait(300); key('Digit1'); await wait(300); key('KeyE'); await wait(300); key('Digit1'); await wait(300);
    const F = O.getFlight(); key('Space', false); await wait(5000); dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    F.throttle = 1; await wait(9000); F.q = (await import('./js/player/flight.js')).fromEuler(F.facing, 0.12, 0.7); await wait(1500);
    document.querySelector('.toasts')?.remove();`;
SHOTS.dogfight = 'hour=16';
SCRIPTS.flycity = SCRIPTS.dogfight.replace("O.getShips().find(x => x.forSale)", "(O.getShips().find(x => x.forSale && /interceptor|striker|needle|warden|shade/.test(x.model)) || O.getShips().find(x => x.forSale))")
  .replace("F.q = (await import('./js/player/flight.js')).fromEuler(F.facing, 0.12, 0.7); await wait(1500);", `const C = O.city, Fl = await import('./js/player/flight.js'), a = Math.atan2(O.s.cx - C.cx, O.s.cz - C.cz);
    F.pos = [C.cx + Math.sin(a) * (C.R * 0.55), C.h + 420, C.cz + Math.cos(a) * (C.R * 0.55)]; F.throttle = 0.55; const yaw = a + Math.PI + 0.25; F.facing = yaw; F.q = Fl.fromEuler(yaw, -0.06, -0.35);
    for (let i = 0; i < 200 && !O.cityView.done; i++) { F.pos = [C.cx + Math.sin(a) * (C.R * 0.55), C.h + 420, C.cz + Math.cos(a) * (C.R * 0.55)]; await wait(200); }
    await wait(2500); O.cam.pitch = 0.12;`);
SHOTS.flycity = 'hour=16.5';
SCRIPTS.citybridge = `const O = ORBIS, c = O.city, wait = ms => new Promise(r => setTimeout(r, ms)), G = await import('./js/gen/city.js');
    let Q = null; for (let a = 0; a < 900 && !Q; a++) { const B = G.cityBlock(c, (a % 30) - 15, Math.floor(a / 30) - 15); Q = G.bridgesOf(c, B).find(q => q.y > 90); }
    const [u0, v0, u1, v1] = Q.r, cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, [x, z] = c.toWorld(Q.axis ? cu : u0 + 2, Q.axis ? v0 + 2 : cv), [tx, tz] = c.toWorld(Q.axis ? cu : u1, Q.axis ? v1 : cv);
    O.ctrl.pos = [x, c.h + G.CURB + Q.y + 0.05, z]; O.ctrl.vel = [0, 0, 0];
    for (let i = 0; i < 200 && !O.cityView.done; i++) { O.ctrl.pos = [x, c.h + G.CURB + Q.y + 0.05, z]; await wait(200); }
    O.ctrl.facing = Math.atan2(tx - x, tz - z); O.cam.yaw = O.ctrl.facing + 0.5; O.cam.pitch = 0.05; O.cam.dist = 4; await wait(2000);`;
SHOTS.citybridge = 'hour=17.8';
const cityRoom = (label, hour) => `const O = ORBIS, c = O.city, wait = ms => new Promise(r => setTimeout(r, ms)), G = await import('./js/gen/city.js'), R = await import('./js/world/cityreal.js');
    let hit = null; for (let a = 0; a < 1600 && !hit; a++) { const B = G.cityBlock(c, (a % 40) - 20, Math.floor(a / 40) - 20); if (B.district !== 'undercity' && B.district !== 'market') continue; for (const b of B.buildings) if (b.label === '${label}' && b.enter) { const r = R.realOf(O.planet, O.s, c, B, b); if (r && r.plan.F >= 1) { hit = r; break; } } }
    const rec = hit, pl = rec.plan, door = pl.doors.find(d => d.kind === 'entrance' || d.k === 0) || pl.doors[0];
    const at = (x, z) => O.s.toWorld(rec.O[0] + rec.ex[0] * x + rec.ez[0] * z, rec.O[1] + rec.ex[1] * x + rec.ez[1] * z);
    const room = pl.rooms.find(q => q.k === 0 && q.rect[1] < 1.5) || pl.rooms.find(q => q.k === 0), [rx0, rz0, rx1, rz1] = room.rect;
    const [x, z] = at(rx0 + 0.6, rz0 + 0.8), [tx, tz] = at((rx0 + rx1) / 2 + 0.5, (rz0 + rz1) / 2 + 0.5);
    O.ctrl.pos = [x, rec.base + 0.05, z]; O.ctrl.vel = [0, 0, 0];
    for (let i = 0; i < 200 && !O.cityView.done; i++) { O.ctrl.pos = [x, rec.base + 0.05, z]; await wait(200); }
    for (let i = 0; i < 40 && !O.getCityRooms()?.live.size; i++) await wait(200);
    O.ctrl.pos = [x, rec.base + 0.05, z]; await wait(1500);
    O.ctrl.facing = Math.atan2(tx - x, tz - z); O.cam.yaw = O.ctrl.facing; O.cam.pitch = 0.2; O.cam.dist = 0.3; document.querySelector('.toasts')?.remove();
    const hide = () => { O.avatar.object.visible = false; requestAnimationFrame(hide); }; hide(); await wait(2000);`;
const roomOverview = label => cityRoom(label).replace("O.cam.pitch = 0.2; O.cam.dist = 0.3;", "const [fx2, fz2] = at(rx0 + (rx1 - rx0) * 0.5, rz0 + 0.5), [tx2, tz2] = at(rx0 + (rx1 - rx0) * 0.5, rz1); O.ctrl.pos = [fx2, rec.base + 0.05, fz2]; O.ctrl.facing = Math.atan2(tx2 - fx2, tz2 - fz2); O.cam.yaw = O.ctrl.facing; O.cam.pitch = 0.12; O.cam.dist = 0.3;");
SCRIPTS.cantinaview = roomOverview('cantina'); SHOTS.cantinaview = 'hour=20'; SCRIPTS.noodleview = roomOverview('noodle bar'); SHOTS.noodleview = 'hour=13'; SCRIPTS.chopview = roomOverview('chop shop'); SHOTS.chopview = 'hour=13';
SCRIPTS.citycantina = cityRoom('cantina'); SHOTS.citycantina = 'hour=20';
SCRIPTS.cityshop = cityRoom('shophouse'); SHOTS.cityshop = 'hour=13';
SCRIPTS.cityflop = cityRoom('tenement'); SHOTS.cityflop = 'hour=13';
SCRIPTS.cityraid = `const O = ORBIS, c = O.city, wait = ms => new Promise(r => setTimeout(r, ms)), G = await import('./js/gen/city.js'), A = await import('./js/sim/aircombat.js');
    let L = null; for (let a = 0; a < 900 && !L; a++) { const B = G.cityBlock(c, (a % 30) - 15, Math.floor(a / 30) - 15); L = G.liftsOf(c, B).find(l => l.stops.some(q => q.label.startsWith('Roof') && q.y > 120 && q.y < 260)); }
    const q = L.stops.find(q => q.label.startsWith('Roof') && q.y > 120), [x, z] = c.toWorld(q.u, q.v), y = c.h + G.CURB + q.y + 0.05;
    O.ctrl.pos = [x, y, z]; O.ctrl.vel = [0, 0, 0];
    for (let i = 0; i < 200 && !O.cityView.done; i++) { O.ctrl.pos = [x, y, z]; await wait(200); }
    const k = A.raidIndex(O.planet, O.clock.now()) + 1, R = A.raidAt(O.planet, O.s, k); O.clock.advance(R.t + 1 - O.clock.now()); O.raidTick(O.clock.now());
    const dur = +(new URLSearchParams(location.search).get('secs') || 26); for (let i = 0; i < dur * 4; i++) { O.ctrl.pos = [x, y, z]; await wait(250); }
    const live = O.war.craft.filter(c2 => c2.alive && c2.side === 'raider'), t = live[0] || O.war.craft[0];
    const yaw = Math.atan2(t.f.pos[0] - x, t.f.pos[2] - z); O.ctrl.facing = yaw; O.cam.yaw = yaw; O.cam.pitch = -Math.min(0.6, Math.max(0.05, Math.atan2(t.f.pos[1] - y, Math.hypot(t.f.pos[0] - x, t.f.pos[2] - z)))); O.cam.dist = 4; document.querySelector('.toasts')?.remove(); await wait(700);`;
SHOTS.cityraid = 'hour=16&secs=26'; SCRIPTS.citybridgeo = SCRIPTS.citybridge.replace('O.cam.dist = 4', 'O.cam.dist = 40').replace('O.cam.pitch = 0.05', 'O.cam.pitch = 0.25'); SHOTS.citybridgeo = 'hour=17.8';
// the city kit laid out on a boulevard, family by family (a contact sheet in real light)
const KIT = {
  A: [5, 'lamp_cobra lamp_double lamp_lux lamp_lantern lamp_neon lamp_flood lamp_park bench bench_lux bin bin_lux bin_rusty vending vending2 vending_old kiosk kiosk_lux kiosk_food planter planter_lux bollard hydrant newsstand shelter atm bikerack mailbox terminal_post holo_post barrier junction steamvent tree tree_lux'],
  B: [5, 'stall_canopy stall_umbrella stall_tent stall_fish stall_cloth stall_tech stall_fruit stall_spice stall_grill stall_noodle stall_cart stall_crate foodcart foodcart2 crates_fruit sacks baskets barrels pots rugs cage stool scale handcart lanterns lanterns_post awning awning2 sign_shop sign_market sign_blade holo_ad lanternline'],
  C: [4.5, 'dumpster trashpile boxes firebarrel mattress shack leanto scrapheap hulk washline play pipes pipes2 cables neon_bar neon_noodle neon_eye neon_arrow neon_ring neon_vert neon_cross neon_star neon_fish neon_glyph'],
  D: [6, 'ac ac2 tank_roof antenna dish vent solar cooling billboard aerial skylight beacon container pallet drums forklift fuelcart cargoloader padlights'],
  E: [26, 'tank silo sphere stack crane fountain monument statue'],
};
for (const [K, [sp, list]] of Object.entries(KIT)) {
  SCRIPTS['kit' + K] = `const O = ORBIS, c = O.city, wait = ms => new Promise(r => setTimeout(r, ms)), G = await import('./js/gen/city.js'), THREE = await import('three'), CV = await import('./js/render/city.js');
    const u0 = G.lineAt(c, 0, 0), v0 = G.lineAt(c, 1, 0) + 40, kinds = '${list}'.split(' '), cols = ${K === 'E' ? 2 : 'Math.ceil(Math.sqrt(kinds.length * 1.6))'}, sp = ${sp};
    const [x, z] = c.toWorld(u0, v0 - ${K === 'E' ? 30 : 4}); O.ctrl.pos = [x, c.h + 0.1, z]; O.ctrl.vel = [0, 0, 0];
    for (let i = 0; i < 200 && !O.cityView.done; i++) { O.ctrl.pos = [x, c.h + 0.1, z]; await wait(200); }
    O.cityTraffic.group.visible = false; O.cityTraffic.points.visible = false; O.cityView.props.visible = false;
    const g = new THREE.Group(); O.cityView.group.add(g);
    kinds.forEach((k, n) => { const parts = O.cityView.kit(k), col = n % cols, row = Math.floor(n / cols);
      for (const p of parts) { const m = new THREE.InstancedMesh(p.geometry, p.material, 1), M = new THREE.Matrix4().setPosition(u0 + (col - (cols - 1) / 2) * sp, c.h + 0.2, v0 + row * sp * 1.1); m.setMatrixAt(0, M); if (p.tinted) m.setColorAt(0, new THREE.Color(...CV.kitTint(p.tinted, k, n * 7.1, n * 3.3))); m.castShadow = true; m.receiveShadow = true; g.add(m); } });
    const [tx, tz] = c.toWorld(u0, v0 + sp * 2); O.ctrl.facing = Math.atan2(tx - x, tz - z); O.cam.yaw = O.ctrl.facing; O.cam.pitch = ${K === "E" ? 0.42 : 0.62}; O.cam.dist = ${K === "E" ? 95 : 15}; O.avatar.object.visible = false;
    const hide = () => { O.avatar.object.visible = false; requestAnimationFrame(hide); }; hide(); document.querySelector('.toasts')?.remove(); await wait(2500);`;
  SHOTS['kit' + K] = 'hour=13.5';
}
// one family (tools/assets/family_kit.py), each way of building side by side, on plain ground in real light
const FAMS = { cottage: 12, hut: 9, shed: 7, longhouse: 22, shop: 13, shrine: 11, monument: 10, fountain: 9, villagewell: 4, watertower: 10, windpump: 6, footbridge: 18, jetty: 7, boat: 13, graves: 14, pavilion: 12, picnic: 4, swings: 11, gate: 10, cart: 5, lamp: 2.5, bench: 3, coolingtower: 42, column: 16, spheretank: 20, stable: 15, marketcross: 4, pumphouse: 11, dam: 34, crop: 2.2, hall: 21, school: 27, clinic: 17, inn: 17, warehouse: 33, garage: 16, temple: 19, tenement: 24, markethall: 30, smithy: 13, sawmill: 22, shelterhut: 8, noticeboard: 3.4, busstop: 7, poweredge: 4, culvert: 7, scarecrow: 2.4, beehives: 6, trough: 4.5, bandstall: 5, stockfence: 8 };
for (const [F, sp] of Object.entries(FAMS)) {
  SCRIPTS['fam_' + F] = `const O = ORBIS, c = O.city, wait = ms => new Promise(r => setTimeout(r, ms)), G = await import('./js/gen/city.js'), THREE = await import('three'), CV = await import('./js/render/city.js');
    const u0 = G.lineAt(c, 0, 0), v0 = G.lineAt(c, 1, 0), sp = ${sp}, [px, pz] = c.toWorld(u0, v0 - 2), hold = () => { O.ctrl.pos = [px, c.h + 0.1, pz]; O.ctrl.vel = [0, 0, 0]; }; hold();
    await wait(1500); for (const q of O.cityView.group.children) q.visible = false; O.cityTraffic.group.visible = false; O.cityTraffic.points.visible = false;
    const g = new THREE.Group(); O.cityView.group.add(g); const fl = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ color: 0x75746c, roughness: 0.95 })); fl.rotation.x = -Math.PI / 2; fl.position.set(u0, c.h + 0.02, v0); fl.receiveShadow = true; g.add(fl);
    const [fx, fz] = c.toWorld(u0, v0 + 40), yaw = Math.atan2(fx - px, fz - pz);
    for (let n = 0; n < 7; n++) { const k = 'fam_${F}_' + n, parts = O.cityView.kit(k) || [], col = n < 4 ? n - 1.5 : n - 5, row = n < 4 ? 0 : 1;
      for (const p of parts) { const m = new THREE.InstancedMesh(p.geometry, p.material, 1), M = new THREE.Matrix4().setPosition(u0 + col * sp * 1.15, c.h + 0.02, v0 + sp * 0.6 + row * sp * 1.5); m.setMatrixAt(0, M); if (p.tinted) m.setColorAt(0, new THREE.Color(...CV.kitTint(p.tinted, k, n * 7.1, n * 3.3))); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; g.add(m); } }
    O.ctrl.facing = yaw; O.cam.yaw = yaw; O.cam.pitch = ${/watertower|windpump|column|temple|poweredge/.test(F) ? 0.12 : 0.3}; O.cam.dist = sp * ${/watertower|windpump|column|temple|poweredge/.test(F) ? 4 : /coolingtower|spheretank/.test(F) ? 3.4 : 2.5}; const keep = () => { hold(); requestAnimationFrame(keep); }; keep(); document.querySelector('.toasts')?.remove(); await wait(2500);`;
  SHOTS['fam_' + F] = 'hour=13.5';
}
// the nearest of a kind of site on this planet, seen from above and at the door. SITE= picks it
// the small things, this planet's designs of each in a row: small_<family>
for (const F of ['villagewell', 'fountain', 'shrine', 'monument', 'marketcross', 'noticeboard', 'busstop', 'lamp', 'bench', 'gate', 'pavilion', 'bandstall', 'watertower']) {
  const sp = { villagewell: 5, fountain: 8, shrine: 7, monument: 9, marketcross: 5, noticeboard: 4, busstop: 7, lamp: 4, bench: 3.2, gate: 12, pavilion: 11, bandstall: 5, watertower: 11 }[F];
  SCRIPTS['small_' + F] = `const O = ORBIS, c = O.city, wait = ms => new Promise(r => setTimeout(r, ms)), G = await import('./js/gen/city.js'), THREE = await import('three'), CV = await import('./js/render/city.js'), SG = await import('./js/render/smallgen.js'), SD = await import('./js/gen/smallgen.js'), PL = await import('./js/gen/planet.js'), AD = await import('./js/core/address.js');
    const u0 = G.lineAt(c, 0, 0), v0 = G.lineAt(c, 1, 0), sp = ${sp}, [px, pz] = c.toWorld(u0, v0 - 2), hold = () => { O.ctrl.pos = [px, c.h + 0.1, pz]; O.ctrl.vel = [0, 0, 0]; }; hold();
    await wait(1500); for (const q of O.cityView.group.children) q.visible = false; O.cityTraffic.group.visible = false; O.cityTraffic.points.visible = false;
    const g = new THREE.Group(); O.cityView.group.add(g); const fl = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ color: 0x75746c, roughness: 0.95 })); fl.rotation.x = -Math.PI / 2; fl.position.set(u0, c.h + 0.02, v0); fl.receiveShadow = true; g.add(fl);
    const [fx, fz] = c.toWorld(u0, v0 + 40), yaw = Math.atan2(fx - px, fz - pz), M0 = new THREE.Matrix4().makeRotationY(c.angle ?? 0);
    const planets = [O.planet, ...[11, 12, 13, 14, 15].map(n => PL.makePlanet([n * 77, n * 31 + 5], AD.HOMEWORLD))]; let n = 0;
    for (const pl of planets) for (const D of SD.smallDesigns(pl, '${F}').slice(0, pl === O.planet ? 3 : 1)) { const col = (n < 4 ? n - 1.5 : n - 5.5), row = n < 4 ? 0 : 1; n++; if (n > 8) break;
      for (const p of SG.smallParts(pl, D.id, O.sites().lib.wornSurface)) { const m = new THREE.InstancedMesh(p.geometry, p.material, 1), M = new THREE.Matrix4().setPosition(u0 + col * sp * 1.15, c.h + 0.02, v0 + sp * 0.6 + row * sp * 1.5); m.setMatrixAt(0, M); if (p.tinted) m.setColorAt(0, new THREE.Color(...CV.kitTint(p.tinted, D.id, n * 7.1, n * 3.3))); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; g.add(m); } }
    O.ctrl.facing = yaw; O.cam.yaw = yaw; O.cam.pitch = ${/watertower|monument/.test(F) ? 0.14 : 0.3}; O.cam.dist = sp * ${/watertower|monument/.test(F) ? 3.4 : 2.6}; const keep = () => { hold(); requestAnimationFrame(keep); }; keep(); document.querySelector('.toasts')?.remove(); await wait(2500);`;
  SHOTS['small_' + F] = 'hour=13.5';
}
// a country building, close: wi_out_<family> from the street, wi_in_<family> from its main room
for (const fam of ['cottage', 'hut', 'longhouse', 'shop', 'inn', 'tenement', 'hall', 'school', 'clinic', 'temple', 'smithy', 'garage', 'warehouse', 'stable', 'barn', 'shed', 'markethall', 'sawmill', 'pumphouse', 'hangar', 'factory', 'controltower', 'barracks', 'observatory']) for (const inner of [false, true]) {
  const name = `wi_${inner ? 'in' : 'out'}_${fam}`;
  SCRIPTS[name] = `const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms)), P = await import('./js/gen/outposts.js'), T = await import('./js/gen/surface.js');
    let best = null, bd = 1e12, S0 = null; for (let i = -60; i <= 60; i++) for (let j = -60; j <= 60; j++) for (const S of P.sitesInTile(O.planet, i, j)) for (const q of S.items) if (q.k.startsWith('gb_${fam}_')) { const d = Math.hypot(S.x - O.s.cx, S.z - O.s.cz); if (d < bd) { best = q; bd = d; S0 = S; } }
    if (!best) throw new Error('none: ${fam}');
    const c = Math.cos(best.rot), s = Math.sin(best.rot), f = best.box[1], at = (u, v) => [best.x + u * c + v * s, best.z - u * s + v * c];
    const [ox, oz] = at(0, -f - 9), gy = T.surfaceAt(O.planet, ox, oz).h + 0.1; O.ctrl.pos = [ox, gy, oz]; O.ctrl.vel = [0, 0, 0]; for (let i = 0; i < 16; i++) { O.ctrl.pos = [ox, gy, oz]; await wait(300); }
    const L = [...O.sites().live.values()].find(l => l.it.x === best.x && l.it.z === best.z); if (!L) throw new Error('not live: ' + O.sites().live.size);
    const pl = L.rec.plan, dr = pl.doors[pl.entrance]; window.__wi = { k: best.k, rooms: pl.rooms.length, props: pl.props.length, h: best.y, stoop: best.stoop, tris: O.renderer.info.render.triangles, calls: O.renderer.info.render.calls };
    if (${inner}) { const R = pl.rooms.filter(r => r.k === 0).sort((a, b) => (b.rect[2] - b.rect[0]) * (b.rect[3] - b.rect[1]) - (a.rect[2] - a.rect[0]) * (a.rect[3] - a.rect[1]))[0], lx = (R.rect[0] + R.rect[2]) / 2 - L.rec.w / 2, lz = R.rect[1] + 0.8 - L.rec.d / 2, [x, z] = at(lx, lz); for (let i = 0; i < 8; i++) { O.ctrl.pos = [x, best.y + 0.05, z]; await wait(120); } O.ctrl.facing = best.rot; O.cam.yaw = best.rot; O.cam.pitch = 0.04; O.cam.dist = 0.05; O.avatar.object.visible = false; O.avatar.object.scale.setScalar(0.001); }
    else { O.ctrl.facing = best.rot; O.cam.yaw = best.rot + 0.5; O.cam.pitch = 0.1; O.cam.dist = Math.max(6, best.box[0] * 0.8); }
    document.querySelector('.toasts')?.remove(); await wait(1600); console.log(JSON.stringify(window.__wi));`;
  SHOTS[name] = 'hour=11';
}
for (const [name, kind, dist, pitch] of [['village', 'village', 95, 0.42], ['villagest', 'village', 15, 0.16], ['hamlet', 'hamlet', 55, 0.4], ['fishing', 'fishing', 55, 0.3], ['powerst', 'power', 240, 0.25], ['refinery', 'refinery', 90, 0.3], ['graveyard', 'graveyard', 35, 0.35], ['farm', 'farm', 95, 0.4], ['fieldst', 'farm', 11, 0.14], ['folk', 'village', 26, 0.3], ['township', 'township', 165, 0.42], ['townst', 'township', 16, 0.18], ['lumber', 'lumber', 40, 0.3], ['houses', 'hamlet', 24, 0.26], ['nightvil', 'village', 32, 0.22], ['airfield', 'airfield', 150, 0.28], ['base', 'base', 120, 0.38], ['factory', 'factory', 90, 0.3], ['harbour', 'harbour', 90, 0.3], ['observatory', 'observatory', 42, 0.24]]) {
  SCRIPTS['site_' + name] = `const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms)), P = await import('./js/gen/outposts.js'), T = await import('./js/gen/surface.js');
    let best = null, bd = 1e12, bn = 0; const [x0, z0] = O.ctrl.pos; for (let i = -40; i <= 40; i++) for (let j = -40; j <= 40; j++) for (const S of P.sitesInTile(O.planet, i, j)) if (S.kind === '${kind}') { const d = Math.hypot(S.x - O.s.cx, S.z - O.s.cz), n = S.items.filter(q => q.box).length; if (n * 400 - d > bn * 400 - bd) { best = S; bd = d; bn = n; } }
    if (!best) throw new Error(JSON.stringify({ none: '${kind}' }));
    const FF = ${name === 'fieldst' ? 'best.fields[0]' : 'null'}, street = ${name === 'villagest' || name === 'townst' ? 'true' : 'false'}, L = best.lanes[0], a = L ? Math.atan2(L[3] - L[1], L[2] - L[0]) : 0, sx = FF ? FF.x + Math.sin(FF.rot) * (FF.box[1] + 2) : street ? L[0] * 0.3 + L[2] * 0.7 : best.x, sz = FF ? FF.z + Math.cos(FF.rot) * (FF.box[1] + 2) : street ? L[1] * 0.3 + L[3] * 0.7 : best.z;
    const y = T.surfaceAt(O.planet, sx, sz).h + 1.2; O.ctrl.pos = [sx, y, sz]; O.ctrl.vel = [0, 0, 0]; for (let i = 0; i < 25; i++) { O.ctrl.pos = [sx, y, sz]; await wait(300); }
    O.ctrl.facing = FF ? Math.atan2(FF.x - sx, FF.z - sz) : street ? Math.atan2(L[0] - L[2], L[1] - L[3]) : 0.9; O.cam.yaw = O.ctrl.facing; O.cam.pitch = ${pitch}; O.cam.dist = ${dist}; document.querySelector('.toasts')?.remove(); await wait(2500);`;
  SHOTS['site_' + name] = name === 'folk' ? 'hour=10.5' : name === 'nightvil' ? 'hour=21.5' : 'hour=15';
}
 SCRIPTS.flycityn = SCRIPTS.flycity; SHOTS.flycityn = 'hour=20.8';
SCRIPTS.cars = `const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms)); const V = O.getVehicles(); let best = null, bn = 0;
    for (const v of V) { const n = V.filter(w => Math.hypot(w.pos[0] - v.pos[0], w.pos[2] - v.pos[2]) < 18 && w.kind !== 'bike').length; if (n > bn) { bn = n; best = v; } }
    O.ctrl.pos = [best.pos[0] + Math.sin(best.facing + 1.57) * 9, best.pos[1], best.pos[2] + Math.cos(best.facing + 1.57) * 9]; O.ctrl.vel = [0, 0, 0];
    O.ctrl.facing = Math.atan2(best.pos[0] - O.ctrl.pos[0], best.pos[2] - O.ctrl.pos[2]); O.cam.yaw = O.ctrl.facing + 0.5; O.cam.pitch = 0.4; O.cam.dist = 9; document.querySelector('.toasts')?.remove(); await wait(3000);`;
SHOTS.cars = 'hour=15';
const shipShot = model => `const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms)); const { centreOf } = await import('./js/world/ships.js');
    const sh = O.getShips().find(x => x.model === '${model}'); const { c, facing } = centreOf(O.s, sh), L = (await import('./js/gen/ships.js')).shipPlan('${model}').layout;
    const a = facing + 2.3, r = L.D * 0.95 + 4; O.ctrl.pos = [c[0] + Math.sin(a) * r, c[1], c[2] + Math.cos(a) * r]; O.ctrl.vel = [0, 0, 0]; await wait(500);
    O.ctrl.facing = Math.atan2(c[0] - O.ctrl.pos[0], c[2] - O.ctrl.pos[2]); O.cam.yaw = O.ctrl.facing; O.cam.pitch = 0.1; O.cam.dist = 5; document.querySelector('.toasts')?.remove(); await wait(3500);`;
SCRIPTS.courier = shipShot('courier'); SCRIPTS.patrol = shipShot('patrol'); SCRIPTS.yacht = shipShot('yacht').replace('const a = facing + 2.3, r = L.D * 0.95 + 4;', 'const a = facing + 1.9, r = L.D * 0.75;').replace('O.cam.pitch = 0.1; O.cam.dist = 5;', 'O.cam.pitch = 0.12; O.cam.dist = 8;');
SHOTS.courier = 'hour=10'; SHOTS.patrol = 'hour=10'; SHOTS.yacht = 'hour=10';
SCRIPTS.fight = `const O = ORBIS, P = O.store.player, wait = ms => new Promise(r => setTimeout(r, ms));
    let a = null; for (let k = 0; k < 40 && !a; k++) { a = O.getAgents().find(x => !x.bKey && !x.uniform && !(x.person.job && O.pop.jobById.get(x.person.job).security) && !String(x.id).startsWith('tr:')); if (!a) { O.clock.advance(O.planet.dayLength / 48); await wait(300); } }
    P.inventory.push({ id: 'pistol', n: 1 }); P.weapon = 'pistol';
    const f = a.facing, at = [a.pos[0] + Math.sin(f) * 7, a.pos[1], a.pos[2] + Math.cos(f) * 7]; O.ctrl.pos = at; O.ctrl.vel = [0, 0, 0];
    O.ctrl.facing = Math.atan2(a.pos[0] - at[0], a.pos[2] - at[2]); O.cam.yaw = O.ctrl.facing; O.cam.pitch = -0.02; O.cam.dist = 2.6; await wait(700);
    const aim = () => { const c = O.cam.camera.position; O.cam.camera.lookAt(a.pos[0], a.pos[1] + 1.1, a.pos[2]); };
    for (let k = 0; k < 3; k++) { aim(); O.attack(); await wait(420); }
    O.cam.yaw = O.ctrl.facing + 0.6; O.cam.pitch = 0.25; O.cam.dist = 3.5; await wait(900);`;
SHOTS.fight = 'hour=11';
// inside your home: stand in a room of the given purpose, looking across it
const roomShot = (purpose) => `const O = ORBIS, P = O.store.player, wait = ms => new Promise(r => setTimeout(r, ms)); const { buildingPlan } = await import('./js/gen/building.js'); const { buildingToWorld } = await import('./js/gen/place.js');
    let b = O.pop.buildingByKey.get(P.home), pl = buildingPlan(O.planet, O.s, b), r = pl.rooms.find(q => q.purpose === '${purpose}' && q.unit !== undefined);
    if (!r) for (const bb of O.s.buildings) { const pp = buildingPlan(O.planet, O.s, bb), rr = pp.rooms.find(q => q.purpose === '${purpose}'); if (rr) { b = bb; pl = pp; r = rr; break; } }
    const [x0, z0, x1, z1] = r.rect, at = buildingToWorld(O.s, b, x0 + 0.45, r.k * pl.H, z0 + 0.45), c = buildingToWorld(O.s, b, (x0 + x1) / 2, r.k * pl.H, (z0 + z1) / 2);
    O.ctrl.pos = at; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = Math.atan2(c[0] - at[0], c[2] - at[2]); O.cam.yaw = O.ctrl.facing; O.cam.pitch = 0.25; O.cam.dist = 0.3; document.querySelector('.toasts')?.remove(); const hide = () => { O.avatar.object.visible = false; requestAnimationFrame(hide); }; hide(); await wait(2500);`;
SCRIPTS.living = roomShot('living'); SCRIPTS.bathroom = roomShot('bathroom'); SCRIPTS.hall = roomShot('hall'); SCRIPTS.kitchen = roomShot('kitchen');
SHOTS.living = 'hour=13'; SHOTS.bathroom = 'hour=13'; SHOTS.hall = 'hour=13'; SHOTS.kitchen = 'hour=13';
SCRIPTS.talk = `const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms)), key = c => { dispatchEvent(new KeyboardEvent('keydown', { code: c })); dispatchEvent(new KeyboardEvent('keyup', { code: c })); };
    let a = null; for (let k = 0; k < 40 && !a; k++) { a = O.getAgents().find(x => x.pose !== 'lie' && !x.moving && !String(x.id).startsWith('tr:') && x.person.age > 18); if (!a) { O.clock.advance(O.planet.dayLength / 24); await wait(300); } }
    O.ctrl.pos = [a.pos[0] + Math.sin(a.facing) * 1.3, a.pos[1], a.pos[2] + Math.cos(a.facing) * 1.3]; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = Math.atan2(a.pos[0] - O.ctrl.pos[0], a.pos[2] - O.ctrl.pos[2]); O.cam.yaw = O.ctrl.facing + 0.7; O.cam.pitch = 0.1; O.cam.dist = 3;
    await wait(600); key('KeyE'); await wait(400);
    for (const k of ['intro', 'work', 'family', 'chat']) { document.querySelector('.panel.use [data-a=' + k + ']')?.click(); await wait(250); }`;
SHOTS.talk = 'hour=17';
SCRIPTS.liftoff = `const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms)); const { runOn } = await import('./js/gen/ships.js'); const { dayIndex } = await import('./js/gen/schedule.js'); const { centreOf } = await import('./js/world/ships.js');
    const sh = O.getShips().find(x => x.owner?.startsWith('firm:') && !x.field), home = centreOf(O.s, sh);
    let run = runOn(O.planet, sh, dayIndex(O.planet, O.clock.now())); if (run.depart < O.clock.now()) run = runOn(O.planet, sh, dayIndex(O.planet, O.clock.now()) + 1);
    O.clock.advance(run.depart + 22 - O.clock.now());
    const a = home.facing + 2.2; O.ctrl.pos = [home.c[0] + Math.sin(a) * 30, home.c[1], home.c[2] + Math.cos(a) * 30]; O.ctrl.vel = [0, 0, 0];
    O.ctrl.facing = Math.atan2(home.c[0] - O.ctrl.pos[0], home.c[2] - O.ctrl.pos[2]); O.cam.yaw = O.ctrl.facing + 0.5; O.cam.pitch = -0.3; O.cam.dist = 7; O.syncShips(); await wait(2500);`;
SHOTS.liftoff = 'hour=7';
SCRIPTS.sea = `const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms)); const { surfaceHeight } = await import('./js/gen/surface.js');
    let best = null; for (let k = 0; k < 20000 && !best; k++) { const a = k * 2.39996, r = 300 + k * 3, x = O.s.cx + Math.cos(a) * r, z = O.s.cz + Math.sin(a) * r;
      const h = surfaceHeight(O.planet, x, z); if (h > O.planet.seaLevel + 1 && h < O.planet.seaLevel + 4) { for (let q = 0; q < 8; q++) { const th = q * Math.PI / 4; if (surfaceHeight(O.planet, x + Math.sin(th) * 40, z + Math.cos(th) * 40) < O.planet.seaLevel - 3) { best = [x, h, z, th]; break; } } } }
    if (best) { O.ctrl.pos = [best[0], best[1] + 0.2, best[2]]; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = best[3]; O.cam.yaw = best[3]; O.cam.pitch = 0.15; O.cam.dist = 5; }
    await wait(5000);`;
SHOTS.sea = 'hour=17';
SCRIPTS.shore = SCRIPTS.sea.replace('O.cam.pitch = 0.15; O.cam.dist = 5;', 'O.cam.pitch = 0.45; O.cam.dist = 4; O.ctrl.pos = [best[0] + Math.sin(best[3]) * 9, best[1], best[2] + Math.cos(best[3]) * 9];'); SHOTS.shore = 'hour=13';
SCRIPTS.seaperf = SCRIPTS.sea.replace('await wait(5000);', 'await wait(14000);'); SCRIPTS.seaperf0 = SCRIPTS.seaperf; SHOTS.seaperf = 'hour=17'; SHOTS.seaperf0 = 'hour=17&norefl'; SCRIPTS.seaperf1 = SCRIPTS.seaperf; SHOTS.seaperf1 = 'hour=17&norefl&nograss';
SCRIPTS.overcast = SCRIPTS.road; SHOTS.overcast = 'hour=11&road=0&weather=' + encodeURIComponent('{"cloud":0.95,"rain":0.8,"label":"rain"}');
SCRIPTS.clouds = SCRIPTS.road; SHOTS.clouds = 'hour=16&road=0&weather=' + encodeURIComponent('{"cloud":0.55,"rain":0,"label":"cloudy"}');
SCRIPTS.abovecloud = SCRIPTS.flying.replace('await wait(5000)', 'await wait(30000)'); SHOTS.abovecloud = 'hour=15&secs=4&weather=' + encodeURIComponent('{"cloud":0.6,"rain":0,"label":"cloudy"}');
SCRIPTS.freighter = `const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms)); const f = O.getShips().find(x => x.model === 'freighter');
    const k = +(new URLSearchParams(location.search).get('view') || 0), a = f.at.facing + [2.4, 1.3, 3.6][k], r = [28, 26, 30][k];
    O.ctrl.pos = [f.at.c[0] + Math.sin(a) * r, f.at.c[1], f.at.c[2] + Math.cos(a) * r]; O.ctrl.vel = [0, 0, 0]; await wait(500);
    O.ctrl.facing = Math.atan2(f.at.c[0] - O.ctrl.pos[0], f.at.c[2] - O.ctrl.pos[2]); O.cam.yaw = O.ctrl.facing; O.cam.pitch = 0.12; O.cam.dist = 6; await wait(4000);`;
SCRIPTS.freighter2 = SCRIPTS.freighter; SHOTS.freighter = 'hour=10&view=0'; SHOTS.freighter2 = 'hour=10&view=1';
SHOTS.ship = 'hour=10'; SHOTS.shipside = 'hour=10'; SHOTS.cockpit = 'hour=10'; SHOTS.hold = 'hour=10'; SHOTS.flying = 'hour=10&secs=5';
// the megacity (gen/city.js): stand at a street corner of a block of the given district and look across it
const cityShot = (dist, pitch, d, off = 0, pickFar = false) => `const O = ORBIS, c = O.city, wait = ms => new Promise(r => setTimeout(r, ms)); const G = await import('./js/gen/city.js');
    let best = null, bd = ${pickFar ? '-1' : 'Infinity'}; for (let i = -32; i <= 32; i++) for (let j = -32; j <= 32; j++) { const B = G.cityBlock(c, i, j); if (B.district !== '${dist}') continue; const r = Math.hypot(i, j); if (${pickFar ? 'r > bd' : 'r < bd'}) { bd = r; best = B; } }
    const R = best.rect, cu = (R[0] + R[2]) / 2, cv = (R[1] + R[3]) / 2, [x, z] = c.toWorld(R[0] - 6, R[1] - 6), [tx, tz] = c.toWorld(cu, cv);
    O.ctrl.pos = [x, c.h + 0.1, z]; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = Math.atan2(tx - x, tz - z);
    for (let i = 0; i < 200 && !O.cityView.done; i++) { O.ctrl.pos = [x, c.h + 0.1, z]; await wait(250); }
    O.cam.yaw = O.ctrl.facing + ${off}; O.cam.pitch = ${pitch}; O.cam.dist = ${d}; await wait(2500);`;
SCRIPTS.cityspire = cityShot('spire', -0.35, 6, 0); SHOTS.cityspire = 'hour=15';
SCRIPTS.cityspiren = SCRIPTS.cityspire; SHOTS.cityspiren = 'hour=21.5';
SCRIPTS.citymarket = cityShot('market', 0.08, 7, 0.3); SHOTS.citymarket = 'hour=11';
SCRIPTS.citywarrens = cityShot('undercity', -0.05, 6, 0.4); SHOTS.citywarrens = 'hour=20.5';
SCRIPTS.cityhousing = cityShot('housing', -0.12, 7, 0.2); SHOTS.cityhousing = 'hour=9';
SCRIPTS.citywarrensd = SCRIPTS.citywarrens; SHOTS.citywarrensd = 'hour=12';
SCRIPTS.cityindustry = cityShot('industry', 0.05, 9, 0.2); SHOTS.cityindustry = 'hour=16';
SCRIPTS.cityport = cityShot('port', 0.15, 10, 0.2); SHOTS.cityport = 'hour=13';
SCRIPTS.cityaerial = cityShot('housing', 0.35, 1400, 0, true).replace("O.cam.dist = 1400;", "O.cam.dist = 1400; O.ctrl.facing = Math.atan2(c.cx - x, c.cz - z); O.cam.yaw = O.ctrl.facing;"); SHOTS.cityaerial = 'hour=17.6';
SCRIPTS.cityaerialn = SCRIPTS.cityaerial; SHOTS.cityaerialn = 'hour=21';
SCRIPTS.skyline = `const O = ORBIS, c = O.city, wait = ms => new Promise(r => setTimeout(r, ms));
    const d = Math.hypot(c.cx - O.s.cx, c.cz - O.s.cz), ux = (c.cx - O.s.cx) / d, uz = (c.cz - O.s.cz) / d, { surfaceHeight } = await import('./js/gen/surface.js');
    const x = c.cx - ux * (c.R + 900), z = c.cz - uz * (c.R + 900); O.ctrl.pos = [x, surfaceHeight(O.planet, x, z) + 0.2, z]; O.ctrl.vel = [0, 0, 0];
    for (let i = 0; i < 200 && !O.cityView.done; i++) { O.ctrl.pos = [x, surfaceHeight(O.planet, x, z) + 0.2, z]; await wait(250); }
    O.ctrl.facing = Math.atan2(ux, uz); O.cam.yaw = O.ctrl.facing; O.cam.pitch = 0.0; O.cam.dist = 5; await wait(2500);`;
SHOTS.skyline = 'hour=18.2'; SCRIPTS.skylinen = SCRIPTS.skyline; SHOTS.skylinen = 'hour=21';
SCRIPTS.tris = SCRIPTS.citymarket + ` const out = {}; const tri = o => { const g = o.geometry; if (!g || !o.visible) return 0; const n = (g.index ? g.index.count : g.attributes.position.count) / 3; return n * (o.isInstancedMesh ? o.count : 1); };
    const walk = (o, key) => { if (!o.visible) return; out[key] = (out[key] || 0) + tri(o); for (const c of o.children) walk(c, key); };
    for (const c of O.scene.children) for (const cc of (c.children.length ? c.children : [c])) walk(cc, (c.name || c.type) + '/' + (cc.name || cc.type));
    const city = O.cityView, props = {}; city.props.children.forEach(im => { const k = im.geometry.uuid.slice(0, 4); props[im.material.name + ':' + Math.round(tri(im) / 1000) + 'k'] = 1; });
    throw new Error(JSON.stringify(Object.entries(out).filter(e => e[1] > 50000).map(e => e[0] + ' ' + Math.round(e[1] / 1000) + 'k')) + ' props ' + Object.keys(props).filter(k => +k.split(':')[1].replace('k', '') > 40).join(' '));`;
SHOTS.tris = 'hour=11';
SCRIPTS.carhit = `const O = ORBIS, P = O.store.player, wait = ms => new Promise(r => setTimeout(r, ms)), T = await import('./js/gen/traffic.js'); await wait(1500);
    let v = null; for (let i = 0; i < 80 && !v; i++) { v = T.trafficNear(O.planet, O.s, O.clock.now(), O.s.cx, O.s.cz, 1e5).find(q => !q.parked && Math.hypot(q.pos[0] - O.s.cx, q.pos[2] - O.s.cz) < 400); if (!v) { O.clock.advance(30); await wait(100); } }
    const fut = T.trafficNear(O.planet, O.s, O.clock.now() + 0.3, O.s.cx, O.s.cz, 1e5).find(q => q.id === v.id); O.ctrl.pos = fut.pos.slice(); O.ctrl.vel = [0, 0, 0]; const p0 = O.ctrl.pos.slice();
    let hurt = false; for (let i = 0; i < 60 && !hurt; i++) { await wait(50); hurt = P.hp < 100; } const thrown = Math.hypot(O.ctrl.pos[0] - p0[0], O.ctrl.pos[2] - p0[2]);
    // and with room to stop: a car 40 m away brakes
    P.hp = 100; await wait(2500); let w = null; for (let i = 0; i < 80 && !w; i++) { w = T.trafficNear(O.planet, O.s, O.clock.now(), O.s.cx, O.s.cz, 1e5).find(q => !q.parked && q.id !== v.id && q.trip.pts); if (!w) { O.clock.advance(30); await wait(100); } }
    const f2 = T.trafficNear(O.planet, O.s, O.clock.now() + 3, O.s.cx, O.s.cz, 1e5).find(q => q.id === w.id); O.ctrl.pos = f2.pos.slice(); O.ctrl.vel = [0, 0, 0]; let hp2 = true; for (let i = 0; i < 80; i++) { await wait(50); if (P.hp < 100) hp2 = false; }
    const d = O.cityTraffic.life.delayOf(w.id);
    throw new Error(JSON.stringify({ hitHp: hurt, thrown: +thrown.toFixed(1), type: v.type, spared: hp2, delay: +d.toFixed(1) }));`; SHOTS.carhit = 'hour=11';
SCRIPTS.cityworks = cityShot('works', 0.05, 8, 0.2); SHOTS.cityworks = 'hour=14';
const climbShot = (extra = '') => `const O = ORBIS, c = O.city, wait = ms => new Promise(r => setTimeout(r, ms)), G = await import('./js/gen/city.js'), key = (k, up = true) => { dispatchEvent(new KeyboardEvent('keydown', { code: k })); if (up) dispatchEvent(new KeyboardEvent('keyup', { code: k })); };
    let bd = null, B0; for (let a = 0; a < 3600 && !bd; a++) { B0 = G.cityBlock(c, (a % 60) - 30, Math.floor(a / 60) - 30); if (B0.district === 'housing') bd = B0.buildings.find(q => q.top > 25 && q.tiers.length === 1 && G.STYLES[q.style][5]); }
    const t = bd.tiers[0], vm = (t.r[1] + t.r[3]) / 2, base = c.h + G.CURB, [x, z] = c.toWorld(t.r[0] - 0.7, vm), [tx, tz] = c.toWorld(t.r[0] + 3, vm);
    O.ctrl.pos = [x, base, z]; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = Math.atan2(tx - x, tz - z); O.cam.yaw = O.ctrl.facing; O.cam.pitch = 0.05; O.cam.dist = 4.5;
    for (let i = 0; i < 200 && !O.cityView.done; i++) { O.ctrl.pos = [x, base, z]; await wait(200); } await wait(600);
    key('KeyW', false); key('Space'); await wait(300); key('Space'); await wait(5500); ${extra} dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); O.cam.yaw = O.ctrl.facing + 0.75; O.cam.pitch = 0.12; document.querySelector('.toasts')?.remove(); await wait(500);`;
SCRIPTS.climbing = climbShot(); SHOTS.climbing = 'hour=15'; SCRIPTS.climbingn = climbShot(); SHOTS.climbingn = 'hour=21';
SCRIPTS.sandbox = `const O = ORBIS, P = O.store.player, c = O.city, wait = ms => new Promise(r => setTimeout(r, ms)), key = (k, up = true) => { dispatchEvent(new KeyboardEvent('keydown', { code: k })); if (up) dispatchEvent(new KeyboardEvent('keyup', { code: k })); }, FL = await import('./js/gen/cityfleet.js'), G = await import('./js/gen/city.js'), out = {};
    const [bx, bz] = c.toWorld(G.lineAt(c, 0, 1), G.lineAt(c, 1, -2) + 20); O.ctrl.pos = [bx, c.h + 0.3, bz]; O.ctrl.vel = [0, 0, 0];
    for (let i = 0; i < 200 && !(O.cityView.done && O.getMayhem() && O.cityTraffic.ready >= O.cityTraffic.n); i++) { O.ctrl.pos = [bx, c.h + 0.3, bz]; await wait(200); }
    const M = O.getMayhem(), F = O.cityTraffic.fleet, t0 = O.clock.now(), q = {};
    // land on a flying car
    const sky = F.cars.find(k => { if (k.kind !== 'sky') return false; FL.vehicleAt(F, k, t0 + 3, q); return q.moving && q.y > c.h + 40 && q.vy === 0 && q.trip.t0 + q.trip.dur > t0 + 40; });
    out.sky = !!sky; const at = FL.vehicleAt(F, sky, O.clock.now() + 0.5, {}); const TT = (await import('./js/gen/vehicles.js')).TYPES[sky.type];
    O.ctrl.pos = [at.x, at.y + TT.H + 1.0, at.z]; O.ctrl.vel = [at.vx, 0, at.vz]; O.ctrl.grounded = false;
    for (let i = 0; i < 40 && !M.rider; i++) { const a2 = FL.vehicleAt(F, sky, O.clock.now() + 0.05, {}); if (O.ctrl.pos[1] < a2.y + TT.H + 2) { O.ctrl.pos[0] = a2.x; O.ctrl.pos[2] = a2.z; } await wait(50); }
    out.rode = !!M.rider; const y0 = O.ctrl.pos[1], x0 = O.ctrl.pos[0], z0 = O.ctrl.pos[2]; out.track = []; for (let i = 0; i < 6; i++) { const a3 = FL.vehicleAt(F, sky, O.clock.now(), {}); out.track.push([Math.round(a3.x), Math.round(O.ctrl.pos[0]), a3.moving, +a3.vx.toFixed(0), +a3.vz.toFixed(0), +(O.clock.now() % 1000).toFixed(1)]); await wait(250); } out.carried = Math.round(Math.hypot(O.ctrl.pos[0] - x0, O.ctrl.pos[2] - z0)); out.alt = Math.round(O.ctrl.pos[1] - c.h); out.stayed = !!M.rider;
    O.cam.pitch = 0.3; O.cam.dist = 7; await wait(200); out.prompt = document.querySelector('.prompt')?.textContent?.slice(0, 90);
    key('KeyE'); await wait(600); out.riding = !!O.getRide2(); out.fly = O.getRide2()?.v.fly; out.heat = +M.heat(O.clock.now()).toFixed(2); out.driverFalling = M.bodies.length; out.bodyAlt = M.bodies[0] ? Math.round(M.bodies[0].pos[1] - c.h) : null;
    key('KeyW', false); key('Space', false); await wait(2500); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })); const R = O.getRide2(); out.flew = R ? [Math.round(R.speed), Math.round(R.pos[1] - c.h)] : null; await wait(1500);
    out.bodyDown = M.bodies[0] ? { fly: M.bodies[0].flying, alt: Math.round(M.bodies[0].pos[1] - c.h), dead: !!M.bodies[0].dead } : null; out.heat2 = +M.heat(O.clock.now()).toFixed(2); out.cops = M.officers.length;
    O.cam.yaw += 0.8; await wait(400);
    throw new Error(JSON.stringify(out));`; SHOTS.sandbox = 'hour=12';
SCRIPTS.arrestdbg = `const O = ORBIS, P = O.store.player, wait = ms => new Promise(r => setTimeout(r, ms)); const { issueWarrant } = await import('./js/sim/processes/law.js'); const { buildingPlan } = await import('./js/gen/building.js'); const { doorstep } = await import('./js/gen/place.js');
    const hq = O.pop.buildingByKey.get(O.polity.security), ds = doorstep(O.s, hq, buildingPlan(O.planet, O.s, hq)); O.ctrl.pos = ds.pos.slice(); O.ctrl.vel = [0, 0, 0]; await wait(1500);
    const t = O.clock.now(); issueWarrant(O.ctx, t, 'a test warrant'); O.ctx.onServe(t); const log = [O.getPursuit()?.person.name];
    for (let i = 0; i < 60 && !P.custody; i++) { await wait(1000); const q = O.getPursuit(); if (i % 4 === 0) log.push([i, q ? q.state : 'none', q ? Math.round(Math.hypot(q.pos[0] - O.ctrl.pos[0], q.pos[2] - O.ctrl.pos[2])) : null, +O.ctrl.speed.toFixed(2), O.ctrl.mode, P.hp | 0, O.renderer.info.render.frame]); }
    throw new Error(JSON.stringify({ custody: !!P.custody, log }));`; SHOTS.arrestdbg = 'hour=10.5';
SCRIPTS.speed = `const O = ORBIS, P = O.store.player, c = O.city, wait = ms => new Promise(r => setTimeout(r, ms)), G = await import('./js/gen/city.js'), out = { fitness: P.fitness, fatigue: P.fatigue };
    const u = G.lineAt(c, 0, 1), v0 = G.lineAt(c, 1, -2) + 20, [x, z] = c.toWorld(u, v0), [x2, z2] = c.toWorld(u, v0 + 50); O.ctrl.pos = [x, c.h + 0.1, z]; O.ctrl.facing = Math.atan2(x2 - x, z2 - z); O.cam.yaw = O.ctrl.facing; await wait(1500);
    const run = async keys => { for (const k of keys) dispatchEvent(new KeyboardEvent('keydown', { code: k })); await wait(1200); const p0 = O.ctrl.pos.slice(), t0 = performance.now(); await wait(2500); const m = Math.hypot(O.ctrl.pos[0] - p0[0], O.ctrl.pos[2] - p0[2]) / ((performance.now() - t0) / 1000); for (const k of keys) dispatchEvent(new KeyboardEvent('keyup', { code: k })); await wait(600); return +m.toFixed(2); };
    out.walk = await run(['KeyW']); out.run = await run(['KeyW', 'ShiftLeft']); throw new Error(JSON.stringify(out));`; SHOTS.speed = 'hour=11';
SCRIPTS.gundbg = `const O = ORBIS, P = O.store.player, wait = ms => new Promise(r => setTimeout(r, ms)); let a = null; for (let k = 0; k < 40 && !a; k++) { a = O.getAgents().find(x => !x.bKey && x.pose !== 'lie' && !String(x.id).startsWith('tr:')); if (!a) { O.clock.advance(O.planet.dayLength / 48); await wait(300); } }
    P.inventory.push({ id: 'pistol', n: 1 }); P.weapon = 'pistol'; O.ctrl.pos = [a.pos[0] + 6, a.pos[1], a.pos[2]]; await wait(600); O.attack(); await wait(2500); throw new Error(JSON.stringify({ running: O.getAgents().filter(x => x.activity === 'running from gunfire').length, all: O.getAgents().length }));`; SHOTS.gundbg = 'hour=11';
SCRIPTS.outpost = `const O = ORBIS, wait = ms => new Promise(r => setTimeout(r, ms)), { sitesNear } = await import('./js/gen/outposts.js'), want = new URLSearchParams(location.search).get('kind');
    let site = null; sitesNear(O.planet, O.s.cx, O.s.cz, 16000, s => { if (s.kind === want && (!site || Math.hypot(s.x - O.s.cx, s.z - O.s.cz) < Math.hypot(site.x - O.s.cx, site.z - O.s.cz))) site = s; }); if (!site) throw new Error('none: ' + want);
    const a = 2.2, x = site.x + Math.sin(a) * 38, z = site.z + Math.cos(a) * 38, { surfaceHeight } = await import('./js/gen/surface.js'); O.ctrl.pos = [x, surfaceHeight(O.planet, x, z) + 0.2, z]; O.ctrl.vel = [0, 0, 0]; O.ctrl.facing = Math.atan2(site.x - x, site.z - z); O.cam.yaw = O.ctrl.facing; O.cam.pitch = 0.5; O.cam.dist = 34; await wait(4000);`;
for (const k of ['farm', 'mine', 'wind', 'ruin']) { SCRIPTS['out' + k] = SCRIPTS.outpost; SHOTS['out' + k] = 'hour=14&kind=' + k; }
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS);
for (const n of want) if (n.startsWith('booth')) SHOTS[n] = '';
const seed = process.env.SEED || '00c0ffee00b0a7e5';
mkdirSync('out/shots', { recursive: true });
const profile = join(tmpdir(), 'orbis-shots-' + process.pid);
preflight();
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, '--window-size=1600,900',
  '--disable-gpu-vsync', '--disable-frame-rate-limit', '--use-angle=metal', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--enable-unsafe-swiftshader', '--no-first-run', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
guardBrowser(chrome, profile, { maxSeconds: 1200 });
// a time limit (SIGALRM) or a kill must not leave this browser running: it holds memory and skews the next run
for (const sig of ['SIGALRM', 'SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { try { process.kill(-chrome.pid, 'SIGKILL'); } catch { try { chrome.kill('SIGKILL'); } catch {} } try { rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(124); });
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
    if (SCRIPTS[name]) { const r = await send('Runtime.evaluate', { expression: `(async () => { ${SCRIPTS[name]} ${process.env.AFTER || ''} })()`, awaitPromise: true }); if (r.result?.exceptionDetails) logs.push('SCRIPT ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400)); }
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
