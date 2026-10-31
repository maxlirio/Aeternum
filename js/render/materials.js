// Shared PBR materials. Geometry carries UVs in metres; each material scales its
// texture to the physical size it represents, so all surfaces have consistent texel
// density. Per-building colour variation rides on vertex colours, keeping one material
// (one draw call per mesh cell) per surface kind.
import * as THREE from 'three';
import { texture } from './textures.js';

function scaled(name, metres) {
  const t = texture(name);
  const c = {};
  for (const k of ['map', 'normalMap', 'roughnessMap']) { c[k] = t[k].clone(); c[k].repeat.set(1 / metres, 1 / metres); c[k].needsUpdate = true; }
  return c;
}

function std(tex, metres, o = {}) {
  const m = new THREE.MeshStandardMaterial({ ...scaled(tex, metres), ...o });
  if (o.normalScale) m.normalScale = new THREE.Vector2(o.normalScale, o.normalScale);
  return m;
}

// Window glass: reflective by day; at night individual windows light up according to
// building occupancy by hour (uniform per building type) and a per-window threshold.
export const WINDOW_TYPES = ['hab', 'house', 'office', 'store', 'workshop', 'hangar'];
export const occupancy = { value: new Float32Array(6) };

function glassMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0x2a3540, roughness: 0.06, metalness: 0.85, envMapIntensity: 1.2 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uOcc = occupancy;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aLit;\nvarying float vLit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLit = aLit;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uOcc[6];\nvarying float vLit;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        int wi = int(floor(vLit)); float th = fract(vLit); float occ = 0.0;
        for (int i = 0; i < 6; i++) if (i == wi) occ = uOcc[i];
        float on = step(th, occ);
        totalEmissiveRadiance += on * mix(vec3(1.0, 0.72, 0.42), vec3(0.75, 0.86, 1.0), step(0.83, th)) * 2.2;
        diffuseColor.rgb *= 1.0 - on * 0.7;`);
  };
  return m;
}

let M = null;
export function materials() {
  if (M) return M;
  M = {
    panels: std('panels', 3.2, { vertexColors: true }),
    corrugated: std('corrugated', 2.4, { vertexColors: true, metalness: 0.6 }),
    concrete: std('concrete', 4, { vertexColors: true }),
    trim: std('metal', 2, { color: 0x6b7178, metalness: 0.8 }),
    darkTrim: std('metal', 2, { color: 0x3c4148, metalness: 0.6 }),
    glass: glassMaterial(),
    asphalt: std('asphalt', 6),
    pavers: std('pavers', 4),
    marking: new THREE.MeshStandardMaterial({ color: 0xd9d4c4, roughness: 0.7 }),
    plaster: std('plaster', 3, { vertexColors: true }),
    tiles: std('tiles', 4, { vertexColors: true }),
    fabric: std('fabric', 1, { vertexColors: true }),
    wood: std('wood', 1.5, { vertexColors: true }),
    metal: std('metal', 1.5, { vertexColors: true, metalness: 0.6 }),
    door: std('metal', 2, { color: 0x8a9096, metalness: 0.7, roughness: 0.4 }),
    doorLocked: std('metal', 2, { color: 0x8a6a3c, metalness: 0.7, roughness: 0.4 }),
    lightPanel: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2dd, emissiveIntensity: 1.6, roughness: 0.4 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x0a1418, emissive: 0x3aa6c8, emissiveIntensity: 0.9, roughness: 0.2 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd7a0, emissiveIntensity: 0 }),
  };
  return M;
}
