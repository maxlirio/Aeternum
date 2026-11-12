// You, as the ADVENTURER body (assets/adventurer.glb, packed from ~/Developer/ADVENTURER by tools/pack-adventurer.mjs):
// the same interface as the placeholder (player/avatar.js createPlaceholderAvatar), so the game swaps one for the other
// once it has loaded. Walking and running are the body's own recorded clips, blended by speed and kept in step with
// it; sitting, lying and swimming are put on the skeleton directly; on a wall every joint comes from the climber
// (player/limbik.js) and the hands from what they're holding (player/grasp.js, player/handhold.js).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { captureRest, applyClimbPose } from './limbik.js';
import { captureHand } from './grasp.js';
import { armObject } from '../render/weapons.js';
import { WEAPONS } from '../sim/processes/combat.js';

const GAITS = [['idle', 0], ['walk', 1.45], ['jog', 3.4], ['run', 5.8]];      // (m/s each clip covers: measured from the feet at load, these if it can't be)
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _p = new THREE.Quaternion();
function setWorldQuat(b, q) { b.parent.getWorldQuaternion(_p).invert(); b.quaternion.copy(_p).multiply(q); b.updateMatrixWorld(true); }
function aim(bone, child, dir) { bone.getWorldPosition(_v); const c = child.getWorldPosition(new THREE.Vector3()).sub(_v).normalize(); _q.setFromUnitVectors(c, dir); bone.getWorldQuaternion(_p); setWorldQuat(bone, _q.multiply(_p).clone()); }

export async function loadAdventurer(url = './assets/adventurer.glb') {
  const g = await new GLTFLoader().loadAsync(url), root = g.scene, by = {};
  root.traverse(o => { if (o.name && !by[o.name]) by[o.name] = o; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  root.traverse(o => { if (o.isBone) o.userData.q0 = o.quaternion.clone(); });
  const skinned = []; root.traverse(o => { if (o.isSkinnedMesh) skinned.push(o); });
  const body = skinned.find(m => /body/i.test(m.name)) || skinned[0];
  const fing = (f, s) => ['01', '02', '03'].map(k => by[`${f}_${k}_${s}`]);
  const rig = captureRest({ root, pelvis: by.pelvis, spine: [by.spine_01, by.spine_02, by.spine_03], neck: by.neck_01, head: by.head,
    arms: { l: [by.upperarm_l, by.lowerarm_l, by.hand_l], r: [by.upperarm_r, by.lowerarm_r, by.hand_r] }, legs: { l: [by.thigh_l, by.calf_l, by.foot_l], r: [by.thigh_r, by.calf_r, by.foot_r] },
    toe: { l: by.ball_l, r: by.ball_r } });
  rig.handBones = {}; for (const s of ['l', 'r']) rig.handBones[s] = { hand: by['hand_' + s], index: fing('index', s), middle: fing('middle', s), ring: fing('ring', s), pinky: fing('pinky', s), thumb: fing('thumb', s) };
  rig.hands = { l: captureHand(rig, 'l', [body]), r: captureHand(rig, 'r', [body]) };
  // the clips, and how fast each one walks (the planted foot's travel against the hips, over a cycle)
  const mixer = new THREE.AnimationMixer(root), clip = n => g.animations.find(a => a.name === n), act = {};
  for (const a of g.animations) { act[a.name] = mixer.clipAction(a); }
  const speedOf = name => { const c = clip(name); if (!c) return 0; const A = mixer.clipAction(c); A.play(); A.weight = 1; let lo = Infinity, hi = -Infinity; for (let i = 0; i <= 24; i++) { mixer.setTime(c.duration * i / 24); root.updateMatrixWorld(true); const z = by.ball_l.getWorldPosition(_v).z - by.pelvis.getWorldPosition(new THREE.Vector3()).z; lo = Math.min(lo, z); hi = Math.max(hi, z); } A.stop(); return (hi - lo) / (c.duration / 2); };
  const gaits = GAITS.map(([n, v]) => { const m = n === 'idle' ? 0 : speedOf(n); return { n, v: m > 0.5 && m < 12 ? m : v, a: act[n] }; }).filter(x => x.a);
  for (const b of Object.values(by)) if (b.isBone) b.quaternion.copy(b.userData.q0);
  for (const G of gaits) { G.a.play(); G.a.weight = 0; G.a.enabled = true; }
  const mats = []; root.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) { if (!mats.includes(m)) { m.userData.t0 = m.transparent; m.userData.d0 = m.depthWrite; mats.push(m); } } });
  let opacity = 1, onWall = false, phase = 0, oneShot = null, heldId = null, aimIdle = null;
  const socket = by.socket_hand_r || by.hand_r, held = new THREE.Group(); socket.add(held);
  const setGait = (speed, dt) => {      // the two clips either side of this speed, in step with it
    let i = 0; while (i < gaits.length - 2 && speed > gaits[i + 1].v) i++;
    const A = gaits[i], B = gaits[i + 1], f = B ? THREE.MathUtils.clamp((speed - A.v) / (B.v - A.v), 0, 1) : 0;
    for (const G of gaits) { const w = G === A ? 1 - f : G === B ? f : 0; G.a.weight += (w - G.a.weight) * Math.min(1, dt * 10); }
    const cyc = B && B.n !== 'idle' ? (A.n === 'idle' ? B : (f > 0.5 ? B : A)) : null;
    if (cyc && speed > 0.05) { const rate = speed / cyc.v; phase = (phase + dt * rate / cyc.a.getClip().duration) % 1; for (const G of gaits) if (G.n !== 'idle') { G.a.time = phase * G.a.getClip().duration; G.a.timeScale = 0; } }
  };
  const resetBones = () => { for (const b of Object.values(by)) if (b.isBone) b.quaternion.copy(b.userData.q0); };
  const api = {
    object: root, rig, isPlaceholder: false,
    // world hooks for the hands: what to probe, and how to get from render space back to the world
    setWorld(probe, fromRender) { rig.probe = probe; rig.fromRender = fromRender; },
    climb(pose, toRender) { onWall = true; root.position.set(0, 0, 0); applyClimbPose(rig, pose, toRender); },
    setOpacity(o) {
      if (Math.abs(o - opacity) < 0.01) return; opacity = o; root.visible = o > 0.02;
      for (const m of mats) { m.transparent = o < 0.99 || m.userData.t0; m.opacity = o; m.depthWrite = o >= 0.99 ? m.userData.d0 : false; }
    },
    setHeld(id) {
      if (heldId === id) return; heldId = id; held.clear(); const W = id && WEAPONS[id];
      aimIdle = W && id !== 'fists' ? (W.ranged ? act.pistol_idle : act.sword_idle) || null : null;
      if (id && this.planet && W && id !== 'fists') held.add(armObject(this.planet, id));
    },
    punch() { const a = act.punch_jab || act.strike_straight_r_1; if (!a) return; oneShot = a; a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; a.weight = 1; a.timeScale = 1.2; a.play(); },
    update(dt, speed, grounded, climb = null, pose = null) {
      if (onWall) { onWall = false; root.quaternion.identity(); }
      if (climb && !pose) return;       // (the climber puts every joint; climb() comes after this)
      held.visible = !pose;
      resetBones();
      if (pose === 'sit' || pose === 'lie') { for (const G of gaits) G.a.weight = G.n === 'idle' ? 1 : 0; }
      else if (pose === 'swim') setGait(Math.min(speed, 1.4), dt);
      else setGait(grounded ? speed : 0, dt);
      if (aimIdle && !pose) { aimIdle.play(); aimIdle.weight += ((speed < 0.3 ? 1 : 0) - aimIdle.weight) * Math.min(1, dt * 6); }
      if (oneShot && !oneShot.isRunning()) { oneShot.stop(); oneShot = null; }
      mixer.update(dt);
      root.updateMatrixWorld(true);
      if (pose === 'sit') {      // thighs level, shins down, hands on the knees
        const f = new THREE.Vector3(0, 0, 1).applyQuaternion(root.getWorldQuaternion(_q)), down = new THREE.Vector3(0, -1, 0);
        root.position.y -= 0.45; root.updateMatrixWorld(true);
        for (const s of ['l', 'r']) { aim(by['thigh_' + s], by['calf_' + s], f.clone().addScaledVector(down, 0.05).normalize()); aim(by['calf_' + s], by['foot_' + s], down.clone().addScaledVector(f, 0.12).normalize());
          aim(by['upperarm_' + s], by['lowerarm_' + s], down.clone().addScaledVector(f, 0.35).normalize()); aim(by['lowerarm_' + s], by['hand_' + s], f.clone().addScaledVector(down, 0.5).normalize()); }
      } else if (pose === 'lie') { root.rotateX(-Math.PI / 2); root.position.y += 0.12; }
      else if (pose === 'swim') { root.rotateX(1.25); root.position.y += 0.75; }
      else if (!grounded && !climb) {      // in the air: knees up a little, arms out for balance
        for (const s of ['l', 'r']) { by['thigh_' + s].rotateX(-0.35); by['calf_' + s].rotateX(0.5); }
      }
    },
  };
  return api;
}
