// Puts a skeleton into a climber's pose (player/climber.js pose()). The same code drives any
// rig: it only needs named joints as THREE objects, and works by rotating each bone in world
// space until it points where it should, so a bone's own axes don't matter.
//   rig = { root, pelvis, spine: [bones…], head?, arms: { l: [upper, lower, hand], r }, legs: { l: [thigh, calf, foot], r },
//           fingers?: { l: [[bone…]…], r }, curl?: axis }
import * as THREE from 'three';
import { gripHand, wristFor, rollNeed, FOREARM_ROLL } from './grasp.js';
import { gripOfHold } from './handhold.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _wq = new THREE.Quaternion();

// Rotate `bone` (about its own origin) so the world direction from it to `child` becomes `dir`.
function aimBone(bone, child, dir) {
  bone.getWorldPosition(_a); child.getWorldPosition(_b);
  _c.subVectors(_b, _a).normalize();
  _q.setFromUnitVectors(_c, dir);                     // the world-space change
  bone.getWorldQuaternion(_wq); _wq.premultiply(_q);
  bone.parent.getWorldQuaternion(_pq).invert();
  bone.quaternion.copy(_pq.multiply(_wq));
  bone.updateMatrixWorld(true);
}
// Set a bone's world rotation.
function setWorldQuat(bone, q) { bone.parent.getWorldQuaternion(_pq).invert(); bone.quaternion.copy(_pq).multiply(q); bone.updateMatrixWorld(true); }

// Two-bone IK: upper → lower → end reaches `target`, the joint bending toward `pole`.
// Returns how far short the end still is (0 = there).
export function solveLimb(upper, lower, end, target, pole) {
  upper.getWorldPosition(_a); lower.getWorldPosition(_b); end.getWorldPosition(_c);
  const l1 = _a.distanceTo(_b), l2 = _b.distanceTo(_c), S = _a.clone();
  const to = new THREE.Vector3().subVectors(target, S), full = to.length(), d = Math.min(full, (l1 + l2) * 0.9995), dir = to.clone().normalize();
  // the elbow or knee: along the line to the target, then out toward the pole
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const off = pole.clone().sub(S); off.addScaledVector(dir, -off.dot(dir)); if (off.lengthSq() < 1e-8) off.set(0, 0, 1); off.normalize();
  const joint = S.clone().addScaledVector(dir, along).addScaledVector(off, h);
  aimBone(upper, lower, _d.subVectors(joint, S).normalize().clone());
  const reach = S.clone().addScaledVector(dir, d);
  aimBone(lower, end, _e.subVectors(reach, joint).normalize().clone());
  return Math.max(0, full - d);
}

const v3 = a => new THREE.Vector3(a[0], a[1], a[2]);
// A world rotation whose local axes X, Y, Z point along the three given (orthonormal) vectors.
const basis = (x, y, z) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));

// rest: captured once by captureRest(rig): each joint's world rotation relative to a T/A-pose
// facing +z, so rotations can be written in "the body's frame".
export function captureRest(rig) {
  rig.root.updateMatrixWorld(true);
  const rest = new Map(), add = b => { if (b) rest.set(b, b.getWorldQuaternion(new THREE.Quaternion()).clone()); };
  add(rig.pelvis); (rig.spine || []).forEach(add); add(rig.neck); add(rig.head);
  for (const s of ['l', 'r']) { rig.arms[s].forEach(add); rig.legs[s].forEach(add); (rig.fingers?.[s] || []).flat().forEach(add); }
  rig.rest = rest; rig.rootRest = rig.root.quaternion.clone();
  return rig;
}

// Pose the rig. `pose` is world space; toRender maps it to the scene (the floating origin).
// Returns the worst miss in metres, for tests.
export function applyClimbPose(rig, pose, toRender = p => p, grounded = {}) {
  const R = v3(pose.right), F = v3(pose.forward), U = v3(pose.up), P = v3(toRender(...pose.pelvis));
  // the body's frame: rig faces +z, its left is +x (y up). So X = left = -right, Z = forward.
  const yawFrame = basis(R.clone().negate(), new THREE.Vector3(0, 1, 0), F);
  rig.root.quaternion.copy(yawFrame); rig.root.updateMatrixWorld(true);
  // pelvis: where the solver says, tilted by the feet
  rig.pelvis.getWorldPosition(_a); rig.root.position.add(_b.subVectors(P, _a)); rig.root.updateMatrixWorld(true);
  const tiltP = new THREE.Quaternion().setFromAxisAngle(F, pose.hipTilt || 0);
  const lean = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), U), tiltS = new THREE.Quaternion().setFromAxisAngle(F, pose.tilt || 0);
  const idleTorso = (rig.spine || []).every(b => b.userData.qi) && rig.head?.userData.qi;
  if (idleTorso) {
    // the torso as one piece: the pelvis takes the lean and the tilt, and every joint above it is held at the idle pose's own bend, so the
    // back, chest, neck and shoulders are exactly the shape they are standing; the head only turns a little toward the hold (a turn of the
    // head alone, kept small, leaves the neck's shape)
    const tilt = new THREE.Quaternion().slerpQuaternions(tiltP, tiltS, 0.5);
    setWorldQuat(rig.pelvis, tilt.multiply(lean).multiply(yawFrame).multiply(rig.rest.get(rig.pelvis)));
    for (const b of [...rig.spine, rig.neck, rig.clavicles?.l, rig.clavicles?.r, rig.head]) if (b?.userData.qi) b.quaternion.copy(b.userData.qi);
    rig.pelvis.updateMatrixWorld(true);
    // the head looks up the wall to the hands (or the hold it's going for), not down into the wall the torso leans to: a turn against the
    // chest of up to 30° up, 15° down, 30° aside, half of it in the neck so neither bends far
    { const h = rig.head.getWorldPosition(new THREE.Vector3()), hands = pose.limbs.lh.p && pose.limbs.rh.p ? v3(toRender(...pose.limbs.lh.p)).add(v3(toRender(...pose.limbs.rh.p))).multiplyScalar(0.5) : null, la = pose.lookAt ? v3(toRender(...pose.lookAt)) : null, tgt = la && la.y > h.y ? la : hands || la;     // (a foot hold below: the eyes stay up on the hands)
      if (tgt) {
        const t = tgt.sub(h).normalize(), cf = F.clone().applyQuaternion(lean), cu = new THREE.Vector3(0, 1, 0).applyQuaternion(lean);
        const yaw = Math.max(-0.5, Math.min(0.5, Math.atan2(t.dot(R), t.dot(cf)))), pitch = Math.max(-0.26, Math.min(0.52, Math.atan2(t.dot(cu), Math.hypot(t.dot(R), t.dot(cf)))));
        const dir = cf.clone().multiplyScalar(Math.cos(pitch) * Math.cos(yaw)).addScaledVector(R, Math.cos(pitch) * Math.sin(yaw)).addScaledVector(cu, Math.sin(pitch)).normalize(), q = new THREE.Quaternion().setFromUnitVectors(cf, dir);
        if (rig.neck) { rig.neck.getWorldQuaternion(_wq); setWorldQuat(rig.neck, new THREE.Quaternion().slerp(q, 0.5).multiply(_wq)); }
        rig.head.getWorldQuaternion(_wq); setWorldQuat(rig.head, (rig.neck ? new THREE.Quaternion().slerp(q, 0.5) : q).multiply(_wq));
      }
    }
  } else {
  setWorldQuat(rig.pelvis, tiltP.clone().multiply(yawFrame).multiply(rig.rest.get(rig.pelvis)));
  // spine: leaning in over its bones; shoulders tilt with the hands (twist a little with them)
  const n = (rig.spine || []).length || 1;
  (rig.spine || []).forEach((b, i) => {
    const f = (i + 1) / n, q = new THREE.Quaternion().slerpQuaternions(tiltP, tiltS, f), l = new THREE.Quaternion().slerp(lean, f);
    setWorldQuat(b, q.multiply(l).multiply(yawFrame).multiply(rig.rest.get(b)));
  });
  if (rig.head) setWorldQuat(rig.head, yawFrame.clone().multiply(rig.rest.get(rig.head)));
  }
  let miss = 0;
  // limbs: elbows out and down, knees out over the toes
  for (const s of ['l', 'r']) {
    const sd = s === 'l' ? R.clone().negate() : R, [ua, la, ha] = rig.arms[s], [th, ca, fo] = rig.legs[s], H = pose.limbs[s + 'h'], Fo = pose.limbs[s + 'f'];
    const hp = v3(toRender(...H.p)), shoulder = ua.getWorldPosition(new THREE.Vector3());
    // a real hand: what it's on is felt for, and the wrist goes where that grip needs it, closing in over the last of the reach
    const RH = rig.hands?.[s], G = RH && H.hold && (H.grip ?? 0) > 0 ? gripOfHold(H.hold, s, rig.probe, toRender, rig.fromRender) : null;
    // on an arris the hand lies up it at the slant the forearm comes in at: first guessed from the shoulder-to-hold line (the elbow hangs below it,
    // so a little steeper), then, once the arm is on, from the forearm itself, and the arm put on again
    const hp0 = hp.clone(), cUp = G?.kind === 'corner' ? (() => { const O = v3(G.O), Ys = v3(G.Y), u = new THREE.Vector3().crossVectors(O, Ys); if (u.y < 0) u.negate(); return { Ys, u }; })() : null;
    const slant = d => Math.max(-0.6, Math.min(1.5, Math.atan2(d.dot(cUp.u), Math.max(0.05, d.dot(cUp.Ys)))));
    if (cUp) G.tilt = Math.max(-0.6, Math.min(1.5, slant(v3(G.E).sub(shoulder).normalize()) + 0.3));
    const gripAt = () => { hp.copy(hp0); if (G) { const w = v3(wristFor(G, RH)), e = H.grip >= 1 ? 1 : (H.grip * H.grip * (3 - 2 * H.grip)); hp.lerp(w, e); } };
    gripAt();
    const elbowPole = shoulder.clone().addScaledVector(sd, 0.5).addScaledVector(new THREE.Vector3(0, 1, 0), -0.45).addScaledVector(F, 0.05);     // (out to the side and down: never back behind the body, which wrenches the shoulder)
    // the arm is put from its modelled pose every frame (so no roll is carried over from the last one), and where the hand has a grip the elbow
    // swings round the shoulder-to-wrist line to where the forearm needs least roll to bring the palm round: a forearm only turns so far
    // the shoulder rises with the arm, as a real one does (the collarbone lifts and the shoulder blade turns up, about a third of the lift
    // above shoulder height): without it the arm reaches up from under the chin, across the face, and the neck vanishes behind the shoulder
    const cl = rig.clavicles?.[s];
    if (cl?.userData.qi) {
      cl.quaternion.copy(cl.userData.qi); cl.updateMatrixWorld(true);
      const sh0 = ua.getWorldPosition(new THREE.Vector3()), toH = hp.clone().sub(sh0), elev = Math.acos(Math.max(-1, Math.min(1, -toH.y / (toH.length() || 1))));
      const lift = Math.max(0, Math.min(0.3, (elev - 1.6) * 0.3));
      if (lift > 0) { const c0 = cl.getWorldPosition(new THREE.Vector3()), d = sh0.clone().sub(c0).normalize(), ax = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize();
        cl.getWorldQuaternion(_wq); setWorldQuat(cl, new THREE.Quaternion().setFromAxisAngle(ax, lift).multiply(_wq)); }
      shoulder.copy(ua.getWorldPosition(new THREE.Vector3()));
    }
    const fromRest = () => { for (const b of [ua, la, ha]) if (b.userData.qi || b.userData.q0) b.quaternion.copy(b.userData.qi || b.userData.q0); ua.updateMatrixWorld(true); };      // (from the idle pose's own arm where there is one)
    let pole = elbowPole;
    if (G && (ua.userData.qi || ua.userData.q0)) {
      const axis = hp.clone().sub(shoulder).normalize(); let best = null;
      for (const sw of [0, -0.35, 0.35, -0.7, 0.7, -1.05, 1.05]) {
        const pp = elbowPole.clone().sub(shoulder).applyAxisAngle(axis, sw).add(shoulder); fromRest(); solveLimb(ua, la, ha, hp, pp);
        const need = Math.abs(rollNeed(RH, G)), cost = Math.max(0, need - FOREARM_ROLL * 0.85) * 3 + need * 0.15 + Math.abs(sw) * 0.25, el = la.getWorldPosition(_e), cost2 = cost + Math.max(0, el.dot(F) - hp.dot(F) + 0.06) * 8 + Math.max(0, -(el.clone().sub(shoulder).dot(sd)) - 0.04) * 6 + Math.max(0, el.y - shoulder.y - 0.12) * 4 + Math.max(0, -(el.clone().sub(shoulder).dot(F)) - 0.03) * 30;     // (the elbow not into the wall, not across the chest, not cocked up over the shoulder, not thrown back behind the body)
        if (!best || cost2 < best.cost) best = { cost: cost2, pp };
      }
      pole = best.pp;
    }
    fromRest();
    let mArm = solveLimb(ua, la, ha, hp, pole);
    if (cUp) { const fd = ha.getWorldPosition(new THREE.Vector3()).sub(la.getWorldPosition(new THREE.Vector3())).normalize(), t = slant(fd); if (Math.abs(t - G.tilt) > 0.04) { G.tilt = t; gripAt(); fromRest(); mArm = solveLimb(ua, la, ha, hp, pole); } }
    miss = Math.max(miss, mArm);
    const fp = v3(toRender(...Fo.p)), hip = th.getWorldPosition(new THREE.Vector3());
    const kneeUp = Math.max(0, fp.y - hip.y + 0.5);     // (a foot up near hip height: the knee comes up and out, it doesn't go through what's in front)
    const kneePole = hip.clone().addScaledVector(sd, 0.3).addScaledVector(F, 0.5 + kneeUp * 0.6).addScaledVector(new THREE.Vector3(0, 1, 0), 0.1 + kneeUp * 0.45);     // (a foot up near the hip: the knee goes up and toward the wall, not splayed out to the side (that tears the skin at the hip), never back through the body)
    for (const b of [th, ca, fo]) if (b.userData.qi || b.userData.q0) b.quaternion.copy(b.userData.qi || b.userData.q0);     // (the leg too from its idle pose each frame: nothing winds up)
    th.updateMatrixWorld(true);
    miss = Math.max(miss, solveLimb(th, ca, fo, fp, kneePole));
    // the hand lies on its hold: fingers over the ledge toward the wall, palm down, thumb in; in the
    // air it opens and leads toward where it's going. The foot's toes point at the wall.
    const wall = H.n ? v3(H.n).negate() : F.clone(), grip = H.grip ?? 0;
    if (RH) {      // the hand closes on what it's on, or, reaching, is open and follows the forearm
      if (G) { RH.hand.quaternion.copy(RH.hand.userData.q0); RH.hand.updateMatrixWorld(true); gripHand(RH, G, grip); }
      else { for (const f of ['index', 'middle', 'ring', 'pinky']) RH.fingers[f].bones.forEach((b, i) => b.quaternion.copy(RH.fingers[f].q0[i])); RH.thumb.bones.forEach((b, i) => b.quaternion.copy(RH.thumb.q0[i])); RH.hand.quaternion.copy(RH.hand.userData.q0); RH.hand.updateMatrixWorld(true); }
    } else
    setWorldQuat(ha, yawFrame.clone().multiply(rig.rest.get(ha)));
    if (rig.palm && !RH) {
      const down = new THREE.Vector3(0, -1, 0), fingers = wall.clone().multiplyScalar(0.85).addScaledVector(down, 0.5 * grip).normalize();
      aimBone(ha, rig.palm[s].middle, fingers);
      // twist about the fingers so the thumb lies toward the body's centre line
      const hw = ha.getWorldPosition(new THREE.Vector3()), th = rig.palm[s].thumb.getWorldPosition(new THREE.Vector3()).sub(hw);
      th.addScaledVector(fingers, -th.dot(fingers)).normalize();
      const inward = sd.clone().negate(); inward.addScaledVector(fingers, -inward.dot(fingers)).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(th, inward), wq = ha.getWorldQuaternion(new THREE.Quaternion()).premultiply(q);
      setWorldQuat(ha, wq);
      // and the fingers close round the edge, by world axis, as firmly as it's gripping
      const axis = new THREE.Vector3().crossVectors(fingers, down).normalize();
      if (rig.fingers?.[s]) for (const chain of rig.fingers[s]) chain.forEach((b, i) => {
        b.quaternion.copy(b.userData.q0 ||= b.quaternion.clone()); b.updateMatrixWorld(true);
        const w = b.getWorldQuaternion(new THREE.Quaternion()).premultiply(new THREE.Quaternion().setFromAxisAngle(axis, (0.2 + 0.8 * grip) * [0.8, 1.0, 0.7][i % 3]));
        setWorldQuat(b, w);
      });
    }
    setWorldQuat(fo, yawFrame.clone().multiply(rig.rest.get(fo)));
    if (rig.toe) { aimBone(fo, rig.toe[s], (Fo.n ? v3(Fo.n).negate() : F.clone()).addScaledVector(new THREE.Vector3(0, -1, 0), Fo.n ? 0.12 : 0.7).normalize()); }
  }
  return miss;
}
