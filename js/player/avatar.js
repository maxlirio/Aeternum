// Human body VIEW. Gameplay never reads this geometry: people are points with a facing,
// a pose name and a gait phase. This module turns that into a PLACEHOLDER body made of
// primitives. ADVENTURER's rigged GLB will replace buildRig/applyPose behind the same
// two interfaces:
//   player:  createPlaceholderAvatar() → { object, update(dt, speed, grounded), setOpacity }
//   crowd:   buildRig() / applyPose(rig, state) used by render/crowd.js
import * as THREE from 'three';
import { captureRest, applyClimbPose } from './limbik.js';

// Parts are tagged by what they are made of so each person can be coloured differently.
export function buildRig(mats) {
  const parts = [];
  const tag = (o, kind) => { o.castShadow = true; parts.push({ mesh: o, kind }); return o; };
  const cap = (r, l, kind) => { const g = new THREE.CapsuleGeometry(r, l, 4, 10); g.translate(0, -l / 2 - r, 0); return tag(new THREE.Mesh(g, mats[kind]), kind); };
  const root = new THREE.Group(); root.rotation.order = 'YXZ';   // yaw, then lie back
  const hips = new THREE.Group(); hips.position.y = 0.95; root.add(hips);
  const torso = new THREE.Group(); hips.add(torso);
  const chest = tag(new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.36, 4, 12), mats.suit), 'suit'); chest.position.y = 0.3; chest.scale.set(1.05, 1, 0.72); torso.add(chest);
  const vest = tag(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.26), mats.pad), 'pad'); vest.position.set(0, 0.38, 0); torso.add(vest);
  const stripe = tag(new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.03, 0.27), mats.accent), 'accent'); stripe.position.set(0, 0.45, 0); torso.add(stripe);
  const neck = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8), mats.skin), 'skin'); neck.position.y = 0.62; torso.add(neck);
  const head = tag(new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), mats.skin), 'skin'); head.scale.set(0.9, 1.1, 1); head.position.y = 0.76; torso.add(head);
  const hair = tag(new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mats.hair), 'hair'); hair.scale.set(0.92, 1.1, 1.02); hair.position.y = 0.775; torso.add(hair);
  const limb = (parent, x, y, r1, l1, r2, l2, kind) => {
    const upper = new THREE.Group(); upper.position.set(x, y, 0); parent.add(upper);
    upper.add(cap(r1, l1, kind));
    const lower = new THREE.Group(); lower.position.y = -(l1 + 2 * r1) + r1 * 0.5; upper.add(lower);
    lower.add(cap(r2, l2, kind));
    return { upper, lower };
  };
  const legL = limb(hips, 0.1, 0, 0.075, 0.33, 0.06, 0.34, 'suit'), legR = limb(hips, -0.1, 0, 0.075, 0.33, 0.06, 0.34, 'suit');
  for (const L of [legL, legR]) { const boot = tag(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.24), mats.pad), 'pad'); boot.position.set(0, -0.5, 0.04); L.lower.add(boot); }
  const armL = limb(torso, 0.25, 0.52, 0.055, 0.22, 0.045, 0.22, 'suit'), armR = limb(torso, -0.25, 0.52, 0.055, 0.22, 0.045, 0.22, 'suit');
  for (const A of [armL, armR]) { const hand = tag(new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mats.skin), 'skin'); hand.position.y = -0.36; A.lower.add(hand); }
  return { root, hips, torso, legL, legR, armL, armR, parts };
}

// state: { mode: 'walk'|'stand'|'sit'|'lie'|'air', phase, blend (0 idle..1 moving), k (0 walk..1 run) }
export function applyPose(rig, st) {
  const { hips, torso, legL, legR, armL, armR } = rig;
  const s = Math.sin(st.phase), amp = (0.35 + 0.55 * st.k) * st.blend;
  rig.root.rotation.x = 0;
  hips.position.y = 0.95; torso.rotation.set(0, 0, 0);
  legL.upper.rotation.set(s * amp, 0, 0); legR.upper.rotation.set(-s * amp, 0, 0);
  legL.lower.rotation.x = Math.max(0, -Math.cos(st.phase)) * amp * 1.3; legR.lower.rotation.x = Math.max(0, Math.cos(st.phase)) * amp * 1.3;
  armL.upper.rotation.set(-s * amp * 0.8, 0, 0.08); armR.upper.rotation.set(s * amp * 0.8, 0, -0.08);
  armL.lower.rotation.x = armR.lower.rotation.x = -0.25 - 0.5 * st.k * st.blend;
  torso.rotation.x = 0.12 * st.k * st.blend; torso.rotation.y = s * 0.08 * st.blend;
  hips.position.y = 0.95 - Math.abs(Math.cos(st.phase)) * 0.04 * st.blend * (0.5 + st.k);
  if (st.mode === 'air') { legL.upper.rotation.x = -0.4; legR.upper.rotation.x = 0.2; legL.lower.rotation.x = legR.lower.rotation.x = 0.7; }
  if (st.mode === 'sit') {
    hips.position.y = 0.5;
    legL.upper.rotation.x = legR.upper.rotation.x = -Math.PI / 2;
    legL.lower.rotation.x = legR.lower.rotation.x = Math.PI / 2;
    armL.upper.rotation.x = armR.upper.rotation.x = -0.5; armL.lower.rotation.x = armR.lower.rotation.x = -0.9;
  }
  if (st.mode === 'climb') {     // hands reaching up in turn, knees lifting: ladder, ledge, steep slope
    const a = Math.sin(st.phase), b = Math.cos(st.phase);
    torso.rotation.x = st.lean; rig.root.rotation.x = 0;
    armL.upper.rotation.set(-2.5 + 0.45 * a, 0, 0.12); armR.upper.rotation.set(-2.5 - 0.45 * a, 0, -0.12);
    armL.lower.rotation.x = -0.5 - 0.3 * Math.max(0, b); armR.lower.rotation.x = -0.5 - 0.3 * Math.max(0, -b);
    legL.upper.rotation.set(-0.5 - 0.5 * Math.max(0, a), 0, 0); legR.upper.rotation.set(-0.5 - 0.5 * Math.max(0, -a), 0, 0);
    legL.lower.rotation.x = 0.8 + 0.4 * Math.max(0, a); legR.lower.rotation.x = 0.8 + 0.4 * Math.max(0, -a);
  }
  if (st.mode === 'lie') {
    rig.root.rotation.x = -Math.PI / 2; hips.position.y = 0.95;
    armL.upper.rotation.z = 0.15; armR.upper.rotation.z = -0.15;
  }
}

export function createPlaceholderAvatar() {
  const mats = {
    suit: new THREE.MeshStandardMaterial({ color: 0x46505a, roughness: 0.75 }),
    pad: new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.6, metalness: 0.3 }),
    hair: new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.6 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xb48a6e, roughness: 0.6 }),
    accent: new THREE.MeshStandardMaterial({ color: 0xc98b2a, roughness: 0.5 }),
  };
  const rig = buildRig(mats);
  let phase = 0, blend = 0, opacity = 1, swing = 0, aim = false;
  // what's in the right hand: a few primitives per weapon, parented to the forearm
  const held = new THREE.Group(); held.position.set(0, -0.4, 0.02); rig.armR.lower.add(held);
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.45, metalness: 0.6 }), steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.25, metalness: 1 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x0a1820, emissive: 0x6fd0ff, emissiveIntensity: 2 });
  const box = (w, h, d, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; return o; };
  const MODELS = {
    knife: () => [box(0.025, 0.1, 0.03, dark, 0, 0, 0), box(0.006, 0.17, 0.03, steel, 0, -0.13, 0.005)],
    baton: () => [box(0.035, 0.12, 0.035, dark, 0, 0, 0), box(0.025, 0.38, 0.025, dark, 0, -0.25, 0), box(0.03, 0.05, 0.03, glow, 0, -0.45, 0)],
    pistol: () => [box(0.03, 0.11, 0.045, dark, 0, -0.02, 0.0, 0.25), box(0.032, 0.05, 0.2, dark, 0, -0.08, 0.08), box(0.012, 0.012, 0.03, steel, 0, -0.08, 0.19)],
    carbine: () => [box(0.03, 0.1, 0.045, dark, 0, -0.02, 0, 0.25), box(0.045, 0.08, 0.55, dark, 0, -0.09, 0.12), box(0.02, 0.02, 0.18, steel, 0, -0.08, 0.45), box(0.03, 0.03, 0.08, glow, 0, -0.03, 0.25)],
  };
  // the same IK rig a real skeleton gets (player/limbik.js): just joints
  const end = (L, y) => { const g = new THREE.Group(); g.position.y = y; L.lower.add(g); return g; };
  const ik = captureRest({ root: rig.root, pelvis: rig.hips, spine: [rig.torso], arms: { l: [rig.armL.upper, rig.armL.lower, end(rig.armL, -0.36)], r: [rig.armR.upper, rig.armR.lower, end(rig.armR, -0.36)] }, legs: { l: [rig.legL.upper, rig.legL.lower, end(rig.legL, -0.48)], r: [rig.legR.upper, rig.legR.lower, end(rig.legR, -0.48)] } });
  let onWall = false;
  return {
    object: rig.root,
    isPlaceholder: true,
    // on a wall: every joint from the climber's pose
    climb(pose, toRender) { onWall = true; rig.root.position.set(0, 0, 0); applyClimbPose(ik, pose, toRender); },
    // fades the body out when the camera is pressed against it in tight rooms
    setOpacity(o) {
      if (Math.abs(o - opacity) < 0.01) return;
      opacity = o; rig.root.visible = o > 0.02;
      for (const m of Object.values(mats)) { m.transparent = o < 0.99; m.opacity = o; m.depthWrite = o >= 0.99; }
    },
    // the weapon (item id) in the right hand, or nothing
    setHeld(id) {
      if (held.userData.id === id) return;
      held.clear(); held.userData.id = id; aim = id === 'pistol' || id === 'carbine';
      for (const m of (MODELS[id] || (() => []))()) held.add(m);
    },
    punch() { swing = 1; },
    update(dt, speed, grounded, climb = null, pose = null) {   // pose: 'sit' | 'lie' while seated
      if (onWall) { onWall = false; rig.hips.quaternion.identity(); rig.root.quaternion.identity(); }
      if (pose) { blend = 0; applyPose(rig, { mode: pose, phase, blend: 0, k: 0 }); return; }
      blend += ((speed > 0.15 ? 1 : 0) - blend) * Math.min(1, dt * 8);
      phase += dt * (climb ? (climb.moving ? 4 : 0) : speed > 0.15 ? 2.2 + speed * 1.15 : 0);
      applyPose(rig, { mode: climb ? 'climb' : grounded ? 'walk' : 'air', phase, blend, k: Math.min(1, Math.max(0, speed - 3) / 3), lean: climb?.lean ?? 0 });
      if (!climb) {
        if (aim) { rig.armR.upper.rotation.set(-1.45, 0, -0.1); rig.armR.lower.rotation.x = -0.1; }          // a gun is held out in front
        if (swing > 0) {                                                                                     // a strike: the arm drives forward and back
          const k = Math.sin(swing * Math.PI); rig.armR.upper.rotation.x = -0.4 - 1.2 * k; rig.armR.lower.rotation.x = -1.2 + 1.1 * k; rig.torso.rotation.y = -0.35 * k;
          swing = Math.max(0, swing - dt * 4);
        }
      }
    },
  };
}
