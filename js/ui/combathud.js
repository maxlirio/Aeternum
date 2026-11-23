// What you see of a fight on foot, drawn on one canvas over the game: the crosshair (opening up as the shots wander), the
// mark that tells you a round landed (red: he's down), arcs at the edge of the crosshair pointing the way you were hit from,
// the red closing in as you're hurt, your shield and health, the three objectives on the line, who's put down whom, and what
// men near you shout to each other.
export class CombatHud {
  constructor() {
    const c = this.cv = document.createElement('canvas'); c.className = 'combathud';
    Object.assign(c.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 4 }); document.body.append(c);
    this.g = c.getContext('2d'); this.hits = []; this.hurts = []; this.feed = []; this.barks = []; this.hm = 0; this.kill = false; this.redT = 0;
  }
  hit(kill, head = false) { this.hm = 0.22; this.kill = kill; this.head = !!head; }
  // a blow from `ang` (radians, round from straight ahead, clockwise)
  hurt(ang, shield) { this.hurts.push({ a: ang, t: 0, shield }); if (!shield) this.redT = 0.5; }
  // the eyepiece. A rifle's: round, a fine cross with stadia marks below the centre (holdovers for range), a dot; a little
  // red-brown at the edge of the glass. A tank's gunner's sight: a wide rectangular field, the aiming chevron, range marks.
  sight(g, S, W, H, cx, cy) {
    const k = S.k, R = Math.min(W, H) * 0.46;
    if (k <= 0.45) { g.fillStyle = `rgba(0,0,0,${k / 0.45})`; g.fillRect(0, 0, W, H); return; }
    const open = Math.min(1, (k - 0.45) / 0.45), r = R * (0.25 + 0.75 * open);
    const hole = () => { g.beginPath(); if (S.tank) { const w = Math.min(W * 0.86, r * 2.6), h = r * 1.5; g.roundRect ? g.roundRect(cx - w / 2, cy - h / 2, w, h, 18) : g.rect(cx - w / 2, cy - h / 2, w, h); } else g.arc(cx, cy, r, 0, Math.PI * 2); };
    // the glass: darker toward its edge (only inside the eyepiece)
    g.save(); hole(); g.clip(); const gr = g.createRadialGradient(cx, cy, r * 0.55, cx, cy, r * (S.tank ? 1.35 : 1.02)); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, S.tank ? 'rgba(0,10,0,0.55)' : 'rgba(30,10,0,0.7)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); g.restore();
    // and black everywhere else
    g.save(); g.beginPath(); g.rect(0, 0, W, H); if (S.tank) { const w = Math.min(W * 0.86, r * 2.6), h = r * 1.5; g.roundRect ? g.roundRect(cx - w / 2, cy - h / 2, w, h, 18) : g.rect(cx - w / 2, cy - h / 2, w, h); } else g.arc(cx, cy, r, 0, Math.PI * 2, true);
    g.fillStyle = '#000'; g.fill('evenodd'); g.restore();
    if (open < 1) return;
    g.lineCap = 'butt';
    if (!S.tank) {
      // the cross: heavy posts from the edge, a fine line through the middle, holdover marks below
      g.strokeStyle = 'rgba(10,10,10,0.95)'; g.lineWidth = 4; g.beginPath(); for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.moveTo(cx + ux * r, cy + uy * r); g.lineTo(cx + ux * r * 0.32, cy + uy * r * 0.32); } g.stroke();
      g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx - r * 0.32, cy); g.lineTo(cx + r * 0.32, cy); g.moveTo(cx, cy - r * 0.32); g.lineTo(cx, cy + r * 0.32); g.stroke();
      g.lineWidth = 1.2; for (let i = 1; i <= 4; i++) { const y = cy + i * r * 0.06, w = r * (0.045 - i * 0.006); g.beginPath(); g.moveTo(cx - w, y); g.lineTo(cx + w, y); g.stroke(); }
      for (let i = 1; i <= 3; i++) for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * i * r * 0.07, cy - 4); g.lineTo(cx + s * i * r * 0.07, cy + 4); g.stroke(); }
      g.fillStyle = 'rgba(230,40,30,0.9)'; g.beginPath(); g.arc(cx, cy, 1.8, 0, 7); g.fill();
      g.font = '500 11px system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(220,220,210,0.55)'; g.fillText(`${S.zoom.toFixed(1)}×`, cx + r * 0.72, cy + r * 0.72);
      // your breath, while you hold it
      if (S.holding || S.breath < 1) { g.fillStyle = S.gasp ? 'rgba(240,90,60,0.7)' : 'rgba(220,220,210,0.45)'; g.fillRect(cx - 40, cy + r * 0.8, 80 * S.breath, 3); }
    } else {
      // the gunner's sight: the aiming chevron, a broken horizontal line, range marks under the centre for long shots
      g.strokeStyle = 'rgba(255,190,60,0.95)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(cx - 14, cy + 9); g.lineTo(cx, cy); g.lineTo(cx + 14, cy + 9); g.stroke();
      g.beginPath(); g.moveTo(cx - r * 1.2, cy); g.lineTo(cx - 30, cy); g.moveTo(cx + 30, cy); g.lineTo(cx + r * 1.2, cy); g.moveTo(cx, cy + 20); g.lineTo(cx, cy + r * 0.6); g.stroke();
      g.font = '500 10px system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(255,190,60,0.85)';
      for (let i = 1; i <= 4; i++) { const y = cy + 20 + i * r * 0.1; g.beginPath(); g.moveTo(cx - 8, y); g.lineTo(cx + 8, y); g.stroke(); g.fillText(String(i * 4), cx + 12, y); }
      g.fillText(`${S.zoom.toFixed(1)}×`, cx + r * 1.0, cy + r * 0.62);
    }
  }
  log(html, kind = '') { this.feed.push({ html, kind, t: 0 }); if (this.feed.length > 5) this.feed.shift(); }
  // st: { on, armed, spread (radians), fov (radians), aiming, hp, shield, shieldMax, nades, obj: [{ name, prog, owner }], barks: [{ x, y, text, side }] }
  draw(st, dt) {
    const c = this.cv, W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const g = this.g; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    this.hm = Math.max(0, this.hm - dt); this.redT = Math.max(0, this.redT - dt);
    for (const h of this.hurts) h.t += dt; this.hurts = this.hurts.filter(h => h.t < 1.4);
    for (const f of this.feed) f.t += dt; this.feed = this.feed.filter(f => f.t < 7);
    if (!st.on) { c.style.display = 'none'; return; } c.style.display = '';
    const cx = W / 2, cy = H / 2, S = st.scope;
    // through the sight: black all round the eyepiece (closing in as it comes up to the eye), the reticle in it
    if (S) this.sight(g, S, W, H, cx, cy);
    // hurt: red at the edges, deeper the lower your health, a flash with each blow
    const low = Math.max(0, 1 - st.hp / 60), red = Math.min(0.75, low * 0.55 + this.redT * 0.6);
    if (red > 0.01) { const gr = g.createRadialGradient(cx, cy, Math.min(W, H) * 0.3, cx, cy, Math.hypot(W, H) * 0.6); gr.addColorStop(0, 'rgba(120,0,0,0)'); gr.addColorStop(1, `rgba(140,8,4,${red})`); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
    // the crosshair: four short strokes, apart by how far the next shot may wander
    if (st.armed && !(S && S.k > 0.5) && !st.tank) {
      const px = Math.max(5, Math.tan(st.spread) / Math.tan(st.fov / 2) * H / 2), L = st.aiming ? 6 : 8;
      g.lineCap = 'round'; for (const [w, a] of [[3, 'rgba(0,0,0,0.45)'], [1.5, 'rgba(255,255,255,0.92)']]) { g.lineWidth = w; g.strokeStyle = a; g.beginPath();
        for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.moveTo(cx + ux * px, cy + uy * px); g.lineTo(cx + ux * (px + L), cy + uy * (px + L)); } g.stroke(); }
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(cx - 1, cy - 1, 2, 2);
    }
    // a hit: an X across the centre
    if (this.hm > 0) { const k = this.hm / 0.22, r0 = 7 + (1 - k) * 4, r1 = r0 + 7; g.lineWidth = this.kill ? 3 : this.head ? 2.6 : 2; g.strokeStyle = this.kill ? `rgba(255,60,40,${0.4 + k * 0.6})` : this.head ? `rgba(255,200,60,${0.4 + k * 0.6})` : `rgba(255,255,255,${0.3 + k * 0.7})`;      // (red: down; gold: a head shot) g.beginPath();
      for (const [ux, uy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { g.moveTo(cx + ux * r0 * 0.7, cy + uy * r0 * 0.7); g.lineTo(cx + ux * r1 * 0.7, cy + uy * r1 * 0.7); } g.stroke(); }
    // where the blows came from: an arc round the centre, on that side
    for (const h of this.hurts) { const k = 1 - h.t / 1.4, R = 90; g.lineWidth = 9; g.strokeStyle = h.shield ? `rgba(120,200,255,${k * 0.8})` : `rgba(230,30,20,${k * 0.85})`; g.beginPath(); const a = h.a - Math.PI / 2; g.arc(cx, cy, R, a - 0.28, a + 0.28); g.stroke(); }
    // shield and health, low in the middle
    if (!st.tank) { const w = 220, x = cx - w / 2, y = H - 54; g.fillStyle = 'rgba(0,0,0,0.42)'; g.fillRect(x - 3, y - 3, w + 6, 22);
      if (st.shieldMax) { g.fillStyle = st.shield > 0 ? 'rgba(130,205,255,0.95)' : 'rgba(130,205,255,0.25)'; g.fillRect(x, y, w * Math.max(0, st.shield / st.shieldMax), 6); }
      g.fillStyle = st.hp > 35 ? 'rgba(235,235,225,0.95)' : 'rgba(240,70,50,0.95)'; g.fillRect(x, y + 9, w * Math.max(0, st.hp / 100), 7);
      for (let k = 0; k < (st.nades || 0); k++) { g.fillStyle = 'rgba(210,200,150,0.95)'; g.beginPath(); g.arc(x + w + 14 + k * 13, y + 8, 4.5, 0, 7); g.fill(); }
      for (let k = 0; k < (st.rockets || 0); k++) { g.fillStyle = 'rgba(230,140,80,0.95)'; g.fillRect(x - 22 - k * 9, y + 1, 5, 14); } }
    // in a tank: where the gun is actually laid (it follows your eye at the rate the turret turns), whether it's loaded, the hull
    if (st.tank) { const T = st.tank;
      if (!(S && S.k > 0.5)) { g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(cx, cy, 3, 0, 7); g.stroke(); }
      if (T.pip) { const r = 11, ready = T.reload >= 1; g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(T.pip.x, T.pip.y, r + 1, 0, 7); g.stroke();
        g.strokeStyle = ready ? 'rgba(150,255,160,0.95)' : 'rgba(255,210,120,0.9)'; g.beginPath(); g.arc(T.pip.x, T.pip.y, r, -Math.PI / 2, -Math.PI / 2 + T.reload * Math.PI * 2); g.stroke(); }
      const w = 220, x = cx - w / 2, y = H - 54; g.fillStyle = 'rgba(0,0,0,0.42)'; g.fillRect(x - 3, y - 3, w + 6, 22); g.fillStyle = T.hp / T.maxHp > 0.35 ? 'rgba(210,215,190,0.95)' : 'rgba(240,90,60,0.95)'; g.fillRect(x, y, w * Math.max(0, T.hp / T.maxHp), 7);
      g.fillStyle = T.reload >= 1 ? 'rgba(150,255,160,0.9)' : 'rgba(255,210,120,0.8)'; g.fillRect(x, y + 10, w * T.reload, 4);
      g.font = '600 12px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillStyle = 'rgba(235,235,225,0.85)'; g.fillText(`${T.name} · ${Math.round(Math.abs(T.speed) * 3.6)} km/h`, cx, y - 6); }
    // (shield and health are yours on foot; in the tank it's the hull above)
    // the line's three objectives, across the top: a ring filling in the colour of whoever's taking it
    if (st.obj?.length) { const y = 34, gap = 64, x0 = cx - gap * (st.obj.length - 1) / 2; g.font = '600 12px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      st.obj.forEach((O, i) => { const x = x0 + i * gap, p = O.prog, col = p > 0 ? '70,130,230' : '220,70,55';
        g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.arc(x, y, 15, 0, 7); g.fill();
        g.lineWidth = 4; g.strokeStyle = `rgba(${col},0.95)`; g.beginPath(); g.arc(x, y, 13, -Math.PI / 2, -Math.PI / 2 + Math.abs(p) * Math.PI * 2, p < 0); if (Math.abs(p) > 0.01) g.stroke();
        g.fillStyle = O.owner === 'ours' ? 'rgb(150,190,255)' : O.owner === 'theirs' ? 'rgb(255,140,120)' : 'rgb(235,225,200)'; g.fillText(O.name[0], x, y + 1); }); }
    // what they're shouting
    g.font = '600 13px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
    for (const b of st.barks || []) { const a = Math.min(1, b.life * 2); g.lineWidth = 3; g.strokeStyle = `rgba(0,0,0,${0.6 * a})`; g.strokeText(b.text, b.x, b.y); g.fillStyle = b.side === 'ours' ? `rgba(190,215,255,${a})` : `rgba(255,190,170,${a})`; g.fillText(b.text, b.x, b.y); }
    // who's down: top right, fading
    g.font = '500 13px system-ui, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'top';
    this.feed.forEach((f, i) => { const a = Math.min(1, (7 - f.t) / 1.5); g.fillStyle = `rgba(0,0,0,${0.35 * a})`; const tw = g.measureText(f.html).width; g.fillRect(W - 24 - tw - 8, 80 + i * 22 - 3, tw + 16, 20); g.fillStyle = f.kind === 'you' ? `rgba(255,220,140,${a})` : f.kind === 'bad' ? `rgba(255,150,130,${a})` : `rgba(235,235,230,${a})`; g.fillText(f.html, W - 24, 80 + i * 22); });
  }
}
