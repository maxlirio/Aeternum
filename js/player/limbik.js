// Puts a skeleton into a climber's pose (player/climber.js pose()). The same code drives any
// rig: it only needs named joints as THREE objects, and works by rotating each bone in world
// space until it points where it should, so a bone's own axes don't matter.
//   rig = { root, pelvis, spine: [bones…], head?, arms: { l: [upper, lower, hand], r }, legs: { l: [thigh, calf, foot], r },
//           fingers?: { l: [[bone…]…], r }, curl?: axis }
import * as THREE from 'three';

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
  add(rig.pelvis); (rig.spine || []).forEach(add); add(rig.head);
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
  setWorldQuat(rig.pelvis, tiltP.clone().multiply(yawFrame).multiply(rig.rest.get(rig.pelvis)));
  // spine: leaning in over its bones; shoulders tilt with the hands (twist a little with them)
  const lean = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), U), n = (rig.spine || []).length || 1;
  const tiltS = new THREE.Quaternion().setFromAxisAngle(F, pose.tilt || 0);
  (rig.spine || []).forEach((b, i) => {
    const f = (i + 1) / n, q = new THREE.Quaternion().slerpQuaternions(tiltP, tiltS, f), l = new THREE.Quaternion().slerp(lean, f);
    setWorldQuat(b, q.multiply(l).multiply(yawFrame).multiply(rig.rest.get(b)));
  });
  if (rig.head && pose.lookAt) {     // eyes on the hold you're going for
    const h = rig.head.getWorldPosition(new THREE.Vector3()), t = v3(toRender(...pose.lookAt)).sub(h).normalize();
    const look = new THREE.Quaternion().setFromUnitVectors(F, t); look.slerp(new THREE.Quaternion(), 0.25);
    setWorldQuat(rig.head, look.multiply(yawFrame).multiply(rig.rest.get(rig.head)));
  } else if (rig.head) setWorldQuat(rig.head, yawFrame.clone().multiply(rig.rest.get(rig.head)));
  let miss = 0;
  // limbs: elbows out and down, knees out over the toes
  for (const s of ['l', 'r']) {
    const sd = s === 'l' ? R.clone().negate() : R, [ua, la, ha] = rig.arms[s], [th, ca, fo] = rig.legs[s], H = pose.limbs[s + 'h'], Fo = pose.limbs[s + 'f'];
    const hp = v3(toRender(...H.p)), shoulder = ua.getWorldPosition(new THREE.Vector3());
    const elbowPole = shoulder.clone().addScaledVector(sd, 0.5).addScaledVector(new THREE.Vector3(0, 1, 0), -0.45).addScaledVector(F, -0.25);
    miss = Math.max(miss, solveLimb(ua, la, ha, hp, elbowPole));
    const fp = v3(toRender(...Fo.p)), hip = th.getWorldPosition(new THREE.Vector3());
    const kneeUp = Math.max(0, fp.y - hip.y + 0.5);     // (a foot up near hip height: the knee comes up and out, it doesn't go through what's in front)
    const kneePole = hip.clone().addScaledVector(sd, 0.35).addScaledVector(F, 0.5).addScaledVector(new THREE.Vector3(0, 1, 0), 0.1 + kneeUp * 1.6);
    miss = Math.max(miss, solveLimb(th, ca, fo, fp, kneePole));
    // the hand lies on its hold: fingers over the ledge toward the wall, palm down, thumb in; in the
    // air it opens and leads toward where it's going. The foot's toes point at the wall.
    const wall = H.n ? v3(H.n).negate() : F.clone(), grip = H.grip ?? 0;
    setWorldQuat(ha, yawFrame.clone().multiply(rig.rest.get(ha)));
    if (rig.palm) {
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
