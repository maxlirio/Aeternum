// The fighter's sight, drawn over the view while you fly:
//   · the aim circle: where the mouse is pointing you (your instructor flies the nose there);
//   · the gun cross: where your rounds go, ranged to the target ahead (their drop and your own speed in it), else to convergence;
//   · the lead ring on the enemy you're on: where your rounds have to be aimed to meet it (its speed, their time of flight, their drop),
//     brightening when the gun cross is on it; the target's box with its range and closure;
//   · the seeker: a diamond closing on whatever it sees, solid at lock;
//   · a mark at the cross when your rounds hit; a red edge toward a hit you take; arrows toward missiles coming at you.
import * as THREE from 'three';
import { GUN } from '../sim/aircombat.js';

const G = 9.81, _v = new THREE.Vector3();
export class FlightHud {
  constructor() {
    const c = this.canvas = document.createElement('canvas'); c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:4'; document.body.append(c);
    this.g = c.getContext('2d'); this.marks = []; this.hurts = []; this.on = false;
  }
  hitMark(kill = false) { this.marks.push({ t: 0, kill }); }
  hurt(dirScreen) { this.hurts.push({ t: 0, a: dirScreen }); }
  hide() { if (this.on) { this.g.clearRect(0, 0, this.canvas.width, this.canvas.height); this.on = false; } }
  // f: your Flight; me: your craft in the war (or null); war; camera; toRender; aim: unit world direction you're steering for (or null); dt
  draw(f, me, war, camera, toRender, aim, dt) {
    const c = this.canvas, dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const g = this.g; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); this.on = true;
    const proj = p => { _v.set(...toRender(...p)).project(camera); return _v.z < 1 && _v.z > -1 ? [(_v.x + 1) / 2 * W, (1 - _v.y) / 2 * H] : null; };
    const at = (d, k) => [f.pos[0] + d[0] * k, f.pos[1] + d[1] * k, f.pos[2] + d[2] * k];
    g.lineCap = 'round'; g.font = '600 12px ui-monospace, Menlo, monospace'; g.textAlign = 'center';
    const ink = (a = 0.9) => `rgba(205, 255, 214, ${a})`, line = (w = 1.5, a = 0.9) => { g.lineWidth = w; g.strokeStyle = ink(a); g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 3; };
    // the enemy you're on: locked, else the hostile nearest your nose within 2.5 km
    let tgt = me?.lock?.alive && !me.lock.decoy ? me.lock : null;
    if (!tgt && me) { let best = 0.86; for (const o of war.enemiesOf(me)) { const d = [o.f.pos[0] - f.pos[0], o.f.pos[1] - f.pos[1], o.f.pos[2] - f.pos[2]], r = Math.hypot(...d); if (r > 2500) continue; const cs = (d[0] * f.fwd[0] + d[1] * f.fwd[1] + d[2] * f.fwd[2]) / r; if (cs > best) { best = cs; tgt = o; } } }
    const range = tgt ? Math.hypot(tgt.f.pos[0] - f.pos[0], tgt.f.pos[1] - f.pos[1], tgt.f.pos[2] - f.pos[2]) : 600;
    // the gun cross: a round leaves at the guns' speed plus yours, and falls; where it is when it's gone `range` along the nose
    const vr = [f.vel[0] + f.fwd[0] * GUN.v, f.vel[1] + f.fwd[1] * GUN.v, f.vel[2] + f.fwd[2] * GUN.v], sp = Math.hypot(...vr), tof = range / sp;
    const round = [f.pos[0] + vr[0] * tof, f.pos[1] + vr[1] * tof - 0.5 * G * tof * tof, f.pos[2] + vr[2] * tof];
    const gc = proj(round);
    if (gc) { line(1.6); const [x, y] = gc; g.beginPath(); for (const [a, b, cc, d] of [[-16, 0, -6, 0], [6, 0, 16, 0], [0, -16, 0, -6], [0, 6, 0, 16]]) { g.moveTo(x + a, y + b); g.lineTo(x + cc, y + d); } g.stroke(); g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fillStyle = ink(); g.fill(); }
    // the aim circle
    if (aim) { const ac = proj(at(aim, 2000)); if (ac) { line(1.2, 0.75); g.beginPath(); g.arc(ac[0], ac[1], 9, 0, Math.PI * 2); g.stroke(); } }
    // the target: its box, range and closure; the lead ring where your rounds would meet it
    if (tgt) {
      const tc = proj(tgt.f.pos);
      const rv = [tgt.f.vel[0] - f.vel[0], tgt.f.vel[1] - f.vel[1], tgt.f.vel[2] - f.vel[2]], los = [(tgt.f.pos[0] - f.pos[0]) / range, (tgt.f.pos[1] - f.pos[1]) / range, (tgt.f.pos[2] - f.pos[2]) / range], closure = -(rv[0] * los[0] + rv[1] * los[1] + rv[2] * los[2]);
      if (tc) { const s = Math.max(14, Math.min(60, 22000 / range * 0.6)); line(1.2, 0.85); g.strokeRect(tc[0] - s, tc[1] - s, 2 * s, 2 * s);
        g.fillStyle = ink(0.95); g.fillText(`${range < 1000 ? Math.round(range) + ' m' : (range / 1000).toFixed(1) + ' km'}  ${closure >= 0 ? '+' : ''}${Math.round(closure * 3.6)}`, tc[0], tc[1] + s + 15); }
      // lead: aim point A with the round reaching the target as it gets there, held up by the round's drop
      let t = range / GUN.v; let A = tgt.f.pos;
      for (let k = 0; k < 4; k++) { A = [tgt.f.pos[0] + (tgt.f.vel[0] - f.vel[0]) * t, tgt.f.pos[1] + (tgt.f.vel[1] - f.vel[1]) * t + 0.5 * G * t * t, tgt.f.pos[2] + (tgt.f.vel[2] - f.vel[2]) * t]; t = Math.hypot(A[0] - f.pos[0], A[1] - f.pos[1], A[2] - f.pos[2]) / GUN.v; }
      const L = proj([f.pos[0] + (A[0] - f.pos[0]), f.pos[1] + (A[1] - f.pos[1]), f.pos[2] + (A[2] - f.pos[2])]);
      if (L && range < GUN.range * 1.3) { const on = gc && Math.hypot(gc[0] - L[0], gc[1] - L[1]) < Math.max(10, 30000 / range * 0.25); line(on ? 2.4 : 1.4, on ? 1 : 0.8); g.strokeStyle = on ? 'rgba(255, 236, 120, 1)' : ink(0.85); g.beginPath(); g.arc(L[0], L[1], 7, 0, Math.PI * 2); g.stroke(); if (tc) { g.setLineDash([3, 5]); g.beginPath(); g.moveTo(tc[0], tc[1]); g.lineTo(L[0], L[1]); g.stroke(); g.setLineDash([]); } }
      // the seeker's diamond, closing in to the lock
      if (me && me.lock === tgt && me.missiles) { const k = Math.min(1, me.lockT / 1.2), s = 34 - 20 * k; if (tc) { line(k >= 1 ? 2.4 : 1.2, k >= 1 ? 1 : 0.6); g.strokeStyle = k >= 1 ? 'rgba(255, 120, 90, 1)' : ink(0.7); g.beginPath(); g.moveTo(tc[0], tc[1] - s); g.lineTo(tc[0] + s, tc[1]); g.lineTo(tc[0], tc[1] + s); g.lineTo(tc[0] - s, tc[1]); g.closePath(); g.stroke(); } }
    }
    // missiles coming for you: an arrow at the edge toward each
    for (const m of war.missiles) { if (m.target !== me) continue; const p = proj(m.p) || (() => { _v.set(...toRender(...m.p)).project(camera); return [(-_v.x + 1) / 2 * W, (1 + _v.y) / 2 * H]; })(); const cx = W / 2, cy = H / 2, a = Math.atan2(p[1] - cy, p[0] - cx), R = Math.min(W, H) * 0.42, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = 'rgba(255, 70, 50, 0.95)'; g.beginPath(); g.moveTo(14, 0); g.lineTo(-8, -9); g.lineTo(-8, 9); g.closePath(); g.fill(); g.restore(); }
    // your hits: a mark at the gun cross; a kill, a bigger one
    if (gc) for (const m of this.marks) { const k = 1 - m.t / 0.35, s = m.kill ? 15 : 9; g.lineWidth = m.kill ? 3 : 2; g.strokeStyle = m.kill ? `rgba(255, 90, 60, ${k})` : `rgba(255, 255, 255, ${k})`; g.beginPath(); for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { g.moveTo(gc[0] + a * s * 0.5, gc[1] + b * s * 0.5); g.lineTo(gc[0] + a * s, gc[1] + b * s); } g.stroke(); }
    // hits you take: the edge of the view flares red toward them
    for (const h of this.hurts) { const k = 1 - h.t / 0.9, cx = W / 2, cy = H / 2, R = Math.hypot(W, H) * 0.5; const gr = g.createRadialGradient(cx + Math.cos(h.a) * R, cy + Math.sin(h.a) * R, 0, cx + Math.cos(h.a) * R, cy + Math.sin(h.a) * R, R * 0.75); gr.addColorStop(0, `rgba(200, 20, 10, ${0.45 * k})`); gr.addColorStop(1, 'rgba(200, 20, 10, 0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
    for (const m of this.marks) m.t += dt; for (const h of this.hurts) h.t += dt;
    this.marks = this.marks.filter(m => m.t < 0.35); this.hurts = this.hurts.filter(h => h.t < 0.9);
  }
}
