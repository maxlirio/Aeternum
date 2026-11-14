// Sound, made on the spot with Web Audio (no recordings to license): the pulse carbine's crack and whine, other men's shots
// out across the field (quieter, duller and later the further off: sound comes at 343 m/s), the snap of a round going past
// your head, the tick that tells you a hit landed, a blow taken, and blasts that roll in after their flash.
// Each sound is placed: panned to where it came from against the way the camera faces.
const C = 343;
export class Sound {
  constructor() { this.ctx = null; this.master = null; this.noiseBuf = null; this.voices = 0; this.ear = { pos: [0, 0, 0], yaw: 0 }; }
  // browsers only let sound start from a click or key: called from the first one
  wake() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    const X = this.ctx; this.master = X.createDynamicsCompressor(); this.master.threshold.value = -14; this.master.ratio.value = 6; this.master.connect(X.destination);
    this.out = X.createGain(); this.out.gain.value = 0.8; this.out.connect(this.master);
    const n = X.sampleRate * 1.5, b = X.createBuffer(1, n, X.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this.noiseBuf = b;
  }
  listen(pos, yaw) { this.ear.pos = pos; this.ear.yaw = yaw; }
  // where p is from the ear: distance, and pan (-1 left .. 1 right)
  place(p) { const E = this.ear, dx = p[0] - E.pos[0], dz = p[2] - E.pos[2], d = Math.hypot(dx, p[1] - E.pos[1], dz) || 0.01;
    const fx = Math.sin(E.yaw), fz = Math.cos(E.yaw), rx = -fz, rz = fx; return { d, pan: Math.max(-1, Math.min(1, (dx * rx + dz * rz) / Math.max(1, Math.hypot(dx, dz)))) }; }
  ok() { return this.ctx && this.ctx.state === 'running' && this.voices < 40; }
  // one voice: source → filter → gain envelope → pan → out, started `delay` s from now, freed when done
  chain(delay, pan, vol, len) {
    const X = this.ctx, t = X.currentTime + delay, g = X.createGain(), p = X.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.out);
    g.gain.value = 1; this.voices++; setTimeout(() => { this.voices--; try { p.disconnect(); } catch { } }, (delay + len + 0.1) * 1000);
    return { t, g, vol };
  }
  noise(at, { len, f0, f1 = f0, q = 0.8, type = 'bandpass', vol, attack = 0.002 }, dest) {
    const X = this.ctx, s = X.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = X.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, at); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + len);
    const g = X.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + attack); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    s.connect(f); f.connect(g); g.connect(dest); s.start(at, Math.random()); s.stop(at + len + 0.05);
  }
  tone(at, { len, f0, f1 = f0, type = 'sine', vol, attack = 0.002 }, dest) {
    const X = this.ctx, o = X.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + len);
    const g = X.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + attack); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g); g.connect(dest); o.start(at); o.stop(at + len + 0.05);
  }
  // a pulse weapon going off at p (yours: p null, right by your ear). Far off it's a dull thump: the air takes the top off it
  shot(p = null, { energy = true, heavy = false } = {}) {
    if (!this.ok()) return; const P = p ? this.place(p) : { d: 1, pan: 0 }, far = Math.min(1, P.d / 400), vol = Math.min(1, 7 / (P.d + 6)) * (p ? 0.8 : 0.55);
    if (vol < 0.012) return; const v = this.chain(p ? P.d / C : 0, P.pan, vol, 0.8), dst = v.g;
    const top = 9000 * (1 - far * 0.85);
    this.noise(v.t, { len: 0.09 + far * 0.25, f0: top, f1: 400, type: 'lowpass', q: 0.5, vol: vol * (heavy ? 1.3 : 1) }, dst);         // the crack
    this.noise(v.t, { len: 0.35 + far * 0.6, f0: 220, f1: 60, type: 'lowpass', q: 0.7, vol: vol * 0.7, attack: 0.004 }, dst);           // the body of it, and the field throwing it back
    if (energy && P.d < 150) this.tone(v.t, { len: 0.16, f0: 2400 * (0.9 + Math.random() * 0.2), f1: 380, type: 'sawtooth', vol: vol * 0.16 * (1 - P.d / 150) }, dst);      // the pulse's whine
  }
  // a round passing close: a sharp snap, with no thump (that comes later, from the gun)
  crack(p) {
    if (!this.ok()) return; const P = this.place(p), v = this.chain(0, P.pan, 0.5, 0.2);
    this.noise(v.t, { len: 0.05, f0: 5000, f1: 2500, type: 'highpass', q: 0.6, vol: 0.45 }, v.g);
    this.tone(v.t, { len: 0.12, f0: 1700, f1: 700, type: 'triangle', vol: 0.08 }, v.g);
  }
  // your round landed: a short bright tick; put him down: a lower double knock
  hit(kill = false) {
    if (!this.ok()) return; const v = this.chain(0, 0, 0.5, 0.3);
    this.tone(v.t + 0.02, { len: 0.05, f0: kill ? 900 : 2100, f1: kill ? 700 : 1900, type: 'square', vol: 0.07 }, v.g);
    if (kill) { this.tone(v.t + 0.1, { len: 0.09, f0: 620, f1: 420, type: 'square', vol: 0.07 }, v.g); this.noise(v.t + 0.02, { len: 0.12, f0: 300, f1: 120, type: 'lowpass', vol: 0.2 }, v.g); }
  }
  // you're hit: a thump through the body; the shield going: a fizz
  hurt(shield = false) {
    if (!this.ok()) return; const v = this.chain(0, (Math.random() - 0.5) * 0.4, 0.6, 0.5);
    if (shield) { this.noise(v.t, { len: 0.22, f0: 3800, f1: 900, type: 'bandpass', q: 3, vol: 0.25 }, v.g); this.tone(v.t, { len: 0.2, f0: 520, f1: 260, type: 'sine', vol: 0.12 }, v.g); return; }
    this.tone(v.t, { len: 0.22, f0: 110, f1: 45, type: 'sine', vol: 0.55 }, v.g); this.noise(v.t, { len: 0.12, f0: 900, f1: 200, type: 'lowpass', vol: 0.35 }, v.g);
  }
  shieldDown() { if (!this.ok()) return; const v = this.chain(0, 0, 0.5, 0.6); this.tone(v.t, { len: 0.5, f0: 900, f1: 120, type: 'sawtooth', vol: 0.09 }, v.g); this.noise(v.t, { len: 0.4, f0: 2000, f1: 200, type: 'bandpass', q: 2, vol: 0.2 }, v.g); }
  shieldUp() { if (!this.ok()) return; const v = this.chain(0, 0, 0.3, 0.5); this.tone(v.t, { len: 0.4, f0: 300, f1: 1100, type: 'sine', vol: 0.06 }, v.g); }
  // a blast: the flash first, then the bang when the sound's crossed the distance; far off it's all rumble
  boom(p, R = 6) {
    if (!this.ok()) return; const P = this.place(p), vol = Math.min(1, R * 6 / (P.d + 10)), far = Math.min(1, P.d / 1500); if (vol < 0.01) return;
    const v = this.chain(P.d / C, P.pan, vol, 2.6);
    this.noise(v.t, { len: 0.25 + far * 0.4, f0: 4000 * (1 - far * 0.9), f1: 200, type: 'lowpass', q: 0.5, vol }, v.g);
    this.noise(v.t, { len: 1.6 + far, f0: 160, f1: 30, type: 'lowpass', q: 0.9, vol: vol * 0.9, attack: 0.01 }, v.g);
    this.tone(v.t, { len: 0.7, f0: 70, f1: 28, type: 'sine', vol: vol * 0.7 }, v.g);
  }
  // small things: picking something up, a pin pulled
  blip(f = 880) { if (!this.ok()) return; const v = this.chain(0, 0, 0.3, 0.3); this.tone(v.t, { len: 0.08, f0: f, f1: f * 1.5, type: 'triangle', vol: 0.12 }, v.g); this.tone(v.t + 0.08, { len: 0.1, f0: f * 1.5, f1: f * 2, type: 'triangle', vol: 0.1 }, v.g); }
  clink(p) { if (!this.ok()) return; const P = this.place(p), vol = Math.min(0.4, 4 / (P.d + 4)); if (vol < 0.02) return; const v = this.chain(0, P.pan, vol, 0.3); this.tone(v.t, { len: 0.12, f0: 3200, f1: 3000, type: 'triangle', vol: vol * 0.4 }, v.g); this.noise(v.t, { len: 0.06, f0: 4000, type: 'highpass', vol: vol * 0.3 }, v.g); }
}
