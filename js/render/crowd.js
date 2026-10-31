// Draws the people near the player. Input per frame is plain data — position, facing,
// pose, gait — from gen/schedule.js; this view poses one template rig per person and
// copies the part transforms into instanced meshes (one draw call per body part for
// the whole crowd). Swap this module to change how people look; nothing else changes.
import * as THREE from 'three';
import { buildRig, applyPose } from '../player/avatar.js';
import { Rng } from '../core/prng.js';
import { seedFromString } from '../core/hash.js';

const MAX = 96;
const SUITS = [0x46505a, 0x5a4a3e, 0x3e4f46, 0x6a6458, 0x2f3a4a, 0x744c3c, 0x585e66, 0x3c3c44, 0x7a7262, 0x4a5a6a];
const SKIN = [0xe2b99a, 0xc9967a, 0xb48a6e, 0x8d5f45, 0x6b4532, 0xd8a888, 0xa87458];
const HAIR = [0x1e1a16, 0x3a2a1e, 0x5a3e28, 0x8a6a48, 0xb0a090, 0x2a2e33, 0x6a3020];
const ACCENT = [0xc98b2a, 0x3a8ac9, 0xc94a3a, 0x6aa04a, 0xd0d0c8, 0x8a5ac9];

export class CrowdView {
  constructor(scene) {
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
    const mats = { suit: white, pad: white, skin: white, hair: white, accent: white };
    this.rig = buildRig(mats);
    this.meshes = this.rig.parts.map(({ mesh, kind }) => {
      const im = new THREE.InstancedMesh(mesh.geometry, white, MAX);
      im.count = 0; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
      im.userData.kind = kind; scene.add(im);
      return im;
    });
    this.looks = new Map();
    this.color = new THREE.Color();
    this.gait = new Map();     // id -> phase
  }
  look(id) {
    let l = this.looks.get(id);
    if (!l) {
      const r = new Rng(seedFromString(id));
      l = { suit: r.pick(SUITS), pad: r.pick([0x2a2e33, 0x3a3530, 0x22262a, 0x4a4038]), skin: r.pick(SKIN), hair: r.pick(HAIR), accent: r.pick(ACCENT), scale: r.range(0.92, 1.06) };
      this.looks.set(id, l);
    }
    return l;
  }
  // agents: [{ id, pos:[x,y,z] (render space), facing, pose, moving, age }]
  update(agents, dt) {
    const n = Math.min(MAX, agents.length), rig = this.rig;
    for (let i = 0; i < n; i++) {
      const a = agents[i], L = this.look(a.id);
      let ph = this.gait.get(a.id) || 0;
      if (a.moving) ph += dt * (2.2 + 1.3 * 1.15);
      this.gait.set(a.id, ph);
      const child = a.age < 16 ? 0.55 + a.age * 0.028 : 1;
      rig.root.position.set(a.pos[0], a.pos[1], a.pos[2]);
      rig.root.rotation.y = a.facing;
      rig.root.scale.setScalar(L.scale * child);
      applyPose(rig, { mode: a.moving ? 'walk' : a.pose === 'lie' ? 'lie' : a.pose === 'sit' ? 'sit' : 'stand', phase: ph, blend: a.moving ? 1 : 0, k: 0 });
      if (a.pose === 'lie' && !a.moving) { // lie centred on the anchor, on its back
        rig.root.position.x += Math.sin(a.facing) * 0.87 * child; rig.root.position.z += Math.cos(a.facing) * 0.87 * child; rig.root.position.y += 0.14;
      }
      if (a.pose === 'sit' && !a.moving) { rig.root.position.x -= Math.sin(a.facing) * 0.12; rig.root.position.z -= Math.cos(a.facing) * 0.12; }
      rig.root.updateMatrixWorld(true);
      for (let j = 0; j < this.meshes.length; j++) {
        const im = this.meshes[j];
        im.setMatrixAt(i, rig.parts[j].mesh.matrixWorld);
        im.setColorAt(i, this.color.setHex(L[im.userData.kind]));
      }
    }
    for (const im of this.meshes) { im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  }
}
