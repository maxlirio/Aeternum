// Draws the fleet. Its model is a separate download, fetched once the game is running: nobody waits for it at the door.
// At this size a tile says nothing, so the hull gets its plating here: panels of many sizes, each its own tone, with dark seams, from the ship's own coordinates.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const LIVERY = [[0.1, 0.11, 0.13], [0.62, 0.6, 0.55], [0.32, 0.12, 0.05]];   // gunmetal, ivory, oxide
function plated(base, colour) {
  const m = base.clone(); m.color = new THREE.Color(...colour); m.map = null; m.metalnessMap = null; m.roughnessMap = null; m.aoMap = null; m.normalMap = null; m.metalness = 0.25; m.roughness = 0.62;
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vShip;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvShip = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vShip;
      float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
      // one set of panels: tone of the panel you're on, and how close to its seam
      vec2 panels(vec3 q, vec3 n, float size) { vec3 a = abs(n); vec2 uv = a.x > a.y && a.x > a.z ? q.zy : a.y > a.z ? q.xz : q.xy; uv.x *= 0.62; vec2 c = floor(uv / size); uv.x += step(1.0, mod(c.y, 2.0)) * size * 0.5; c = floor(uv / size); vec2 f = fract(uv / size); float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) * size; return vec2(h31(vec3(c, size)), e); }`)
      .replace('#include <map_fragment>', `
      { vec3 nw = normalize(cross(dFdx(vShip), dFdy(vShip)));
        vec2 big = panels(vShip, nw, 46.0), mid = panels(vShip + 7.0, nw, 11.0), small = panels(vShip + 3.0, nw, 2.8); float dist = length(vViewPosition), pxSize = dist * 0.0012;
        float tone = 0.74 + 0.42 * big.x + 0.2 * (mid.x - 0.5) * (1.0 - smoothstep(600.0, 2600.0, dist)) + 0.1 * (small.x - 0.5) * (1.0 - smoothstep(80.0, 400.0, dist));
        float seam = (1.0 - 0.55 * (1.0 - smoothstep(0.12, 0.34 + pxSize, big.y))) * (1.0 - 0.34 * (1.0 - smoothstep(0.06, 0.16 + pxSize, mid.y)) * (1.0 - smoothstep(900.0, 3000.0, dist))) * (1.0 - 0.2 * (1.0 - smoothstep(0.02, 0.05 + pxSize, small.y)) * (1.0 - smoothstep(60.0, 260.0, dist)));
        float grime = 0.86 + 0.14 * h31(floor(vShip / vec3(3.0, 19.0, 3.0)));
        diffuseColor.rgb *= tone * seam * grime; }`);
  };
  return m;
}
export class CapitalView {
  constructor(scene, lib) { this.group = new THREE.Group(); this.group.name = 'fleet'; scene.add(this.group); this.lib = lib; this.models = {}; this.loading = false; }
  load() {
    if (this.loading) return; this.loading = true;
    new GLTFLoader().load('./assets/capital.glb', gltf => {
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse(o => { if (!o.isMesh) return; let top = o; while (top.parent && top.parent !== gltf.scene) top = top.parent; const kind = top.userData.kind, list = this.models[kind] || (this.models[kind] = []), slot = o.material.name, g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); list.push({ g, slot }); });
    }, undefined, e => console.warn('fleet model', e?.message || e));
  }
  update(fleet, toRender) {
    for (const C of fleet) {
      if (!this.models[C.model]) continue;
      if (!C.mesh) { C.mesh = new THREE.Group(); for (const { g, slot } of this.models[C.model]) { const base = this.lib.surface(slot === 'tint' ? 'tint-hull' : slot), mat = slot === 'tint' ? plated(base, LIVERY[C.colour % 3]) : (slot === 'heatshield' || slot === 'paint' || slot === 'metal') ? plated(base, slot === 'heatshield' ? [0.035, 0.035, 0.04] : slot === 'metal' ? [0.1, 0.105, 0.115] : [0.16, 0.17, 0.19]) : base, m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; C.mesh.add(m); } this.group.add(C.mesh); C.mesh.rotation.y = C.yaw; }
      C.mesh.position.set(...toRender(C.x, C.y, C.z));
      // the decks inside, once you're near enough to see in
      const dk = this.models[C.model + '_decks'], at = C.ship.at, r = toRender(at.c[0], at.c[1], at.c[2]);
      if (dk && !C.decks && Math.hypot(...r) < 900) { C.decks = new THREE.Group(); for (const { g, slot } of dk) { const m = new THREE.Mesh(g, this.lib.surface(slot === 'tint' ? 'tint-paint' : slot)); m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; C.decks.add(m); } C.decks.rotation.y = at.facing; this.group.add(C.decks); }
      if (C.decks) { C.decks.visible = Math.hypot(...r) < 1100; const L = C.deckW / 2, D = C.deckD / 2, c = Math.cos(at.facing), s = Math.sin(at.facing); C.decks.position.set(r[0] - (L * c + D * s), r[1], r[2] - (-L * s + D * c)); }
    }
  }
}
