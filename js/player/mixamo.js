// The recorded clips (Mixamo takes, put onto these bodies by tools/retarget-mixamo.mjs): assets/anims/mixamo.{json,bin}.
//  - for the ADVENTURER body: THREE.AnimationClips, one quaternion track per bone and the pelvis's travel (clipFor)
//  - for the people's capsule rig (player/avatar.js buildRig): the hips, torso and limb joints at any moment (poseCrowd)
import * as THREE from 'three';

let loading = null;
export function loadMixamo(base = './assets/anims/mixamo') {
  return loading ||= (async () => {
    const [meta, bin] = await Promise.all([fetch(base + '.json').then(r => r.json()), fetch(base + '.bin').then(r => r.arrayBuffer())]);
    const by = new Map();
    for (const c of meta.clips) by.set(c.id, { ...c, Q: new Int16Array(bin, c.q, c.frames * meta.bones.length * 4), P: new Float32Array(bin, c.p, c.frames * 3), C: new Float32Array(bin, c.crowd, c.frames * meta.crowd) });
    return lib = { bones: meta.bones, by, ids: [...by.keys()] };
  })();
}
export let lib = null;

// a clip for the body (its bones named as in assets/adventurer_kit.glb)
export function clipFor(id) {
  const c = lib?.by.get(id); if (!c) return null; if (c.clip) return c.clip;
  const nb = lib.bones.length, times = new Float32Array(c.frames); for (let i = 0; i < c.frames; i++) times[i] = i / c.fps;
  const tracks = lib.bones.map((b, j) => { const v = new Float32Array(c.frames * 4); for (let i = 0; i < c.frames; i++) for (let k = 0; k < 4; k++) v[i * 4 + k] = c.Q[(i * nb + j) * 4 + k] / 32767; return new THREE.QuaternionKeyframeTrack(b + '.quaternion', times, v); });
  tracks.push(new THREE.VectorKeyframeTrack('pelvis.position', times, c.P));
  return c.clip = new THREE.AnimationClip(id, c.dur, tracks);
}
export const infoOf = id => lib?.by.get(id) || null;

// the capsule rig put in clip `id` at time t (s; looped or held at the end as the clip plays); w: how much of it over the pose it has (0..1)
const _a = new THREE.Quaternion(), _b = new THREE.Quaternion(), _v = new THREE.Vector3();
export function poseCrowd(rig, id, t, w = 1) {
  const c = lib?.by.get(id); if (!c) return false; const n = 43, F = c.frames;
  let f = t * c.fps; f = c.loop ? ((f % (F - 1)) + (F - 1)) % (F - 1) : Math.max(0, Math.min(F - 1, f)); const i = Math.min(F - 2, Math.floor(f)), u = f - i, A = c.C, o0 = i * n, o1 = (i + 1) * n;
  const q = (k, out) => { _a.fromArray(A, o0 + k); _b.fromArray(A, o1 + k); _a.slerp(_b, u); if (w < 1) out.slerp(_a, w); else out.copy(_a); };
  _v.set(A[o0] + (A[o1] - A[o0]) * u, A[o0 + 1] + (A[o1 + 1] - A[o0 + 1]) * u, A[o0 + 2] + (A[o1 + 2] - A[o0 + 2]) * u); rig.hips.position.lerp(_v, w);
  q(3, rig.hips.quaternion); q(7, rig.torso.quaternion);
  const L = [rig.legL.upper, rig.legL.lower, rig.legR.upper, rig.legR.lower, rig.armL.upper, rig.armL.lower, rig.armR.upper, rig.armR.lower];
  L.forEach((o, k) => q(11 + k * 4, o.quaternion));
  return true;
}
