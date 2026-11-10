// Faster than light, seen from behind your own ship: it hangs in a tunnel of light, streaks of it pouring past on every side, the walls
// rippling, a white point far ahead where it's going. Drawn as its own little scene (no world needed: it runs while the world you're
// leaving saves and while the one you're going to is still being built, main.js), with your ship in it, lit by the tunnel.
import * as THREE from 'three';
import { LIVERY } from './ships.js';

const WALL = {
  vertexShader: `varying vec2 vU; varying vec3 vP;
    void main() { vU = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float uT; uniform float uS; varying vec2 vU; varying vec3 vP;
    float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
    void main() {
      float a = vU.x * 6.2832, z = vU.y;
      vec2 q = vec2(vU.x * 18.0, z * 6.0 + uT * 2.4 * uS);
      float bands = n(q) * 0.6 + n(q * 2.7 + 3.1) * 0.4;
      float rip = pow(n(vec2(vU.x * 7.0 + sin(z * 9.0 + uT) * 0.3, z * 30.0 + uT * 9.0 * uS)), 3.0);
      float ends = smoothstep(0.0, 0.25, z) * smoothstep(1.0, 0.55, z);
      vec3 col = mix(vec3(0.10, 0.22, 0.75), vec3(0.55, 0.35, 1.0), n(q * 0.5 + 7.0));
      col += vec3(0.6, 0.8, 1.0) * rip * 0.9;
      float k = (0.10 + 0.55 * bands * bands + rip * 0.6) * ends * uS;
      gl_FragColor = vec4(col * k, 1.0);
    }`,
};

export class FtlTunnel {
  constructor(renderer) {
    this.renderer = renderer; this.t = 0; this.speed = 0; this.target = 1;
    const S = this.scene = new THREE.Scene(); S.background = new THREE.Color(0x01030a); S.fog = new THREE.Fog(0x01030a, 300, 900);
    this.cam = new THREE.PerspectiveCamera(62, 1, 0.2, 3000);
    // the walls: a long tube round the ship, its light rippling back past
    const tube = new THREE.CylinderGeometry(150, 150, 1600, 64, 40, true).rotateX(Math.PI / 2);
    this.wall = new THREE.Mesh(tube, new THREE.ShaderMaterial({ ...WALL, uniforms: { uT: { value: 0 }, uS: { value: 0 } }, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    S.add(this.wall);
    // streaks: thin rods of light, every one somewhere round the ship, all pouring back past it
    const N = this.N = 1400, rod = new THREE.BoxGeometry(1, 1, 1);
    this.rods = new THREE.InstancedMesh(rod, new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: true }), N);
    this.rods.frustumCulled = false; this.rods.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3); S.add(this.rods);
    this.st = Array.from({ length: N }, (_, i) => { const r = 14 + Math.pow(Math.random(), 0.7) * 125, h = Math.random(); this.rods.instanceColor.setXYZ(i, ...(h < 0.6 ? [0.55, 0.75, 1] : h < 0.85 ? [0.8, 0.9, 1] : [0.7, 0.5, 1]).map(v => v * (0.5 + Math.random() * 0.8))); return { a: Math.random() * 6.2832, r, z: (Math.random() - 0.5) * 1400, w: 0.06 + Math.random() * 0.14, v: 0.7 + Math.random() * 0.6 }; });
    // where it's going: a white point far ahead, and its haze
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(200,225,255,0.9)'); gr.addColorStop(0.4, 'rgba(90,130,255,0.25)'); gr.addColorStop(1, 'rgba(40,60,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    this.eye = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true })); this.eye.position.set(0, 0, 800); this.eye.scale.set(420, 420, 1); S.add(this.eye);
    // the tunnel's light on the hull: cold from all round, brighter from ahead, and the drives' blue behind
    S.add(new THREE.HemisphereLight(0x6f8cff, 0x1a1040, 1.1));
    this.key = new THREE.DirectionalLight(0xcfe0ff, 2.2); this.key.position.set(0.3, 0.6, 1); S.add(this.key);
    this.rim = new THREE.DirectionalLight(0x8a6cff, 1.4); this.rim.position.set(-0.6, -0.3, -1); S.add(this.rim);
    this.flick = new THREE.PointLight(0x9fc4ff, 0, 60, 1.6); S.add(this.flick);
    this.drive = new THREE.PointLight(0x5f8fff, 8, 40, 1.8); S.add(this.drive);
    this.shipG = new THREE.Group(); S.add(this.shipG); this.L = { W: 8, D: 16, H: 4 };
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3();
  }
  // your ship, as drawn in the world (render/ships.js), its livery and all
  ship(shipView, model, colour = 0) {
    const M = shipView?.models?.[model] || shipView?.models?.shuttle; if (!M) return;
    this.shipG.clear(); const L = M.L, col = LIVERY[(((colour | 0) % LIVERY.length) + LIVERY.length) % LIVERY.length], body = new THREE.Group(), h = M.hinge;
    body.position.set(-L.W / 2, -(L.ceiling ?? 3) / 2, -L.D / 2); this.shipG.add(body);
    const up = new THREE.Matrix4().makeTranslation(h.x, h.y, h.z).multiply(new THREE.Matrix4().makeRotationFromQuaternion(M.raise)).multiply(new THREE.Matrix4().makeTranslation(-h.x, -h.y, -h.z));     // (the ramp, up and shut in flight)
    for (const [list, ramp] of [[M.hull, false], [M.ramp, true]]) for (const { im, tinted } of list) {
      const m = im.material.clone(); if (tinted) m.color = m.color.clone().multiply(new THREE.Color(col[0], col[1], col[2]));
      const me = new THREE.Mesh(im.geometry, m); me.frustumCulled = false; if (ramp) { me.matrixAutoUpdate = false; me.matrix.copy(up); } body.add(me);
    }
    this.L = { W: L.W, D: L.D, H: (L.ceiling ?? 3) + 1 };
    this.drive.position.set(0, 0, -L.D / 2 - 2);
  }
  render(dt) {
    const R = this.renderer, cv = R.domElement, w = cv.clientWidth || innerWidth, h = cv.clientHeight || innerHeight;
    if (Math.abs(this.cam.aspect - w / h) > 1e-3) { this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
    this.t += dt; this.speed += (this.target - this.speed) * Math.min(1, dt * (this.target > this.speed ? 0.9 : 2.5));
    const t = this.t, sp = this.speed, V = 60 + 1500 * sp * sp;
    this.wall.material.uniforms.uT.value = t; this.wall.material.uniforms.uS.value = Math.min(1, sp * 1.2); this.wall.rotation.z = t * 0.12;
    // the rods: back past the ship, longer the faster it goes
    const len = 0.8 + 90 * sp * sp;
    for (let i = 0; i < this.N; i++) {
      const s = this.st[i]; s.z -= V * s.v * dt; if (s.z < -700) { s.z += 1400; s.a = Math.random() * 6.2832; }
      const r = s.r * (1 - 0.25 * sp * Math.max(0, s.z) / 700);      // (the tunnel narrowing to its point ahead)
      this._p.set(Math.cos(s.a + t * 0.12) * r, Math.sin(s.a + t * 0.12) * r, s.z); this._s.set(s.w, s.w, len * s.v);
      this._m.compose(this._p, this._q.identity(), this._s); this.rods.setMatrixAt(i, this._m);
    }
    this.rods.instanceMatrix.needsUpdate = true; this.rods.material.opacity = Math.min(1, 0.25 + sp);
    this.eye.material.opacity = 0.35 + 0.65 * sp; const pulse = 1 + 0.06 * Math.sin(t * 7); this.eye.scale.set(420 * pulse * (0.6 + 0.4 * sp), 420 * pulse * (0.6 + 0.4 * sp), 1);
    // the ship rides it: a slow sway, a shudder that grows with speed
    const sh = 0.004 + 0.01 * sp;
    this.shipG.rotation.set(Math.sin(t * 0.7) * 0.03 + (Math.random() - 0.5) * sh, 0, Math.sin(t * 0.43) * 0.06 + (Math.random() - 0.5) * sh);
    this.shipG.position.set(Math.sin(t * 0.31) * 0.5, Math.sin(t * 0.53) * 0.35, 0);
    this.flick.position.set(Math.sin(t * 3.1) * 12, Math.cos(t * 2.3) * 10, 10 + Math.sin(t * 5) * 8); this.flick.intensity = 10 * sp * (0.6 + 0.4 * Math.random());
    this.drive.intensity = 6 + 10 * sp;
    // the eye: behind and a little above it, looking along it to the point ahead
    const L = this.L, back = Math.max(14, L.D * 1.55), up = Math.max(3.5, L.H * 0.9 + L.W * 0.18);
    this.cam.position.set(Math.sin(t * 0.21) * L.W * 0.12, up + Math.sin(t * 0.37) * 0.3, -back);
    this.cam.lookAt(0, up * 0.25, L.D * 0.6 + 60); this.cam.rotateZ(Math.sin(t * 0.43) * 0.02);
    const tm = R.toneMappingExposure; R.toneMappingExposure = 1; R.render(this.scene, this.cam); R.toneMappingExposure = tm;
  }
  dispose() {
    this.scene.traverse(o => { if (o === this.wall || o === this.rods || o === this.eye) { o.geometry?.dispose(); o.material.map?.dispose?.(); o.material.dispose(); } });
    this.shipG.traverse(q => q.material?.dispose?.());
  }
}

// a white flash over everything, fading out: the moment of going in, or of coming out
export function ftlFlash(ms = 700, peak = 1) {
  const d = document.createElement('div'); d.style.cssText = `position:fixed;inset:0;z-index:80;pointer-events:none;background:#eef6ff;opacity:${peak};transition:opacity ${ms}ms ease-out`;
  document.body.append(d); requestAnimationFrame(() => requestAnimationFrame(() => { d.style.opacity = '0'; })); setTimeout(() => d.remove(), ms + 100);
}

// before there's a renderer: the same streaks drawn flat on a canvas, so the page shows the tunnel from its first moment (main.js boot)
export function ftlStreaks() {
  const cv = document.createElement('canvas'); cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:70;pointer-events:none;background:#01030a'; document.body.append(cv);
  const g = cv.getContext('2d'), d = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight; cv.width = W * d; cv.height = H * d; g.scale(d, d);
  const st = Array.from({ length: 700 }, () => ({ a: Math.random() * 6.283, r: Math.random() ** 0.5 * Math.hypot(W, H) / 2 + 4, h: 205 + Math.random() * 50 })); let on = true;
  const step = () => {
    if (!on) return; g.fillStyle = 'rgba(1,3,10,0.5)'; g.fillRect(0, 0, W, H);
    for (const s of st) { s.r *= 1.06; if (s.r > Math.hypot(W, H)) s.r = 4 + Math.random() * 40; const len = 4 + s.r * 0.25, x = W / 2 + Math.cos(s.a) * s.r, y = H / 2 + Math.sin(s.a) * s.r;
      g.strokeStyle = `hsla(${s.h},90%,82%,0.85)`; g.lineWidth = 0.6 + s.r / 600; g.beginPath(); g.moveTo(x, y); g.lineTo(x - Math.cos(s.a) * len, y - Math.sin(s.a) * len); g.stroke(); }
    requestAnimationFrame(step);
  };
  step(); return { stop() { on = false; cv.style.transition = 'opacity 400ms'; cv.style.opacity = '0'; setTimeout(() => cv.remove(), 450); } };
}
