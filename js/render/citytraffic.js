// Draws the megacity's traffic (gen/citytraffic.js): the vehicles within reach as real
// models (a VehicleView of its own), and every vehicle in the city as a point of light —
// the streams of the sky lanes you see from across the city, brightest at night. In between, a simple stand-in of the right size and paint, so nothing pops.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VehicleView } from './vehicles.js';
import { TYPES } from '../gen/vehicles.js';
import { LAYOUTS } from '../gen/ships.js';
import { PAINTS_VEHICLE } from './props.js';
import { ShipView } from './ships.js';
import { cityTraffic, cityLanes, lanePhase, loopPoint, Q } from '../gen/citytraffic.js';
import { CURB } from '../gen/city.js';

const NEAR = 240, MAXN = 90, SHIP = 700, MAXS = 12;      // real models: cars this near (this many), ships likewise
const BOX = 1800, CAP = 5000;           // beyond them, out to BOX, a simple stand-in of the right size and colour; then a point of light
export class CityTrafficView {
  constructor(city, lib) {
    this.city = city; this.vehicles = new VehicleView(lib);
    this.group = new THREE.Group(); this.group.name = 'city-traffic';       // render space (models)
    this.ships = new ShipView(lib); this.group.add(this.vehicles.group, this.ships.group);
    let n = 0; for (const L of cityLanes(city)) if (!L.ground) n += L.n;
    // the far stand-in: a body and a cabin, unit sized
    const body = new THREE.BoxGeometry(1, 0.55, 1).translate(0, 0.275, 0), cab = new THREE.BoxGeometry(0.8, 0.45, 0.5).translate(0, 0.775, -0.05);
    this.boxes = new THREE.InstancedMesh(mergeGeometries([body, cab]), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.5 }), CAP);
    this.boxes.frustumCulled = false; this.boxes.count = 0; this.boxes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3); this.group.add(this.boxes);
    this.boxM = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0); this._c = new THREE.Color();
    this.n = n;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(city.cx, city.h, city.cz), city.R + 600);
    this.mat = new THREE.PointsMaterial({ size: 2.6, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false;   // world space: goes under the floating-origin root
    this.points.name = 'city-traffic-lights';
  }
  putBox(v, i, toRender) {
    if (i >= CAP) return;
    const L = v.ship ? LAYOUTS[v.ship] : null, T = TYPES[v.type] || TYPES.sedan, p = v.render ? v.pos : toRender(...v.pos);
    this._s.set(L ? L.W * 0.7 : T.W, L ? L.H * 0.8 : T.H, L ? L.D : T.L);
    this.boxM.compose(this._p.set(p[0], p[1], p[2]), this._q.setFromAxisAngle(this._up, v.facing), this._s);
    this.boxes.setMatrixAt(i, this.boxM);
    const col = PAINTS_VEHICLE[((v.colour % PAINTS_VEHICLE.length) + PAINTS_VEHICLE.length) % PAINTS_VEHICLE.length];
    this.boxes.setColorAt(i, this._c.setRGB(col[0], col[1], col[2]));
  }
  update(t, viewer, night, toRender) {
    const c = this.city, near = [], ships = [], P = this.pos, C = this.col;
    const far = Math.hypot(viewer[0] - c.cx, viewer[2] - c.cz) > c.R + 2500;
    if (far && (this.skip = ((this.skip || 0) + 1) % 4)) return;        // from out of town the streams only need updating now and then
    const close = Math.hypot(viewer[0] - c.cx, viewer[2] - c.cz) < c.R + NEAR + 400;
    let k = 0;
    // every sky-lane vehicle as a light (the closed form of gen/citytraffic.js, without the per-vehicle objects)
    const base = c.h + CURB, cs = c.cos, sn = c.sin;
    for (const L of cityLanes(c)) {
      if (L.ground) continue;
      const sh = lanePhase(c, L) + L.speed * t;
      for (let q = 0; q < L.n; q++) {
        const s = ((q * L.gap + sh) % L.P + L.P) % L.P; loopPoint(L, s);
        const tail = s < L.L;                     // one way white heads, the other way red tails
        P[k * 3] = c.cx + Q.u * cs - Q.v * sn; P[k * 3 + 1] = base + Q.alt + 0.6; P[k * 3 + 2] = c.cz + Q.u * sn + Q.v * cs;
        C[k * 3] = 1; C[k * 3 + 1] = tail ? 0.18 : 0.9; C[k * 3 + 2] = tail ? 0.12 : 0.72; k++;
      }
    }
    const M = this.boxM; let nb = 0;
    if (close) cityTraffic(c, t, v => {
      const d = Math.hypot(v.pos[0] - viewer[0], v.pos[1] - viewer[1], v.pos[2] - viewer[2]);
      if (d > BOX) return;
      if (v.ship ? d < SHIP : d < NEAR) (v.ship ? ships : near).push(v.ship ? { id: v.id, model: v.ship, c: toRender(...v.pos), facing: v.facing, colour: v.colour, rampDown: false, type: v.type } : { type: v.type, pos: toRender(...v.pos), facing: v.facing, colour: v.colour });
      else this.putBox(v, nb++, toRender);
    }, viewer[0], viewer[2], BOX);
    // over budget: the farther ones are drawn as stand-ins too, so nothing ever blinks out
    const dq = v => { const p = v.pos || v.c; return p[0] ** 2 + (p[1] - viewer[1]) ** 2 + p[2] ** 2; };
    if (near.length > MAXN) { near.sort((p, q) => dq(p) - dq(q)); for (const v of near.splice(MAXN)) this.putBox({ ...v, pos: v.pos, render: true }, nb++, toRender); }
    if (ships.length > MAXS) { ships.sort((p, q) => dq(p) - dq(q)); for (const v of ships.splice(MAXS)) this.putBox({ ship: v.model, pos: v.c, facing: v.facing, colour: v.colour, render: true }, nb++, toRender); }
    this.boxes.count = Math.min(nb, CAP); this.boxes.instanceMatrix.needsUpdate = true; if (this.boxes.instanceColor) this.boxes.instanceColor.needsUpdate = true;
    this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.color.needsUpdate = true;
    this.points.geometry.setDrawRange(0, k);
    this.mat.opacity = 0.04 + 0.9 * night * night; this.mat.size = 2.2 + 2.5 * night;
    this.vehicles.update(near); this.ships.update(ships, 0);
    this.drawn = near.length;
  }
}
