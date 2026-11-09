// The Meridian's rings from inside (gen/rings.js): the model bent round the axle (tools/assets/ring_kit.py), the planet's own trees standing
// on its floor, all of it turning. And the bend itself for whatever is in there with you: a point on the flat strip the collision world walks
// → where it is in the turning ring, and which way is up there.
import * as THREE from 'three';
import { gltfLoader, bakedPart } from './gltf.js';
import { RINGS, ringLayout, ringTurn, W } from '../gen/rings.js';
import { plantSet } from '../gen/flora.js';

// Lit from inside: the sunline down the crown is the ring's sun (its daylight follows the hours at home), what comes in at the glass, a glow
// off the floor, lamps at night. Directions are the ring's own, read from where each surface is: the sun outside means nothing in here.
function ringLit(base, g, U, inst = false) {
  const m = base.clone();
  m.onBeforeCompile = sh => {
    sh.uniforms.uDay = U.day; sh.uniforms.uGlass = U.glass;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRing; varying vec3 vRingN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      ${inst ? 'vRing = (instanceMatrix * vec4(position, 1.0)).xyz; vRingN = normalize(mat3(instanceMatrix) * objectNormal);' : 'vRing = position; vRingN = objectNormal;'}`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRing; varying vec3 vRingN; uniform float uDay; uniform float uGlass;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      { float rad = length(vRing.xy); vec2 out2 = vRing.xy / max(rad, 1.0); vec3 up = vec3(-out2, 0.0); float h = ${g.Rf.toFixed(2)} - rad;
        vec3 sun = vec3(out2 * ${(g.Rf - 31.4).toFixed(2)}, 0.0) - vRing; float sd = length(sun); sun /= sd;
        vec3 n = normalize(gl_FrontFacing ? vRingN : -vRingN);
        float key = max(dot(n, sun), 0.0) * (0.25 + 0.95 * uDay), sky = (0.5 + 0.5 * dot(n, up)) * (0.2 + 0.45 * uDay) * (0.6 + 0.6 * uGlass);
        float bounce = max(-dot(n, up), 0.0) * 0.12 * (0.3 + uDay), dusk = (1.0 - uDay) * (1.0 - smoothstep(0.0, 9.0, h)) * 0.35;
        vec3 lit = vec3(1.0, 0.96, 0.88) * key + vec3(0.62, 0.72, 0.9) * sky + vec3(0.9, 0.8, 0.6) * bounce + vec3(1.0, 0.72, 0.42) * dusk + 0.07;
        reflectedLight.directDiffuse = vec3(0.0); reflectedLight.directSpecular *= 0.0;
        reflectedLight.indirectDiffuse = diffuseColor.rgb * lit; reflectedLight.indirectSpecular *= 0.25 + 0.5 * uDay; }`);
  };
  m.customProgramCacheKey = () => 'ring-' + g.key + (inst ? '-i' : '') + base.uuid;
  return m;
}
const COL = { thatch: [0.76, 0.64, 0.3], corrugated: [0.6, 0.62, 0.6], render: [0.86, 0.8, 0.68], ceramic: [0.56, 0.7, 0.72], laminate: [0.78, 0.52, 0.46], plastic: [0.84, 0.68, 0.36], tint: [0.56, 0.64, 0.52], paint: [0.24, 0.27, 0.3], metal: [0.42, 0.43, 0.45], fabric: [0.78, 0.74, 0.66] };
const FLOWER = { neonpink: [0.86, 0.36, 0.55], neonamber: [0.95, 0.66, 0.2], neonviolet: [0.5, 0.36, 0.8], neoncyan: [0.4, 0.75, 0.85], neongreen: [0.5, 0.8, 0.35], hazard: [0.95, 0.85, 0.3], navwhite: [0.95, 0.93, 0.9] };

export class RingView {
  constructor(scene, lib, planet, flora) {
    this.group = new THREE.Group(); this.group.name = 'rings'; this.group.visible = false; scene.add(this.group);
    this.lib = lib; this.planet = planet; this.flora = flora; this.models = null; this.loading = false; this.built = false;
    this.U = { day: { value: 1 }, glass: { value: 0 } }; this.spin = [];
  }
  load() {
    if (this.loading) return; this.loading = true;
    gltfLoader().load('./assets/rings.glb', gltf => {
      gltf.scene.updateMatrixWorld(true); const M = {};
      gltf.scene.traverse(o => { if (!o.isMesh) return; let top = o; while (top.parent && top.parent !== gltf.scene) top = top.parent; const k = top.userData.kind; (M[k] ||= []).push({ g: bakedPart(o), slot: o.material.name }); });
      this.models = M;
    }, undefined, e => console.warn('rings model', e?.message || e));
  }
  material(slot, g) {
    const U = { day: this.U.day, glass: { value: g.kind === 'garden' ? 1 : g.kind === 'farm' ? 0.3 : 0.4 } }, plain = c => new THREE.MeshStandardMaterial({ color: new THREE.Color(...c), roughness: 0.8, metalness: slot === 'metal' ? 0.5 : 0.05 });
    if (slot === 'navwhite' && g.kind !== 'garden') { const m = new THREE.MeshBasicMaterial({ color: 0xfff4e0 }); m.onBeforeRender = () => m.color.setRGB(0.35 + 0.75 * this.U.day.value, 0.32 + 0.7 * this.U.day.value, 0.28 + 0.62 * this.U.day.value); return m; }
    if (slot === 'lampwarm') { const m = new THREE.MeshStandardMaterial({ color: 0x1a1612, emissive: 0xffd9a0, emissiveIntensity: 1.5, roughness: 0.5 }); m.onBeforeRender = () => { m.emissiveIntensity = 0.6 + 2.2 * (1 - this.U.day.value); }; return m; }
    if (/^neon/.test(slot) && (g.kind === 'town' || g.kind === 'farm')) return this.lib.surface(slot);
    if (slot === 'glass') return new THREE.MeshPhysicalMaterial({ color: 0xcfe4ee, roughness: 0.05, metalness: 0, transparent: true, opacity: g.kind === 'garden' ? 0.12 : 0.22, depthWrite: false, side: THREE.DoubleSide });
    if (slot === 'visor') return ringLit(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.05, 0.09, 0.1), roughness: 0.08, metalness: 0.3, envMapIntensity: 0.45 }), g, U);
    if (slot === 'screen') return this.lib.surface('screen');
    const c = COL[slot] || (g.kind === 'garden' && FLOWER[slot]) || (FLOWER[slot] && g.kind !== 'garden' ? null : null);
    return ringLit(c ? plain(c) : FLOWER[slot] ? plain(FLOWER[slot]) : this.lib.surface(slot), g, U);
  }
  build(fleetC) {
    this.built = true;
    for (const g of RINGS) {
      const list = this.models['ring_' + g.key]; if (!list) continue;
      const turn = new THREE.Group(); turn.position.set(0, 0, g.z); turn.name = 'ring-' + g.key;
      const mats = {}; for (const { g: geo, slot } of list) { geo.computeBoundingSphere(); const m = new THREE.Mesh(geo, mats[slot] ||= this.material(slot, g)); m.frustumCulled = true; m.castShadow = false; m.receiveShadow = false; if (slot === 'glass') m.renderOrder = 2; turn.add(m); }
      this.trees(g, turn);
      this.group.add(turn); this.spin.push({ g, turn });
      turn.visible = false;
    }
  }
  // The planet's own trees, shrubs and ferns, standing up off the curved floor (up is toward the axle)
  trees(g, turn) {
    const F = this.flora; if (!F?.kinds) return;
    const set = plantSet(this.planet).filter(sp => F.kinds[sp]), L = ringLayout(g), by = {};
    for (const it of L.items) {
      if (it.t !== 'tree' && it.t !== 'shrub' && it.t !== 'fern') continue;
      const sp = it.t === 'tree' ? set[it.k % set.length] : it.t; if (!sp || !F.kinds[sp]) continue; (by[sp] ||= []).push(it);
    }
    const U = { day: this.U.day, glass: { value: g.kind === 'garden' ? 1 : 0.4 } }, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), c = new THREE.Color(), Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0);
    for (const [sp, list] of Object.entries(by)) {
      const K = F.kinds[sp], [Lx, Dz, H] = K.dims;
      for (const P of K.prims) {
        const im = new THREE.InstancedMesh(P.pr.geometry, ringLit(P.pr.material, g, U, true), list.length); im.frustumCulled = false;
        if (P.leafy) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
        list.forEach((it, i) => {
          const a = it.s / g.Rf, rho = g.Rf, k = (it.k % 1000) / 1000, sc = it.h / H, sx = sc * (0.85 + 0.3 * k);
          q.setFromAxisAngle(Z, a).multiply(q2.setFromAxisAngle(Y, k * 6.283));
          m4.compose(new THREE.Vector3(rho * Math.sin(a), -rho * Math.cos(a) + 0, W / 2 - it.x), q, new THREE.Vector3(sx, sc, sx)).multiply(new THREE.Matrix4().makeTranslation(-Lx / 2, -0.05 / sc, -Dz / 2));
          im.setMatrixAt(i, m4); if (P.leafy) { F.leafColour(sp, k, c); im.setColorAt(i, c); }
        });
        turn.add(im);
      }
    }
  }
  // C: the Meridian (gen/capital.js fleet entry). day: 0 night .. 1 noon at home.
  // inside: the ring you're in (gen/rings.js key), or null outside, where only the glazed one shows anything through its skin
  update(C, t, toRender, eye, day, inside = null) {
    if (!C) return;
    const r = toRender(C.x, C.y, C.z), far = Math.hypot(r[0] - eye.x, r[1] - eye.y, r[2] - eye.z);
    if (far < 3500) this.load();
    this.group.visible = far < 2600 && !!this.models;
    if (!this.group.visible) return;
    if (!this.built) this.build(C);
    this.U.day.value = day;
    this.group.position.set(r[0], r[1], r[2]); this.group.rotation.set(0, C.yaw, 0);
    for (const { g, turn } of this.spin) { turn.rotation.z = ringTurn(g, t); turn.visible = inside ? inside === g.key : g.kind === 'garden' && far < 1800; }
  }
}

// ---- the bend, for what's in there with you
// b: the ring's structure in the collision world (its plan.ring is the ring), C: the Meridian. Fills `out` (a Matrix4, render space) with the
// rigid move that takes the flat strip near (x, y, z) to where that piece of floor is in the turning ring.
const _E = new THREE.Matrix4(), _F = new THREE.Matrix4(), _T = new THREE.Matrix4();
export function bendAt(world, b, C, t, x, y, z, toRender, out) {
  const g = b.plan.ring, [lx, lz] = world.toB(b, x, z), h = y - b.base, a = lz / g.Rf + ringTurn(g, t), rho = g.Rf - h, sa = Math.sin(a), ca = Math.cos(a), cy = Math.cos(C.yaw), sy = Math.sin(C.yaw);
  const ship = (X, Y, Zs) => [C.x + X * cy + Zs * sy, C.y + Y, C.z - X * sy + Zs * cy], dir = (X, Y, Zs) => [X * cy + Zs * sy, Y, -X * sy + Zs * cy];
  const P = ship(rho * sa, -rho * ca, g.z + W / 2 - lx), ex = dir(0, 0, -1), ey = dir(-sa, ca, 0), ez = dir(ca, sa, 0);
  const fx = world.fromBVec(b, 1, 0), fz = world.fromBVec(b, 0, 1);
  _E.set(ex[0], ey[0], ez[0], 0, ex[1], ey[1], ez[1], 0, ex[2], ey[2], ez[2], 0, 0, 0, 0, 1);
  _F.set(fx[0], 0, fz[0], 0, 0, 1, 0, 0, fx[1], 0, fz[1], 0, 0, 0, 0, 1).transpose();
  const pr = toRender(...P), fr = toRender(x, y, z);
  out.makeTranslation(pr[0], pr[1], pr[2]).multiply(_E).multiply(_F).multiply(_T.makeTranslation(-fr[0], -fr[1], -fr[2]));
  return out;
}
