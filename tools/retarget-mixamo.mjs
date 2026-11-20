// Mixamo clips (each a glb of the Mixamo skeleton and one take: Blender's FBX → glb, skeleton only) put onto Aeternum's bodies:
//   node tools/retarget-mixamo.mjs <dir of .glb clips>  →  assets/anims/mixamo.json + mixamo.bin
// Two bakes of every clip:
//  - the ADVENTURER skeleton (assets/adventurer_kit.glb): a quaternion track for each bone Mixamo has, in that body's own bone frames,
//    and the pelvis's travel. Retargeted by world rotation: each bone turns in the world as its Mixamo bone turns from Mixamo's rest
//    pose, after the two rest poses are lined up bone by bone (Mixamo stands in a T, this body doesn't).
//  - the people's capsule rig (player/avatar.js buildRig): hips, torso and the eight limb segments, for render/crowd.js and render/infantry.js.
// Locomotion loops are made in place (their speed measured from the travel); a strafe is mirrored for the other side.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import * as THREE from '../vendor/three/build/three.module.js';

const SRC = process.argv[2]; if (!SRC) { console.error('usage: node tools/retarget-mixamo.mjs <dir of mixamo .glb>'); process.exit(1); }
const ROOT = new URL('..', import.meta.url).pathname;

// what each take is called in the game, and how it plays
const CLIPS = {
  'Backwards Rifle Walk': { id: 'rifle_back', loop: true, inPlace: true }, 'Bayonet Stab': { id: 'bayonet' }, 'Death From Back Headshot': { id: 'death_back', hold: true },
  'Death From The Front': { id: 'death_front', hold: true }, 'Dying': { id: 'dying', hold: true }, 'Fall A Land To Standing Idle 01': { id: 'land_hard' },
  'Firing Rifle': { id: 'rifle_fire', loop: true }, 'Fist Fight A': { id: 'fight_a', loop: true }, 'Fist Fight B': { id: 'fight_b', loop: true },
  'Getting Up': { id: 'get_up' }, 'Grab Rifle And Put Back': { id: 'rifle_draw' }, 'Hit Reaction': { id: 'hit_a' }, 'Hit Reaction-2': { id: 'hit_b' },
  'Hook Punch': { id: 'hook' }, 'Jumping Down': { id: 'jump_down' }, 'Prone Firing Rifle': { id: 'prone_fire', loop: true, prone: true }, 'Rifle Aiming Idle': { id: 'rifle_aim', loop: true },
  'Sitting Dazed': { id: 'dazed', loop: true, hold: true }, 'Sprint Forward': { id: 'sprint', loop: true, inPlace: true }, 'Stable Sword Inward Slash': { id: 'slash' },
  'Strafe': { id: 'strafe', loop: true, inPlace: true, mirror: true }, 'Taking Punch': { id: 'punched' }, 'Throw Grenade': { id: 'grenade' },
  'Grenade Throw': { id: 'nade_stand' }, 'Throw Grenade-2': { id: 'nade_crouch' },
};
// Mixamo → this body
const MAP = { Hips: 'pelvis', Spine: 'spine_01', Spine1: 'spine_02', Spine2: 'spine_03', Neck: 'neck_01', Head: 'head' };
for (const [S, s] of [['Left', 'l'], ['Right', 'r']]) {
  Object.assign(MAP, { [S + 'Shoulder']: 'clavicle_' + s, [S + 'Arm']: 'upperarm_' + s, [S + 'ForeArm']: 'lowerarm_' + s, [S + 'Hand']: 'hand_' + s,
    [S + 'UpLeg']: 'thigh_' + s, [S + 'Leg']: 'calf_' + s, [S + 'Foot']: 'foot_' + s, [S + 'ToeBase']: 'ball_' + s });
  for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) for (const k of [1, 2, 3]) MAP[`${S}Hand${f}${k}`] = `${f.toLowerCase()}_0${k}_${s}`;
}
// the bone each one points at (its direction, to line the rest poses up by)
const AIM = { pelvis: 'spine_01', spine_01: 'spine_02', spine_02: 'spine_03', spine_03: 'neck_01', neck_01: 'head' };
for (const s of ['l', 'r']) { Object.assign(AIM, { ['clavicle_' + s]: 'upperarm_' + s, ['upperarm_' + s]: 'lowerarm_' + s, ['lowerarm_' + s]: 'hand_' + s, ['hand_' + s]: 'middle_01_' + s, ['thigh_' + s]: 'calf_' + s, ['calf_' + s]: 'foot_' + s, ['foot_' + s]: 'ball_' + s });
  for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) { AIM[`${f}_01_${s}`] = `${f}_02_${s}`; AIM[`${f}_02_${s}`] = `${f}_03_${s}`; } }

// ---- glb reading
function readGlb(path) {
  const b = readFileSync(path), L = b.readUInt32LE(12), J = JSON.parse(b.slice(20, 20 + L).toString()), bin = b.slice(20 + L + 8);
  const acc = i => { const a = J.accessors[i], v = J.bufferViews[a.bufferView], n = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type], off = (v.byteOffset || 0) + (a.byteOffset || 0);
    if (a.componentType !== 5126) throw new Error('float accessors only'); return new Float32Array(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + a.count * n * 4)); };
  return { J, acc };
}
// nodes as three Object3Ds at rest, by name
function buildNodes(J) {
  const objs = J.nodes.map(n => { const o = new THREE.Object3D(); o.name = n.name || ''; if (n.translation) o.position.fromArray(n.translation); if (n.rotation) o.quaternion.fromArray(n.rotation); if (n.scale) o.scale.fromArray(n.scale); return o; });
  J.nodes.forEach((n, i) => (n.children || []).forEach(c => objs[i].add(objs[c])));
  const scene = new THREE.Object3D(); for (const i of J.scenes[J.scene || 0].nodes) scene.add(objs[i]);
  scene.updateMatrixWorld(true); const by = {}; for (const o of objs) by[o.name] = o; return { scene, objs, by };
}
const wq = o => o.getWorldQuaternion(new THREE.Quaternion()), wp = o => o.getWorldPosition(new THREE.Vector3());

// ---- the body
const T = buildNodes(readGlb(join(ROOT, 'assets/adventurer_kit.glb')).J);
const TB = T.by, tRestQ = {}, tRestP = {}; for (const n of Object.values(MAP)) { if (!TB[n]) throw new Error('body has no ' + n); tRestQ[n] = wq(TB[n]); tRestP[n] = wp(TB[n]); }
const tHip = tRestP.pelvis.y - Math.min(tRestP.ball_l.y, tRestP.ball_r.y);
const tOrder = []; T.scene.traverse(o => { if (Object.values(MAP).includes(o.name)) tOrder.push(o.name); });      // (parents before children)

// ---- the capsule rig's joints, from the body's pose (world positions/rotations in the body's frame)
const DOWN = new THREE.Vector3(0, -1, 0);
function crowdPose(W, hipK) {      // W: name → { q, p } world; → 43 numbers
  const hipsQ = W.pelvis.q.clone().multiply(tRestQ.pelvis.clone().invert()), torsoW = W.spine_03.q.clone().multiply(tRestQ.spine_03.clone().invert());
  const torsoL = hipsQ.clone().invert().multiply(torsoW), out = [W.pelvis.p.x * hipK, W.pelvis.p.y * hipK, W.pelvis.p.z * hipK, ...hipsQ.toArray(), ...torsoL.toArray()];
  for (const [a, b, c, par] of [['thigh_l', 'calf_l', 'foot_l', hipsQ], ['thigh_r', 'calf_r', 'foot_r', hipsQ], ['upperarm_l', 'lowerarm_l', 'hand_l', torsoW], ['upperarm_r', 'lowerarm_r', 'hand_r', torsoW]]) {
    const up = new THREE.Quaternion().setFromUnitVectors(DOWN, W[b].p.clone().sub(W[a].p).normalize()), lo = new THREE.Quaternion().setFromUnitVectors(DOWN, W[c].p.clone().sub(W[b].p).normalize());
    const upL = par.clone().invert().multiply(up), loL = up.clone().invert().multiply(lo); out.push(...upL.toArray(), ...loL.toArray()); }
  return out;
}

// ---- each clip
const files = readdirSync(SRC).filter(f => f.endsWith('.glb')), meta = [], chunks = []; let off = 0;
const push = (arr, Type) => { const a = new Type(arr); const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(new Uint8Array(pad)); off += pad; } const at = off; chunks.push(new Uint8Array(a.buffer)); off += a.byteLength; return at; };
for (const f of files) {
  const name = basename(f, '.glb'), C = CLIPS[name]; if (!C) { console.log('  (skipped, not known:', name + ')'); continue; }
  const { J, acc } = readGlb(join(SRC, f)), S = buildNodes(J), SB = {}; for (const k of Object.keys(MAP)) SB[k] = S.by['mixamorig:' + k];
  const A = J.animations[0], tracks = new Map();
  for (const ch of A.channels) { const node = S.objs[ch.target.node], smp = A.samplers[ch.sampler]; tracks.set(node.name + '.' + ch.target.path, { t: acc(smp.input), v: acc(smp.output) }); }
  const times = [...tracks.values()].reduce((m, x) => x.t.length > m.length ? x.t : m, new Float32Array(1)), N = times.length, fps = Math.round((N - 1) / (times[N - 1] - times[0])) || 30;
  // a track at time t (Blender leaves a bone that doesn't move with a key or two, not one a frame)
  const at = (tr, t, n, out) => { const T = tr.t; let k = 0; while (k < T.length - 1 && T[k + 1] <= t) k++; const k1 = Math.min(T.length - 1, k + 1), u = k1 === k ? 0 : Math.max(0, Math.min(1, (t - T[k]) / (T[k1] - T[k])));
    if (n === 4) { const a = new THREE.Quaternion().fromArray(tr.v, k * 4), b = new THREE.Quaternion().fromArray(tr.v, k1 * 4); out.copy(a.slerp(b, u)); } else out.fromArray(tr.v, k * 3).lerp(new THREE.Vector3().fromArray(tr.v, k1 * 3), u); };
  const sRest = {}; for (const [k, o] of Object.entries(SB)) sRest[k] = { q: wq(o), p: wp(o) };
  const sHip = sRest.Hips.p.y - Math.min(sRest.LeftToeBase.p.y, sRest.RightToeBase.p.y), hipK = tHip / sHip;
  // the source, frame by frame, in world
  const sFrames = [];
  for (let i = 0; i < N; i++) {
    for (const o of S.objs) { const r = tracks.get(o.name + '.rotation'), p = tracks.get(o.name + '.translation'); if (r) at(r, times[i], 4, o.quaternion); if (p) at(p, times[i], 3, o.position); }
    S.scene.updateMatrixWorld(true); const F = {}; for (const [k, o] of Object.entries(SB)) F[k] = { q: wq(o), p: wp(o) }; sFrames.push(F);
  }
  for (const side of C.mirror ? ['', '_m'] : ['']) {
    // mirrored: across the body's middle (x → −x), left and right swapped
    const mq = q => new THREE.Quaternion(q.x, -q.y, -q.z, q.w), mp = p => new THREE.Vector3(-p.x, p.y, p.z), sw = k => k.replace(/^Left/, '\0').replace(/^Right/, 'Left').replace('\0', 'Right');
    const flip = F => { const G = {}; for (const k of Object.keys(F)) G[sw(k)] = { q: mq(F[k].q), p: mp(F[k].p) }; return G; };
    const rest = side ? flip(sRest) : sRest, frames = side ? sFrames.map(flip) : sFrames;
    // the rest poses lined up: each body bone turned so it points where its Mixamo bone points at rest
    const align = {}; for (const [sk, tk] of Object.entries(MAP)) { const tc = AIM[tk], sc = Object.keys(MAP).find(k => MAP[k] === tc);
      if (tc && sc) { const dT = tRestP[tc].clone().sub(tRestP[tk]).normalize(), dS = rest[sc].p.clone().sub(rest[sk].p).normalize(); align[tk] = new THREE.Quaternion().setFromUnitVectors(dT, dS); } }
    for (const tk of Object.values(MAP)) if (!align[tk]) { const par = TB[tk].parent?.name; align[tk] = align[par]?.clone() || new THREE.Quaternion(); }
    // travel: in place for the locomotion loops (their speed kept), else from where it starts
    const h0 = frames[0].Hips.p, hN = frames[N - 1].Hips.p, drift = new THREE.Vector3(hN.x - h0.x, 0, hN.z - h0.z), dur = (N - 1) / fps;
    const qs = [], ps = [], crowd = [];
    for (let i = 0; i < N; i++) {
      const F = frames[i], W = {};
      for (const [sk, tk] of Object.entries(MAP)) { const D = F[sk].q.clone().multiply(rest[sk].q.clone().invert()); W[tk] = { q: D.multiply(align[tk]).multiply(tRestQ[tk]) }; }
      // the hips: travel scaled to this body's legs
      const hp = F.Hips.p.clone().sub(rest.Hips.p); if (C.inPlace) { hp.x -= drift.x * i / (N - 1); hp.z -= drift.z * i / (N - 1); hp.x -= h0.x - rest.Hips.p.x; hp.z -= h0.z - rest.Hips.p.z; } else { hp.x -= h0.x - rest.Hips.p.x; hp.z -= h0.z - rest.Hips.p.z; }
      const pelP = tRestP.pelvis.clone().addScaledVector(hp, hipK);
      // local rotations, down the body's own hierarchy (a bone Mixamo doesn't have stays at rest)
      const worldQ = {}, worldP = {};
      T.scene.traverse(o => { if (o === T.scene) return; const par = o.parent, pq = par === T.scene ? new THREE.Quaternion() : worldQ[par.name] || wq(par);
        const pp = par === T.scene ? new THREE.Vector3() : worldP[par.name] || wp(par);
        let q = W[o.name]?.q || pq.clone().multiply(o.quaternion); let p = o.name === 'pelvis' ? pelP : o.position.clone().multiply(par === T.scene ? new THREE.Vector3(1, 1, 1) : par.getWorldScale(new THREE.Vector3())).applyQuaternion(pq).add(pp);
        worldQ[o.name] = q; worldP[o.name] = p; });
      for (const tk of tOrder) { const par = TB[tk].parent, pq = worldQ[par.name] || wq(par), lq = pq.clone().invert().multiply(worldQ[tk]); qs.push(...lq.toArray()); }
      { const par = TB.pelvis.parent, pq = worldQ[par.name] || wq(par), pp = worldP[par.name] || wp(par), ps0 = par.getWorldScale(new THREE.Vector3()); const lp = pelP.clone().sub(pp).applyQuaternion(pq.clone().invert()).divide(ps0); ps.push(lp.x, lp.y, lp.z); }
      const CW = {}; for (const k of Object.keys(worldQ)) CW[k] = { q: worldQ[k], p: worldP[k] }; crowd.push(...crowdPose(CW, 0.95 / tRestP.pelvis.y));
    }
    // the body's quaternions as int16 (a 30 fps take of 52 bones is small enough so)
    const q16 = qs.map(v => Math.max(-32767, Math.min(32767, Math.round(v * 32767))));
    const id = C.id + (C.mirror ? (side ? '_r' : '_l') : '');
    meta.push({ id, src: name, fps, frames: N, dur: +dur.toFixed(3), loop: !!C.loop, hold: !!C.hold, speed: +(drift.length() * hipK / dur).toFixed(3), dir: +Math.atan2(drift.x, drift.z).toFixed(3),      // (the way it travels, + toward the body's left (+x); a mirror's drift is already mirrored)
     
      q: push(q16, Int16Array), p: push(ps, Float32Array), crowd: push(crowd, Float32Array) });
    console.log(`  ${id.padEnd(14)} ${N} frames ${dur.toFixed(2)} s, travel ${(drift.length() * hipK).toFixed(2)} m ${C.inPlace ? '(in place)' : ''}`);
  }
}
mkdirSync(join(ROOT, 'assets/anims'), { recursive: true });
const all = new Uint8Array(off); let o2 = 0; for (const c of chunks) { all.set(c, o2); o2 += c.byteLength; }
writeFileSync(join(ROOT, 'assets/anims/mixamo.bin'), all);
writeFileSync(join(ROOT, 'assets/anims/mixamo.json'), JSON.stringify({ bones: tOrder, crowd: 43, clips: meta }));
console.log(`assets/anims/mixamo.{json,bin}: ${meta.length} clips, ${(off / 1e6).toFixed(2)} MB, ${tOrder.length} bones`);
