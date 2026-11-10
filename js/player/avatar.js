// Human body VIEW. Gameplay never reads this geometry: people are points with a facing,
// a pose name and a gait phase. This module turns that into a PLACEHOLDER body made of
// primitives. ADVENTURER's rigged GLB will replace buildRig/applyPose behind the same
// two interfaces:
//   player:  createPlaceholderAvatar() → { object, update(dt, speed, grounded), setOpacity }
//   crowd:   buildRig() / applyPose(rig, state) used by render/crowd.js
import { armObject } from '../render/weapons.js';
import { WEAPONS } from '../sim/processes/combat.js';
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
  // pelvis, waist, ribcage, shoulders: a person's taper, not an egg
  const pelvis = tag(new THREE.Mesh(new THREE.CapsuleGeometry(0.125, 0.09, 4, 12), mats.suit), 'suit'); pelvis.rotation.z = Math.PI / 2; pelvis.scale.set(1, 1, 0.78); pelvis.position.y = 0.0; hips.add(pelvis);
  const waist = tag(new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.14, 4, 12), mats.suit), 'suit'); waist.position.y = 0.13; waist.scale.set(1.05, 1, 0.8); torso.add(waist);
  const chest = tag(new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.2, 4, 12), mats.suit), 'suit'); chest.position.y = 0.36; chest.scale.set(1.14, 1, 0.76); torso.add(chest);
  const shoulders = tag(new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.33, 4, 10), mats.suit), 'suit'); shoulders.rotation.z = Math.PI / 2; shoulders.position.y = 0.5; torso.add(shoulders);
  const vest = tag(new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.26, 0.225), mats.pad), 'pad'); vest.position.set(0, 0.35, 0); torso.add(vest);
  const stripe = tag(new THREE.Mesh(new THREE.BoxGeometry(0.315, 0.018, 0.23), mats.accent), 'accent'); stripe.position.set(0, 0.42, 0); torso.add(stripe);
  const neck = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.054, 0.1, 10), mats.skin), 'skin'); neck.position.y = 0.585; torso.add(neck);
  const head = tag(new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 14), mats.skin), 'skin'); head.scale.set(0.86, 1.14, 0.98); head.position.y = 0.71; torso.add(head);
  const hair = tag(new THREE.Mesh(new THREE.SphereGeometry(0.104, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mats.hair), 'hair'); hair.scale.set(0.88, 1.08, 1.02); hair.position.set(0, 0.725, -0.006); torso.add(hair);
  const limb = (parent, x, y, r1, l1, r2, l2, kind) => {
    const upper = new THREE.Group(); upper.position.set(x, y, 0); parent.add(upper);
    upper.add(cap(r1, l1, kind));
    const lower = new THREE.Group(); lower.position.y = -(l1 + 2 * r1) + r1 * 0.5; upper.add(lower);
    lower.add(cap(r2, l2, kind));
    return { upper, lower };
  };
  const legL = limb(hips, 0.095, -0.03, 0.073, 0.31, 0.052, 0.36, 'suit'), legR = limb(hips, -0.095, -0.03, 0.073, 0.31, 0.052, 0.36, 'suit');
  for (const L of [legL, legR]) { const boot = tag(new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.16, 4, 10), mats.pad), 'pad'); boot.rotation.x = Math.PI / 2; boot.scale.set(1.08, 1, 0.82); boot.position.set(0, -0.455, 0.05); L.lower.add(boot); }
  const armL = limb(torso, 0.225, 0.5, 0.05, 0.235, 0.04, 0.23, 'suit'), armR = limb(torso, -0.225, 0.5, 0.05, 0.235, 0.04, 0.23, 'suit');
  for (const A of [armL, armR]) { const hand = tag(new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), mats.skin), 'skin'); hand.scale.set(0.72, 1.3, 0.95); hand.position.y = -0.335; A.lower.add(hand); }
  return { root, hips, torso, legL, legR, armL, armR, parts };
}

// state: { mode: 'walk'|'stand'|'sit'|'lie'|'air', phase, blend (0 idle..1 moving), k (0 walk..1 run) }
export function applyPose(rig, st) {
  const { hips, torso, legL, legR, armL, armR } = rig;
  const s = Math.sin(st.phase), amp = (0.35 + 0.55 * st.k) * st.blend;
  rig.root.rotation.x = 0;
  hips.position.y = 0.95; hips.position.z = 0; hips.rotation.set(0, 0, 0); torso.rotation.set(0, 0, 0);
  // (a climb turns these joints every way: the poses below only set their bend, so clear the rest)
  legL.lower.rotation.set(0, 0, 0); legR.lower.rotation.set(0, 0, 0); armL.lower.rotation.set(0, 0, 0); armR.lower.rotation.set(0, 0, 0);
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
  if (st.mode === 'swim') {     // face down, head up, arms pulling in turn, legs fluttering; treading water when still
    const going = Math.min(1, st.k / 0.6), a = st.phase; const lie = 1.25 * going + 0.15, L = 0.95 + 0.12 * going; rig.root.rotation.x = lie; hips.position.y = L * Math.cos(lie); hips.position.z = -L * Math.sin(lie);   // turned about the middle of the body, not the feet: on the water, not under it
    torso.rotation.x = -0.5 * going; armL.upper.rotation.set(-2.2 * going - 0.5 + Math.sin(a) * 1.3 * going, 0, 0.35 - 0.2 * going); armR.upper.rotation.set(-2.2 * going - 0.5 - Math.sin(a) * 1.3 * going, 0, -0.35 + 0.2 * going);
    armL.lower.rotation.x = -0.5 + (1 - going) * Math.sin(a) * 0.4; armR.lower.rotation.x = -0.5 - (1 - going) * Math.sin(a) * 0.4;
    legL.upper.rotation.x = Math.sin(a * 2.2) * 0.34; legR.upper.rotation.x = -Math.sin(a * 2.2) * 0.34; legL.lower.rotation.x = 0.25 + Math.max(0, Math.sin(a * 2.2)) * 0.3; legR.lower.rotation.x = 0.25 + Math.max(0, -Math.sin(a * 2.2)) * 0.3;
  }
  if (st.mode === 'lie') {
    rig.root.rotation.x = -Math.PI / 2; hips.position.y = 0.95;
    armL.upper.rotation.z = 0.15; armR.upper.rotation.z = -0.15;
  }
}

// A long gun held in both hands, in the chest's frame along the line of fire (a: 0 at the ready, muzzle down across the body, 1 up into the shoulder):
// the grip by the right hip rising to the shoulder, the hands put on it by reaching (two-bone IK). The gun's group is rig.gunSock.
export function holdLong(rig, a) {
  const G = rig.gunSock || (rig.gunSock = (() => { const g = new THREE.Group(); rig.torso.add(g); return g; })()); G.visible = true;
  G.position.set(-0.11 + 0.03 * a, 0.2 + 0.2 * a, 0.2 + 0.04 * a); G.rotation.set(0.55 * (1 - a), 0.22 * a - 0.25 * (1 - a), 0); G.updateMatrix();
  const grip = new THREE.Vector3(0, -0.02, 0).applyMatrix4(G.matrix), fore = new THREE.Vector3(0, -0.04, 0.36).applyMatrix4(G.matrix);
  reach(rig.armR, grip, new THREE.Vector3(-1, -0.6, -0.4)); reach(rig.armL, fore, new THREE.Vector3(1, -1, -0.3));
}
// an arm (render/avatar.js limb: upper at the shoulder, bone down its -y; lower at the elbow) put so its hand is at T, its elbow bent toward `pole`; all in the arm's parent's frame
const _d = new THREE.Vector3(), _u = new THREE.Vector3(), _ax = new THREE.Vector3(), _e = new THREE.Vector3(), _q = new THREE.Quaternion(), DOWN = new THREE.Vector3(0, -1, 0), L1 = 0.31, L2 = 0.335;
function reach(arm, T, pole) {
  const S = arm.upper.position; _d.subVectors(T, S); const d = Math.min(_d.length(), (L1 + L2) * 0.985); _d.normalize();
  const al = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  _ax.crossVectors(_d, pole).normalize(); if (_ax.lengthSq() < 1e-6) _ax.set(1, 0, 0);
  _u.copy(_d).applyAxisAngle(_ax, al);         // (the upper arm swung off the line to the target, toward the pole)
  arm.upper.quaternion.setFromUnitVectors(DOWN, _u);
  _e.copy(S).addScaledVector(_u, L1); const low = new THREE.Vector3().copy(S).addScaledVector(_d, d).sub(_e).normalize();
  _q.setFromUnitVectors(DOWN, low); arm.lower.quaternion.copy(arm.upper.quaternion).invert().multiply(_q);
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
  let phase = 0, blend = 0, opacity = 1, swing = 0, aim = false, twoHands = false;
  // the hand socket: a weapon's grip goes here
  const held = new THREE.Group(); held.position.set(0, -0.4, 0.02); rig.armR.lower.add(held);
  // the same IK rig a real skeleton gets (player/limbik.js): just joints
  const end = (L, y) => { const g = new THREE.Group(); g.position.y = y; L.lower.add(g); return g; };
  const ik = captureRest({ root: rig.root, pelvis: rig.hips, spine: [rig.torso], arms: { l: [rig.armL.upper, rig.armL.lower, end(rig.armL, -0.36)], r: [rig.armR.upper, rig.armR.lower, end(rig.armR, -0.36)] }, legs: { l: [rig.legL.upper, rig.legL.lower, end(rig.legL, -0.48)], r: [rig.legR.upper, rig.legR.lower, end(rig.legR, -0.48)] } });
  let onWall = false;
  return {
    object: rig.root,
    rig,
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
      held.clear(); rig.gunSock?.clear(); held.userData.id = id; const W = id && WEAPONS[id]; aim = !!W?.ranged; twoHands = !!W?.two;
      // Every model has its grip at its origin, so it goes straight into the hand socket. (A real skeleton's hand bone takes this same group.)
      if (id && this.planet && WEAPONS[id] && id !== 'fists') {
        const g = armObject(this.planet, id);
        if (aim && twoHands) { holdLong(rig, 1); rig.gunSock.clear(); rig.gunSock.add(g); }      // a long gun: in both hands, along the line of fire
        else { if (aim) { g.rotation.x = Math.PI / 2; g.position.set(0, -0.02, 0); } else g.rotation.x = -0.25; held.add(g); }     // a pistol along the arm; a blade out from the fist
      }
    },
    punch() { swing = 1; },
    update(dt, speed, grounded, climb = null, pose = null) {   // pose: 'sit' | 'lie' while seated
      if (onWall) { onWall = false; rig.hips.quaternion.identity(); rig.root.quaternion.identity(); }
      if (rig.gunSock) rig.gunSock.visible = !pose && !climb;      // (a long gun's slung while you sit, swim or climb)
      if (pose === 'swim') { phase += dt * (speed > 0.15 ? 5 : 1.6); applyPose(rig, { mode: 'swim', phase, blend: 0, k: speed }); return; }
      if (pose) { blend = 0; applyPose(rig, { mode: pose, phase, blend: 0, k: 0 }); return; }
      blend += ((speed > 0.15 ? 1 : 0) - blend) * Math.min(1, dt * 8);
      phase += dt * (climb ? (climb.moving ? 4 : 0) : speed > 0.15 ? 2.2 + speed * 1.15 : 0);
      applyPose(rig, { mode: climb ? 'climb' : grounded ? 'walk' : 'air', phase, blend, k: Math.min(1, Math.max(0, speed - 3) / 3), lean: climb?.lean ?? 0 });
      if (!climb) {
        if (aim && twoHands) holdLong(rig, speed > 3 ? 0.35 : 1);
        else if (aim) { rig.armR.upper.rotation.set(-1.45, 0, -0.1); rig.armR.lower.rotation.x = -0.1; }
        if (twoHands && !aim) { rig.armL.upper.rotation.set(-1.15, 0, 0.55); rig.armL.lower.rotation.set(-0.75, 0, 0); if (!aim) { rig.armR.upper.rotation.set(-0.9, 0, -0.1); rig.armR.lower.rotation.x = -0.6; } }          // a gun is held out in front
        if (swing > 0) {                                                                                     // a strike: the arm drives forward and back
          const k = Math.sin(swing * Math.PI); rig.armR.upper.rotation.x = -0.4 - 1.2 * k; rig.armR.lower.rotation.x = -1.2 + 1.1 * k; rig.torso.rotation.y = -0.35 * k;
          swing = Math.max(0, swing - dt * 4);
        }
      }
    },
  };
}
