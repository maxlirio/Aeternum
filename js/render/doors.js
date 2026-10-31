// Door leaves: one InstancedMesh for every door in the settlement. Leaves slide into
// the wall when open (hangar doors roll up). State comes from world/doors.js; this
// module only draws it and eases the motion (an ACTIVE-tier process near the player).
import * as THREE from 'three';
import { materials } from './materials.js';
import { doorState } from '../world/doors.js';

const COL = { normal: new THREE.Color(1, 1, 1), locked: new THREE.Color(1.12, 0.82, 0.5), broken: new THREE.Color(1.15, 0.45, 0.4) };

export class DoorView {
  constructor(s, doors) {
    this.s = s; this.doors = doors;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.mesh = new THREE.InstancedMesh(geo, materials().door, doors.length);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.anim = new Float32Array(doors.length);   // 0 closed .. 1 open
    this.target = new Float32Array(doors.length);
    this.lockState = new Array(doors.length).fill(null);
    this.m = new THREE.Matrix4(); this.v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.m.identity();
    for (let i = 0; i < doors.length; i++) { this.place(i); this.mesh.setColorAt(i, COL.normal); }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
  // world-space (settlement-mesh-space) centre of the closed leaf
  centre(i) {
    const { door, frame } = this.doors[i];
    const [o, ex, ez] = frame;
    const x = door.x, z = door.z, y = door.k * this.doors[i].plan.H + door.height / 2;
    return [o[0] + ex[0] * x + ez[0] * z, o[1] + y, o[2] + ex[2] * x + ez[2] * z];
  }
  place(i) {
    const { door, frame } = this.doors[i];
    const [, ex, ez] = frame;
    const dirW = door.axis === 'x' ? ex : ez;
    const c = this.centre(i), a = this.anim[i];
    const roll = door.kind === 'hangar';
    const W = door.width - 0.02, Hh = door.height - 0.02;
    const [X, Y, Z] = this.v;
    X.set(dirW[0], 0, dirW[2]); Y.set(0, 1, 0); Z.crossVectors(X, Y);
    // sliding leaves move along the wall; roll-up doors shrink upward into the head
    const hgt = roll ? Hh * (1 - 0.88 * a) : Hh;
    this.m.makeBasis(X.clone().multiplyScalar(W), Y.clone().multiplyScalar(hgt), Z.clone().multiplyScalar(0.07));
    if (roll) this.m.setPosition(c[0], c[1] + (Hh - hgt) / 2, c[2]);
    else { const off = a * (door.width - 0.15); this.m.setPosition(c[0] + dirW[0] * off, c[1], c[2] + dirW[2] * off); }
    this.mesh.setMatrixAt(i, this.m);
  }
  // Re-read state for every door (cheap; called ~1 Hz and after interactions).
  refresh(store, planet, t) {
    let colors = false;
    for (let i = 0; i < this.doors.length; i++) {
      const { b, door } = this.doors[i];
      const st = doorState(store, planet, b, door, t);
      this.target[i] = st.open ? 1 : 0;
      const ls = st.broken ? 'broken' : st.locked && door.kind !== 'interior' ? 'locked' : st.locked ? 'locked' : 'normal';
      if (ls !== this.lockState[i]) { this.lockState[i] = ls; this.mesh.setColorAt(i, COL[ls]); colors = true; }
    }
    if (colors) this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    let moved = false;
    for (let i = 0; i < this.doors.length; i++) {
      const d = this.target[i] - this.anim[i];
      if (d === 0) continue;
      const step = dt * (this.doors[i].door.kind === 'hangar' ? 0.25 : 2.2);
      this.anim[i] = Math.abs(d) <= step ? this.target[i] : this.anim[i] + Math.sign(d) * step;
      this.place(i); moved = true;
    }
    if (moved) this.mesh.instanceMatrix.needsUpdate = true;
  }
  isPassable(i) { return this.anim[i] > 0.8; }
}
