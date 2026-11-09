// Draws the fleet. Its model is a separate download, fetched once the game is running: nobody waits for it at the door.
// At this size a tile says nothing, so the hull gets its plating here: panels of many sizes, each its own tone, with dark seams, from the ship's own coordinates.
import * as THREE from 'three';
import { gltfLoader, bakedPart } from './gltf.js';
import { RINGS, ringTurn } from '../gen/rings.js';

const DECK = { anvil: [[0.2, 0.22, 0.25], [0.1, 0.11, 0.13]], vesper: [[0.6, 0.57, 0.5], [0.3, 0.28, 0.25]], tiller: [[0.46, 0.41, 0.26], [0.2, 0.2, 0.18]], sable: [[0.16, 0.17, 0.2], [0.07, 0.08, 0.1]], bastion: [[0.27, 0.3, 0.33], [0.13, 0.15, 0.17]], meridian: [[0.56, 0.53, 0.46], [0.28, 0.27, 0.25]], halcyon: [[0.7, 0.69, 0.65], [0.24, 0.24, 0.25]], longshore: [[0.42, 0.39, 0.28], [0.2, 0.2, 0.19]] };
const LIVERY = [[0.1, 0.11, 0.13], [0.62, 0.6, 0.55], [0.32, 0.12, 0.05]];   // gunmetal, ivory, oxide
function plated(base, colour, k = 1) {
  const m = base.clone(); m.color = new THREE.Color(...colour); m.map = null; m.metalnessMap = null; m.roughnessMap = null; m.aoMap = null; m.normalMap = null; m.metalness = 0.25; m.roughness = 0.62;
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vShip;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvShip = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vShip;
      float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
      // one set of panels: tone of the panel you're on, and how close to its seam
      vec2 panels(vec3 q, vec3 n, float size) { vec3 a = abs(n); vec2 uv = a.x > a.y && a.x > a.z ? q.zy : a.y > a.z ? q.xz : q.xy; uv.x *= 0.62; vec2 c = floor(uv / size); uv.x += h31(vec3(c.y, size, 3.0)) * size; c = floor(uv / size); vec2 f = fract(uv / size); float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) * size; return vec2(h31(vec3(c, size)), e); }`)
      .replace('#include <map_fragment>', `
      { vec3 nw = normalize(cross(dFdx(vShip), dFdy(vShip)));
        vec2 big = panels(vShip, nw, ${(46 * k).toFixed(1)}), mid = panels(vShip + 7.0, nw, ${(11 * k).toFixed(1)}), small = panels(vShip + 3.0, nw, 2.8); float dist = length(vViewPosition), pxSize = dist * 0.0012;
        float tone = 0.86 + 0.2 * big.x + 0.2 * (mid.x - 0.5) * (1.0 - smoothstep(600.0, 2600.0, dist)) + 0.1 * (small.x - 0.5) * (1.0 - smoothstep(80.0, 400.0, dist));
        float seam = (1.0 - 0.3 * (1.0 - smoothstep(0.12, 0.34 + pxSize, big.y))) * (1.0 - 0.18 * (1.0 - smoothstep(0.06, 0.16 + pxSize, mid.y)) * (1.0 - smoothstep(900.0, 3000.0, dist))) * (1.0 - 0.1 * (1.0 - smoothstep(0.02, 0.05 + pxSize, small.y)) * (1.0 - smoothstep(60.0, 260.0, dist)));
        float grime = 0.86 + 0.14 * h31(floor(vShip / vec3(3.0, 19.0, 3.0)));
        // long weather streaks along the ship, the underside in its own shade, and what the sky doesn't reach
        float streak = 0.9 + 0.1 * h31(vec3(floor(vShip.x / 2.4), floor(vShip.y / 2.4), floor(vShip.z / 70.0)));
        diffuseColor.rgb *= tone * seam * grime * streak * mix(0.6, 1.0, smoothstep(-0.8, 0.5, nw.y)); }`);
  };
  m.customProgramCacheKey = () => 'plated-' + k;
  return m;
}
// Glass on the outside of a ship, close to: a curtain wall. Floors every 3.6 m, mullions every 1.5, each pane its own tint, rooms lit behind some.
// From far off it settles to the plain dark glass it is (the lines would only shimmer).
function facade(base) {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.06, 0.08, 0.11), roughness: 0.08, metalness: 0.5, envMapIntensity: 1.1 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vShip; varying vec3 vShipN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvShip = position; vShipN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vShip; varying vec3 vShipN;
      float hf(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { vec3 n = normalize(vShipN); float side = abs(n.y) < 0.6 ? 1.0 : 0.0; float u = abs(n.x) > abs(n.z) ? vShip.z : vShip.x;
        float fl = vShip.y / 3.6, cl = u / 1.5; vec2 f = fract(vec2(cl, fl)); float dist = length(vViewPosition), fade = side * (1.0 - smoothstep(250.0, 900.0, dist));
        float frame = max(1.0 - smoothstep(0.0, 0.035, min(f.x, 1.0 - f.x)), 1.0 - smoothstep(0.0, 0.06, min(f.y, 1.0 - f.y)));
        float cell = hf(vec3(floor(cl), floor(fl), 7.0)), room = hf(vec3(floor(cl / 3.0), floor(fl), 3.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * (0.85 + 0.3 * cell), fade);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.33, 0.34), frame * fade);
        totalEmissiveRadiance += vec3(1.0, 0.8, 0.55) * step(0.9, room) * (1.0 - frame) * fade * 0.28 * (0.3 + 0.7 * step(f.y, 0.85)); }`);
  };
  m.customProgramCacheKey = () => 'facade';
  return m;
}
// Inside, the sun doesn't reach: rooms are lit by their own fittings, in pools under each (they stand on the same grid: tools/assets/capital_kit.py), with a wash of daylight in from the open dock. (No shadow map could stop the sun at this scale.)
function roomLit(base, deckY, bay) {
  const m = base.clone();
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRoom;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoom = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRoom;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      { bool hangar = vRoom.z < ${bay.toFixed(1)}; float per = hangar ? 7.0 : 3.5;
        float rise = (vRoom.y - ${deckY.toFixed(1)}) / (hangar ? 7.2 : 4.2);
        // the hangar's lights hang in rows; the rooms' run the length of the ceiling in three troughs
        float row = hangar ? 0.5 + 0.5 * cos((vRoom.z - per * 0.5) * 6.2832 / per) : 0.82 + 0.18 * cos((vRoom.z - 1.75) * 6.2832 / 3.5), acr = 0.5 + 0.5 * cos((vRoom.x - 17.0) * 6.2832 / (hangar ? 10.0 : 9.0));
        float pool = pow(row, hangar ? 1.2 : 1.0) * pow(acr, hangar ? 1.3 : 0.8);
        // near a fitting the light is bright and tight; the room between is filled by what bounces. Floors and low walls get the most, the top of a wall the least.
        float fall = mix(1.0, 0.55, smoothstep(0.1, 0.95, rise));
        float wall = smoothstep(0.0, 2.4, min(vRoom.x - 2.0, 32.0 - vRoom.x));
        float ao = mix(0.62, 1.0, smoothstep(0.0, 0.5, vRoom.y - ${deckY.toFixed(1)})) * mix(0.72, 1.0, wall);
        float day = (1.0 - smoothstep(3.0, 40.0, vRoom.z)) * 1.3;
        vec3 lit = (vec3(0.32, 0.31, 0.3) + vec3(1.0, 0.95, 0.86) * pool * 1.15 * fall) * ao + vec3(0.72, 0.84, 1.0) * day * (0.5 + 0.5 * ao);
        reflectedLight.directDiffuse = vec3(0.0); reflectedLight.directSpecular = reflectedLight.directSpecular * 0.0;
        reflectedLight.indirectDiffuse = diffuseColor.rgb * lit; reflectedLight.indirectSpecular *= 0.5 + 0.6 * pool; }`);
  };
  m.customProgramCacheKey = () => 'room-' + deckY + '-' + bay + '-' + base.uuid;
  return m;
}
const ACCENT = { bastion: [1.0, 0.42, 0.18], anvil: [1.0, 0.3, 0.15], meridian: [1.0, 0.78, 0.4], vesper: [0.95, 0.85, 0.55], halcyon: [0.55, 0.85, 1.0], sable: [0.6, 0.4, 1.0], longshore: [1.0, 0.7, 0.2], tiller: [0.9, 0.85, 0.3] };
const CARPET = { bastion: [0.1, 0.11, 0.13], anvil: [0.09, 0.09, 0.1], meridian: [0.32, 0.1, 0.09], vesper: [0.12, 0.2, 0.17], halcyon: [0.14, 0.17, 0.26], sable: [0.08, 0.07, 0.1], longshore: [0.18, 0.16, 0.12], tiller: [0.2, 0.17, 0.12] };
// A window out of the ship: what you'd see through it, by the way you're looking — the sky over the haze, cloud tops far below, the light of the hour.
function skyview(day) {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  m.onBeforeCompile = sh => {
    sh.uniforms.uDay = day;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vW; uniform float uDay;
      float hs(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hs(i), hs(i + vec2(1, 0)), f.x), mix(hs(i + vec2(0, 1)), hs(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `vec3 d = normalize(vW - cameraPosition); float e = d.y;
        vec3 zen = mix(vec3(0.02, 0.03, 0.08), vec3(0.12, 0.3, 0.68), uDay), hor = mix(vec3(0.08, 0.08, 0.14), vec3(0.62, 0.74, 0.88), uDay);
        vec3 c = mix(hor, zen, pow(smoothstep(-0.01, 0.35, e), 0.6));
        if (e < 0.0) { vec2 q = d.xz / max(0.09, -e) * 1.4; float cl = vn(q) * 0.55 + vn(q * 2.7) * 0.3 + vn(q * 7.1) * 0.15; vec3 sea = mix(vec3(0.03, 0.04, 0.07), vec3(0.3, 0.42, 0.58), uDay), top = mix(vec3(0.12, 0.13, 0.17), vec3(0.95, 0.96, 0.98), uDay);
          c = mix(sea, top, smoothstep(0.42, 0.62, cl)); c = mix(c, hor, 1.0 - smoothstep(-0.12, -0.0, e) * 0.0 - smoothstep(-0.12, -0.005, -e - 0.0) ); c = mix(mix(sea, top, smoothstep(0.42, 0.62, cl)), hor, smoothstep(-0.16, -0.02, e)); }
        c += (1.0 - uDay) * step(0.995, hs(floor(d.xy * 400.0 + d.z * 31.0))) * smoothstep(0.0, 0.2, e);
        vec4 diffuseColor = vec4(c, 1.0);`);
  };
  m.customProgramCacheKey = () => 'skyview';
  return m;
}
export class CapitalView {
  constructor(scene, lib) { this.group = new THREE.Group(); this.group.name = 'fleet'; scene.add(this.group); this.lib = lib; this.models = {}; this.loading = false; this.day = { value: 1 }; }
  load() {
    if (this.loading) return; this.loading = true; this.fetch('./assets/capital.glb');
  }
  fetch(file) {
    gltfLoader().load(file, gltf => {
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse(o => { if (!o.isMesh) return; let top = o; while (top.parent && top.parent !== gltf.scene) top = top.parent; const kind = top.userData.kind, list = this.models[kind] || (this.models[kind] = []), slot = o.material.name, g = bakedPart(o); list.push({ g, slot }); });
    }, undefined, e => console.warn('fleet model', e?.message || e));
  }
  // Each part is its own stuff. Only the hull's skin carries plating; a nozzle is burnt metal, a frame is steel, a heat tile is a tile.
  partMaterial(slot, C) {
    const base = this.lib.surface(slot === 'tint' ? 'tint-hull' : slot), plain = (col, rough, metal) => { const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(...col), roughness: rough, metalness: metal, envMapIntensity: 1 }); return m; };
    if (slot === 'tint') return C.sleek ? new THREE.MeshPhysicalMaterial({ color: C.dark ? new THREE.Color(0.018, 0.02, 0.026) : new THREE.Color(0.78, 0.76, 0.72), roughness: 0.24, metalness: 0.2, clearcoat: C.dark ? 0.35 : 1, clearcoatRoughness: 0.05, envMapIntensity: C.dark ? 0.3 : 1 }) : plated(base, LIVERY[C.livery ?? C.colour % 3], Math.max(1, C.length / 1100));
    if (slot === 'glass') return new THREE.MeshPhysicalMaterial({ color: 0xd6e8f2, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.2, depthWrite: false, envMapIntensity: 1.4 });     // clear glass you see into (a ring's glazing, a dome)
    if (slot === 'visor') return facade(base);
    if (slot === 'mirror' && this.waterBase) { const w = this.waterBase.clone(); w.normalMap = this.waterBase.normalMap.clone(); w.normalMap.needsUpdate = true; w.normalMap.repeat.set(0.16, 0.16); w.opacity = 0.9; return w; }     // (the Vesper's canal and lakes: the planet's own water)
    if (slot === 'metal') return plain([0.34, 0.33, 0.32], 0.42, 0.9);
    if (slot === 'heatshield') return plain([0.03, 0.03, 0.033], 0.85, 0.05);
    if (slot === 'paint') return plain([0.16, 0.17, 0.19], 0.6, 0.3);
    if (slot === 'rubber') return plain([0.012, 0.012, 0.014], 0.9, 0.2);
    return base;
  }
  // Inside, each ship in its own colours: naval grey, liner cream, yacht white, working yellow-grey. Walls are painted steel, the rest what it's made of.
  deckSurface(slot, C) {
    const plain = (col, rough, metal) => new THREE.MeshStandardMaterial({ color: new THREE.Color(...col), roughness: rough, metalness: metal, envMapIntensity: 0.6 });
    if (slot === 'tint') return plain(DECK[C.model]?.[0] || [0.36, 0.38, 0.4], 0.62, 0.12);
    if (slot === 'paint') return plain(DECK[C.model]?.[1] || [0.2, 0.22, 0.24], 0.55, 0.25);
    if (slot === 'metal') return plain([0.34, 0.35, 0.36], 0.5, 0.35);
    if (slot === 'heatshield') return plain([0.1, 0.105, 0.11], 0.8, 0.1);
    if (slot === 'rubber') return plain([0.035, 0.036, 0.04], 0.85, 0);
    if (slot === 'soil') return plain([0.5, 0.36, 0.05], 0.5, 0.15);       // (crane yellow: no room is made of soil, so the slot's free in here)
    if (slot === 'lampwarm') return new THREE.MeshStandardMaterial({ color: 0x20201c, emissive: 0xfff2dc, emissiveIntensity: 3.2, roughness: 0.4 });
    if (slot === 'glow') return new THREE.MeshBasicMaterial({ color: new THREE.Color(...(ACCENT[C.model] || [0.4, 0.85, 1])) });           // the ship's own colour, in its strips and its plot
    if (slot === 'fabric') return plain(CARPET[C.model] || [0.3, 0.12, 0.1], 0.95, 0);
    if (slot === 'ceramic') return plain([0.82, 0.84, 0.82], 0.25, 0.05);
    if (slot === 'mirror') return skyview(this.day);
    return this.lib.surface(slot);
  }
  update(fleet, toRender, cam, t = 0) {
    for (const C of fleet) {
      if (!this.models[C.model]) continue;
      if (!C.mesh) {
        C.mesh = new THREE.Group(); const part = (g, slot, to) => { const m = new THREE.Mesh(g, this.partMaterial(slot, C)); m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; to.add(m); };
        for (const { g, slot } of this.models[C.model]) part(g, slot, C.mesh);
        // the spin rings turn on the axle, each at the rate that gives its floor a full weight (gen/rings.js)
        C.rings = []; for (let i = 0; this.models[C.model + '_ring' + i]; i++) { const r = new THREE.Group(); for (const { g, slot } of this.models[C.model + '_ring' + i]) part(g, slot, r); r.traverse(o => { if (o.isMesh && o.material.side !== THREE.FrontSide) { o.material = o.material.clone(); o.material.side = THREE.FrontSide; } }); C.mesh.add(r); C.rings.push(r); }     // (one-sided: from inside the ring you look out through its skin)
        this.group.add(C.mesh); C.mesh.rotation.y = C.yaw; this.onMesh?.(C);
      }
      if (C.rings) C.rings.forEach((r, i) => { if (RINGS[i]) r.rotation.z = ringTurn(RINGS[i], t); });
      C.mesh.position.set(...toRender(C.x, C.y, C.z));
      // the decks inside, once you're near enough to see in
      const dk = this.models[C.ship.model], at = C.ship.at, r = toRender(at.c[0], at.c[1], at.c[2]), far = Math.hypot(r[0] - cam.x, r[1] - cam.y, r[2] - cam.z);      // (from the eye: the render origin only follows you across the ground)
      if (far < 5000 && !(this.deckLoads ||= new Set()).has(C.ship.model)) { this.deckLoads.add(C.ship.model); this.fetch('./assets/decks-' + C.model + '.glb'); }      // (each ship's insides are their own file)
      if (dk && !C.decks && far < 900) { C.decks = new THREE.Group(); for (const { g, slot } of dk) { const b = this.deckSurface(slot, C), glows = /^(glow|lamp|neon|nav|screen|mirror)/.test(slot), m = new THREE.Mesh(g, glows ? b : roomLit(b, 1, C.ship.layout?.rooms?.[0]?.rect?.[3] ?? C.hangarEnd ?? 47)); m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; C.decks.add(m); } C.decks.rotation.y = at.facing; this.group.add(C.decks); }
      if (C.decks) { C.decks.visible = far < 1100; const L = C.deckW / 2, D = C.deckD / 2, c = Math.cos(at.facing), s = Math.sin(at.facing); C.decks.position.set(r[0] - (L * c + D * s), r[1], r[2] - (-L * s + D * c)); }
    }
  }
}
