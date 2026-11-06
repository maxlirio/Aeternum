// Furniture and fixtures drawn from the built asset library (tools/assets/build.py):
// assets/props.glb holds one mesh per variant, its material slots named after the shared
// tileable PBR surfaces in assets/materials/. A prop in a floor plan is a logical box
// with a kind (gen/building.js); this view picks the variant made for that size, fits
// it to the box, and draws it instanced. Gameplay never reads any of this.
//
// Only props near the player are drawn (interiors are only seen up close); the set is
// refreshed at the NEAR tier.
import { share } from './share.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { weather } from './grime.js';

const FABRICS = [[0.32, 0.38, 0.46], [0.5, 0.33, 0.28], [0.42, 0.44, 0.40], [0.62, 0.58, 0.50], [0.22, 0.24, 0.27], [0.55, 0.5, 0.42], [0.3, 0.34, 0.3]];
const PAINTS = [[0.55, 0.58, 0.6], [0.7, 0.7, 0.66], [0.42, 0.5, 0.55], [0.86, 0.86, 0.84], [0.36, 0.42, 0.36], [0.6, 0.4, 0.28], [0.3, 0.32, 0.36]];
const SOFT = new Set(['bed', 'sofa', 'chair', 'armchair']);       // their 'tint' parts are upholstery; everyone else's are paint
const SLEEK = /^(arrow|manta|wraith)/;       // paint like a car's: deep gloss over nothing
const HULLED = { has: k => /^(shuttle|freighter|courier|patrol|yacht|speeder|runabout|racer|dropship|gunship|explorer|hauler|ferry|miner|interceptor|striker|needle|warden|shade)/.test(k) };   // panelled hull plating      // their 'tint' parts are panelled hull plating
export const PAINTS_VEHICLE = [[0.62, 0.12, 0.08], [0.85, 0.55, 0.12], [0.16, 0.3, 0.52], [0.82, 0.82, 0.8], [0.12, 0.13, 0.14], [0.25, 0.42, 0.3], [0.5, 0.52, 0.56]];

export async function loadPropLibrary(base = './assets/', anisotropy = 8) {
  const [gltf, craft, index, city, itemsG, commonG, familyG] = await Promise.all([
    new GLTFLoader().loadAsync(base + 'props.glb'),
    new GLTFLoader().loadAsync(base + 'craft.glb').catch(() => null),      // ships and vehicles
    fetch(base + 'materials/index.json').then(r => r.json()),
    new GLTFLoader().loadAsync(base + 'city.glb').catch(() => null),       // the megacity kit (tools/assets/city_kit.py)
    new GLTFLoader().loadAsync(base + 'items.glb').catch(() => null),      // everything you can carry, and household things
    new GLTFLoader().loadAsync(base + 'common.glb').catch(() => null),     // what most places have
    new GLTFLoader().loadAsync(base + 'family.glb').catch(() => null),     // the same things in each planet's way of building (gen/designs.js)
  ]);
  if (craft) for (const o of [...craft.scene.children]) gltf.scene.add(o);
  const tl = new THREE.TextureLoader(), mats = new Map();
  const tex = (file, srgb, tile) => {
    const t = tl.load(base + 'materials/' + file);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / tile, 1 / tile); t.anisotropy = anisotropy;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const surface = name => {
    if (mats.has(name)) return mats.get(name);
    let m;
    if (name === 'screen') m = new THREE.MeshStandardMaterial({ color: 0x0b1118, emissive: 0x5d8fc0, emissiveIntensity: 0.55, roughness: 0.15 });
    else if (name === 'leafcard' || name === 'needlecard' || name === 'frondcard' || name === 'padcard' || name.startsWith('imp')) {   // alpha-tested foliage cards (and distant tree pictures), lit from both sides
      const t = tl.load(base + 'materials/' + ({ leafcard: 'foliage_leaf', needlecard: 'foliage_needle', frondcard: 'foliage_frond', padcard: 'foliage_pad', impconifer: 'impostor_conifer', impbroadleaf: 'impostor_broadleaf' })[name] + '.png'); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = anisotropy;
      m = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, metalness: 0 });
    }
    else if (name === 'mirror') m = new THREE.MeshStandardMaterial({ color: 0xdfe6ea, roughness: 0.02, metalness: 1, envMapIntensity: 1.4 });
    else if (name.startsWith('nav')) m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: { navred: 0xff2a1a, navgreen: 0x1aff4a, navwhite: 0xfff4e0 }[name], emissiveIntensity: 3 });
    else if (name === 'visor') m = new THREE.MeshStandardMaterial({ color: 0x0b1218, roughness: 0.06, metalness: 0.6 });
    else if (name === 'glow') m = new THREE.MeshStandardMaterial({ color: 0x0a1820, emissive: 0x6fd0ff, emissiveIntensity: 2.2, roughness: 0.3 });
 else if (name === 'lampwarm') m = new THREE.MeshStandardMaterial({ color: 0x2a2620, emissive: 0xffd9a8, emissiveIntensity: 1, roughness: 0.3 });
    else if (name.startsWith('neon')) m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: { neonpink: 0xff2a8a, neoncyan: 0x29e0ff, neonamber: 0xffa21a, neongreen: 0x3aff6a, neonviolet: 0xa64bff }[name] || 0xffffff, emissiveIntensity: 2.4, roughness: 0.3 });
    else if (name === 'glass') m = new THREE.MeshStandardMaterial({ color: 0xb8d0dc, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.2, depthWrite: false });
    else {
      if (name === 'tint-sleek') { m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.22, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 }); mats.set(name, m); m.name = name; return m; }
      const base = name.replace(/^tint-/, ''), tile = index[base]?.tile || 1, orm = tex(base + '_orm.webp', false, tile);
      m = new THREE.MeshStandardMaterial({ map: tex(base + '_c.webp', true, tile), normalMap: tex(base + '_n.webp', false, tile),
        roughnessMap: orm, metalnessMap: orm, aoMap: orm, roughness: 1, metalness: 1, aoMapIntensity: 0.8 });
      if (base === 'leaf') m.side = THREE.DoubleSide;
      if (name === 'tint-hull') { m.metalnessMap = null; m.metalness = 0.18; }     // a ship is painted, not polished: the paint is the colour you see
    }
    m.name = name; mats.set(name, m); return m;
  };
  const variants = new Map();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    let top = o; while (top.parent && top.parent !== gltf.scene) top = top.parent;   // the variant's root node
    const { kind, dims } = top.userData;               // (node names lose their dots in the loader; extras keep the numbers)
    const name = key(kind, ...dims);
    if (!variants.has(name)) variants.set(name, { name, kind, dims, prims: [] });
    const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
    variants.get(name).prims.push({ geometry: g, slot: o.material.name });
  });
  for (const v of variants.values()) for (const p of v.prims) {
    p.tinted = p.slot === 'tint';
    p.material = surface(p.tinted ? 'tint-' + (/^(tent|tarp|leanto|stall_)/.test(v.kind) ? 'canvas' : SOFT.has(v.kind) ? 'fabric' : SLEEK.test(v.kind) ? 'sleek' : HULLED.has(v.kind) ? 'hull' : v.kind.startsWith('veh_') ? 'paint' : 'paint') : p.slot);
  }
  // the city kit: kind → parts (geometry in the kit's own frame, its surface, tinted?)
  const cityKit = new Map(), worn = new Map();
  for (const kit of [city, itemsG, commonG, familyG]) {
    if (!kit) continue;
    kit.scene.updateMatrixWorld(true);
    kit.scene.traverse(o => {
      if (!o.isMesh) return;
      let top = o; while (top.parent && top.parent !== kit.scene) top = top.parent;
      const k = String(top.userData.kind || top.name).replace(/^city_/, '');
      const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
      const slot = o.material.name, tinted = slot === 'tint' ? 'bright' : slot === 'paint' ? 'muted' : false;     // powder-coated street steel takes a muted city colour
      const base = surface(tinted ? 'tint-paint' : slot), key = base.name + (tinted || ''), glowy = slot === 'lampwarm' || slot.startsWith('neon') || slot.startsWith('nav') || slot === 'glass' || slot === 'mirror' || slot === 'screen' || slot === 'visor' || slot.endsWith('card');
      // street kit is out in the weather: nothing stays one clean colour
      const mat = glowy ? base : (worn.get(key) || worn.set(key, weather(base.clone(), { dirt: 0.75, rust: ['metal', 'corrugated'].includes(slot) || tinted === 'muted' ? 0.55 : 0 })).get(key));
      (cityKit.get(k) || cityKit.set(k, []).get(k)).push({ geometry: g, material: mat, matrix: new THREE.Matrix4(), tinted,
        cast: !(slot === 'lampwarm' || slot.startsWith('neon') || slot === 'glass') });
    });
  }
  // a material as the street kit wears it, for models built at run time (render/housegen.js)
  const wornSurface = (slot, tinted) => { const base = surface(tinted ? 'tint-paint' : slot), key = base.name + (tinted || ''); if (slot === 'visor' || slot === 'glass') return base; return worn.get(key) || worn.set(key, weather(base.clone(), { dirt: 0.75, rust: ['metal', 'corrugated'].includes(slot) || tinted === 'muted' ? 0.55 : 0 })).get(key); };
  // this planet's materials: its own stone, clay and timber (gen/culture.js localTones), on everything worn from here on and already
  let tones = null; const toneOf = m => { const t = tones?.[m.userData.slot]; if (t) m.color.setRGB(t[0], t[1], t[2]); return m; };
  const setLocal = t => { tones = t; for (const [k, m] of worn) { m.userData.slot = m.userData.slot || k; toneOf(m); } };
  const wornSurface0 = wornSurface;
  return { setLocal, variants, surface, wornSurface: (slot, tinted) => { const m = wornSurface0(slot, tinted); if (!tinted && slot !== 'visor' && slot !== 'glass') { m.userData.slot = slot; toneOf(m); } return m; }, cityKit, cityPart: k => cityKit.get(k) || null };
}

const key = (kind, a, b, c) => `${kind}_${+a.toFixed(2)}x${+b.toFixed(2)}x${+c.toFixed(2)}`;
// The variant made for this box, else the closest one of the same kind (stretched to fit).
export function variantFor(lib, kind, len, dep, h) {
  const exact = lib.variants.get(key(kind, len, dep, h));
  if (exact) return exact;
  let best = null, bd = Infinity;
  for (const v of lib.variants.values()) if (v.kind === kind) {
    const d = Math.abs(Math.log(len / v.dims[0])) + Math.abs(Math.log(dep / v.dims[1])) + Math.abs(Math.log(h / v.dims[2]));
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

const VIEWS = new Map();      // model part → copies of its geometry no town's using just now
export class PropView {
  constructor(lib, radius = 26) {
    this.lib = lib; this.R = radius; this.group = new THREE.Group(); this.group.name = 'props';
    this.place = new Map();       // variant name → [{ m: Matrix4, c: Color, p: [x, z] (group-local) }]
    this.meshes = null;
  }
  // Called by the building mesher for each prop: frame = [origin, ex, ez] in the settlement group's space.
  add(pr, frame, len, dep, rng) {
    const v = variantFor(this.lib, pr.kind, len, dep, pr.h);
    if (!v) return false;
    const [o, ex, ez] = frame, [L, D, H] = v.dims;
    const m = new THREE.Matrix4().set(
      ex[0] * len / L, 0, ez[0] * dep / D, o[0],
      ex[1] * len / L, pr.h / H, ez[1] * dep / D, o[1],
      ex[2] * len / L, 0, ez[2] * dep / D, o[2],
      0, 0, 0, 1);
    const pal = SOFT.has(pr.kind) ? FABRICS : PAINTS, c = pal[Math.floor(rng.next() * pal.length)];
    const cx = o[0] + ex[0] * len / 2 + ez[0] * dep / 2, cz = o[2] + ex[2] * len / 2 + ez[2] * dep / 2;
    (this.place.get(v.name) || this.place.set(v.name, []).get(v.name)).push({ m, c: new THREE.Color(...c), p: [cx, cz], y: o[1] });
    return true;
  }
  build() {
    this.meshes = [];
    for (const [name, list] of this.place) {
      const v = this.lib.variants.get(name);
      for (const pr of v.prims) {
        const im = new THREE.InstancedMesh(VIEWS.get(pr)?.pop() || share(pr.geometry), pr.material, list.length); im.prim = pr;
        im.count = 0; im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true;
        if (pr.tinted) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
        this.group.add(im); this.meshes.push({ im, list, tinted: pr.tinted });
      }
    }
    return this.group;
  }
  // NEAR tier: draw what's within reach of (x, z), given in the group's space.
  update(x, y, z) {
    if (!this.meshes) return;
    const R2 = this.R * this.R;
    for (const { im, list, tinted } of this.meshes) {
      let n = 0;
      for (const it of list) {
        const dx = it.p[0] - x, dz = it.p[1] - z;
        if (dx * dx + dz * dz > R2 || Math.abs(it.y - y) > 7) continue;      // other floors are behind slabs
        im.setMatrixAt(n, it.m);
        if (tinted) im.setColorAt(n, it.c);
        n++;
      }
      im.count = n; im.instanceMatrix.needsUpdate = true;
      if (tinted && im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
  // This town's gone: its copies of the models go back for the next town to use. (Disposing one would free the buffers every other copy shares.)
  release() { for (const { im } of this.meshes || []) { (VIEWS.get(im.prim) || VIEWS.set(im.prim, []).get(im.prim)).push(im.geometry); im.dispose(); } this.meshes = null; }
  get drawn() { return this.meshes ? this.meshes.reduce((n, m) => n + m.im.count, 0) : 0; }
}
