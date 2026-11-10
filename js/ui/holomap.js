// The holo map: the ship's navigation screen, opened in space. The stars of the home sector (gen/stars.js) as a slowly
// turning projection; pick one and its worlds come up on their orbits; pick a world and what's known of it from orbit
// (its kind, its peoples, how they build, whether they're at war) with the jump to it. Resolves { system, body } or null.
import { starChart, worldPreview, jumpOf } from '../gen/stars.js';

const CSS = `
.holo { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; background: radial-gradient(ellipse at center, rgba(4,20,30,0.55), rgba(0,4,8,0.88)); font: 13px/1.45 system-ui, sans-serif; color: #bdf4ff; }
.holo .screen { position: relative; width: min(1180px, 94vw); height: min(700px, 88vh); border: 1px solid rgba(120,230,255,0.45); border-radius: 14px; background: linear-gradient(180deg, rgba(10,50,70,0.55), rgba(4,22,34,0.72)); box-shadow: 0 0 40px rgba(60,200,255,0.25), inset 0 0 60px rgba(40,180,255,0.12); display: grid; grid-template-columns: 1fr 330px; overflow: hidden; }
.holo .screen::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(0deg, rgba(150,240,255,0.05) 0 1px, transparent 1px 3px); animation: holoScan 6s linear infinite; }
@keyframes holoScan { from { background-position: 0 0; } to { background-position: 0 60px; } }
.holo canvas { width: 100%; height: 100%; display: block; cursor: crosshair; }
.holo .side { border-left: 1px solid rgba(120,230,255,0.25); padding: 22px 22px 18px; display: flex; flex-direction: column; gap: 10px; background: rgba(0,12,20,0.35); }
.holo h2 { margin: 0; font-size: 20px; letter-spacing: 0.06em; color: #e6fdff; text-shadow: 0 0 12px rgba(90,220,255,0.7); font-weight: 600; }
.holo .k { color: rgba(170,235,255,0.65); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; }
.holo .row { display: flex; justify-content: space-between; border-bottom: 1px solid rgba(120,230,255,0.12); padding: 3px 0; }
.holo .row b { color: #e6fdff; font-weight: 500; }
.holo button { margin-top: auto; padding: 12px 14px; border-radius: 8px; border: 1px solid rgba(140,240,255,0.7); background: rgba(40,170,220,0.22); color: #eaffff; font: 600 14px system-ui; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; box-shadow: 0 0 18px rgba(60,200,255,0.35); }
.holo button:hover { background: rgba(60,200,250,0.38); }
.holo button.ghost { margin-top: 0; background: transparent; box-shadow: none; border-color: rgba(140,240,255,0.3); font-weight: 500; }
.holo button[disabled] { opacity: 0.35; cursor: default; }
.holo .here { color: #ffd890; }
@media (max-width: 760px) { .holo .screen { grid-template-columns: 1fr; grid-template-rows: 1fr auto; } .holo .side { border-left: 0; border-top: 1px solid rgba(120,230,255,0.25); } }`;
const rgb = (c, a = 1, k = 1) => `rgba(${Math.round(Math.min(1, c[0] * k) * 255)},${Math.round(Math.min(1, c[1] * k) * 255)},${Math.round(Math.min(1, c[2] * k) * 255)},${a})`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ARCH = { temperate: 'temperate', steppe: 'steppe', highland: 'highland', jungle: 'jungle', savanna: 'savanna', arid: 'desert', ocean: 'ocean', frozen: 'frozen', canyonland: 'canyon country', volcanic: 'volcanic', fungal: 'fungal', crystal: 'crystal', spireforest: 'spire forest', barren: 'barren', cloud: 'cloud world, no ground', archipelago: 'archipelago' };

// U: universe seed; here: { system, body } you're over
export function openHoloMap(U, here) {
  if (!document.getElementById('holo-css')) { const st = document.createElement('style'); st.id = 'holo-css'; st.textContent = CSS; document.head.append(st); }
  const chart = starChart(U), root = document.createElement('div'); root.className = 'holo';
  root.innerHTML = `<div class="screen"><canvas></canvas><div class="side"></div></div>`; document.body.append(root);
  const cv = root.querySelector('canvas'), side = root.querySelector('.side'), g = cv.getContext('2d');
  let sys = here.system, world = null, hover = null, t0 = performance.now(), raf = 0, view = 'stars';
  return new Promise(done => {
    const close = v => { cancelAnimationFrame(raf); removeEventListener('keydown', key, true); root.remove(); done(v); };
    const key = e => { if (e.code === 'Escape' || e.code === 'KeyE') { e.preventDefault(); e.stopPropagation(); if (view === 'system' && e.code === 'Escape') { view = 'stars'; world = null; panel(); } else close(null); } };
    addEventListener('keydown', key, true);
    const size = () => { const r = cv.getBoundingClientRect(), d = devicePixelRatio || 1; cv.width = r.width * d; cv.height = r.height * d; g.setTransform(d, 0, 0, d, 0, 0); return r; };
    let R = size(); addEventListener('resize', () => { R = size(); }, { once: true });
    // where each thing is drawn this frame, for picking
    let hits = [];
    const project = (x, y, z, rot) => { const c = Math.cos(rot), s = Math.sin(rot), X = x * c - y * s, Y = x * s + y * c, tilt = 0.55; return [R.width / 2 + X, R.height / 2 + Y * tilt - z]; };
    function draw() {
      const t = (performance.now() - t0) / 1000; g.clearRect(0, 0, R.width, R.height); hits = [];
      // the grid of the plane
      g.strokeStyle = 'rgba(110,220,255,0.10)'; g.lineWidth = 1; const rot = t * 0.04;
      if (view === 'stars') {
        const sc = Math.min(R.width, R.height) / 70;
        for (let r = 5; r <= 35; r += 5) { g.beginPath(); for (let a = 0; a <= 64; a++) { const p = project(Math.cos(a / 64 * 6.283) * r * sc, Math.sin(a / 64 * 6.283) * r * sc, 0, rot); a ? g.lineTo(...p) : g.moveTo(...p); } g.stroke(); }
        const H = chart[here.system];
        for (const S of chart) { const [x, y] = [(S.pos[0]) * sc, (S.pos[1]) * sc], p = project(x, y, 0, rot), q = project(x, y, 14 + S.size * 6, rot), sel = S.n === sys, hv = hover === S.n;
          g.strokeStyle = 'rgba(110,220,255,0.25)'; g.beginPath(); g.moveTo(...p); g.lineTo(...q); g.stroke();
          const r0 = 3 + S.size * 2.6 + (hv ? 2 : 0), grd = g.createRadialGradient(q[0], q[1], 0, q[0], q[1], r0 * 4); grd.addColorStop(0, rgb(S.colour, 1)); grd.addColorStop(0.25, rgb(S.colour, 0.55)); grd.addColorStop(1, rgb(S.colour, 0)); g.fillStyle = grd; g.beginPath(); g.arc(q[0], q[1], r0 * 4, 0, 6.283); g.fill();
          if (sel) { g.strokeStyle = 'rgba(160,240,255,0.9)'; g.beginPath(); g.arc(q[0], q[1], r0 * 2.2 + Math.sin(t * 3) * 1.5, 0, 6.283); g.stroke(); }
          g.fillStyle = S.n === here.system ? '#ffd890' : sel || hv ? '#e6fdff' : 'rgba(190,240,255,0.75)'; g.font = '12px system-ui'; g.fillText(S.name + (S.n === here.system ? '  · you are here' : ''), q[0] + r0 + 6, q[1] + 4);
          hits.push({ x: q[0], y: q[1], r: Math.max(14, r0 * 2.2), S });
          if (S.n !== here.system && (sel || hv)) { const a = project(H.pos[0] * sc, H.pos[1] * sc, 14 + H.size * 6, rot); g.setLineDash([4, 6]); g.strokeStyle = 'rgba(255,216,144,0.6)'; g.beginPath(); g.moveTo(...a); g.lineTo(...q); g.stroke(); g.setLineDash([]); }
        }
      } else {
        const S = chart[sys], max = S.bodies.at(-1).orbit + 0.4, sc = Math.min(R.width * 0.42, R.height * 0.78) / max, c = project(0, 0, 0, 0);
        const grd = g.createRadialGradient(c[0], c[1], 0, c[0], c[1], 40 * S.size); grd.addColorStop(0, rgb(S.colour, 1)); grd.addColorStop(0.3, rgb(S.colour, 0.6)); grd.addColorStop(1, rgb(S.colour, 0)); g.fillStyle = grd; g.beginPath(); g.arc(c[0], c[1], 40 * S.size, 0, 6.283); g.fill();
        for (const B of S.bodies) {
          g.strokeStyle = 'rgba(110,220,255,0.22)'; g.beginPath(); for (let a = 0; a <= 96; a++) { const p = project(Math.cos(a / 96 * 6.283) * B.orbit * sc, Math.sin(a / 96 * 6.283) * B.orbit * sc, 0, 0); a ? g.lineTo(...p) : g.moveTo(...p); } g.stroke();
          const a = B.phase + t * 0.25 / B.orbit, p = project(Math.cos(a) * B.orbit * sc, Math.sin(a) * B.orbit * sc, 0, 0), W = worldPreview(U, S.n, B.n), r = 8 + (B.n % 3) * 2, sel = world === B.n, hv = hover === B.n;
          const pg = g.createRadialGradient(p[0] - r * 0.4, p[1] - r * 0.4, r * 0.1, p[0], p[1], r * 1.1);
          if (W.cloud) { pg.addColorStop(0, '#f4f1ea'); pg.addColorStop(0.6, '#c8c2b4'); pg.addColorStop(1, '#5a5650'); } else { pg.addColorStop(0, rgb(W.ground, 1, 3.2)); pg.addColorStop(0.55, rgb(W.sea, 1, 2.2)); pg.addColorStop(1, rgb(W.sea, 1, 0.5)); }
          g.fillStyle = pg; g.beginPath(); g.arc(p[0], p[1], r, 0, 6.283); g.fill();
          if (W.ring) { g.strokeStyle = 'rgba(230,220,200,0.6)'; g.beginPath(); g.ellipse(p[0], p[1], r * 1.9, r * 0.5, -0.3, 0, 6.283); g.stroke(); }
          if (sel || hv) { g.strokeStyle = 'rgba(160,240,255,0.95)'; g.beginPath(); g.arc(p[0], p[1], r + 6 + Math.sin(t * 3) * 1.5, 0, 6.283); g.stroke(); }
          const mine = S.n === here.system && B.n === here.body;
          g.fillStyle = mine ? '#ffd890' : sel || hv ? '#e6fdff' : 'rgba(190,240,255,0.7)'; g.font = '12px system-ui'; g.fillText(W.name + (mine ? '  · here' : ''), p[0] + r + 8, p[1] + 4);
          hits.push({ x: p[0], y: p[1], r: Math.max(14, r + 6), B });
        }
      }
      raf = requestAnimationFrame(draw);
    }
    function panel() {
      const S = chart[sys];
      if (view === 'stars') { const J = jumpOf(chart, here, { system: sys, body: 0 });
        side.innerHTML = `<div class="k">Navigation · local stars</div><h2>${esc(S.name)}</h2><div class="row"><span>Star</span><b>class ${S.cls}</b></div><div class="row"><span>Worlds</span><b>${S.bodies.length}</b></div><div class="row"><span>Distance</span><b>${sys === here.system ? '<span class="here">this system</span>' : J.ly.toFixed(1) + ' ly'}</b></div>
          <p style="opacity:.7">Choose a star to see its worlds.</p><button data-a="open">Show its worlds</button><button class="ghost" data-a="close">Close</button>`; return; }
      if (world === null) { side.innerHTML = `<div class="k">${esc(S.name)} · class ${S.cls}</div><h2>${S.bodies.length} worlds</h2><p style="opacity:.7">Choose a world on its orbit.</p><button class="ghost" data-a="back" style="margin-top:auto">Back to the stars</button>`; return; }
      const W = worldPreview(U, sys, world), J = jumpOf(chart, here, { system: sys, body: world }), mine = sys === here.system && world === here.body;
      side.innerHTML = `<div class="k">${esc(S.name)} · world ${world + 1}</div><h2>${esc(W.name)}</h2>
        <div class="row"><span>Kind</span><b>${esc(ARCH[W.arch] || W.arch)}</b></div>
        <div class="row"><span>Strangeness</span><b>${W.weird < 0.3 ? 'familiar' : W.weird < 0.6 ? 'unusual' : W.weird < 0.8 ? 'strange' : 'alien'}</b></div>
        <div class="row"><span>Peoples</span><b>${W.nations} ${W.nations === 1 ? 'nation' : 'nations'}${W.war ? ' · <span style="color:#ff9a80">at war</span>' : ''}</b></div>
        <div class="row"><span>Mostly</span><b>${esc(W.industry)}</b></div>
        <div class="row"><span>They build</span><b>${esc(W.builds)}</b></div>
        <div class="row"><span>Day</span><b>${W.dayH} h${W.moons ? ' · ' + W.moons + (W.moons === 1 ? ' moon' : ' moons') : ''}${W.ring ? ' · ringed' : ''}</b></div>
        <div class="row"><span>Jump</span><b>${mine ? '<span class="here">you are here</span>' : sys === here.system ? 'in-system' : J.ly.toFixed(1) + ' ly'}</b></div>
        <button data-a="jump" ${mine ? 'disabled' : ''}>Engage FTL</button><button class="ghost" data-a="back">Back to the stars</button>`;
    }
    side.addEventListener('click', e => { const a = e.target.dataset?.a; if (!a) return;
      if (a === 'close') close(null); if (a === 'open') { view = 'system'; world = null; panel(); } if (a === 'back') { view = 'stars'; world = null; panel(); }
      if (a === 'jump' && world !== null) close({ system: sys, body: world }); });
    const at = e => { const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; let best = null, bd = 1e9; for (const h of hits) { const d = Math.hypot(h.x - x, h.y - y); if (d < h.r && d < bd) { bd = d; best = h; } } return best; };
    cv.addEventListener('mousemove', e => { const h = at(e); hover = h ? (h.S ? h.S.n : h.B.n) : null; cv.style.cursor = h ? 'pointer' : 'crosshair'; });
    cv.addEventListener('click', e => { const h = at(e); if (!h) return; if (h.S) { if (sys === h.S.n && view === 'stars') { view = 'system'; world = null; } else sys = h.S.n; } else world = h.B.n; panel(); });
    cv.addEventListener('dblclick', e => { const h = at(e); if (h?.S) { sys = h.S.n; view = 'system'; world = null; panel(); } });
    if (here) { view = 'stars'; } panel(); draw();
  });
}

// The jump: the stars stretch into lines and pour past, a flash, and you're somewhere else. `back`: coming out of it.
export function ftlEffect(secs, back = false) {
  return new Promise(done => {
    const cv = document.createElement('canvas'); cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:70;pointer-events:none'; document.body.append(cv);
    const g = cv.getContext('2d'), d = devicePixelRatio || 1; cv.width = innerWidth * d; cv.height = innerHeight * d; g.scale(d, d);
    const N = 900, st = Array.from({ length: N }, () => ({ a: Math.random() * 6.283, r: Math.random() ** 0.5 * 40 + 2, z: Math.random(), h: 190 + Math.random() * 40 })), t0 = performance.now(), W = innerWidth, H = innerHeight;
    const step = () => {
      const t = (performance.now() - t0) / 1000, f = Math.min(1, t / secs), k = back ? 1 - f : f, speed = back ? (1 - f) ** 2 : f ** 2;
      g.fillStyle = `rgba(0,3,8,${back ? 0.25 + 0.6 * (1 - f) : 0.25 + 0.6 * f})`; g.fillRect(0, 0, W, H);
      for (const s of st) { s.r *= 1 + speed * 0.09 + 0.004; if (s.r > Math.hypot(W, H)) s.r = 2 + Math.random() * 30; const len = 2 + speed * 90 * (s.r / 200), x = W / 2 + Math.cos(s.a) * s.r, y = H / 2 + Math.sin(s.a) * s.r;
        g.strokeStyle = `hsla(${s.h},90%,${70 + 25 * k}%,${0.3 + 0.7 * k})`; g.lineWidth = 0.6 + k * 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x - Math.cos(s.a) * len, y - Math.sin(s.a) * len); g.stroke(); }
      const flash = back ? Math.max(0, 1 - t * 2.2) : Math.max(0, (f - 0.86) / 0.14); if (flash > 0) { g.fillStyle = `rgba(225,245,255,${flash})`; g.fillRect(0, 0, W, H); }
      if (f < 1) requestAnimationFrame(step); else { if (back) cv.remove(); done(cv); }
    };
    step();
  });
}
