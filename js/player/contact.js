// The take as a guide, the world as the limit. A recorded clip (a death, a fall, a flinch, a get-up) says where each joint
// wants to be; this pass, run after it, moves each joint there, root outwards, unless that would put some part of the body
// into the ground or a wall. Then the joint stops where it got to (last frame's, or as far towards the clip's as is free)
// and holds there until the clip turns it somewhere free again; it goes on towards the clip from where it stopped, not in a
// jump. A part that's in anyway (the ground rose under it: a slope, a kerb) is turned out of it. And the trunk is lifted out
// of the ground as a whole, so a body that falls on rising ground lies on it rather than in it.
//
// Generic over a bone tree: `joints` (root outwards) are { bone, tips: [{ at: Object3D, off?: Vector3, r }] }, the points
// each joint's turn carries (the tips of the limb below it), each a ball of radius r; `trunk` the tips the body is lifted by,
// `lift` the Object3D that's moved up to lift it. query: { floor(x, y, z) → ground height under (x, z) near y; solid(x, y, z) →
// bool, walls and the like (not the ground) } in the bones' world space (+y up).
import * as THREE from 'three';

const _w = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), _t = new THREE.Quaternion();
const GRID = 0.35, SLACK = 0.008, RESUME = 9;      // (m between the ground's samples; m a part may sink before it counts; rad/s a stopped joint goes on at)

export function makeContact(spec) {
  const held = new Map(), stopped = new Set(); let ground = new Map(), Q = null;
  // the ground under (x, z), from the corners of the cell it's in (each asked once a frame), so a slope reads as a slope
  const corner = (i, j, y) => { const k = (i * 73856 + j) * 64 + y; let h = ground.get(k); if (h === undefined) { h = Q.floor(i * GRID, y / 4, j * GRID); ground.set(k, h); } return h; };
  // (asked from the part's own height, a quarter metre at a time: a table top over a lying body isn't its ground, the floor under it is)
  const floorAt = (x, Y, z) => { const y = Math.round(Y * 4), fx = x / GRID, fz = z / GRID, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    return (corner(i, j, y) * (1 - u) + corner(i + 1, j, y) * u) * (1 - v) + (corner(i, j + 1, y) * (1 - u) + corner(i + 1, j + 1, y) * u) * v; };
  // how far the deepest of these tips is into the ground (≤ 0: none is); Infinity if one's in a wall
  const depth = (tips, walls = true) => { let d = -Infinity;
    for (const T of tips) { T.at.localToWorld(_w.copy(T.off || ZERO)); const e = floorAt(_w.x, _w.y - 0.2, _w.z) + T.r - _w.y; if (e > d) { d = e; deep = T; deepAt.copy(_w); }      // (groundAt counts what's built up to half a metre over where it's asked from; the land always)
      if (walls && Q.solid && Q.solid(_w.x, _w.y, _w.z)) return Infinity; }
    return d; };
  let deep = null; const deepAt = new THREE.Vector3();
  const set = (B, q) => { B.quaternion.copy(q); B.updateMatrixWorld(true); };
  return {
    // off: forget where everything stopped (the next take starts from its own pose)
    reset() { held.clear(); stopped.clear(); },
    // run after the clip's pose is on the bones; ref: the height the ground's asked about from (the body's feet)
    apply(query, dt, ref) {
      Q = query; ground = new Map();
      spec.lift.updateMatrixWorld(true);
      // the trunk out of the ground, all of it at once
      { const d = depth(spec.trunk, false); if (d > SLACK && d < 3) { const P = spec.lift, par = P.parent;
        par.updateMatrixWorld(true); P.getWorldPosition(_a); _b.copy(_a); _b.y += d; par.worldToLocal(_a); par.worldToLocal(_b); P.position.add(_b.sub(_a)); P.updateMatrixWorld(true); } }
      for (const J of spec.joints) {
        const B = J.bone, want = _t.copy(B.quaternion), was = held.get(B);
        // a joint that stopped goes on towards the clip from where it stopped, at a limb's pace
        const go = was && stopped.has(B) ? was.clone().rotateTowards(want, RESUME * dt) : want.clone();
        set(B, go); let d = depth(J.tips);
        if (d > SLACK && was) {      // in the way: as far towards it from where it was as is free, or where it was
          let ok = false;
          for (const f of [0.66, 0.33, 0]) { set(B, _q.copy(was).slerp(go, f)); d = depth(J.tips); if (d <= SLACK) { ok = true; break; } }
          if (!ok) set(B, was);
        }
        d = depth(J.tips, false);
        if (d > SLACK && d < 2 && deep) {      // in the ground anyway: turned about the joint till the deepest part's on it
          B.getWorldPosition(_a); const from = _b.copy(deepAt).sub(_a), to = deepAt.clone().setY(deepAt.y + d).sub(_a);
          if (from.lengthSq() > 1e-4) { _p.setFromUnitVectors(from.normalize(), to.normalize()); B.parent.getWorldQuaternion(_q); const wq = B.getWorldQuaternion(new THREE.Quaternion());
            set(B, _q.clone().invert().multiply(_p.multiply(wq))); }
        }
        const moved = B.quaternion.angleTo(want) > 1e-3; if (moved) stopped.add(B); else stopped.delete(B);
        held.set(B, (was || new THREE.Quaternion()).copy(B.quaternion));
      }
    },
  };
}
const ZERO = new THREE.Vector3();

// The ADVENTURER skeleton's joints and the parts each one carries
export function adventurerContact(by) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z), tip = (n, r, off) => by[n] ? { at: by[n], r, off } : null, T = a => a.filter(Boolean);
  const head = tip('head', 0.1, V(0, 0.09, 0.02)), eyes = [tip('eye_l', 0.05), tip('eye_r', 0.05)], joints = [];      // (the eyes: the face, which a body falling forward lands on)
  for (const [n, tips] of [['spine_01', [tip('spine_03', 0.13), head, ...eyes]], ['spine_02', [tip('spine_03', 0.13), head, ...eyes]], ['spine_03', [tip('neck_01', 0.07), head, ...eyes]], ['neck_01', [head, ...eyes]]]) if (by[n]) joints.push({ bone: by[n], tips: T(tips) });
  for (const s of ['l', 'r']) {
    for (const [n, tips] of [[`upperarm_${s}`, [tip(`lowerarm_${s}`, 0.045), tip(`hand_${s}`, 0.04), tip(`middle_03_${s}`, 0.015)]], [`lowerarm_${s}`, [tip(`hand_${s}`, 0.04), tip(`middle_03_${s}`, 0.015)]], [`hand_${s}`, [tip(`middle_03_${s}`, 0.015)]],
      [`thigh_${s}`, [tip(`calf_${s}`, 0.055), tip(`foot_${s}`, 0.045), tip(`ball_${s}`, 0.02)]], [`calf_${s}`, [tip(`foot_${s}`, 0.045), tip(`ball_${s}`, 0.02)]], [`foot_${s}`, [tip(`ball_${s}`, 0.02)]]]) if (by[n]) joints.push({ bone: by[n], tips: T(tips) });
  }
  return makeContact({ lift: by.pelvis, trunk: T([tip('pelvis', 0.1), tip('spine_02', 0.12), tip('spine_03', 0.13), head, ...eyes]), joints });
}
