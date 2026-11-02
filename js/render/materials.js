// Shared PBR materials. Geometry carries UVs in metres; each material scales its
// texture to the physical size it represents, so all surfaces have consistent texel
// density. Per-building colour variation rides on vertex colours, keeping one material
// (one draw call per mesh cell) per surface kind.
import * as THREE from 'three';
import { texture } from './textures.js';

// Baked PBR surfaces (tools/assets/build.py → assets/materials/): colour, normal and
// occlusion/roughness/metalness. Loaded once at boot (loadSurfaces); when they aren't
// there (or ?proctex), the procedural canvas textures stand in.
let SURF = null, aniso = 8;
const BASE = './assets/materials/';
export async function loadSurfaces(anisotropy = 8) {
  aniso = anisotropy;
  if (new URLSearchParams(globalThis.location?.search || '').has('proctex')) return null;
  try { SURF = await (await fetch(BASE + 'index.json')).json(); } catch { SURF = null; }
  return SURF;
}
export const surfaceMeans = () => Object.fromEntries(Object.entries(SURF || {}).filter(([, v]) => v.mean).map(([k, v]) => [k, v.mean]));
const cache = new Map();
// { map, normalMap, roughnessMap, metalnessMap, aoMap } for a baked surface, tiled at its own size (or `metres`)
export function baked(name, metres) {
  if (!SURF?.[name]) return null;
  const key = name + '@' + (metres || SURF[name].tile);
  if (cache.has(key)) return cache.get(key);
  const tile = metres || SURF[name].tile, tl = new THREE.TextureLoader();
  const t = (f, srgb) => { const x = tl.load(BASE + name + f); x.wrapS = x.wrapT = THREE.RepeatWrapping; x.repeat.set(1 / tile, 1 / tile); x.anisotropy = aniso; if (srgb) x.colorSpace = THREE.SRGBColorSpace; return x; };
  const orm = t('_orm.webp', false);
  const out = { map: t('_c.webp', true), normalMap: t('_n.webp', false), roughnessMap: orm, metalnessMap: orm, aoMap: orm };
  cache.set(key, out);
  return out;
}

function scaled(name, metres) {
  const t = texture(name);
  const c = {};
  for (const k of ['map', 'normalMap', 'roughnessMap']) { c[k] = t[k].clone(); c[k].repeat.set(1 / metres, 1 / metres); c[k].needsUpdate = true; }
  return c;
}

// A surface: the baked set `bakedName` if it's loaded (its own tile size), else the procedural one.
function std(tex, metres, o = {}, bakedName = null) {
  const b = bakedName && baked(bakedName);
  const m = b ? new THREE.MeshStandardMaterial({ ...b, aoMapIntensity: 0.7, ...o, roughness: 1, metalness: 1 })     // (the maps carry both)
    : new THREE.MeshStandardMaterial({ ...scaled(tex, metres), ...o });
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
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aLit;\nvarying float vLit;\nvarying vec2 vWinUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLit = aLit; vWinUv = uv;');
    // Each window is dressed differently, from its own random value (the fraction of aLit):
    // blinds part-way down (slatted), curtains drawn at the sides, or bare glass onto a dim
    // room that darkens toward the ceiling. Blinds and curtains are matte; glass stays a mirror.
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uOcc[6];\nvarying float vLit;\nvarying vec2 vWinUv;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float wr = fract(fract(vLit) * 91.7), wr2 = fract(fract(vLit) * 37.3);
        float blindTo = wr < 0.45 ? 1.0 - (0.15 + 0.7 * wr2) : 1.0;                 // blinds come down from the top
        float curtain = wr > 0.6 && wr < 0.85 ? 0.12 + 0.18 * wr2 : 0.0;           // curtains from both sides
        float onBlind = step(blindTo, vWinUv.y), onCurtain = step(vWinUv.x, curtain) + step(1.0 - curtain, vWinUv.x);
        float cloth = clamp(onBlind + onCurtain, 0.0, 1.0);
        vec3 blind = vec3(0.78, 0.74, 0.66) * (0.85 + 0.15 * step(0.5, fract(vWinUv.y * 34.0)));
        vec3 drape = mix(vec3(0.45, 0.36, 0.3), vec3(0.32, 0.38, 0.44), wr2) * (0.9 + 0.1 * sin(vWinUv.x * 120.0));
        vec3 room = mix(vec3(0.16, 0.15, 0.14), vec3(0.06, 0.065, 0.07), vWinUv.y);
        diffuseColor.rgb = mix(room, onBlind > 0.5 ? blind : drape, cloth);`)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n        metalnessFactor *= 1.0 - 0.85 * cloth;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n        roughnessFactor = mix(roughnessFactor, 0.85, cloth);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        int wi = int(floor(vLit)); float th = fract(vLit); float occ = 0.0;
        for (int i = 0; i < 6; i++) if (i == wi) occ = uOcc[i];
        float on = step(th, occ);
        totalEmissiveRadiance += on * mix(vec3(1.0, 0.66, 0.36), vec3(0.62, 0.78, 1.0), step(0.83, th)) * (0.55 + 0.5 * fract(th * 7.3));
        diffuseColor.rgb *= 1.0 - on * 0.7;`);
  };
  return m;
}

let M = null;
export function materials() {
  if (M) return M;
  M = {
    panels: std('panels', 3.2, { vertexColors: true }, 'facade'),
    corrugated: std('corrugated', 2.4, { vertexColors: true, metalness: 0.6 }, 'corrugated'),
    concrete: std('concrete', 4, { vertexColors: true }, 'concrete'),
    trim: std('metal', 2, { color: 0x6b7178, metalness: 0.8 }),
    darkTrim: std('metal', 2, { color: 0x3c4148, metalness: 0.6 }),
    glass: glassMaterial(),
    asphalt: std('asphalt', 6, {}, 'asphalt'),
    pavers: std('pavers', 4, {}, 'pavers'),
    marking: new THREE.MeshStandardMaterial({ color: 0xd9d4c4, roughness: 0.7 }),
    plaster: std('plaster', 3, { vertexColors: true }, 'render'),
    tiles: std('tiles', 4, { vertexColors: true }, 'floortile'),
    fabric: std('fabric', 1, { vertexColors: true }, 'fabric'),
    wood: std('wood', 1.5, { vertexColors: true }, 'wood'),
    metal: std('metal', 1.5, { vertexColors: true, metalness: 0.6 }, 'metal'),
    door: std('metal', 2, { color: 0x8a9096, metalness: 0.7, roughness: 0.4 }),
    doorLocked: std('metal', 2, { color: 0x8a6a3c, metalness: 0.7, roughness: 0.4 }),
    lightPanel: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2dd, emissiveIntensity: 1.6, roughness: 0.4 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x0a1418, emissive: 0x3aa6c8, emissiveIntensity: 0.9, roughness: 0.2 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd7a0, emissiveIntensity: 0 }),
    art: SURF ? new THREE.MeshStandardMaterial({ map: (() => { const t = new THREE.TextureLoader().load(BASE + 'art_c.webp'); t.colorSpace = THREE.SRGBColorSpace; return t; })(), roughness: 0.75 }) : null,   // the paintings atlas (4 × 4)
  };
  return M;
}
