// Draws the megacity's traffic (gen/citytraffic.js): the vehicles within reach as real
// models (a VehicleView of its own), and every vehicle in the city as a point of light —
// the streams of the sky lanes you see from across the city, brightest at night.
import * as THREE from 'three';
import { VehicleView } from './vehicles.js';
import { cityTraffic, cityLanes, lanePhase } from '../gen/citytraffic.js';
import { CURB } from '../gen/city.js';

const NEAR = 650;
export class CityTrafficView {
  constructor(city, lib) {
    this.city = city; this.vehicles = new VehicleView(lib);
    this.group = new THREE.Group(); this.group.name = 'city-traffic';       // render space (models)
    this.group.add(this.vehicles.group);
    let n = 0; for (const L of cityLanes(city)) if (!L.ground) n += Math.floor((L.a1 - L.a0) / L.gap);
    this.n = n;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(city.cx, city.h, city.cz), city.R + 600);
    this.mat = new THREE.PointsMaterial({ size: 2.6, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false;   // world space: goes under the floating-origin root
    this.points.name = 'city-traffic-lights';
  }
  update(t, viewer, night, toRender) {
    const c = this.city, near = [], P = this.pos, C = this.col;
    const close = Math.hypot(viewer[0] - c.cx, viewer[2] - c.cz) < c.R + NEAR + 400;
    let k = 0;
    // every sky-lane vehicle as a light (the same closed form as gen/citytraffic.js, without the per-vehicle objects)
    const base = c.h + CURB, cs = c.cos, sn = c.sin;
    for (const L of cityLanes(c)) {
      if (L.ground) continue;
      const len = L.a1 - L.a0, n = Math.floor(len / L.gap), ph = lanePhase(c, L), lat = L.at + L.off, y = base + L.alt + 0.6;
      const tail = L.dir > 0, g = tail ? 0.18 : 0.9, b = tail ? 0.12 : 0.72, sh = L.dir * L.speed * t + ph;
      for (let q = 0; q < n; q++) {
        const a = L.a0 + (((q * L.gap + sh) % len) + len) % len;
        const u = L.axis ? a : lat, v = L.axis ? lat : a;
        P[k * 3] = c.cx + u * cs - v * sn; P[k * 3 + 1] = y; P[k * 3 + 2] = c.cz + u * sn + v * cs;
        C[k * 3] = 1; C[k * 3 + 1] = g; C[k * 3 + 2] = b; k++;
      }
    }
    if (close) cityTraffic(c, t, v => {
      if (Math.hypot(v.pos[0] - viewer[0], v.pos[1] - viewer[1], v.pos[2] - viewer[2]) < NEAR) near.push({ type: v.type, pos: toRender(...v.pos), facing: v.facing, colour: v.colour });
    }, viewer[0], viewer[2], NEAR);
    this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.color.needsUpdate = true;
    this.points.geometry.setDrawRange(0, k);
    this.mat.opacity = 0.35 + 0.65 * night; this.mat.size = 2.2 + 2.5 * night;
    this.vehicles.update(near);
    this.drawn = near.length;
  }
}
