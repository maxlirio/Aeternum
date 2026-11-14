// Draws the armour on the line (sim/armor.js). Both are original designs, built of their real parts:
//  · the Warden, a tank: a welded hull with a shallow upper glacis, side skirts in bolted panels over the running gear (six
//    dual road wheels a side on swing arms, a toothed drive sprocket at the back, an idler at the front, return rollers), a
//    track of separate steel links with rubber pads that runs round them as it drives, a faceted turret with its mantlet,
//    a long gun with a thermal sleeve, bore evacuator and muzzle sensor, a coaxial machine gun, a commander's cupola with
//    vision blocks and an open hatch, the gunner's sight, smoke dischargers, antennas, a stowage basket with tarps on the
//    bustle, louvred engine grilles, lights, tow hooks;
//  · the Drover, an armoured carrier: a boat-nosed welded hull on eight big tyres (lugged treads, rims, hubs), fenders, a
//    small turret with a light cannon, a rear ramp that drops for the squad, roof hatches, vision blocks, a trim vane.
// Each side paints its own. Knocked out, they're burnt black, and a tank's turret is thrown off its ring.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { townSurface } from './materials.js';
import { ARMOR } from '../sim/armor.js';

const PAINT = { ours: 0x5a6442, theirs: 0x857052 };
const matCache = new Map();
function mat(name, color, o = {}) { const k = name + ':' + color + ':' + JSON.stringify(o); if (!matCache.has(k)) { const m = townSurface(name).clone(); m.vertexColors = false; m.color.setHex(color); Object.assign(m, o); matCache.set(k, m); } return matCache.get(k); }
const charred = () => mat('metal', 0x1e1b19, { roughness: 0.95, metalness: 0.2 });
const glassMat = () => { const k = 'glass'; if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color: 0x223038, roughness: 0.1, metalness: 0.6, emissive: 0x0a1418, emissiveIntensity: 0.6 })); return matCache.get(k); };

// a kit of parts: geometry gathered by material, merged into one mesh per material at the end
class Kit {
  constructor() { this.by = new Map(); }
  add(g, m) { g = g.index ? g.toNonIndexed() : g; if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); if (!this.by.has(m)) this.by.set(m, []); this.by.get(m).push(g); return g; }
  box(w, h, d, x, y, z, m, rx = 0, ry = 0, rz = 0) { const g = new THREE.BoxGeometry(w, h, d); if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz))); g.translate(x, y, z); return this.add(g, m); }
  // a cylinder along x (axis 'x'), y or z
  cyl(r, len, x, y, z, m, axis = 'y', seg = 16, r1 = r) { const g = new THREE.CylinderGeometry(r1, r, len, seg); if (axis === 'x') g.rotateZ(Math.PI / 2); if (axis === 'z') g.rotateX(Math.PI / 2); g.translate(x, y, z); return this.add(g, m); }
  // a side profile [(z, y)…] extruded across the width (centred on x = 0)
  prism(pts, width, m, bevel = 0.03) { const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y))); const g = new THREE.ExtrudeGeometry(sh, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, steps: 1 }); g.translate(0, 0, -(width - bevel * 2) / 2); g.rotateY(-Math.PI / 2); return this.add(g, m); }
  // a plan [(x, z)…] extruded upward from y0 by h
  plan(pts, y0, h, m, bevel = 0.05) { const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z))); const g = new THREE.ExtrudeGeometry(sh, { depth: h - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, steps: 1 }); g.rotateX(-Math.PI / 2); g.translate(0, y0 + bevel, 0); return this.add(g, m); }
  done(parent, cast = true) { const out = []; for (const [m, list] of this.by) { const g = mergeGeometries(list.map(clean)); g.computeBoundingSphere(); const mesh = new THREE.Mesh(g, m); mesh.castShadow = cast; mesh.receiveShadow = true; parent.add(mesh); out.push(mesh); } this.by.clear(); return out; }
}
const clean = g => { const o = new THREE.BufferGeometry(); for (const a of ['position', 'normal', 'uv']) o.setAttribute(a, g.attributes[a]); return o; };

// ---- the track: the loop the links run round, as points in (z, y) with their lengths along it
function trackLoop(idler, sprocket, low, lowZ) {
  const pts = [], arc = (cz, cy, r, a0, a1, n) => { for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cz + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  // bottom run forward, up round the idler, back along the top (sagging a little between rollers), down round the sprocket
  pts.push([lowZ[0], low]); pts.push([lowZ[1], low]);
  arc(idler[0], idler[1], idler[2], -Math.PI / 2 - 0.5, Math.PI / 2, 12);
  const topY = idler[1] + idler[2]; for (let i = 1; i < 6; i++) { const f = i / 6, z = idler[0] + (sprocket[0] - idler[0]) * f; pts.push([z, topY + (sprocket[1] + sprocket[2] - topY) * f - Math.sin(f * Math.PI * 3) ** 2 * 0.035]); }
  arc(sprocket[0], sprocket[1], sprocket[2], Math.PI / 2, Math.PI * 1.5 + 0.4, 12);
  const L = [0]; for (let i = 1; i <= pts.length; i++) { const a = pts[i - 1], b = pts[i % pts.length]; L.push(L[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const cz = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return { pts, L, total: L[L.length - 1], c: [cz, cy] };
}
function along(loop, s) { s = ((s % loop.total) + loop.total) % loop.total; let i = 1; while (loop.L[i] < s) i++; const a = loop.pts[i - 1], b = loop.pts[i % loop.pts.length], f = (s - loop.L[i - 1]) / (loop.L[i] - loop.L[i - 1] || 1); return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, Math.atan2(b[1] - a[1], b[0] - a[0])]; }

// ---- the Warden
const TW = { trackX: 1.47, wheelZ: [-2.45, -1.47, -0.49, 0.49, 1.47, 2.45], wheelY: 0.42, wheelR: 0.36, spr: [-3.22, 0.66, 0.37], idl: [3.18, 0.64, 0.31], rollers: [-1.6, 0, 1.6] };
function buildTank(side) {
  const P = mat('paint', PAINT[side]), Pd = mat('paint', new THREE.Color(PAINT[side]).multiplyScalar(0.62).getHex()), M = mat('metal', 0x5a5a58, { metalness: 0.8, roughness: 0.55 }), Md = mat('metal', 0x2e2d2b, { metalness: 0.7, roughness: 0.7 }), Rb = mat('rubber', 0x1c1c1c), Rs = mat('rust', 0x6a4a38), Cv = mat('canvas', 0x6e6650), G = glassMat();
  const root = new THREE.Group(), hull = new THREE.Group(); root.add(hull); const K = new Kit();
  // the hull: lower tub between the tracks, upper hull over them with the glacis, rear plate
  K.prism([[-3.45, 0.5], [3.0, 0.5], [3.62, 0.98], [-3.45, 0.98]], 2.25, P);
  K.prism([[-3.5, 0.98], [3.62, 0.98], [2.2, 1.52], [-3.25, 1.56], [-3.5, 1.3]], 3.5, P, 0.04);
  // skirts: five bolted panels a side, a rubber flap under them
  for (const sx of [-1, 1]) { for (let i = 0; i < 5; i++) { const z0 = -3.1 + i * 1.22; K.box(0.05, 0.5, 1.2, sx * 1.8, 0.87, z0 + 0.6, P); for (let b = 0; b < 3; b++) K.cyl(0.025, 0.03, sx * 1.83, 1.06, z0 + 0.2 + b * 0.4, Md, 'x', 6); }
    K.box(0.03, 0.08, 6.05, sx * 1.8, 0.58, -0.08, Rb);
    // fenders over the track ends, suspension arms, return rollers
    K.box(0.66, 0.04, 0.6, sx * TW.trackX, 1.0, 3.35, P, -0.25); K.box(0.66, 0.04, 0.35, sx * TW.trackX, 1.0, -3.42, P, 0.3);
    for (const z of TW.wheelZ) K.box(0.12, 0.12, 0.62, sx * 1.16, 0.62, z + 0.22, Pd, 0.6);
    for (const z of TW.rollers) K.cyl(0.09, 0.14, sx * TW.trackX, 1.02, z, Md, 'x', 10); }
  // engine deck: two louvred grilles; exhaust grille on the rear plate; stowage bins on the rear sponsons
  for (const sx of [-1, 1]) { K.box(1.15, 0.04, 1.0, sx * 0.75, 1.565, -2.75, Md); for (let i = 0; i < 8; i++) K.box(1.05, 0.05, 0.05, sx * 0.75, 1.6, -3.18 + i * 0.12, M, 0.5);
    K.box(0.62, 0.32, 0.9, sx * 1.42, 1.72, -2.85, P); K.box(0.64, 0.03, 0.92, sx * 1.42, 1.885, -2.85, Pd); }
  K.box(1.6, 0.36, 0.06, 0, 1.12, -3.53, Rs); for (let i = 0; i < 5; i++) K.box(1.5, 0.03, 0.05, 0, 0.99 + i * 0.065, -3.57, Md);
  // the driver's hatch and periscopes; lights; tow hooks
  K.cyl(0.32, 0.06, 0, 1.53, 2.15, P, 'y', 18); for (const x of [-0.22, 0, 0.22]) K.box(0.14, 0.09, 0.07, x, 1.56, 2.5, G);
  for (const sx of [-1, 1]) { K.box(0.2, 0.14, 0.12, sx * 1.25, 1.12, 3.5, Md); K.box(0.16, 0.1, 0.02, sx * 1.25, 1.12, 3.565, mat('metal', 0xd8d8c8, { emissive: new THREE.Color(0x605a40), emissiveIntensity: 0.6 })); K.cyl(0.05, 0.22, sx * 0.7, 0.62, 3.4, Rs, 'z', 8); K.cyl(0.05, 0.22, sx * 0.8, 0.66, -3.5, Rs, 'z', 8); }
  K.done(hull);
  // the running gear that turns: wheels as instances (so they can roll), sprockets and idlers
  const wheels = { tyre: null, disc: null, list: [] }, WG = new THREE.CylinderGeometry(TW.wheelR, TW.wheelR, 0.15, 22).rotateZ(Math.PI / 2), DG = (() => { const parts = [new THREE.CylinderGeometry(0.3, 0.3, 0.17, 18).rotateZ(Math.PI / 2), new THREE.CylinderGeometry(0.09, 0.09, 0.22, 10).rotateZ(Math.PI / 2)]; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; parts.push(new THREE.BoxGeometry(0.2, 0.05, 0.05).translate(0, Math.cos(a) * 0.17, Math.sin(a) * 0.17)); } return mergeGeometries(parts.map(g => clean(g.toNonIndexed()))); })();
  for (const sx of [-1, 1]) for (const z of TW.wheelZ) for (const dx of [-0.12, 0.12]) wheels.list.push({ x: sx * TW.trackX + dx, y: TW.wheelY, z, r: TW.wheelR, side: sx });
  wheels.tyre = new THREE.InstancedMesh(WG, Rb, wheels.list.length); wheels.disc = new THREE.InstancedMesh(DG, Pd, wheels.list.length); for (const im of [wheels.tyre, wheels.disc]) { im.castShadow = true; im.frustumCulled = false; hull.add(im); }
  const gears = [], gear = (r, teeth, m) => { const parts = [new THREE.CylinderGeometry(r * 0.82, r * 0.82, 0.12, 20).rotateZ(Math.PI / 2), new THREE.CylinderGeometry(0.1, 0.1, 0.2, 10).rotateZ(Math.PI / 2)];
    for (let i = 0; i < teeth; i++) { const a = i / teeth * Math.PI * 2; parts.push(new THREE.BoxGeometry(0.12, 0.08, 0.07).rotateX(-a).translate(0, Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9)); } return new THREE.Mesh(mergeGeometries(parts.map(g => clean(g.toNonIndexed()))), m); };
  for (const sx of [-1, 1]) for (const dx of [-0.13, 0.13]) { const s = gear(TW.spr[2], 12, M); s.position.set(sx * TW.trackX + dx, TW.spr[1], TW.spr[0]); s.castShadow = true; hull.add(s); gears.push({ m: s, r: TW.spr[2], side: sx });
    const i = gear(TW.idl[2], 0, M); i.position.set(sx * TW.trackX + dx, TW.idl[1], TW.idl[0]); i.castShadow = true; hull.add(i); gears.push({ m: i, r: TW.idl[2], side: sx }); }
  // the tracks: steel links with rubber pads and a guide horn, run round the loop
  const loop = trackLoop([TW.idl[0], TW.idl[1], TW.idl[2] + 0.035], [TW.spr[0], TW.spr[1], TW.spr[2] + 0.035], TW.wheelY - TW.wheelR - 0.03, [TW.wheelZ[0] - 0.2, TW.wheelZ[5] + 0.2]);
  const pitch = 0.165, N = Math.floor(loop.total / pitch), linkG = mergeGeometries([clean(new THREE.BoxGeometry(0.66, 0.045, 0.145).toNonIndexed()), clean(new THREE.BoxGeometry(0.06, 0.08, 0.07).translate(0, 0.055, 0).toNonIndexed()), clean(new THREE.BoxGeometry(0.52, 0.03, 0.115).translate(0, -0.035, 0).toNonIndexed())], true);
  const tracks = new THREE.InstancedMesh(linkG, [Md, Md, Rb], N * 2); tracks.castShadow = true; tracks.frustumCulled = false; hull.add(tracks);
  // the turret: on its ring, turning; the gun on its trunnions, lifting; the barrel recoiling into the turret
  const turret = new THREE.Group(); turret.position.set(0, 1.56, ARMOR.tank.pivot); hull.add(turret); const T = new Kit();
  T.cyl(1.2, 0.14, 0, 0.0, 0, Md, 'y', 28);
  T.plan([[0.55, 1.75], [1.45, 1.0], [1.55, -0.6], [1.35, -1.95], [-1.35, -1.95], [-1.55, -0.6], [-1.45, 1.0], [-0.55, 1.75]], 0.02, 0.72, P, 0.06);
  // cupola with vision blocks; commander's sight on its post; gunner's sight; loader's hatch and his machine gun
  T.cyl(0.38, 0.22, -0.6, 0.83, -0.5, P, 'y', 20); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; T.box(0.15, 0.09, 0.06, -0.6 + Math.sin(a) * 0.37, 0.86, -0.5 + Math.cos(a) * 0.37, G, 0, a); }
  T.cyl(0.05, 0.3, -1.0, 0.95, 0.55, Md, 'y', 8); T.cyl(0.17, 0.26, -1.0, 1.2, 0.55, P, 'y', 14); T.box(0.24, 0.13, 0.03, -1.0, 1.2, 0.71, G);
  T.box(0.42, 0.32, 0.55, 0.72, 0.9, 0.95, P); T.box(0.34, 0.2, 0.03, 0.72, 0.92, 1.235, G);
  T.cyl(0.33, 0.05, 0.62, 0.77, -0.65, P, 'y', 18); T.cyl(0.03, 0.4, 0.62, 0.95, -0.65, Md, 'y', 6); T.box(0.1, 0.13, 0.55, 0.62, 1.2, -0.55, Md); T.cyl(0.018, 0.55, 0.62, 1.22, -0.05, Md, 'z', 6); T.box(0.14, 0.14, 0.2, 0.75, 1.15, -0.6, P);
  // smoke dischargers, a cluster each side; stowage boxes on the sides; antennas; the bustle basket with its tarps
  for (const sx of [-1, 1]) { for (let i = 0; i < 4; i++) { const g = new THREE.CylinderGeometry(0.045, 0.045, 0.26, 8); g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.9 - (i % 2) * 0.25, 0, sx * (0.6 + (i >> 1) * 0.3)))); g.translate(sx * 1.43, 0.52 + (i % 2) * 0.1, 0.95 + (i >> 1) * 0.12); T.add(g, Md); }
    T.box(0.12, 0.4, 1.25, sx * 1.6, 0.36, -0.95, P); T.cyl(0.05, 0.08, sx * 1.0, 0.78, -1.62, Md, 'y', 8); T.cyl(0.011, 2.5, sx * 1.0, 2.05, -1.62, Md, 'y', 4, 0.006); }
  for (const [x, y] of [[-1.3, 0.2], [1.3, 0.2], [-1.3, 0.62], [1.3, 0.62]]) T.box(0.05, 0.05, 0.6, x, y, -2.25, Md);
  T.box(2.65, 0.05, 0.05, 0, 0.62, -2.55, Md); T.box(2.65, 0.05, 0.05, 0, 0.2, -2.55, Md); T.box(2.65, 0.03, 0.62, 0, 0.16, -2.25, Md);
  T.cyl(0.18, 1.05, -0.55, 0.36, -2.25, Cv, 'x', 12); T.cyl(0.16, 0.95, 0.6, 0.35, -2.27, mat('canvas', 0x5a5844), 'x', 12); T.box(0.9, 0.22, 0.35, 0.1, 0.5, -2.3, mat('canvas', 0x4e5440));
  T.done(turret);
  // the hatch, open
  const hatch = new THREE.Group(); hatch.position.set(-0.6, 0.95, -0.82); turret.add(hatch); const HK = new Kit(); HK.cyl(0.34, 0.05, 0, 0, 0.33, P, 'y', 18); HK.box(0.08, 0.06, 0.3, 0, 0.04, 0.33, Md); HK.done(hatch); hatch.rotation.x = -1.75;
  // the mantlet, the gun on its trunnions
  const gunPivot = new THREE.Group(); gunPivot.position.set(0, 0.42, 1.75); turret.add(gunPivot); const MK = new Kit();
  MK.box(0.95, 0.62, 0.42, 0, -0.04, 0.12, P); MK.cyl(0.03, 0.5, 0.33, -0.12, 0.45, Md, 'z', 8); MK.box(0.18, 0.12, 0.08, 0.33, -0.12, 0.32, Md); MK.done(gunPivot);
  const barrel = new THREE.Group(); gunPivot.add(barrel); const BK = new Kit();
  BK.cyl(0.095, 4.6, 0, 0, 0.2 + 2.3, Pd, 'z', 18, 0.085); for (const z of [1.2, 2.0, 3.7]) BK.cyl(0.112, 0.07, 0, 0, z, P, 'z', 18);      // the thermal sleeve's bands
  BK.cyl(0.15, 0.55, 0, 0, 2.75, Pd, 'z', 20, 0.14); BK.cyl(0.11, 0.2, 0, 0, 4.7, M, 'z', 16); BK.box(0.07, 0.06, 0.12, 0, 0.13, 4.62, Md); BK.cyl(0.13, 0.35, 0, 0, 0.35, Md, 'z', 18);      // bore evacuator, muzzle, its reference sensor, the breech collar
  BK.done(barrel);
  const flash = muzzleFlash(1.4); flash.position.set(0, 0, 4.82); barrel.add(flash);
  return { root, hull, turret, gunPivot, barrel, flash, hatch, wheels, gears, tracks, loop, pitch, N, kind: 'tank', meshes: collect(root), T: ARMOR.tank };
}

// ---- the Drover
const DW = { z: [-2.55, -1.25, 1.0, 2.3], x: 1.38, y: 0.56, r: 0.56 };
function buildApc(side) {
  const P = mat('paint', PAINT[side]), Pd = mat('paint', new THREE.Color(PAINT[side]).multiplyScalar(0.62).getHex()), M = mat('metal', 0x5a5a58, { metalness: 0.8, roughness: 0.55 }), Md = mat('metal', 0x2e2d2b, { metalness: 0.7, roughness: 0.7 }), Rb = mat('rubber', 0x1a1a1a), G = glassMat();
  const root = new THREE.Group(), hull = new THREE.Group(); root.add(hull); const K = new Kit();
  K.prism([[-3.5, 0.66], [2.55, 0.66], [3.5, 1.25], [2.2, 1.9], [-3.3, 2.0], [-3.5, 1.62]], 2.5, P, 0.05);
  // fenders over each pair of wheels, a trim vane on the nose, lights, vision blocks, roof hatches, exhaust, a tool rack
  for (const sx of [-1, 1]) { for (const [z0, z1] of [[-3.2, -0.6], [0.35, 2.95]]) { K.box(0.62, 0.05, z1 - z0, sx * 1.42, 1.25, (z0 + z1) / 2, P); K.box(0.05, 0.3, z1 - z0, sx * 1.72, 1.12, (z0 + z1) / 2, P); }
    K.box(0.18, 0.13, 0.1, sx * 1.0, 1.45, 3.0, Md); K.box(0.15, 0.09, 0.02, sx * 1.0, 1.45, 3.06, mat('metal', 0xd8d8c8, { emissive: new THREE.Color(0x605a40), emissiveIntensity: 0.6 }));
    for (let i = 0; i < 3; i++) K.box(0.04, 0.09, 0.18, sx * 1.24, 1.9, 0.9 - i * 1.2, G); K.cyl(0.07, 0.6, sx * 1.33, 1.55, -1.6, mat('rust', 0x5a4232), 'z', 8);
    for (let i = 0; i < 4; i++) K.box(0.03, 0.03, 0.3, sx * 1.27, 1.4, -0.4 + i * 0.35, Md); }
  K.box(2.1, 0.06, 0.62, 0, 1.6, 2.83, Pd, 0.46);      // the trim vane, folded flat on the glacis for (let i = 0; i < 4; i++) K.box(0.18, 0.08, 0.05, -0.45 + i * 0.3, 1.88, 2.15, G);
  K.cyl(0.36, 0.06, -0.55, 2.03, -2.2, P, 'y', 18); K.cyl(0.36, 0.06, 0.55, 2.03, -2.2, P, 'y', 18); K.cyl(0.3, 0.06, 0.55, 1.94, 1.8, P, 'y', 18);
  K.cyl(0.04, 0.08, -1.0, 2.05, -3.0, Md, 'y', 8); K.cyl(0.01, 2.2, -1.0, 3.15, -3.0, Md, 'y', 4, 0.006);
  K.done(hull);
  // the ramp, hinged at the bottom of the back
  const ramp = new THREE.Group(); ramp.position.set(0, 0.7, -3.52); hull.add(ramp); const RK = new Kit(); RK.box(1.85, 1.25, 0.08, 0, 0.62, 0, P); for (let i = 0; i < 5; i++) RK.box(1.6, 0.03, 0.03, 0, 0.2 + i * 0.24, 0.05, Md); RK.box(0.08, 0.6, 0.05, 0.6, 0.8, -0.06, Md); RK.done(ramp);
  // eight wheels: lugged tyre, rim, hub
  const TG = (() => { const parts = [new THREE.CylinderGeometry(DW.r, DW.r, 0.4, 26).rotateZ(Math.PI / 2)]; for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; for (const dx of [-0.1, 0.1]) parts.push(new THREE.BoxGeometry(0.16, 0.05, 0.1).rotateX(-a + (dx > 0 ? 0.3 : -0.3)).translate(dx, Math.cos(a) * DW.r, Math.sin(a) * DW.r)); } return mergeGeometries(parts.map(g => clean(g.toNonIndexed()))); })();
  const RG = (() => { const parts = [new THREE.CylinderGeometry(0.31, 0.31, 0.42, 18).rotateZ(Math.PI / 2), new THREE.CylinderGeometry(0.13, 0.13, 0.46, 12).rotateZ(Math.PI / 2)]; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; parts.push(new THREE.CylinderGeometry(0.025, 0.025, 0.48, 6).rotateZ(Math.PI / 2).translate(0, Math.cos(a) * 0.2, Math.sin(a) * 0.2)); } return mergeGeometries(parts.map(g => clean(g.toNonIndexed()))); })();
  const wheels = { list: [] }; for (const sx of [-1, 1]) for (const z of DW.z) wheels.list.push({ x: sx * DW.x, y: DW.y, z, r: DW.r, side: sx });
  wheels.tyre = new THREE.InstancedMesh(TG, Rb, 8); wheels.disc = new THREE.InstancedMesh(RG, M, 8); for (const im of [wheels.tyre, wheels.disc]) { im.castShadow = true; im.frustumCulled = false; hull.add(im); }
  // the turret: small, the light cannon in it
  const turret = new THREE.Group(); turret.position.set(0, 1.95, ARMOR.apc.pivot); hull.add(turret); const T = new Kit();
  T.cyl(0.62, 0.1, 0, 0.0, 0, Md, 'y', 22); T.plan([[0.35, 0.78], [0.6, 0.35], [0.62, -0.55], [-0.62, -0.55], [-0.6, 0.35], [-0.35, 0.78]], 0.02, 0.46, P, 0.04);
  T.box(0.26, 0.2, 0.3, 0.38, 0.58, 0.25, P); T.box(0.2, 0.12, 0.02, 0.38, 0.6, 0.405, G); T.cyl(0.26, 0.05, -0.25, 0.5, -0.2, P, 'y', 16);
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const g = new THREE.CylinderGeometry(0.04, 0.04, 0.22, 8); g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.9, 0, sx * (0.5 + i * 0.25)))); g.translate(sx * 0.6, 0.3, 0.2 + i * 0.1); T.add(g, Md); }
  T.done(turret);
  const gunPivot = new THREE.Group(); gunPivot.position.set(0, 0.35, 0.72); turret.add(gunPivot); const MK = new Kit(); MK.box(0.38, 0.3, 0.25, 0, 0, 0.05, P); MK.cyl(0.02, 0.4, 0.17, -0.05, 0.3, Md, 'z', 6); MK.done(gunPivot);
  const barrel = new THREE.Group(); gunPivot.add(barrel); const BK = new Kit(); BK.cyl(0.07, 0.6, 0, 0, 0.45, Md, 'z', 14); BK.cyl(0.04, 2.0, 0, 0, 1.6, M, 'z', 12); BK.cyl(0.058, 0.22, 0, 0, 2.6, Md, 'z', 12); for (let i = 0; i < 2; i++) BK.box(0.13, 0.025, 0.04, 0, 0, 2.55 + i * 0.08, Md); BK.done(barrel);
  const flash = muzzleFlash(0.6); flash.position.set(0, 0, 2.75); barrel.add(flash);
  return { root, hull, turret, gunPivot, barrel, flash, ramp, wheels, gears: [], tracks: null, kind: 'apc', meshes: collect(root), T: ARMOR.apc };
}
function muzzleFlash(s) { const g = new THREE.ConeGeometry(0.35 * s, 1.4 * s, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.7 * s), m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.visible = false; return m; }
function collect(root) { const out = []; root.traverse(o => { if (o.isMesh && o.material.blending !== THREE.AdditiveBlending) out.push(o); }); return out; }

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
export class ArmorView {
  constructor(scene, toRender) {
    this.scene = scene; this.toRender = toRender; this.group = new THREE.Group(); this.group.name = 'armor'; scene.add(this.group); this.models = new Map();
    // rounds in flight: bright streaks; rockets: a body with fins and the flame behind it
    this.tr = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tr.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 6), 3)); this.tr.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(64 * 6), 3)); this.tr.frustumCulled = false; this.group.add(this.tr);
    const rk = mergeGeometries([new THREE.CylinderGeometry(0.045, 0.045, 0.7, 10).rotateX(Math.PI / 2), new THREE.ConeGeometry(0.045, 0.2, 10).rotateX(Math.PI / 2).translate(0, 0, 0.45), ...[0, 1, 2, 3].map(i => new THREE.BoxGeometry(0.005, 0.12, 0.12).rotateZ(i * Math.PI / 2).translate(0, 0, -0.3))].map(g => clean(g.toNonIndexed())));
    this.rk = new THREE.InstancedMesh(rk, new THREE.MeshStandardMaterial({ color: 0x4a4e3a, roughness: 0.6, metalness: 0.3 }), 16); this.rk.count = 0; this.rk.frustumCulled = false; this.group.add(this.rk);
    this.rkFlame = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 16); this.rkFlame.count = 0; this.rkFlame.frustumCulled = false; this.group.add(this.rkFlame);
  }
  model(V) {
    let m = this.models.get(V.id); if (m) return m;
    m = V.kind === 'tank' ? buildTank(V.side) : buildApc(V.side); m.dL = 0; m.dR = 0; m.last = V.dist; m.burnt = false; this.group.add(m.root); this.models.set(V.id, m); return m;
  }
  update(A, dt, eye) {
    if (!A.I.F) { this.group.visible = false; return; } this.group.visible = true;
    const live = new Set();
    for (const V of A.list) {
      const m = this.model(V); live.add(V.id); m.root.position.set(...this.toRender(...V.pos)); m.root.visible = this.hide !== V.id;      // (your own, while your eye's at its sight)
      _e.set(-V.pitch, V.facing, V.roll, 'YXZ'); m.root.quaternion.setFromEuler(_e);
      const near = Math.hypot(V.pos[0] - eye[0], V.pos[2] - eye[2]) < 220;
      // the tracks and wheels: each side at its own speed (turning, one side runs faster than the other)
      const dd = V.dist - m.last; m.last = V.dist; const turn = V.yawRate * dt * V.T.W / 2; m.dL += dd - turn; m.dR += dd + turn;
      if (near) this.running(m);
      const tl = wrap(V.turret - V.facing); m.turret.rotation.y = tl; m.gunPivot.rotation.x = -(V.gun - V.pitch * Math.cos(tl));
      m.barrel.position.z = -0.38 * V.recoil * (V.kind === 'tank' ? 1 : 0.4);
      m.flash.visible = V.sinceShot < 0.06 && !V.dead; if (m.flash.visible) m.flash.scale.setScalar(0.7 + Math.random() * 0.6);
      if (m.ramp) m.ramp.rotation.x = -V.ramp * 2.15 - (V.dead ? 0.5 : 0);      // (down past level until its lip is on the ground: hinge 0.7 m up, ramp 1.25 m long)
      if (V.dead) this.wreck(m, V);
    }
    for (const [id, m] of this.models) if (!live.has(id)) { this.group.remove(m.root); m.root.traverse(o => { if (o.isMesh || o.isInstancedMesh) o.geometry.dispose(); }); this.models.delete(id); }
    // rounds
    const tp = this.tr.geometry.attributes.position, tc = this.tr.geometry.attributes.color; let k = 0, r = 0;
    for (const R of A.rounds) {
      if (R.kind === 'rocket') { if (r < 16) { const p = this.toRender(...R.p), l = Math.hypot(...R.v); _v.set(R.v[0] / l, R.v[1] / l, R.v[2] / l); _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _v); _m.compose(new THREE.Vector3(...p), _q, _s); this.rk.setMatrixAt(r, _m); _m.compose(new THREE.Vector3(p[0] - _v.x * 0.45, p[1] - _v.y * 0.45, p[2] - _v.z * 0.45), _q, _v.set(1, 1, 1).multiplyScalar(0.8 + Math.random() * 0.6)); this.rkFlame.setMatrixAt(r, _m); r++; } continue; }
      if (k >= 64) continue; const len = R.kind === 'shell' ? 0.012 : 0.02, a = this.toRender(R.p[0] - R.v[0] * len, R.p[1] - R.v[1] * len, R.p[2] - R.v[2] * len), b = this.toRender(...R.p), c = R.kind === 'shell' ? [1, 0.8, 0.5] : [1, 0.6, 0.3];
      tp.setXYZ(2 * k, ...a); tp.setXYZ(2 * k + 1, ...b); tc.setXYZ(2 * k, c[0] * 0.2, c[1] * 0.2, c[2] * 0.2); tc.setXYZ(2 * k + 1, ...c); k++;
    }
    this.tr.geometry.setDrawRange(0, k * 2); tp.needsUpdate = tc.needsUpdate = true; this.rk.count = this.rkFlame.count = r; this.rk.instanceMatrix.needsUpdate = this.rkFlame.instanceMatrix.needsUpdate = true;
  }
  running(m) {
    const W = m.wheels; W.list.forEach((w, i) => { const d = w.side > 0 ? m.dL : m.dR; _e.set(d / w.r, 0, 0); _q.setFromEuler(_e); _m.compose(_v.set(w.x, w.y, w.z), _q, _s); W.tyre.setMatrixAt(i, _m); W.disc.setMatrixAt(i, _m); });
    W.tyre.instanceMatrix.needsUpdate = W.disc.instanceMatrix.needsUpdate = true;
    for (const g of m.gears) g.m.rotation.x = (g.side > 0 ? m.dL : m.dR) / g.r;
    if (m.tracks) { let i = 0; for (const sx of [-1, 1]) { const d = sx > 0 ? m.dL : m.dR, x = sx * TW.trackX; for (let n = 0; n < m.N; n++) { const [z, y, a] = along(m.loop, n * m.pitch - d);      // (the loop runs one way round, so the pads, under each link, always face out)
          _e.set(-a, 0, 0); _q.setFromEuler(_e); _m.compose(_v.set(x, y, z), _q, _s); m.tracks.setMatrixAt(i++, _m); } }
      m.tracks.instanceMatrix.needsUpdate = true; }
  }
  // knocked out: burnt black; a tank's turret thrown up off its ring and come down askew beside it
  wreck(m, V) {
    if (!m.burnt) { m.burnt = true; const C = charred(); for (const o of m.meshes) o.material = Array.isArray(o.material) ? o.material.map(() => C) : C; if (m.tracks) m.tracks.material = [C, C, C]; m.flash.visible = false; this.running(m); m.toss = { side: Math.random() < 0.5 ? -1 : 1, spin: (Math.random() - 0.5) * 1.6 }; }
    if (m.kind === 'tank') { const f = Math.min(1, V.deadT / 1.1), h = 4 * 3.2 * f * (1 - f), t = m.toss;
      m.turret.position.set(t.side * 1.9 * f, 1.56 + h - 0.35 * f, ARMOR.tank.pivot - 0.4 * f); m.turret.rotation.set(0.35 * f, wrap(V.turret - V.facing) + t.spin * f, t.side * -0.5 * f); m.gunPivot.rotation.x = 0.12 * f; }
  }
}
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
