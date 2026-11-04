// Draws the city's vehicles (gen/cityfleet.js). Each vehicle's current straight stretch is
// cached in plain arrays, re-read from its driver's trip only when that stretch ends, so moving
// 12,000 of them is a few multiplications. The nearest are real models, the rest out to BOX a
// simple stand-in of the right size and paint, and every moving one a point of light. Near you
// they obey the lights and each other (sim/roadlife.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VehicleView } from './vehicles.js';
import { ShipView } from './ships.js';
import { TYPES } from '../gen/vehicles.js';
import { LAYOUTS } from '../gen/ships.js';
import { PAINTS_VEHICLE } from './props.js';
import { cityFleet, vehicleAt, redAhead, signalAt } from '../gen/cityfleet.js';
import { RoadLife } from '../sim/roadlife.js';

const NEAR = 240, MAXN = 90, SHIP = 700, MAXS = 12;      // real models: cars this near (this many), ships likewise
const BOX = 1800, CAP = 5000;           // beyond them, out to BOX, a stand-in; then a point of light
const MANNERS = 320;                    // within this they brake for lights, each other and you
const INIT_PER_FRAME = 400;             // drivers are worked out a few at a time, not all on one frame

export class CityTrafficView {
  constructor(planet, city, lib) {
    this.city = city; this.fleet = cityFleet(planet, city); this.vehicles = new VehicleView(lib); this.life = new RoadLife();
    this.group = new THREE.Group(); this.group.name = 'city-traffic';       // render space (models)
    this.ships = new ShipView(lib); this.group.add(this.vehicles.group, this.ships.group);
    const n = this.fleet.cars.length; this.n = n; this.ready = 0;
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.pz = new Float32Array(n); this.vx = new Float32Array(n); this.vy = new Float32Array(n); this.vz = new Float32Array(n);
    this.fx = new Float32Array(n); this.fz = new Float32Array(n); this.ts = new Float64Array(n); this.until = new Float64Array(n); this.taken = new Set();
    const body = new THREE.BoxGeometry(1, 0.55, 1).translate(0, 0.275, 0), cab = new THREE.BoxGeometry(0.8, 0.45, 0.5).translate(0, 0.775, -0.05);
    this.boxes = new THREE.InstancedMesh(mergeGeometries([body, cab]), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.5 }), CAP);
    this.boxes.frustumCulled = false; this.boxes.count = 0; this.boxes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3); this.group.add(this.boxes);
    this.boxM = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0); this._c = new THREE.Color();
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(city.cx, city.h, city.cz), city.R + 600);
    this.mat = new THREE.PointsMaterial({ size: 2.6, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.name = 'city-traffic-lights';   // world space: under the floating-origin root
    this.q = {}; this.nearby = [];
    // the lit lens of each nearby traffic light
    this.lens = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), 200); this.lens.frustumCulled = false; this.lens.count = 0; this.lens.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(600), 3); this.group.add(this.lens);
  }
  read(i, t) {       // the vehicle's current stretch
    const q = vehicleAt(this.fleet, this.fleet.cars[i], t, this.q);
    this.px[i] = q.x; this.py[i] = q.y; this.pz[i] = q.z; this.vx[i] = q.vx; this.vy[i] = q.vy; this.vz[i] = q.vz; this.fx[i] = q.fx; this.fz[i] = q.fz; this.ts[i] = t; this.until[i] = q.until;
  }
  putBox(v, i) {
    if (i >= CAP) return;
    const L = v.ship ? LAYOUTS[v.ship] : null, T = TYPES[v.type] || TYPES.sedan, p = v.pos;
    this._s.set(L ? L.W * 0.7 : T.W, L ? L.H * 0.8 : T.H, L ? L.D : T.L);
    this.boxM.compose(this._p.set(p[0], p[1], p[2]), this._q.setFromAxisAngle(this._up, v.facing), this._s);
    this.boxes.setMatrixAt(i, this.boxM);
    const col = PAINTS_VEHICLE[((v.colour % PAINTS_VEHICLE.length) + PAINTS_VEHICLE.length) % PAINTS_VEHICLE.length];
    this.boxes.setColorAt(i, this._c.setRGB(col[0], col[1], col[2]));
  }
  // people: [[x, y, z]] in the way, that traffic should brake for
  update(t, dt, viewer, night, toRender, people = [], alsoManaged = []) {
    const c = this.city, F = this.fleet, n = this.n, P = this.pos, C = this.col, near = [], ships = [], managed = [];
    this.nearby = [];
    const far = Math.hypot(viewer[0] - c.cx, viewer[2] - c.cz) > c.R + 2500;
    if (far) this.life.step(dt, alsoManaged, people);                   // (the town's traffic has manners too)
    if (far && (this.skip = ((this.skip || 0) + 1) % 4)) return;        // from out of town the streams only need updating now and then
    for (let e = Math.min(n, this.ready + INIT_PER_FRAME); this.ready < e; this.ready++) this.read(this.ready, t);
    let k = 0, nb = 0; const q = this.q, close = !far;
    for (let i = 0; i < this.ready; i++) {
      if (this.taken.has(i)) continue;             // (someone took it: it's the player's now)
      if (t >= this.until[i]) this.read(i, t);
      const e = t - this.ts[i], x = this.px[i] + this.vx[i] * e, y = this.py[i] + this.vy[i] * e, z = this.pz[i] + this.vz[i] * e, moving = this.vx[i] !== 0 || this.vz[i] !== 0 || this.vy[i] !== 0;
      if (moving) {                                // a point of light: heads coming along +a street, tails the other way
        P[k * 3] = x; P[k * 3 + 1] = y + 0.6; P[k * 3 + 2] = z;
        const tail = (this.vx[i] * c.cos + this.vz[i] * c.sin + -this.vx[i] * c.sin + this.vz[i] * c.cos) > 0;
        C[k * 3] = 1; C[k * 3 + 1] = tail ? 0.18 : 0.9; C[k * 3 + 2] = tail ? 0.12 : 0.72; k++;
      }
      if (!close) continue;
      const dx = x - viewer[0], dz = z - viewer[2]; if (Math.abs(dx) > BOX || Math.abs(dz) > BOX) continue;
      const d = Math.hypot(dx, y - viewer[1], dz); if (d > BOX) continue;
      const car = F.cars[i]; let v;
      if (car.kind === 'ground' && d < MANNERS && (moving || this.life.delayOf(car.id) > 0)) {       // running a little behind its schedule, for good reason
        const qd = vehicleAt(F, car, t - this.life.delayOf(car.id), q);
        v = { id: car.id, i, car, type: car.type, pos: [qd.x, qd.y, qd.z], facing: Math.atan2(qd.fx, qd.fz), colour: car.colour, speed: (qd.speed || 0) * this.life.rateOf(car.id), parked: !qd.moving, stop: redAhead(F, qd, t) };
        v.pace = qd.speed || 0; managed.push(v);
      } else v = { id: car.id, i, car, type: car.type, ship: car.ship, pos: [x, y, z], facing: Math.atan2(this.fx[i], this.fz[i]), colour: car.colour, speed: Math.hypot(this.vx[i], this.vy[i], this.vz[i]), parked: !moving, air: car.air && y > c.h + 1 };
      if (d < 70) this.nearby.push(v);
      const rp = toRender(...v.pos);
      if (car.ship ? d < SHIP : d < NEAR) (car.ship ? ships : near).push(car.ship ? { id: car.id, model: car.ship, c: rp, facing: v.facing, colour: car.colour, rampDown: false, d } : { type: car.type, pos: rp, facing: v.facing, colour: car.colour, d, pitch: car.air && moving ? Math.max(-0.2, Math.min(0.2, this.vy[i] * 0.02)) : 0 });
      else this.putBox({ ship: car.ship, type: car.type, pos: rp, facing: v.facing, colour: car.colour }, nb++);
    }
    this.life.step(dt, managed.map(v => ({ ...v, speed: v.pace })).concat(alsoManaged), people);
    // over budget: the farther ones are stand-ins too, so nothing ever blinks out
    const byD = (p, a) => p.d - a.d;
    if (near.length > MAXN) { near.sort(byD); for (const v of near.splice(MAXN)) this.putBox(v, nb++); }
    if (ships.length > MAXS) { ships.sort(byD); for (const v of ships.splice(MAXS)) this.putBox({ ship: v.model, pos: v.c, facing: v.facing, colour: v.colour }, nb++); }
    this.boxes.count = Math.min(nb, CAP); this.boxes.instanceMatrix.needsUpdate = true; if (this.boxes.instanceColor) this.boxes.instanceColor.needsUpdate = true;
    this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.color.needsUpdate = true;
    this.points.geometry.setDrawRange(0, k);
    this.mat.opacity = 0.04 + 0.9 * night * night; this.mat.size = 2.2 + 2.5 * night;
    this.vehicles.update(near); this.ships.update(ships, 0);
    this.drawn = near.length;
  }
  // The lights near you, lit for what the junction's doing: [{ pos (render), state }]
  showLights(list) {
    const M = new THREE.Matrix4(), col = new THREE.Color(); let n = 0;
    for (const L of list) { if (n >= 200) break; M.makeTranslation(L.pos[0], L.pos[1], L.pos[2]); this.lens.setMatrixAt(n, M); this.lens.setColorAt(n, col.setRGB(...L.col)); n++; }
    this.lens.count = n; this.lens.instanceMatrix.needsUpdate = true; if (this.lens.instanceColor) this.lens.instanceColor.needsUpdate = true;
  }
}
export { signalAt };
