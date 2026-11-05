// Every other town on the planet, built as you come to it. Seen from a long way off a town is its
// streets and a block for each building, which costs next to nothing. Coming closer, the real one
// goes up a little each frame: walls, rooms, furniture and doors, the same as your home town's.
// It's taken down again once you've gone. All of it comes from the town's data, so a town rebuilt
// later is the same town; what's happened in it is in the save.
import * as THREE from 'three';
import { getSettlement, regionOf } from '../gen/settlement.js';
import { buildSettlementMesh, buildStreets, buildBlocks } from './settlement-mesh.js';
import { bridgeGroup } from './bridges.js';
import { DoorView } from './doors.js';
import { PropView } from './props.js';

const FAR_IN = 6000, FAR_OUT = 7000;      // from its centre: streets and blocks
const FULL_IN = 1400, FULL_OUT = 2000;    // from its edge: the real thing
const MOST = 2;                           // real towns at once, not counting home
const free = root => root.traverse(o => { if (o.parent?.name === 'props') return; if (o.isInstancedMesh) o.dispose(); if (o.geometry) o.geometry.dispose(); });   // (materials are shared by every town; a prop's model goes back with PropView.release)

export class TownStreamer {
  constructor(planet, root, propLib, home) {
    this.planet = planet; this.propLib = propLib; this.home = home;
    this.group = new THREE.Group(); this.group.name = 'towns'; root.add(this.group);
    this.shells = new Map(); this.full = new Map(); this.busy = null; this.next = 0; this.broken = new Set();
  }
  update(x, z, keep = null, now = performance.now()) {
    if (now < this.next) return; this.next = now + 400;
    const dist = s => Math.hypot(s.cx - x, s.cz - z);
    // far off: one new town at a time, so no one frame pays for several
    const [rx, rz] = regionOf(x, z), reach = Math.ceil(FAR_IN / 3072);
    let want = null, wd = FAR_IN;
    for (let a = -reach; a <= reach; a++) for (let b = -reach; b <= reach; b++) {
      const s = getSettlement(this.planet, rx + a, rz + b); if (!s || s === this.home || this.shells.has(s.key)) continue;
      const d = dist(s); if (d < wd) { wd = d; want = s; }
    }
    if (want) this.shell(want);
    for (const [k, Q] of this.shells) if (dist(Q.s) > FAR_OUT && !this.full.has(k)) { this.group.remove(Q.group); free(Q.group); this.shells.delete(k); }
    // near: the closest town you're coming to
    let near = null, nd = Infinity;
    for (const Q of this.shells.values()) { const d = dist(Q.s) - Q.s.R; if (d < FULL_IN && d < nd && !this.full.has(Q.s.key) && !this.broken.has(Q.s.key)) { nd = d; near = Q.s; } }
    if (near && !this.busy) this.build(near).catch(e => { console.error('town', near.name, e); this.busy = null; this.full.delete(near.key); this.broken.add(near.key); });
    // gone by, or more than there's room for: furthest first, and never the one you're standing in
    const ready = [...this.full.values()].filter(T => T.ready && T !== keep).sort((A, B) => dist(B.s) - dist(A.s));
    for (const T of ready) if (dist(T.s) - T.s.R > FULL_OUT || this.full.size > MOST) this.drop(T);
  }
  shell(s) {
    const group = new THREE.Group(); group.name = 'town-far:' + s.name;
    const here = new THREE.Group(); here.position.set(s.cx, 0, s.cz);
    here.add(...buildStreets(this.planet, s));
    const blocks = new THREE.Group(); blocks.add(...buildBlocks(this.planet, s)); here.add(blocks);
    group.add(here, bridgeGroup(this.planet, s));
    this.group.add(group); this.shells.set(s.key, { s, group, blocks });
    return this.shells.get(s.key);
  }
  async build(s) {
    this.busy = s;
    if (!this.shells.has(s.key)) this.shell(s);
    const propView = this.propLib ? new PropView(this.propLib) : null, T = { s, ready: false, propView };
    this.full.set(s.key, T);
    const town = await buildSettlementMesh(this.planet, s, () => {}, propView, { streets: false, slice: 4, into: this.group });
    T.town = town; T.doorView = new DoorView(s, town.doors); town.group.add(T.doorView.mesh);
    T.doorIndex = new Map(town.doors.map((d, i) => [d.b.key + '#' + d.door.id, i]));
    T.ready = true; this.busy = null;
    this.shells.get(s.key).blocks.visible = false;
    return T;
  }
  // Built by the time this resolves. (Loading a save made in another town.)
  async ensure(s) {
    const T = this.full.get(s.key);
    if (T?.ready) return T;
    if (T || this.busy) { while (!this.full.get(s.key)?.ready) { if (!this.busy && !this.full.has(s.key)) break; await new Promise(r => setTimeout(r, 50)); } if (this.full.get(s.key)?.ready) return this.full.get(s.key); }
    return this.build(s);
  }
  drop(T) {
    this.group.remove(T.town.group); free(T.town.group); T.propView?.release(); this.full.delete(T.s.key);
    const Q = this.shells.get(T.s.key); if (Q) Q.blocks.visible = true;
  }
}
