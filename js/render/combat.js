// What air combat looks like: tracers, missiles with smoke trails, explosions, flares,
// burning wrecks' smoke. Reads AirWar's plain state each frame; draws in render space.
import * as THREE from 'three';

export class CombatView {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.name = 'combat'; scene.add(this.group);
    const line = (n, color, opacity) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3)); const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })); l.frustumCulled = false; this.group.add(l); return l; };
    this.tracers = line(2000, 0xffd27a, 0.95);
    this.trails = line(4000, 0xd8d8d8, 0.55);
    const sphere = new THREE.SphereGeometry(1, 12, 8), cap = 400;
    this.fire = new THREE.InstancedMesh(sphere, new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }), cap);
    // smoke: soft, ragged billboards facing you, not shaded balls
    const sc = document.createElement('canvas'); sc.width = sc.height = 128; { const g = sc.getContext('2d'); for (let k = 0; k < 22; k++) { const x = 64 + (Math.random() - 0.5) * 50, y = 64 + (Math.random() - 0.5) * 50, r = 14 + Math.random() * 26, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.42)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); } }
    const smokeMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), color: 0x45413d, transparent: true, opacity: 0.85, depthWrite: false });
    smokeMat.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); float sc = length(instanceMatrix[0].xyz); mvPosition.xy += position.xy * sc * 2.2; gl_Position = projectionMatrix * mvPosition;`); };
    this.smoke = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), smokeMat, cap);
    this.mis = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, emissive: 0xff9040, emissiveIntensity: 0.4 }), 200);
    for (const m of [this.fire, this.smoke, this.mis]) { m.frustumCulled = false; m.count = 0; this.group.add(m); }
    this.light = new THREE.PointLight(0xffa050, 0, 600, 2); this.group.add(this.light);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
  }
  update(war, toRender) {
    // tracers: a short streak behind each round
    let pa = this.tracers.geometry.attributes.position.array, n = 0;
    for (const r of war.rounds) { if (n >= 2000) break; const a = toRender(...r.p), b = toRender(r.p[0] - r.v[0] * 0.025, r.p[1] - r.v[1] * 0.025, r.p[2] - r.v[2] * 0.025); pa.set([...a, ...b], n * 6); n++; }
    this.tracers.geometry.setDrawRange(0, n * 2); this.tracers.geometry.attributes.position.needsUpdate = true;
    // missiles and their smoke
    pa = this.trails.geometry.attributes.position.array; n = 0; let k = 0;
    for (const m of war.missiles) {
      const p = toRender(...m.p); this._v.set(m.v[0], m.v[1], m.v[2]).normalize(); this._q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this._v);
      if (k < 200) { this._m.compose(new THREE.Vector3(...p), this._q, this._s.set(1, 1, 1)); this.mis.setMatrixAt(k++, this._m); }
      for (let i = 1; i < m.trail.length && n < 4000; i++) { pa.set([...toRender(...m.trail[i - 1]), ...toRender(...m.trail[i])], n * 6); n++; }
    }
    this.mis.count = k; this.mis.instanceMatrix.needsUpdate = true;
    this.trails.geometry.setDrawRange(0, n * 2); this.trails.geometry.attributes.position.needsUpdate = true;
    // explosions, sparks, flares; smoke
    let f = 0, sm = 0, bright = 0, bp = null;
    for (const b of war.booms) {
      const p = toRender(...b.p);
      if (b.smoke) { const r = 3 + b.t * 4; this._m.compose(new THREE.Vector3(p[0], p[1] + b.t * 3, p[2]), this._q.identity(), this._s.set(r, r, r)); if (sm < 400) this.smoke.setMatrixAt(sm++, this._m); continue; }
      const life = b.big ? 2.5 : b.flare ? 3 : 0.6, k2 = b.t / life;
      const r = b.flare ? 0.8 : b.spark ? 1.2 : b.big ? 6 + 26 * Math.sqrt(k2) : 2 + 5 * k2;
      this._m.compose(new THREE.Vector3(...p), this._q.identity(), this._s.set(r, r, r)); if (f < 400) this.fire.setMatrixAt(f++, this._m);
      if (b.big && b.t < 0.6) { bright = Math.max(bright, 1 - b.t / 0.6); bp = p; }
      if (b.big && sm < 400) { const rr = 4 + 18 * k2; this._m.compose(new THREE.Vector3(p[0], p[1] + 4 * b.t, p[2]), this._q.identity(), this._s.set(rr, rr, rr)); this.smoke.setMatrixAt(sm++, this._m); }
    }
    this.fire.count = f; this.fire.instanceMatrix.needsUpdate = true; this.smoke.count = sm; this.smoke.instanceMatrix.needsUpdate = true;
    if (bp) this.light.position.set(...bp); this.light.intensity = bright * 4e4;
  }
}
