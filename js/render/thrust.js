// What comes out of a ship: blue jets from its engines, shaped as a flame from a nozzle is — a white-hot core, a blue plume with the
// bright knots of its shock diamonds, a faint sheath round it, longer and wider the harder it's pushed and spreading out in thin air;
// jets downward from its lift ports that hold it up when it hovers, and the steam and dust they throw off the ground; vented steam as the
// gear comes down and the hull settles on it; and when an engine's hit, its flame turns ragged and red and it trails smoke.
// The nozzles are found in the model itself: the hot throats (its 'glow' parts) facing aft, or facing down for lift.
import * as THREE from 'three';

const JET = {
  vertexShader: `#include <common>
    #include <logdepthbuf_pars_vertex>
    varying float vA; varying vec3 vN; varying vec3 vV;
    void main() { vA = -position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `#include <common>
    #include <logdepthbuf_pars_fragment>
    uniform vec3 uCore; uniform vec3 uEdge; uniform float uPower; uniform float uHeat; uniform float uTime; uniform float uDiamonds; uniform float uAlpha; uniform float uSeed;
    varying float vA; varying vec3 vN; varying vec3 vV;
    float hh(float x) { return fract(sin(x * 127.1) * 43758.5); }
    float n1(float x) { float i = floor(x), f = fract(x); return mix(hh(i), hh(i + 1.0), f * f * (3.0 - 2.0 * f)); }
    void main() {
      #include <logdepthbuf_fragment>
      float rim = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
      float along = pow(clamp(1.0 - vA, 0.0, 1.0), 1.25) * smoothstep(-0.02, 0.05, vA);
      float knots = 1.0 + uDiamonds * 1.1 * pow(abs(sin(vA * 3.14159 * 5.0 + 0.4)), 8.0) * (1.0 - vA);
      float flick = 0.82 + 0.18 * n1(uTime * 38.0 + uSeed * 9.0 + vA * 6.0) + uHeat * 0.4 * (n1(uTime * 21.0 + vA * 14.0 + uSeed) - 0.5);
      vec3 col = mix(uCore, uEdge, smoothstep(0.0, 0.55, vA));
      col = mix(col, mix(vec3(1.0, 0.55, 0.18), vec3(0.9, 0.18, 0.05), vA), uHeat);
      float a = uAlpha * rim * along * knots * flick * uPower;
      gl_FragColor = vec4(col * a, a);
    }`,
};
function jetMaterial(core, edge, alpha, diamonds, tint = false) {
  // the core adds light; the plume's colour is laid over the sky too, so it reads as blue fire in daylight and not only as glow at night
  const fs = tint ? JET.fragmentShader.replace('gl_FragColor = vec4(col * a, a);', 'gl_FragColor = vec4(col * (1.0 + a), clamp(a, 0.0, 0.8));') : JET.fragmentShader;
  return new THREE.ShaderMaterial({ vertexShader: JET.vertexShader, fragmentShader: fs, transparent: true, depthWrite: false, blending: tint ? THREE.NormalBlending : THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uCore: { value: new THREE.Color(...core) }, uEdge: { value: new THREE.Color(...edge) }, uPower: { value: 0 }, uHeat: { value: 0 }, uTime: { value: 0 }, uDiamonds: { value: diamonds }, uAlpha: { value: alpha }, uSeed: { value: Math.random() } } });
}
// a plume: radius 1 at the nozzle (y = 0), narrowing to 0.3 a unit down -y
const CONE = new THREE.CylinderGeometry(1, 0.32, 1, 24, 10, true).translate(0, -0.5, 0);
const LAYERS = [ // [radius, length, core colour, edge colour, alpha, shock diamonds, laid over (not only added)]
  [1.5, 0.75, [0.25, 0.45, 1.0], [0.1, 0.2, 0.85], 0.55, 0, true],      // the blue body of the flame
  [0.95, 1.0, [0.62, 0.82, 1.0], [0.15, 0.38, 1.0], 1.3, 1, false],    // the plume, bright knots of its shock diamonds down it
  [0.5, 0.42, [1.0, 1.0, 1.0], [0.6, 0.82, 1.0], 2.6, 0, false],       // the white-hot core
];

// Where a model's jets are: clusters of hot faces pointing out of the hull (aft for the drives, down for lift)
function nozzles(prims, L, want) {
  const pts = [];
  for (const pr of prims) {
    if (pr.slot !== 'glow') continue;
    const g = pr.geometry, P = g.attributes.position, I = g.index, n = I ? I.count : P.count, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), N = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (let k = 0; k < n; k += 3) {
      const i0 = I ? I.getX(k) : k, i1 = I ? I.getX(k + 1) : k + 1, i2 = I ? I.getX(k + 2) : k + 2;
      a.fromBufferAttribute(P, i0); b.fromBufferAttribute(P, i1); c.fromBufferAttribute(P, i2);
      N.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a)); const area = N.length() / 2; if (area < 1e-6) continue; N.normalize();
      if (N.dot(want) < 0.75) continue;
      pts.push({ p: a.clone().add(b).add(c).multiplyScalar(1 / 3), area });
    }
  }
  const cl = [];
  for (const q of pts) { const c = cl.find(c => c.p.distanceTo(q.p) < Math.max(0.6, c.r + 0.3)); if (c) { c.sum.addScaledVector(q.p, q.area); c.area += q.area; c.p = c.sum.clone().multiplyScalar(1 / c.area); c.r = Math.max(c.r, c.p.distanceTo(q.p)); } else cl.push({ p: q.p.clone(), sum: q.p.clone().multiplyScalar(q.area), area: q.area, r: 0.05 }); }
  return cl.filter(c => c.area > 0.012).map(c => ({ p: c.p, r: Math.max(0.12, Math.sqrt(c.area / Math.PI) * 1.05, c.r), dir: want.clone() }));
}

export class ThrustView {
  constructor(scene, shipView, fx) {
    this.group = new THREE.Group(); this.group.name = 'thrust'; scene.add(this.group); this.ships = shipView; this.fx = fx; this.live = new Map(); this.t = 0; this.info = {};
    this.lights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0x7fb0ff, 0, 30, 1.8); this.group.add(l); return l; });
  }
  model(model) {
    if (this.info[model]) return this.info[model];
    const M = this.ships.models[model]; if (!M) return null; const L = M.L;
    let main = nozzles(M.hullPrims, L, new THREE.Vector3(0, 0, -1)), lift = nozzles(M.hullPrims, L, new THREE.Vector3(0, -1, 0));
    if (!main.length) main = [{ p: new THREE.Vector3(L.W / 2, (L.deck + L.ceiling) / 2, 0.1), r: Math.min(L.W, L.ceiling) * 0.16, dir: new THREE.Vector3(0, 0, -1) }];
    const zmin = Math.min(...main.map(q => q.p.z)); main = main.filter(q => q.p.z < Math.min(L.D * 0.5, zmin + Math.max(2, L.D * 0.12)));     // (only the drives at the stern: not every vent down the sides)
    if (!lift.length) lift = [[0.28, 0.25], [0.72, 0.25], [0.28, 0.75], [0.72, 0.75]].map(([u, v]) => ({ p: new THREE.Vector3(L.W * u, Math.max(0.5, M.gear?.[0]?.top ?? 0.6), L.D * v), r: Math.min(L.W, L.D) * 0.06, dir: new THREE.Vector3(0, -1, 0) }));
    return this.info[model] = { main: main.slice(0, 8), lift: lift.slice(0, 6), L };
  }
  jet(holder, q) {
    const g = new THREE.Group(); g.position.copy(q.p); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), q.dir);
    const layers = LAYERS.map(([rr, ll, core, edge, al, dia, tint], k) => { const m = new THREE.Mesh(CONE, jetMaterial(core, edge, al, dia, tint)); m.frustumCulled = false; m.renderOrder = 4 + k; m.userData = { rr, ll }; g.add(m); return m; });
    holder.add(g); return { g, layers, r: q.r, q };
  }
  // list: entries as given to ShipView, with { thrust 0..2, hover 0..1, heat 0..1, vac 0..1, ground (m below), landed, id } for those that fly
  update(list, dt, origin) {
    this.t += dt; const seen = new Set(), fx = this.fx, toW = p => [p.x + origin[0], p.y + origin[1], p.z + origin[2]];
    let li = 0;
    for (const s of list) {
      if (s.thrust === undefined) continue;
      const I = this.model(s.model || 'shuttle'); if (!I) continue; seen.add(s.id);
      let E = this.live.get(s.id);
      if (!E) { const holder = new THREE.Group(); this.group.add(holder); E = { holder, main: I.main.map(q => this.jet(holder, q)), lift: I.lift.map(q => this.jet(holder, q)), wasDown: true, puff: 0, smoke: 0 }; this.live.set(s.id, E); }
      // the ship's frame, as ShipView places it
      const L = I.L; E.holder.position.set(...s.c); E.holder.quaternion.setFromEuler(new THREE.Euler(-(s.pitch || 0), s.facing, s.roll || 0, 'YXZ')); E.holder.updateMatrix();
      E.holder.position.add(new THREE.Vector3(-L.W / 2, 0, -L.D / 2).applyQuaternion(E.holder.quaternion));
      const spread = 1 + 1.8 * (s.vac || 0), P = Math.min(2, s.thrust), H = s.hover || 0;
      for (const J of E.main) for (const m of J.layers) { const u = m.material.uniforms; u.uPower.value = Math.min(1, 0.25 + 0.75 * Math.min(1, P)) * (P > 0.02 ? 1 : 0); u.uHeat.value = s.heat || 0; u.uTime.value = this.t; const len = Math.max(J.r * (11 + 24 * P), 2.5 + 7 * P) * m.userData.ll * (1 + 0.4 * (s.vac || 0)); m.scale.set(J.r * m.userData.rr * spread * (1 + 0.15 * P), len, J.r * m.userData.rr * spread * (1 + 0.15 * P)); m.visible = P > 0.02; }
      for (const J of E.lift) for (const m of J.layers) { const u = m.material.uniforms; u.uPower.value = Math.min(1, H * 1.4); u.uHeat.value = 0; u.uTime.value = this.t; m.scale.set(J.r * m.userData.rr * (1 + H * 0.3), Math.max(J.r * (6 + 12 * H), 1.2 + 3.5 * H) * m.userData.ll, J.r * m.userData.rr * (1 + H * 0.3)); m.visible = H > 0.04; }
      // light from the jets on whatever's near
      if (li < this.lights.length && (P > 0.1 || H > 0.15)) { const l = this.lights[li++], w = new THREE.Vector3(L.W / 2, 0.5, P > 0.1 ? 0 : L.D / 2).applyMatrix4(E.holder.matrixWorld.copy(new THREE.Matrix4().compose(E.holder.position, E.holder.quaternion, new THREE.Vector3(1, 1, 1)))); l.position.copy(w); l.intensity = 6 * Math.max(P, H) * (0.85 + 0.15 * Math.random()); l.color.setRGB(...(s.heat > 0.5 ? [1, 0.5, 0.25] : [0.5, 0.7, 1])); }
      if (!fx) continue;
      const Mw = new THREE.Matrix4().compose(E.holder.position, E.holder.quaternion, new THREE.Vector3(1, 1, 1)), at = v => toW(v.clone().applyMatrix4(Mw)), down = new THREE.Vector3(0, -1, 0).applyQuaternion(E.holder.quaternion);
      // the lift jets on the ground: steam and dust rolling out from under it
      if (H > 0.15 && s.ground !== undefined && s.ground < 14) for (const J of E.lift) if (Math.random() < H * dt * 26) {
        const w = at(J.q.p), gy = w[1] - s.ground - J.q.p.y, a = Math.random() * 6.283, sp = 4 + 6 * H * (1 - s.ground / 14);
        fx.put(fx.dark, w[0], gy + 0.2, w[2], Math.cos(a) * sp, 0.6 + Math.random(), Math.sin(a) * sp, 1.2 + Math.random() * 1.2, 0.8, 2.2, 0.86, 0.88, 0.9, 0.32 * (1 - s.ground / 16), 1.6, -0.4);
      }
      // the gear comes down, and when the hull settles onto it the bays vent steam
      const gear = this.ships.gearOf?.(s.id) ?? 0, moving = Math.abs(gear - (E.gear ?? gear)) > 1e-4; E.gear = gear;
      if (moving) for (const G of this.ships.models[s.model]?.gear || []) if (Math.random() < dt * 8) { const w = at(new THREE.Vector3(G.ax, G.top, G.z)); fx.put(fx.dark, w[0], w[1] - 0.1, w[2], (Math.random() - 0.5) * 1.5, -0.8 - Math.random(), (Math.random() - 0.5) * 1.5, 0.9 + Math.random() * 0.6, 0.3, 1.1, 0.92, 0.93, 0.95, 0.42, 1.2, -0.5); }
      if (s.landed && !E.wasDown) for (const G of this.ships.models[s.model]?.gear || []) { const w = at(new THREE.Vector3(G.x, 0, G.z)); for (let k = 0; k < 14; k++) { const a = Math.random() * 6.283, sp = 1.5 + Math.random() * 3; fx.put(fx.dark, w[0], w[1] + 0.3, w[2], Math.cos(a) * sp, 0.6 + Math.random() * 1.4, Math.sin(a) * sp, 1.4 + Math.random() * 1.6, 0.5, 1.6, 0.94, 0.95, 0.97, 0.5, 1.4, -0.6); } }
      E.wasDown = !!s.landed;
      // a damaged engine: smoke, then fire, out of its nozzle
      if (s.heat > 0.05) for (const J of E.main) {
        const w = at(J.q.p), back = J.q.dir.clone().applyQuaternion(E.holder.quaternion);
        if (Math.random() < dt * 30 * s.heat) fx.put(fx.dark, w[0] + back.x * J.r, w[1] + back.y * J.r, w[2] + back.z * J.r, back.x * 4, back.y * 4 + 0.8, back.z * 4, 2.5 + Math.random() * 2, J.r * 1.4, J.r * 2.2, 0.08, 0.08, 0.085, 0.55, 0.4, -0.3);
        if (s.heat > 0.55 && Math.random() < dt * 40 * s.heat) fx.put(fx.glow, w[0], w[1], w[2], back.x * 6, back.y * 6 + 1, back.z * 6, 0.25 + Math.random() * 0.3, J.r * 1.1, -J.r, 1.0, 0.42, 0.1, 0.8, 0.8, -1);
      }
    }
    for (const [id, E] of this.live) if (!seen.has(id)) { this.group.remove(E.holder); this.live.delete(id); }
    for (let i = li; i < this.lights.length; i++) this.lights[i].intensity = 0;
  }
}
