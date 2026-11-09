// The Vesper's street buildings (gen/vesper.js units). Far off, each is its shell — a block of the right size and colour with its floors and
// windows — drawn together in the ship's own frame. Within a few hundred metres it becomes the real building (world/vesperreal.js): walls with
// real openings, floors, stairs, rooms and furniture, a structure in the collision world. Built a couple a frame, dropped when you're well away.
import * as THREE from 'three';
import { MeshBuilder } from './meshbuilder.js';
import { buildBuilding } from './building-mesh.js';
import { PropView } from './props.js';
import { unitReal } from '../world/vesperreal.js';

const NEAR = 380, FAR = 460;
const WALLS = [[0.82, 0.76, 0.66], [0.62, 0.66, 0.7], [0.74, 0.6, 0.52], [0.55, 0.58, 0.52], [0.86, 0.84, 0.8], [0.48, 0.5, 0.56], [0.7, 0.68, 0.6], [0.66, 0.55, 0.48]];
function shellMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.05 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vL; varying vec3 vLN; varying vec3 vSz;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSz = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz)); vL = position * vSz; vLN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vL; varying vec3 vLN; varying vec3 vSz;\nfloat hq(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { vec3 n = abs(vLN); if (n.y < 0.5) {     // a wall: floors of windows, a plinth, a cornice; some rooms lit
          float u = (n.x > n.z ? vL.z : vL.x) + 50.0, y = vL.y + vSz.y * 0.5, fl = floor((y - 0.6) / 3.3), fy = fract((y - 0.6) / 3.3), cu = fract(u / 2.6);
          float win = step(0.18, cu) * step(cu, 0.82) * step(0.3, fy) * step(fy, 0.85) * step(0.0, fl) * step(y, vSz.y - 1.0);
          float lit = step(0.72, hq(vec3(floor(u / 2.6), fl, vL.x + vL.z)));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.1, 0.12) + 0.05 * hq(vec3(floor(u / 2.6), fl, 3.0)), win);
          diffuseColor.rgb *= 1.0 - 0.25 * (1.0 - step(0.7, y)) - 0.2 * step(vSz.y - 0.7, y);
          totalEmissiveRadiance += vec3(1.0, 0.8, 0.55) * win * lit * 0.35; } }`);
  };
  m.customProgramCacheKey = () => 'vesper-shell';
  return m;
}
export class VesperStreets {
  constructor(planet, s, world, lib, cityView, C, V) {
    Object.assign(this, { planet, s, world, lib, cityView, C, V });
    this.group = new THREE.Group(); this.group.name = 'vesper-real'; this.group.position.set(s.cx, 0, s.cz);     // (the settlement frame)
    this.live = new Map(); this.shells = null; this._m = new THREE.Matrix4();
  }
  // the shells, in the ship's frame (a child of its model)
  farGroup() {
    const U = this.V.units, im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), shellMaterial(), U.length), c = new THREE.Color();
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(U.length * 3), 3);
    U.forEach((u, i) => { im.setMatrixAt(i, this.shellMatrix(u)); const w = WALLS[u.colour % WALLS.length]; im.setColorAt(i, c.setRGB(...w)); });
    im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true; this.shells = im; return im;
  }
  shellMatrix(u, hide = false) {
    const h = u.F * u.H + 0.6, cx = u.O[0] + u.ex[0] * u.w / 2 + u.ez[0] * u.d / 2, cz = u.O[1] + u.ex[1] * u.w / 2 + u.ez[1] * u.d / 2, along = Math.abs(u.ex[0]) > 0.5;
    return this._m.compose(new THREE.Vector3(cx, this.V.DY + h / 2, cz), new THREE.Quaternion(), hide ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(along ? u.w : u.d, h, along ? u.d : u.w)).clone();
  }
  frame(rec) { const s = this.s, rot = ([u, v]) => [u * s.cos - v * s.sin, 0, u * s.sin + v * s.cos], o = rot(rec.O); return [[o[0], rec.base, o[2]], rot(rec.ex), rot(rec.ez)]; }
  update(pos) {
    const C = this.C, c = Math.cos(C.yaw), sn = Math.sin(C.yaw), dx = pos[0] - C.x, dz = pos[2] - C.z, lx = dx * c - dz * sn, lz = dx * sn + dz * c, ly = pos[1] - C.y;      // (you, in the ship's frame)
    const far = Math.abs(ly - this.V.DY) > 600 || Math.abs(lx) > 1400 || Math.abs(lz) > 3200;
    if (far && !this.live.size) return;
    let built = 0;
    if (!far) for (const u of this.V.units) {
      if (this.live.has(u.id) || built >= 2) continue;
      const ux = u.O[0] + u.ex[0] * u.w / 2 + u.ez[0] * u.d / 2, uz = u.O[1] + u.ex[1] * u.w / 2 + u.ez[1] * u.d / 2;
      if (Math.abs(ux - lx) > NEAR || Math.abs(uz - lz) > NEAR || Math.hypot(ux - lx, uz - lz, ly - this.V.DY) > NEAR) continue;
      const rec = unitReal(this.planet, this.s, C, this.V, u); if (!rec) continue;
      const mb = new MeshBuilder(), pv = this.lib ? new PropView(this.lib, 22) : null;
      if (pv) mb.propSink = (pr, fr, len, dep, rng) => pv.add(pr, fr, len, dep, rng);
      buildBuilding(mb, rec.plan, rec, this.frame(rec));
      const meshes = mb.build(); for (const m of meshes) { m.castShadow = true; m.receiveShadow = true; }
      if (pv) meshes.push(pv.build());
      this.group.add(...meshes); this.world.addStructure(rec);
      if (this.shells) { this.shells.setMatrixAt(u.id, this.shellMatrix(u, true)); this.shells.instanceMatrix.needsUpdate = true; }
      this.live.set(u.id, { rec, meshes, pv, u, ux, uz }); built++;
    }
    const sx = pos[0] - this.s.cx, sz = pos[2] - this.s.cz;
    for (const [id, L] of this.live) {
      if (L.pv) L.pv.update(sx, pos[1], sz);
      if (!far && Math.hypot(L.ux - lx, L.uz - lz) < FAR) continue;
      for (const m of L.meshes) { this.group.remove(m); m.geometry?.dispose(); }
      this.world.removeStructure(L.rec); this.world.cols.delete(L.rec.key);
      if (this.shells) { this.shells.setMatrixAt(id, this.shellMatrix(L.u)); this.shells.instanceMatrix.needsUpdate = true; }
      this.live.delete(id);
    }
  }
}
