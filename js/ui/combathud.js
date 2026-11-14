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
  hit(kill) { this.hm = 0.22; this.kill = kill; }
  // a blow from `ang` (radians, round from straight ahead, clockwise)
  hurt(ang, shield) { this.hurts.push({ a: ang, t: 0, shield }); if (!shield) this.redT = 0.5; }
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
    const cx = W / 2, cy = H / 2;
    // hurt: red at the edges, deeper the lower your health, a flash with each blow
    const low = Math.max(0, 1 - st.hp / 60), red = Math.min(0.75, low * 0.55 + this.redT * 0.6);
    if (red > 0.01) { const gr = g.createRadialGradient(cx, cy, Math.min(W, H) * 0.3, cx, cy, Math.hypot(W, H) * 0.6); gr.addColorStop(0, 'rgba(120,0,0,0)'); gr.addColorStop(1, `rgba(140,8,4,${red})`); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
    // the crosshair: four short strokes, apart by how far the next shot may wander
    if (st.armed) {
      const px = Math.max(5, Math.tan(st.spread) / Math.tan(st.fov / 2) * H / 2), L = st.aiming ? 6 : 8;
      g.lineCap = 'round'; for (const [w, a] of [[3, 'rgba(0,0,0,0.45)'], [1.5, 'rgba(255,255,255,0.92)']]) { g.lineWidth = w; g.strokeStyle = a; g.beginPath();
        for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.moveTo(cx + ux * px, cy + uy * px); g.lineTo(cx + ux * (px + L), cy + uy * (px + L)); } g.stroke(); }
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(cx - 1, cy - 1, 2, 2);
    }
    // a hit: an X across the centre
    if (this.hm > 0) { const k = this.hm / 0.22, r0 = 7 + (1 - k) * 4, r1 = r0 + 7; g.lineWidth = this.kill ? 3 : 2; g.strokeStyle = this.kill ? `rgba(255,60,40,${0.4 + k * 0.6})` : `rgba(255,255,255,${0.3 + k * 0.7})`; g.beginPath();
      for (const [ux, uy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { g.moveTo(cx + ux * r0 * 0.7, cy + uy * r0 * 0.7); g.lineTo(cx + ux * r1 * 0.7, cy + uy * r1 * 0.7); } g.stroke(); }
    // where the blows came from: an arc round the centre, on that side
    for (const h of this.hurts) { const k = 1 - h.t / 1.4, R = 90; g.lineWidth = 9; g.strokeStyle = h.shield ? `rgba(120,200,255,${k * 0.8})` : `rgba(230,30,20,${k * 0.85})`; g.beginPath(); const a = h.a - Math.PI / 2; g.arc(cx, cy, R, a - 0.28, a + 0.28); g.stroke(); }
    // shield and health, low in the middle
    { const w = 220, x = cx - w / 2, y = H - 54; g.fillStyle = 'rgba(0,0,0,0.42)'; g.fillRect(x - 3, y - 3, w + 6, 22);
      if (st.shieldMax) { g.fillStyle = st.shield > 0 ? 'rgba(130,205,255,0.95)' : 'rgba(130,205,255,0.25)'; g.fillRect(x, y, w * Math.max(0, st.shield / st.shieldMax), 6); }
      g.fillStyle = st.hp > 35 ? 'rgba(235,235,225,0.95)' : 'rgba(240,70,50,0.95)'; g.fillRect(x, y + 9, w * Math.max(0, st.hp / 100), 7);
      for (let k = 0; k < (st.nades || 0); k++) { g.fillStyle = 'rgba(210,200,150,0.95)'; g.beginPath(); g.arc(x + w + 14 + k * 13, y + 8, 4.5, 0, 7); g.fill(); } }
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
