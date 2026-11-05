// The megacity's look: every building tier is one instance of a unit box, drawn by a
// standard (lit, shadowed, fogged) material whose colour, roughness and night glow are
// written by a procedural facade shader — floors, window bays, spandrels, shopfronts,
// lit rooms at night that fade into an even glow with distance (no shimmer). The city is
// cut into sectors of 4×4 blocks, built nearest first a few per frame; each is one
// instanced draw (tiers + kerbs + crowns + pads) plus street paint. Street furniture,
// rooftop kit and stalls are instanced from the city kit only near you.
// Everything is read from gen/city.js records; the mesh never decides anything.
import { share } from './share.js';
import * as THREE from 'three';
import { materials } from './materials.js';
import { weather } from './grime.js';
import { getCity, cityBlock, cityExtent, blockRect, lineAt, lineWidth, lineKind, PITCH, CURB, STYLES, STYLE, blockExists, bridgesOf, liftsOf } from '../gen/city.js';

const SECTOR = 4;                       // blocks per sector edge
const PROP_R = 260;                     // street furniture drawn within this
const SMALL_R = 110;                    // ...and the small clutter (goods, bins, junk) only this close
const BIG = /^(lamp_|tree|palm|tank|silo|sphere|stack|crane|billboard|cooling|tank_roof|container|monument|fountain|statue|shelter|kiosk|holo_|neon_|sign_|ad_|lanternline|padlights|shack|dish|antenna|trafficlight|watertower|windturbine|radar|beacontower|gazebo|sculpture|walker|piperack|fueltank|controlbooth|newsscreen|towercrane|scaffold|sitefence|excavator|tramstop|foodtruck|bigclock|flagpole|gate|wallsegment|checkpoint|toll)/;
const STYLE_P = [   // per style: [r,g,b frame], [r,g,b glass], [winFracX, winFracY, litChance, glassiness]
  [[0.24, 0.27, 0.30], [0.05, 0.08, 0.12], [0.86, 0.82, 0.55, 0.9]],   // glass
  [[0.50, 0.50, 0.48], [0.05, 0.07, 0.09], [0.98, 0.45, 0.50, 0.7]],   // ribbon
  [[0.44, 0.42, 0.40], [0.07, 0.09, 0.11], [0.55, 0.55, 0.50, 0.5]],   // grid
  [[0.54, 0.50, 0.44], [0.08, 0.09, 0.10], [0.42, 0.50, 0.62, 0.3]],   // hab
  [[0.46, 0.30, 0.24], [0.10, 0.10, 0.11], [0.38, 0.50, 0.58, 0.25]],  // brick
  [[0.33, 0.31, 0.28], [0.08, 0.08, 0.08], [0.40, 0.45, 0.66, 0.15]],  // grime
  [[0.46, 0.48, 0.47], [0.20, 0.22, 0.22], [0.10, 0.12, 0.30, 0.2]],   // shed
  [[0.40, 0.40, 0.42], [0.08, 0.10, 0.12], [0.80, 0.55, 0.80, 0.8]],   // podium
  [[0.70, 0.70, 0.68], [0.12, 0.16, 0.20], [0.90, 0.70, 0.85, 0.8]],   // terminal
  [[0.42, 0.42, 0.41], [0.42, 0.42, 0.41], [0.00, 0.00, 0.00, 0.0]],   // paving
  [[0.42, 0.30, 0.18], [0.16, 0.12, 0.08], [0.80, 0.78, 0.55, 0.9]],   // bronze
  [[0.74, 0.74, 0.72], [0.08, 0.11, 0.14], [0.60, 0.62, 0.55, 0.6]],   // white
  [[0.22, 0.34, 0.16], [0.22, 0.34, 0.16], [0.00, 0.00, 0.00, 0.0]],   // garden
];

const facadeMats = {};
// shape: 'box' (unit box), or 'round' / 'oct' (unit cylinder / octagon: the facade runs round it)
export function cityMaterial(shape = 'box') {
  if (facadeMats[shape]) return facadeMats[shape];
  if (shape !== 'box') {     // the round ones share the box's uniforms, so night and ground follow it
    const box = cityMaterial('box'), m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.0 });
    m.userData.uni = box.userData.uni;
    m.onBeforeCompile = sh => { box.onBeforeCompile(sh); sh.vertexShader = sh.vertexShader.replace('// @round', `if (roof < 0.5) vFac.x = (atan(lp.z, lp.x) + 3.14159265) * 0.5 * sc.x; vSpan = 3.14159265 * sc.x;`); };
    m.customProgramCacheKey = () => 'orbis-city-facade-round';
    return (facadeMats[shape] = m);
  }
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.0 });
  const uni = {
    uNight: { value: 0 }, uGround: { value: 0 }, uTime: { value: 0 }, uTint: { value: new THREE.Vector3(1, 1, 1) },
    uFrame: { value: STYLE_P.map(s => new THREE.Vector3(...s[0])) },
    uGlass: { value: STYLE_P.map(s => new THREE.Vector3(...s[1])) },
    uWin: { value: STYLE_P.map(s => new THREE.Vector4(...s[2])) },
    uBay: { value: STYLES.map(s => new THREE.Vector2(s[1], s[2])) },
  };
  m.userData.uni = uni;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aCity;      // style, seed, storey height, bay width
        varying vec3 vFac;         // facade u (m), height above city ground (m), roof flag
        varying vec4 vCity; varying float vSpan;
        uniform float uGround;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec3 lp = position * sc;
        float roof = abs(normal.y) > 0.5 ? 1.0 : 0.0;
        float fu = abs(normal.x) > 0.5 ? lp.z * sign(normal.x) : lp.x * -sign(normal.z);
        if (roof > 0.5) fu = lp.x;
        vec4 wp0 = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vFac = vec3(fu + (abs(normal.x) > 0.5 ? sc.z : sc.x) * 0.5, wp0.y - uGround, roof);
        if (roof > 0.5) vFac.y = lp.z;
        vCity = aCity; vSpan = abs(normal.x) > 0.5 ? sc.z : sc.x;
        // @round
        `);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vFac; varying vec4 vCity; varying float vSpan;
        uniform float uNight; uniform float uTime; uniform vec3 uTint;
        uniform vec3 uFrame[13]; uniform vec3 uGlass[13]; uniform vec4 uWin[13]; uniform vec2 uBay[13];
        float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
        float gLit; float gGlass; vec3 gEmit;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          int st = int(vCity.x + 0.5); float seed = vCity.y;
          vec3 frame = uFrame[st] * uTint, glass = uGlass[st]; vec4 W = uWin[st]; vec2 bay = uBay[st];
          float tint = h21(vec2(seed, 7.7)), hue = h21(vec2(seed, 4.4));
          vec3 pal = hue < 0.2 ? vec3(1.08, 0.98, 0.86) : hue < 0.4 ? vec3(0.86, 0.94, 1.06) : hue < 0.52 ? vec3(1.12, 0.88, 0.76) : hue < 0.62 ? vec3(0.84, 1.0, 0.96) : vec3(1.0);
          frame *= (0.7 + 0.5 * tint) * pal; glass *= mix(vec3(1.0), pal, 0.8);
          vec3 col; gGlass = 0.0; gEmit = vec3(0.0);
          if (vFac.z > 0.5) {                                  // roofs: tar, gravel, plant
            col = vec3(0.22, 0.22, 0.23) * (0.8 + 0.4 * vn(vFac.xy * 0.4)) + 0.04 * vn(vFac.xy * 3.0);
          } else if (st == 12) {                               // garden lawns
            col = frame * (0.75 + 0.5 * vn(vFac.xy * 0.5)) * (0.9 + 0.2 * vn(vFac.xy * 6.0));
          } else if (st == 9) {                                // kerbs and paving
            col = frame * (0.85 + 0.25 * vn(vFac.xy * 1.7));
          } else {
            float fh = vCity.z, bw = vCity.w;
            float shop = vFac.y < 5.2 && st != 6 ? 1.0 : 0.0;        // ground floor: shopfronts and lobbies
            vec2 cell = vec2(vFac.x / bw, (vFac.y - (shop > 0.5 ? 0.0 : 5.2)) / fh);
            if (shop > 0.5) cell = vec2(vFac.x / (bw * 2.2), vFac.y / 5.2);
            vec2 id = floor(cell), f = fract(cell);
            float fx = shop > 0.5 ? 0.9 : W.x, fy = shop > 0.5 ? 0.62 : W.y;
            vec2 fw = fwidth(cell);
            float aa = clamp(1.0 - max(fw.x, fw.y) * 2.2, 0.0, 1.0);
            float ex = smoothstep(fx * 0.5 + fw.x, fx * 0.5 - fw.x, abs(f.x - 0.5));
            float ey = smoothstep(fy * 0.5 + fw.y, fy * 0.5 - fw.y, abs(f.y - (shop > 0.5 ? 0.42 : 0.55)));
            float win = mix(fx * fy, ex * ey, aa);
            if (vFac.y < 0.4) win = 0.0;
            float r = h21(id + vec2(seed * 17.0, seed * 3.0));
            float busy = 0.25 + 1.1 * h21(vec2(seed, 9.9));            // some buildings mostly dark, some blazing
            float litP = shop > 0.5 ? 0.62 : W.z * busy * 0.75;
            float lit = mix(litP, step(r, litP), aa);
            vec3 warm = vec3(1.0, 0.66, 0.36), cool = vec3(0.62, 0.8, 1.0);
            vec3 lc = mix(warm, cool, step(0.62, h21(id + 3.1)));
            if (shop > 0.5) lc = mix(lc, vec3(0.2 + 0.8 * h21(id + 5.0), 0.2 + 0.6 * h21(id + 6.0), 0.2 + 0.8 * h21(id + 8.0)), 0.5) * (0.45 + 0.55 * f.y);   // a shop's light falls off toward the floor
            lc *= 0.55 + 0.9 * h21(id + 9.3);
            lc = mix(vec3(1.0, 0.62, 0.3) * 0.55 * (h21(vec2(seed, 5.5)) < 0.3 ? vec3(0.75, 1.0, 1.6) : vec3(1.0)), lc, aa);   // far away: the building's average glow, no sparkle
            float streak = vn(vec2(vFac.x * 0.35, vFac.y * 0.04 + seed)) * 0.3;    // weathering down the face
            vec3 fr = frame * (1.0 - streak * (st == 5 || st == 4 ? 1.6 : 0.6));
            // the wall itself, up close: fades out with distance so it never shimmers
            float cl = clamp(1.0 - max(fwidth(vFac.x), fwidth(vFac.y)) * 12.0, 0.0, 1.0);
            if (cl > 0.0) {
              vec2 w = vFac.xy;
              if (st == 4 || st == 5) {            // brick: running-bond courses, each brick its own shade, dark mortar
                float cy2 = w.y / 0.075, row = floor(cy2), bx2 = w.x / 0.225 + 0.5 * mod(row, 2.0), bid = floor(bx2);
                float m = max(smoothstep(0.9, 0.97, abs(fract(cy2) - 0.5) * 2.0), smoothstep(0.93, 0.985, abs(fract(bx2) - 0.5) * 2.0));
                fr = mix(fr, fr * (0.72 + 0.56 * h21(vec2(bid, row + seed))) * (1.0 - 0.45 * m) , cl);
              } else if (st == 6) {                // cladding: vertical ribs, a seam between sheets, rust along the laps
                float rib = abs(fract(w.x / 0.2) - 0.5) * 2.0, seam = smoothstep(0.985, 1.0, abs(fract(w.x / 3.0) - 0.5) * 2.0), lap = smoothstep(0.92, 1.0, abs(fract(w.y / 3.2) - 0.5) * 2.0);
                fr = mix(fr, fr * (0.82 + 0.3 * rib) * (1.0 - 0.5 * seam), cl); fr = mix(fr, vec3(0.27, 0.14, 0.08), lap * cl * 0.6 * vn(w * vec2(1.3, 0.4)));
              } else {                             // precast panels: joints, a tone per panel, render's fine grain
                vec2 pc = w / vec2(max(bw, 1.2), fh * 0.5), pid = floor(pc), pf = abs(fract(pc) - 0.5) * 2.0;
                float jwx = fwidth(pf.x), jwy = fwidth(pf.y), joint = max(smoothstep(0.985 - jwx, 0.998 + jwx, pf.x) * 0.02 / (0.02 + jwx), smoothstep(0.975 - jwy, 0.995 + jwy, pf.y) * 0.03 / (0.03 + jwy));     // (smoothed by the pixel's own size, or a thin joint breaks into dashes)
                fr = mix(fr, fr * (0.9 + 0.2 * h21(pid + seed)) * (1.0 - 0.4 * joint) * (0.94 + 0.12 * vn(w * 9.0)), cl);
              }
              // rain runs down from each sill; grime gathers at the foot of the wall
              float rs = (1.0 - smoothstep(0.0, 0.5, abs(f.x - 0.5) - fx * 0.5)) * smoothstep(0.1, 0.55, (shop > 0.5 ? 0.0 : ((0.55 - fy * 0.5) - f.y))) * vn(vec2(w.x * 2.5, seed)) ;
              fr *= 1.0 - rs * cl * 0.4;
              fr *= 1.0 - (1.0 - smoothstep(0.0, 1.6, w.y)) * 0.42 * cl * (0.6 + 0.8 * vn(w * vec2(0.8, 3.0)));
            }
            // depth cues up close: the lintel's shadow across the top of each opening, a pale sill under it
            float wy = (f.y - ((shop > 0.5 ? 0.42 : 0.55) - fy * 0.5)) / fy;          // 0 at the sill, 1 at the head
            float head = smoothstep(0.78, 0.98, wy) * ex * ey * aa;
            // glazing bars: the same ones the climber holds (gen/holds.js), ≤ 0.85 m apart
            if (shop < 0.5) { float nb = ceil(fy * fh / 0.85), bar = abs(fract(wy * nb + 0.5) - 0.5) / nb * fy * fh; win *= mix(1.0, smoothstep(0.015, 0.04, bar), aa * step(0.0, wy) * step(wy, 1.0)); }
            float sill = (1.0 - step(0.0, wy)) * step(-0.07 / fy, wy) * ex * aa * (shop > 0.5 ? 0.0 : 1.0);
            fr = mix(fr, fr * 1.25 + 0.05, sill);
            vec3 gl = glass * (0.8 + 0.4 * r);
            if (shop < 0.5) { float kind = h21(id + vec2(3.3, seed)); if (kind < 0.28) gl = mix(gl, vec3(0.62, 0.6, 0.55) * (0.72 + 0.28 * step(0.5, fract(wy * 22.0))), smoothstep(0.35, 0.4, 1.0 - wy + (kind * 2.5 - 0.3)) * aa * 0.8);
              else if (kind < 0.5) { float cu = abs(f.x - 0.5) * 2.0 / max(fx, 0.01); gl = mix(gl, vec3(0.5, 0.42, 0.36) * (0.8 + 0.2 * sin(vFac.x * 28.0)), smoothstep(0.55, 0.62, cu) * aa * 0.85); } }
            col = mix(fr, gl, win) * (1.0 - 0.55 * head);
            gGlass = win * W.w;
            if (shop > 0.5) { float mul = step(0.06, abs(fract(vFac.x / 1.4) - 0.5) * 2.0 - 0.0) * step(0.05, 1.0 - abs(f.y - 0.42) * 2.0); win *= mix(1.0, 0.82 + 0.18 * mul, aa); }
            gEmit = lc * win * lit * (shop > 0.5 ? 0.75 : 1.5) * uNight * (1.0 - 0.6 * head);
            col *= 1.0 - 0.55 * uNight * (1.0 - win);                    // facades fall dark at night (only rooms glow)
            if (shop > 0.5 && st != 9) gEmit += vec3(0.2, 0.18, 0.14) * win * 0.5 * (1.0 - uNight);   // shops lit by day too
          }
          diffuseColor.rgb = col;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.86, 0.12, gGlass);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = gGlass * 0.85;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += gEmit;`);
  };
  m.customProgramCacheKey = () => 'orbis-city-facade';
  facadeMats.box = m;
  return m;
}

// crowns on top of spires, one geometry each (unit-sized: footprint 1×1, height 1)
function crownGeometries() {
  const g = {};
  g.spire = new THREE.ConeGeometry(0.42, 1, 8).translate(0, 0.5, 0);
  g.pyramid = new THREE.ConeGeometry(0.71, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  g.dome = new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  g.ring = new THREE.TorusGeometry(0.42, 0.05, 6, 24).rotateX(Math.PI / 2).translate(0, 0.5, 0);
  g.antenna = new THREE.CylinderGeometry(0.02, 0.05, 1, 6).translate(0, 0.5, 0);
  g.pad = new THREE.CylinderGeometry(0.62, 0.55, 0.06, 20).translate(0, 0.03, 0);
  g.crown = new THREE.CylinderGeometry(0.38, 0.5, 1, 8, 1, true).translate(0, 0.5, 0);
  g.blade = new THREE.BoxGeometry(0.12, 1, 0.7).translate(0, 0.5, 0);
  g.vault = new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 0, 0);
  return g;
}
const CROWN_H = { spire: 0.35, pyramid: 0.12, dome: 0.5, ring: 0.18, antenna: 0.3, pad: 1, crown: 0.08, blade: 0.2, vault: 0.5 };

export class CityView {
  constructor(planet, propLib = null) {
    this.planet = planet; this.city = getCity(planet); this.propLib = propLib;
    this.group = new THREE.Group(); this.group.name = 'city';
    this.mat = cityMaterial(); this.mat.userData.uni.uGround.value = this.city.h + CURB; this.mat.userData.uni.uTint.value.set(...this.city.culture.tint); setKitPalette(this.city.culture.paints);
    this.box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    this.shapes = { round: new THREE.CylinderGeometry(0.5, 0.5, 1, 40, 1).translate(0, 0.5, 0),
      oct: (() => { const g = new THREE.CylinderGeometry(0.5 / Math.cos(Math.PI / 8), 0.5 / Math.cos(Math.PI / 8), 1, 8, 1).rotateY(Math.PI / 8).translate(0, 0.5, 0).toNonIndexed(); g.computeVertexNormals(); return g; })() };
    this.crowns = crownGeometries();
    this.crownMat = weather(new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.35, metalness: 0.8 }), { dirt: 0.5, ground: false });
    this.capMat = weather(new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.75, metalness: 0.2 }), { dirt: 0.8, ground: false });
    this.bridgeGlass = new THREE.MeshStandardMaterial({ color: 0x9fc4d8, roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.35, depthWrite: false });
    this.stripMat = new THREE.MeshStandardMaterial({ color: 0x0a1418, emissive: 0x7fdcff, emissiveIntensity: 1.2 });
    this.padMat = weather(new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.7, metalness: 0.3 }), { dirt: 0.9, ground: false });
    this.streetMat = materials().asphalt;
    this.paintMat = new THREE.MeshStandardMaterial({ color: 0xbdb9ad, roughness: 0.85, transparent: true, opacity: 0.8, depthWrite: false });
    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
    this.sectors = new Map(); this.queue = null;
    const [i0, j0, i1, j1] = cityExtent(this.city);
    this.range = [Math.floor(i0 / SECTOR), Math.floor(j0 / SECTOR), Math.floor(i1 / SECTOR), Math.floor(j1 / SECTOR)];
    this.props = null; this.propAt = null; this.glowMats = new Set(); this.tierAt = new Map();
    this.stats = { sectors: 0, tiers: 0 };
  }

  // Build sectors nearest the viewer first, within a time budget per call.
  update(viewer, night, budgetMs = 6) {
    const c = this.city, uni = this.mat.userData.uni;
    uni.uNight.value = night;
    for (const m of this.glowMats) m.emissiveIntensity = m.name === 'lampwarm' ? 0.12 + 2.6 * night : 0.9 + 2.2 * night;
    this.group.position.set(c.cx, 0, c.cz);
    this.group.rotation.y = -c.angle;
    this.beaconMat.color.setScalar(0).setRGB(1, 0.16, 0.1).multiplyScalar(0.3 + 0.7 * (Math.sin(performance.now() / 260) > 0.6 ? 1 : 0.15));
    const [u, v] = c.toLocal(viewer[0], viewer[2]);
    if (!this.queue) {
      const [a0, b0, a1, b1] = this.range, list = [];
      for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) list.push([a, b]);
      this.queue = list;
    }
    if (this.queue.length) {
      const sc = SECTOR * PITCH, d = ([a, b]) => Math.hypot((a + 0.5) * sc - u, (b + 0.5) * sc - v);
      this.queue.sort((p, q) => d(q) - d(p));
      const t0 = performance.now();
      while (this.queue.length && performance.now() - t0 < budgetMs) { const [a, b] = this.queue.pop(); this.buildSector(a, b); }
    }
    for (const s of this.sectors.values()) {      // shadows only near
      const dd = Math.hypot(s.cu - u, s.cv - v), near = dd < 1500;
      if (s.mesh && s.mesh.castShadow !== near) { s.mesh.castShadow = near; s.mesh.receiveShadow = true; }
      if (s.paint) s.paint.visible = dd < 2200;
      if (s.minor) { const on = dd < 2600; if (s.minorOn !== on) { s.minorOn = on; for (const m of s.minor) m.visible = on; } }      // (caps, doors and bridges: too small to see from further)
    }
    this.updateProps(u, v, viewer[1]);
  }
  get done() { return this.queue && !this.queue.length; }
  // Hide (or restore) a building's ground tier in the instanced mesh — while its real, walk-in
  // version is built (render/cityreal.js).
  hideTier(id, hidden) {
    const e = this.tierAt.get(id); if (!e || !e.sec.mesh) return;
    const [r, y, h] = e.t, M = new THREE.Matrix4();
    if (hidden) M.makeScale(0, 0, 0); else { M.makeScale(r[2] - r[0], h, r[3] - r[1]); M.setPosition((r[0] + r[2]) / 2, y, (r[1] + r[3]) / 2); }
    e.sec.mesh.setMatrixAt(e.k, M); e.sec.mesh.instanceMatrix.needsUpdate = true;
  }

  buildSector(a, b) {
    const c = this.city, base = c.h + CURB, tiers = [], kerbs = [], crowns = {}, pads = [], beacons = [], bridges = [], doors = [], shaped = {};
    for (let i = a * SECTOR; i < (a + 1) * SECTOR; i++) for (let j = b * SECTOR; j < (b + 1) * SECTOR; j++) {
      const B = cityBlock(c, i, j); if (!B.district) continue;
      kerbs.push(B);
      for (const bd of B.buildings) {
        const seed = parseInt(bd.id.replace(/\D/g, '').slice(-6), 10) % 997 / 997 + (i * 31 + j * 17) % 13;
        for (const t of bd.tiers) (t.shape ? (shaped[t.shape] ||= []) : tiers).push([t.r, base + t.y0, t.y1 - t.y0, bd.style, seed, bd.enter && t === bd.tiers[0] ? bd.id : null, bd.floor, bd.bay]);
        if (bd.crown) {
          const t = bd.tiers.at(-1), w = t.r[2] - t.r[0], d = t.r[3] - t.r[1], s = Math.min(w, d);
          (crowns[bd.crown] ||= []).push([t.r, base + t.y1, s * CROWN_H[bd.crown] * (bd.crown === 'antenna' ? 3 : 1) + (bd.crown === 'spire' ? s * 0.6 : 0), bd.crown === 'vault' ? [w, d] : [s, s]]);
        }
        if (bd.top > 120) {   // aircraft-warning lights: the crown's tip, else the roof's four corners
          const t = bd.tiers.at(-1), sz = Math.min(t.r[2] - t.r[0], t.r[3] - t.r[1]);
          if (bd.crown === 'spire' || bd.crown === 'antenna') beacons.push([(t.r[0] + t.r[2]) / 2, base + t.y1 + sz * (bd.crown === 'spire' ? 0.95 : 0.9), (t.r[1] + t.r[3]) / 2]);
          else for (const [a, b] of [[0, 1], [2, 1], [0, 3], [2, 3]]) beacons.push([t.r[a] + (a ? -0.6 : 0.6), base + t.y1 + 1.6, t.r[b] + (b === 3 ? -0.6 : 0.6)]);
        }
      }
      for (const p of B.pads) pads.push(p);
      bridges.push(...bridgesOf(c, B));
      for (const L of liftsOf(c, B)) doors.push(L.stops[0]);
    }
    const sec = { a, b, cu: (a + 0.5) * SECTOR * PITCH, cv: (b + 0.5) * SECTOR * PITCH, group: new THREE.Group() };
    this.sectors.set(a + ',' + b, sec);
    if (!kerbs.length) return;
    // tiers + kerb slabs: one instanced draw
    const n = tiers.length + kerbs.length, mesh = new THREE.InstancedMesh(share(this.box), this.mat, n), attr = new Float32Array(n * 4), M = new THREE.Matrix4();
    let k = 0;
    const put = (r, y, h, st, seed, id, floor = 1, bay = 1) => {
      M.makeScale(r[2] - r[0], h, r[3] - r[1]); M.setPosition((r[0] + r[2]) / 2, y, (r[1] + r[3]) / 2);
      mesh.setMatrixAt(k, M); attr[k * 4] = st; attr[k * 4 + 1] = seed; attr[k * 4 + 2] = floor; attr[k * 4 + 3] = bay; k++;
    };
    for (const B of kerbs) put(B.rect, c.h, CURB, B.ground === 'garden' ? STYLE.garden : STYLE.paving, 0.5);
    for (const t of tiers) { if (t[5]) this.tierAt.set(t[5], { sec, k, t }); put(...t); }
    mesh.geometry = this.box.clone(); mesh.geometry.setAttribute('aCity', new THREE.InstancedBufferAttribute(attr, 4));
    mesh.computeBoundingSphere(); mesh.receiveShadow = true;
    sec.mesh = mesh; sec.group.add(mesh);
    for (const [shape, list] of Object.entries(shaped)) {      // round and octagonal towers
      const g = this.shapes[shape].clone(), at = new Float32Array(list.length * 4), sm = new THREE.InstancedMesh(g, cityMaterial(shape), list.length);
      list.forEach(([r, y, h, st, seed, , floor, bay], q) => { M.makeScale(r[2] - r[0], h, r[3] - r[1]); M.setPosition((r[0] + r[2]) / 2, y, (r[1] + r[3]) / 2); sm.setMatrixAt(q, M); at[q * 4] = st; at[q * 4 + 1] = seed; at[q * 4 + 2] = floor; at[q * 4 + 3] = bay; });
      g.setAttribute('aCity', new THREE.InstancedBufferAttribute(at, 4)); sm.computeBoundingSphere(); sm.receiveShadow = true; sm.castShadow = true; sec.group.add(sm);
      const cm = new THREE.InstancedMesh(share(this.shapes[shape]), this.capMat, list.length);    // their cornices
      list.forEach(([r, y, h], q) => { M.makeScale(r[2] - r[0] + 0.9, Math.min(1.4, 0.5 + h * 0.01), r[3] - r[1] + 0.9); M.setPosition((r[0] + r[2]) / 2, y + h, (r[1] + r[3]) / 2); cm.setMatrixAt(q, M); });
      cm.computeBoundingSphere(); sec.group.add(cm); (sec.minor ||= []).push(cm);
      this.stats.tiers += list.length;
    }
    this.stats.tiers += tiers.length;
    for (const [kind, list] of Object.entries(crowns)) {
      const cm = new THREE.InstancedMesh(share(this.crowns[kind]), this.crownMat, list.length);
      list.forEach(([r, y, h, [sw, sd]], q) => { M.makeScale(sw, Math.max(1, h), sd); M.setPosition((r[0] + r[2]) / 2, y, (r[1] + r[3]) / 2); cm.setMatrixAt(q, M); });
      cm.computeBoundingSphere(); sec.group.add(cm);
    }
    {   // cornices and parapet caps: a thin, slightly proud band on each tier's top (and a plinth band on podiums)
      const caps = tiers.filter(t => t[3] !== STYLE.shed || true);
      const cm = new THREE.InstancedMesh(share(this.box), this.capMat, caps.length);
      caps.forEach(([r, y, h], q) => { const o = Math.min(0.6, 0.012 * Math.min(r[2] - r[0], r[3] - r[1]) + 0.25); M.makeScale(r[2] - r[0] + o * 2, Math.min(1.4, 0.5 + h * 0.01), r[3] - r[1] + o * 2); M.setPosition((r[0] + r[2]) / 2, y + h, (r[1] + r[3]) / 2); cm.setMatrixAt(q, M); });
      cm.computeBoundingSphere(); cm.receiveShadow = true; sec.group.add(cm); (sec.minor ||= []).push(cm);
    }
    if (bridges.length) {   // skybridges: a deck, a glass tube, a roof with a light strip
      const deck = new THREE.InstancedMesh(share(this.box), this.capMat, bridges.length * 2), tube = new THREE.InstancedMesh(share(this.box), this.bridgeGlass, bridges.length), strip = new THREE.InstancedMesh(share(this.box), this.stripMat, bridges.length * 2);
      bridges.forEach((q, n) => { const [u0, v0, u1, v1] = q.r, y = base + q.y, cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, w = u1 - u0, d = v1 - v0;
        M.makeScale(w, 0.8, d); M.setPosition(cu, y - 0.8, cv); deck.setMatrixAt(n * 2, M);
        M.makeScale(w, 0.4, d); M.setPosition(cu, y + 3.4, cv); deck.setMatrixAt(n * 2 + 1, M);
        M.makeScale(w - (q.axis ? 0.1 : 0), 3.4, d - (q.axis ? 0 : 0.1)); M.setPosition(cu, y, cv); tube.setMatrixAt(n, M);
        if (q.axis) { M.makeScale(0.15, 0.12, d); M.setPosition(u0 + 0.1, y - 0.2, cv); strip.setMatrixAt(n * 2, M); M.setPosition(u1 - 0.1, y - 0.2, cv); strip.setMatrixAt(n * 2 + 1, M); }
        else { M.makeScale(w, 0.12, 0.15); M.setPosition(cu, y - 0.2, v0 + 0.1); strip.setMatrixAt(n * 2, M); M.setPosition(cu, y - 0.2, v1 - 0.1); strip.setMatrixAt(n * 2 + 1, M); } });
      for (const m of [deck, tube, strip]) { m.computeBoundingSphere(); sec.group.add(m); (sec.minor ||= []).push(m); } deck.castShadow = true; deck.receiveShadow = true;
    }
    if (doors.length) {     // lift lobbies: a lit doorway at each tower's street door
      const dm = new THREE.InstancedMesh(share(this.box), this.stripMat, doors.length * 2);
      doors.forEach((d, n) => { const along = d.face < 2; M.makeScale(along ? 2.4 : 0.12, 0.18, along ? 0.12 : 2.4); M.setPosition(d.u, base + 3.0, d.v); dm.setMatrixAt(n * 2, M);
        M.makeScale(along ? 1.6 : 0.06, 2.6, along ? 0.06 : 1.6); M.setPosition(d.u, base, d.v); dm.setMatrixAt(n * 2 + 1, M); });
      dm.computeBoundingSphere(); sec.group.add(dm); (sec.minor ||= []).push(dm);
    }
    if (pads.length) {
      const pm = new THREE.InstancedMesh(share(this.box), this.padMat, pads.length);
      pads.forEach((p, q) => { const r = p.r; M.makeScale(r[2] - r[0], 1.2, r[3] - r[1]); M.setPosition((r[0] + r[2]) / 2, base + p.y - 1.2, (r[1] + r[3]) / 2); pm.setMatrixAt(q, M); });
      pm.computeBoundingSphere(); pm.receiveShadow = true; sec.group.add(pm); (sec.minor ||= []).push(pm);
    }
    if (beacons.length) {
      const bm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 6, 4), this.beaconMat, beacons.length);
      beacons.forEach((p, q) => { M.makeTranslation(...p); bm.setMatrixAt(q, M); });
      bm.computeBoundingSphere(); sec.group.add(bm);
    }
    {   // the street surface: each block's cell out to the street centre lines (the graded ground is exactly city.h)
      const pos = [], uv = [], y = c.h + 0.02;
      for (const B of kerbs) {
        const u0 = lineAt(c, 0, B.i), u1 = lineAt(c, 0, B.i + 1), v0 = lineAt(c, 1, B.j), v1 = lineAt(c, 1, B.j + 1);
        pos.push(u0, y, v0, u0, y, v1, u1, y, v1, u0, y, v0, u1, y, v1, u1, y, v0);
        uv.push(u0, v0, u0, v1, u1, v1, u0, v0, u1, v1, u1, v0);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals(); g.computeBoundingSphere();
      const st = new THREE.Mesh(g, this.streetMat); st.receiveShadow = true; sec.group.add(st);
    }
    sec.paint = this.streetPaint(a, b); if (sec.paint) sec.group.add(sec.paint);
    this.group.add(sec.group); this.stats.sectors++;
  }

  // Lane lines down the middle of every street and crossings at every junction.
  streetPaint(a, b) {
    const c = this.city, y = c.h + 0.03, quads = [];
    const iA = a * SECTOR, iB = (a + 1) * SECTOR, jA = b * SECTOR, jB = (b + 1) * SECTOR;
    const uA = lineAt(c, 0, iA), uB = lineAt(c, 0, iB), vA = lineAt(c, 1, jA), vB = lineAt(c, 1, jB);
    const live = (i, j) => blockExists(c, i, j);
    for (let i = iA; i < iB; i++) {        // along v at u = line i
      if (![...Array(SECTOR).keys()].some(q => live(i, jA + q) || live(i - 1, jA + q))) continue;
      const u = lineAt(c, 0, i), w = lineWidth(i), lanes = lineKind(i) === 'street' ? [0] : lineKind(i) === 'avenue' ? [-w / 4, 0, w / 4] : [-w / 3, -w / 6, 0.6, -0.6, w / 6, w / 3];
      for (let v = vA; v < vB; v += 9) for (const o of lanes) quads.push([u + o - 0.08, v, u + o + 0.08, v + (Math.abs(o) < 1 ? 9 : 4.5)]);
    }
    for (let j = jA; j < jB; j++) {
      if (![...Array(SECTOR).keys()].some(q => live(iA + q, j) || live(iA + q, j - 1))) continue;
      const v = lineAt(c, 1, j), w = lineWidth(j), lanes = lineKind(j) === 'street' ? [0] : lineKind(j) === 'avenue' ? [-w / 4, 0, w / 4] : [-w / 3, -w / 6, 0.6, -0.6, w / 6, w / 3];
      for (let u = uA; u < uB; u += 9) for (const o of lanes) quads.push([u, v + o - 0.08, u + (Math.abs(o) < 1 ? 9 : 4.5), v + o + 0.08]);
    }
    for (let i = iA; i < iB; i++) for (let j = jA; j < jB; j++) {   // zebra crossings on the four arms of each junction
      if (!(live(i, j) && live(i - 1, j - 1))) continue;
      const u = lineAt(c, 0, i), v = lineAt(c, 1, j), wu = lineWidth(i) / 2, wv = lineWidth(j) / 2;
      for (let s = -wu + 1; s < wu - 1; s += 1.2) { quads.push([u + s, v + wv + 0.5, u + s + 0.6, v + wv + 3.5]); quads.push([u + s, v - wv - 3.5, u + s + 0.6, v - wv - 0.5]); }
      for (let s = -wv + 1; s < wv - 1; s += 1.2) { quads.push([u + wu + 0.5, v + s, u + wu + 3.5, v + s + 0.6]); quads.push([u - wu - 3.5, v + s, u - wu - 0.5, v + s + 0.6]); }
    }
    if (!quads.length) return null;
    const pos = new Float32Array(quads.length * 18);
    quads.forEach(([u0, v0, u1, v1], q) => pos.set([u0, y, v0, u0, y, v1, u1, y, v1, u0, y, v0, u1, y, v1, u1, y, v0], q * 18));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.computeVertexNormals(); g.computeBoundingSphere();
    return new THREE.Mesh(g, this.paintMat);
  }

  // Street furniture, stalls and rooftop kit within PROP_R: instanced per kind, rebuilt when
  // you've moved a block's width.
  updateProps(u, v, y) {
    if (this.propAt && Math.hypot(this.propAt[0] - u, this.propAt[1] - v) < 40) return;
    this.propAt = [u, v];
    if (this.props) { this.group.remove(this.props); this.props.traverse(o => o.isInstancedMesh && o.dispose()); }
    this.props = new THREE.Group(); this.group.add(this.props);
    if (Math.hypot(u, v) > this.city.R + PROP_R) return;
    const c = this.city, base = c.h + CURB, byKind = new Map();
    const [i0, j0] = [Math.floor((u - PROP_R) / PITCH) - 1, Math.floor((v - PROP_R) / PITCH) - 1];
    for (let i = i0; i <= i0 + Math.ceil(2 * PROP_R / PITCH) + 2; i++) for (let j = j0; j <= j0 + Math.ceil(2 * PROP_R / PITCH) + 2; j++) {
      const B = cityBlock(c, i, j); if (!B.district) continue;
      for (const p of B.props) { const d = Math.hypot(p.u - u, p.v - v); if (d > PROP_R || (d > SMALL_R && !BIG.test(p.k))) continue; if (this.isBroken?.(B, B.props.indexOf(p))) { let l = byKind.get('scrapheap'); if (!l) byKind.set('scrapheap', l = []); l.push({ ...p, s: 0.45, y: Math.min(p.y, 0.05) }); continue; } let l = byKind.get(p.k); if (!l) byKind.set(p.k, l = []); l.push(p); }
    }
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    for (const [k, list] of byKind) {
      const proto = this.kit(k); if (!proto) continue;
      for (const part of proto) {
        const im = new THREE.InstancedMesh(share(part.geometry), part.material, list.length);
        list.forEach((p, q) => { Q.setFromAxisAngle(up, p.rot); S.setScalar(p.s || 1); P.set(p.u, base + p.y, p.v); M.compose(P, Q, S).multiply(part.matrix); im.setMatrixAt(q, M);
          if (part.tinted) im.setColorAt(q, col.setRGB(...kitTint(part.tinted, k, p.u, p.v))); });
        im.computeBoundingSphere(); im.castShadow = part.cast; im.receiveShadow = true; this.props.add(im);
      }
    }
  }
  // The model for a kit name: from the city kit GLB when it has it (mesh 'city_<k>'), else
  // a plain stand-in shape of the right size.
  kit(k) {
    this.kits ||= new Map();
    if (this.kits.has(k)) return this.kits.get(k);
    let parts = this.propLib?.cityPart?.(k) || this.propLib?.cityPart?.('common_' + k) || this.propLib?.cityPart?.('item_' + k) || null;
    if (!parts) parts = standIn(k);
    for (const pt of parts) if (pt.material.name === 'lampwarm' || pt.material.name?.startsWith('neon')) this.glowMats.add(pt.material);
    this.kits.set(k, parts);
    return parts;
  }
}

// stand-ins until the kit model exists: a sized, coloured box or cylinder
const SIZES = {   // w, h, d, colour, shape
  tree: [3, 7, 3, 0x3f6a34, 'tree'], tree_lux: [2.5, 6, 2.5, 0x4a7a3a, 'tree'], lamp_cobra: [0.3, 8, 0.3, 0x55595e, 'lamp'], lamp_double: [0.3, 7, 0.3, 0x4a4d50, 'lamp'],
  lamp_lux: [0.25, 6, 0.25, 0xb0b4b8, 'lamp'], lamp_lantern: [0.25, 4.5, 0.25, 0x302a24, 'lamp'], lamp_neon: [0.2, 5, 0.2, 0x303438, 'lamp'], lamp_flood: [0.4, 12, 0.4, 0x606468, 'lamp'], lamp_park: [0.2, 4, 0.2, 0x2a2e2a, 'lamp'],
  bench: [1.8, 0.8, 0.6, 0x6b5640], bench_lux: [2.2, 0.6, 0.7, 0x9aa0a4], bin: [0.6, 1, 0.6, 0x3a4a3a, 'cyl'], bin_lux: [0.6, 1, 0.6, 0xa0a4a8, 'cyl'], bin_rusty: [0.6, 1, 0.6, 0x6a4a30, 'cyl'],
  vending: [1, 1.9, 0.8, 0xb03030], vending2: [1, 1.9, 0.8, 0x3070b0], vending_old: [1, 1.9, 0.8, 0x707040], kiosk: [2.4, 2.8, 2, 0x406070], kiosk_lux: [2.4, 3, 2, 0xc0c4c8],
  planter: [1.6, 0.8, 1.6, 0x505050], planter_lux: [2, 0.7, 2, 0xb8b8b0], bollard: [0.3, 1, 0.3, 0x606060, 'cyl'], newsstand: [1.4, 1.4, 0.6, 0x405030], shelter: [4, 2.8, 1.6, 0x506070],
  atm: [0.8, 1.8, 0.6, 0x404850], bikerack: [2, 0.8, 0.4, 0x707070], mailbox: [0.5, 1.2, 0.5, 0x2050a0], hydrant: [0.35, 0.8, 0.35, 0xc03020, 'cyl'], terminal_post: [0.5, 1.6, 0.4, 0x304050],
  holo_post: [0.4, 3, 0.4, 0x4080c0, 'cyl'], dumpster: [2, 1.4, 1.2, 0x2f5a3a], trashpile: [2, 0.8, 2, 0x4a4438], boxes: [1.4, 1, 1.2, 0x8a7050], firebarrel: [0.6, 0.9, 0.6, 0x5a3a24, 'cyl'],
  junction: [0.9, 1.4, 0.5, 0x6a6a5a], steamvent: [1, 0.3, 1, 0x505050], barrier: [2, 1, 0.5, 0xc0a030], drums: [1.6, 0.9, 0.8, 0x305080], pallet: [1.2, 0.6, 1.2, 0x8a6a40], container: [6, 2.6, 2.4, 0x9a4a2a],
  crates_fruit: [1.6, 0.8, 1, 0xa06030], sacks: [1.2, 0.6, 0.9, 0xb09a70], handcart: [1.6, 1, 0.9, 0x705030], foodcart: [2, 2.2, 1.2, 0xc06030], foodcart2: [2, 2.2, 1.2, 0x30a070], stool: [0.4, 0.6, 0.4, 0x705030, 'cyl'],
  barrels: [1.4, 1, 0.7, 0x704a2a], lanterns_post: [0.2, 3, 0.2, 0x402a20], fuelcart: [3, 1.6, 1.8, 0xc0c040], cargoloader: [4, 2.4, 2.4, 0xd0a020], padlights: [16, 0.15, 16, 0xfff0a0, 'pad'],
  stall_canopy: [3.2, 2.6, 2.4, 0xb04030], stall_umbrella: [3, 2.6, 3, 0x3060b0], stall_cart: [2.4, 2, 1.4, 0x90703a], stall_tent: [3, 2.8, 2.6, 0xd0c0a0], stall_crate: [3, 1.2, 2, 0x8a6a40], stall_noodle: [3.4, 2.6, 2.2, 0xd03030],
  stall_fish: [3, 2.4, 2, 0x40a0b0], stall_cloth: [3, 2.8, 2.2, 0x9030a0], stall_tech: [3, 2.4, 2, 0x404a50], stall_fruit: [3, 2.4, 2.2, 0x60a030], stall_spice: [3, 2.4, 2.2, 0xd08020], stall_grill: [2.6, 2.4, 2, 0x502a20],
  baskets: [1, 0.5, 1, 0xa08050], pots: [1, 0.6, 1, 0x905030], rugs: [1.6, 0.5, 1, 0xa03040], cage: [0.8, 0.8, 0.8, 0x707070], scale: [0.6, 1.2, 0.5, 0x908060], lanternline: [7, 0.4, 0.1, 0xffa040, 'glow'],
  sign_shop: [3, 1, 0.2, 0x2080d0, 'glow'], sign_market: [3, 1, 0.2, 0xe0a020, 'glow'], sign_blade: [0.3, 3, 1, 0xd03070, 'glow'], holo_ad: [4, 2.4, 0.1, 0x40d0e0, 'glow'], awning: [3, 0.3, 1.6, 0xb04030], awning2: [3, 0.3, 1.6, 0x308050], lanterns: [3, 0.5, 0.3, 0xff8030, 'glow'],
  neon_bar: [2.4, 0.7, 0.15, 0xff3080, 'glow'], neon_noodle: [2.6, 0.8, 0.15, 0xff6020, 'glow'], neon_eye: [1.2, 1.2, 0.15, 0x30e0ff, 'glow'], neon_arrow: [1.8, 0.7, 0.15, 0xffe030, 'glow'], neon_ring: [1.4, 1.4, 0.15, 0xa040ff, 'glow'],
  neon_vert: [0.6, 3.2, 0.15, 0xff2050, 'glow'], neon_cross: [1, 1, 0.15, 0x30ff60, 'glow'], neon_star: [1.2, 1.2, 0.15, 0xff9030, 'glow'], neon_fish: [1.8, 0.9, 0.15, 0x40a0ff, 'glow'], neon_glyph: [0.8, 2.4, 0.15, 0xff40c0, 'glow'],
  pipes: [0.5, 0.5, 14, 0x6a6a60, 'pipe'], pipes2: [0.8, 0.8, 14, 0x5a4a3a, 'pipe'], cables: [0.15, 0.15, 14, 0x202020, 'pipe'],
  ac: [1.4, 1, 1, 0x9a9a98], ac2: [2.4, 1.6, 1.6, 0x8a8c8e], tank_roof: [2.4, 3, 2.4, 0x7a6a5a, 'cyl'], antenna: [0.15, 6, 0.15, 0x909090, 'cyl'], dish: [2, 1.6, 2, 0xc8c8c8, 'cyl'], vent: [1, 1.2, 1, 0x707070, 'cyl'],
  solar: [3, 0.4, 2, 0x203048], cooling: [3, 2.4, 3, 0x8a9090, 'cyl'], billboard: [6, 4, 0.4, 0xe0e0e0, 'glow'], aerial: [0.1, 4, 0.1, 0x808080, 'cyl'], skylight: [3, 0.6, 3, 0x405060], beacon: [0.4, 2, 0.4, 0xff3020, 'cyl'],
  shack: [3, 2.4, 2.6, 0x6a5a48], mattress: [1.9, 0.25, 0.9, 0x8a8070], scrapheap: [3, 1.4, 3, 0x5a5048], leanto: [3, 2, 2, 0x707060], hulk: [4, 1.4, 2, 0x5a4a40],
  tank: [9, 10, 9, 0xb0b0a8, 'cyl'], silo: [7, 18, 7, 0xa0a098, 'cyl'], sphere: [10, 10, 10, 0xc0c0b8, 'ball'], stack: [3, 30, 3, 0x6a5a50, 'cyl'], crane: [2, 28, 2, 0xd0a020], forklift: [1.4, 2, 2.6, 0xe0b020],
  fountain: [8, 1.2, 8, 0x8a9aa0, 'cyl'], monument: [3, 12, 3, 0xa0a0a0], statue: [2, 6, 2, 0x8a7a5a], play: [3, 2, 3, 0xc04040], washline: [6, 2.2, 0.2, 0xd0d0c0], kiosk_food: [2.4, 2.8, 2, 0xa06040],
};
let TINTS = [[0.72, 0.16, 0.12], [0.1, 0.36, 0.62], [0.86, 0.6, 0.12], [0.16, 0.5, 0.3], [0.56, 0.2, 0.52], [0.84, 0.82, 0.76], [0.2, 0.22, 0.24], [0.9, 0.36, 0.1], [0.12, 0.56, 0.6]];
const MUTED = [[0.16, 0.17, 0.18], [0.12, 0.2, 0.16], [0.13, 0.16, 0.24], [0.3, 0.14, 0.1], [0.24, 0.24, 0.22]];
// a kit part's colour: 'bright' parts vary piece by piece; 'muted' street steel is one colour per kind
export const setKitPalette = p => { TINTS = p; };
export function kitTint(mode, k, u, v) {
  if (mode === 'muted') { let h = 0; for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return MUTED[h % MUTED.length]; }
  const h = Math.abs(Math.sin(u * 12.9898 + v * 78.233) * 43758.5453) % 1; return TINTS[Math.floor(h * TINTS.length)];
}
const standInCache = new Map();
function standIn(k) {
  if (standInCache.has(k)) return standInCache.get(k);
  const [w, h, d, col, shape] = SIZES[k] || [1, 1, 1, 0x808080];
  const glow = shape === 'glow' || shape === 'pad';
  const mat = glow ? new THREE.MeshBasicMaterial({ color: col }) : new THREE.MeshStandardMaterial({ color: col, roughness: 0.75, metalness: 0.2 });
  let parts;
  const I = new THREE.Matrix4();
  if (shape === 'tree') {
    parts = [{ geometry: new THREE.CylinderGeometry(0.12 * w / 3, 0.18 * w / 3, h * 0.45, 6).translate(0, h * 0.225, 0), material: new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.9 }), matrix: I, cast: true },
      { geometry: new THREE.IcosahedronGeometry(w * 0.55, 1).scale(1, 1.25, 1).translate(0, h * 0.62, 0), material: new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 }), matrix: I, cast: true }];
  } else if (shape === 'lamp') {
    parts = [{ geometry: new THREE.CylinderGeometry(w * 0.35, w * 0.5, h, 6).translate(0, h / 2, 0), material: mat, matrix: I, cast: true },
      { geometry: new THREE.BoxGeometry(0.5, 0.18, 1.4).translate(0, h - 0.1, 0.6), material: lampGlow(), matrix: I, cast: false }];
  } else {
    const g = shape === 'cyl' ? new THREE.CylinderGeometry(w / 2, w / 2, h, 12).translate(0, h / 2, 0) : shape === 'ball' ? new THREE.SphereGeometry(w / 2, 14, 10).translate(0, h / 2 + 2, 0)
      : shape === 'pipe' ? new THREE.CylinderGeometry(w / 2, w / 2, d, 6).rotateX(Math.PI / 2) : new THREE.BoxGeometry(w, h, d).translate(0, shape === 'pad' ? 0.08 : h / 2, 0);
    parts = [{ geometry: g, material: mat, matrix: I, cast: !glow }];
  }
  standInCache.set(k, parts);
  return parts;
}
let lampGlowMat = null;
const lampGlow = () => lampGlowMat ||= new THREE.MeshBasicMaterial({ color: 0xfff1d0 });
export const cityLampMaterial = lampGlow;
