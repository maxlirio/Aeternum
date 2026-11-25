// You, as the ADVENTURER body (assets/adventurer.glb, packed from ~/Developer/ADVENTURER by tools/pack-adventurer.mjs):
// the same interface as the placeholder (player/avatar.js createPlaceholderAvatar), so the game swaps one for the other
// once it has loaded. Walking and running are the body's own recorded clips, blended by speed and kept in step with
// it; sitting, lying and swimming are put on the skeleton directly; on a wall every joint comes from the climber
// (player/limbik.js) and the hands from what they're holding (player/grasp.js, player/handhold.js).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { captureRest, applyClimbPose, solveLimb } from './limbik.js';
import { captureHand } from './grasp.js';
import { armObject } from '../render/weapons.js';
import { WEAPONS } from '../sim/processes/combat.js';
import { loadMixamo, clipFor, infoOf } from './mixamo.js';
import { adventurerContact } from './contact.js';

const GAITS = [['idle', 0], ['walk', 1.45], ['jog', 3.4], ['sprint', 7.05, 6.4]];      // (m/s each clip covers: measured from the feet at load, these if it can't be; and the speed it's the whole of the gait at, if not that: the recorded sprint is your run)
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _p = new THREE.Quaternion();
function setWorldQuat(b, q) { b.parent.getWorldQuaternion(_p).invert(); b.quaternion.copy(_p).multiply(q); b.updateMatrixWorld(true); }
function aim(bone, child, dir) { bone.getWorldPosition(_v); const c = child.getWorldPosition(new THREE.Vector3()).sub(_v).normalize(); _q.setFromUnitVectors(c, dir); bone.getWorldQuaternion(_p); setWorldQuat(bone, _q.multiply(_p).clone()); }

export async function loadAdventurer(url = './assets/adventurer.glb') {
  const [g] = await Promise.all([new GLTFLoader().loadAsync(url), loadMixamo().catch(e => console.warn('recorded clips', e))]), root = g.scene, by = {};
  for (const id of ['sprint', 'rifle_back', 'strafe_l', 'strafe_r', 'rifle_aim', 'rifle_fire', 'rifle_draw', 'bayonet', 'slash', 'hook', 'grenade', 'hit_a', 'hit_b', 'punched', 'land_hard', 'jump_down', 'get_up', 'dazed', 'death_front', 'death_back', 'dying', 'prone_fire', 'fight_a', 'fight_b', 'nade_stand', 'nade_crouch', 'jump_run', 'jump_up', 'fall']) { const c = clipFor(id); if (c && !g.animations.some(a => a.name === id)) g.animations.push(c); }      // (the recorded takes: player/mixamo.js)
  root.traverse(o => { if (o.name && !by[o.name]) by[o.name] = o; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  root.traverse(o => { if (o.isBone) o.userData.q0 = o.quaternion.clone(); });
  const skinned = []; root.traverse(o => { if (o.isSkinnedMesh) skinned.push(o); });
  const body = skinned.find(m => /body/i.test(m.name)) || skinned[0];
  const fing = (f, s) => ['01', '02', '03'].map(k => by[`${f}_${k}_${s}`]);
  const rig = captureRest({ root, pelvis: by.pelvis, spine: [by.spine_01, by.spine_02, by.spine_03], neck: by.neck_01, head: by.head,
    arms: { l: [by.upperarm_l, by.lowerarm_l, by.hand_l], r: [by.upperarm_r, by.lowerarm_r, by.hand_r] }, legs: { l: [by.thigh_l, by.calf_l, by.foot_l], r: [by.thigh_r, by.calf_r, by.foot_r] },
    toe: { l: by.ball_l, r: by.ball_r } });
  rig.handBones = {}; for (const s of ['l', 'r']) rig.handBones[s] = { hand: by['hand_' + s], index: fing('index', s), middle: fing('middle', s), ring: fing('ring', s), pinky: fing('pinky', s), thumb: fing('thumb', s) };
  const flesh = skinned.filter(m => /body|glove/i.test(m.name)); rig.hands = { l: captureHand(rig, 'l', flesh), r: captureHand(rig, 'r', flesh) };      // (in gloves, the glove is the surface that grips)
  // the clips, and how fast each one walks (the planted foot's travel against the hips, over a cycle)
  const mixer = new THREE.AnimationMixer(root), clip = n => g.animations.find(a => a.name === n), act = {};
  for (const a of g.animations) { act[a.name] = mixer.clipAction(a); }
  const speedOf = name => { const c = clip(name); if (!c) return 0; const A = mixer.clipAction(c); A.play(); A.weight = 1; let lo = Infinity, hi = -Infinity; for (let i = 0; i <= 24; i++) { mixer.setTime(c.duration * i / 24); root.updateMatrixWorld(true); const z = by.ball_l.getWorldPosition(_v).z - by.pelvis.getWorldPosition(new THREE.Vector3()).z; lo = Math.min(lo, z); hi = Math.max(hi, z); } A.stop(); return (hi - lo) / (c.duration / 2); };
  const gaits = GAITS.map(([n, v, at]) => { const m = n === 'idle' ? 0 : speedOf(n), V = m > 0.5 && m < 12 ? m : v; return { n, v: V, at: at ?? V, a: act[n] }; }).filter(x => x.a);
  for (const b of Object.values(by)) if (b.isBone) b.quaternion.copy(b.userData.q0);
  // the idle pose's joints, each against its parent: what the climber keeps the torso, neck, head and collarbones at, so the body is the same shape on a wall as standing
  if (act.idle) { const A = act.idle; A.play(); A.weight = 1; mixer.setTime(0); root.updateMatrixWorld(true); for (const b of Object.values(by)) if (b.isBone) b.userData.qi = b.quaternion.clone(); A.stop(); for (const b of Object.values(by)) if (b.isBone) b.quaternion.copy(b.userData.q0); }
  rig.clavicles = { l: by.clavicle_l, r: by.clavicle_r };
  for (const G of gaits) { G.a.play(); G.a.weight = 0; G.a.enabled = true; }
  const mats = []; root.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) { if (!mats.includes(m)) { m.userData.t0 = m.transparent; m.userData.d0 = m.depthWrite; mats.push(m); } } });
  let opacity = 1, onWall = false, phase = 0, oneShot = null, heldId = null, aimIdle = null, gunUp = 0, gunPitch = 0, ranged = false, crouchK = 0, moveAng = 0, guard = false, long = false, prone = false, proneFire = 0, firing = 0, side = 0;
  // The recorded takes (player/mixamo.js) played over the body: a stretch of one (from..to s, at a rate), the whole body or the upper half, weighted, eased in and out;
  // held on its last frame (a death), or let go. still: the hips kept over the feet (a stumble or a landing mustn't carry the body off from where you are).
  const takes = [], AIR = /^(jump_|fall$)/; let jumping = false;
  const play = (id, o = {}) => { const c = clip(id); if (!c) return null; let A = o.upper ? (upperActs[id] ||= upperOf(id)) : act[id]; if (!A) return null;
    if (!o.upper && takes.some(T => T.A === A)) { const alt = altActs[id] ||= [mixer.clipAction(c.clone())]; A = alt.find(a => !takes.some(T => T.A === a)) || (alt.push(mixer.clipAction(c.clone())), alt.at(-1)); }      // (the same take again while the last is still easing out — a jump's landing after its flight: a second copy of it, so each eases on its own)
    for (const T of takes) if (T.A === A || T.id === id || (!o.upper && !T.upper && !T.hold)) T.out = true;
    const T = { id, A, from: o.from || 0, t: o.from || 0, to: o.to ?? c.duration, rate: o.rate || 1, w: o.w ?? 1, k: 0, upper: !!o.upper, hold: !!o.hold, still: !!o.still, loop: !!o.loop, flat: !!o.flat, fast: !!o.fast, out: false, done: o.done || null };
    A.play(); A.enabled = true; A.timeScale = 0; A.weight = 0; takes.push(T); return T; };
  const upperActs = {}, altActs = {};
  const fullK = () => takes.reduce((m, T) => T.upper ? m : Math.max(m, T.k * T.w), 0);
  function stepTakes(dt) {
    for (const T of takes) { if (!T.out) { T.t += dt * T.rate; if (T.t >= T.to) { if (T.loop) T.t = T.t - T.to + (T.from || 0); else if (T.hold) T.t = T.to - 1e-3; else { T.t = T.to - 1e-3; T.out = true; T.done?.(); } } }
      T.k = Math.max(0, Math.min(1, T.k + (T.out ? -1 : 1) * dt * (T.fast ? 16 : T.hold && !T.loop ? 4 : 7))); T.A.time = T.t; T.A.weight = T.k * T.w * (T.upper ? 4 : 1); }
    for (let i = takes.length - 1; i >= 0; i--) if (takes[i].out && takes[i].k <= 0) { takes[i].A.weight = 0; takes[i].A.stop(); takes.splice(i, 1); } }
  const stillHips = () => { const k = takes.reduce((m, T) => T.still ? Math.max(m, T.k) : m, 0); if (k <= 0 || !pelvis0) return; const P = by.pelvis.position, up = upAxis;
    for (const a of ['x', 'y', 'z']) if (a !== up) P[a] += (pelvis0[a] - P[a]) * k;
    for (const T of takes) if (T.flat) P[up] += (pelvis0[up] - P[up]) * T.k * T.w; };      // (flat: the hips at standing height, the clip's own rise and fall left out: a jump that was recorded off a ledge, flown here by the jump you made)
  const pelvis0 = by.pelvis?.position.clone(), upAxis = pelvis0 ? ['x', 'y', 'z'].reduce((m, a) => Math.abs(pelvis0[a]) > Math.abs(pelvis0[m]) ? a : m, 'x') : 'y';      // (the pelvis's height is along whichever of its axes it stands furthest out on)
  // the gun up to the eye: the aiming clips' upper body only (spine, arms, head), laid over whatever the legs are doing, turned up or down
  // with where you look. (Weighted well over the gait's 1 so the arms hold the gun, not swing.)
  const UPPER = /^(spine|neck|head|jaw|eye|clavicle|upperarm|lowerarm|hand|index|middle|ring|pinky|thumb|socket_(hand|forearm|shoulder|chest|head))/;
  const upperOf = n => { const c = clip(n); if (!c) return null; const A = mixer.clipAction(new THREE.AnimationClip(n + '_upper', c.duration, c.tracks.filter(t => UPPER.test(t.name.split('.')[0])))); A.play(); A.weight = 0; return A; };
  const aimA = { mid: upperOf('pistol_aim'), up: upperOf('pistol_aim_up'), down: upperOf('pistol_aim_down') };
  const socket = by.socket_hand_r || by.hand_r, held = new THREE.Group(); socket.add(held);
  const dirGaits = { back: act.rifle_back, l: act.strafe_l, r: act.strafe_r }; for (const A of Object.values(dirGaits)) if (A) { A.play(); A.weight = 0; A.timeScale = 0; }
  let dirPh = 0, guardUp = null; setTimeout(() => { guardUp = upperOf('strafe_l'); if (guardUp) guardUp.timeScale = 0; }, 0);
  const setGait = (speed, dt) => {      // the two clips either side of this speed, in step with it; going backwards with a long gun, or sideways with your fists up, their own clips
    const back = (long || guard) && speed > 0.35 && Math.cos(moveAng) < -0.55 ? 1 : 0, sideways = guard && !ranged && speed > 0.35 && Math.abs(Math.sin(moveAng)) > 0.75 ? (Math.sin(moveAng) > 0 ? 'l' : 'r') : null;
    const D = back ? dirGaits.back : sideways ? dirGaits[sideways] : null;
    for (const [k, A] of Object.entries(dirGaits)) if (A) { const w = A === D ? 1 : 0; A.weight += (w - A.weight) * Math.min(1, dt * 10); }
    // backing off with your fists up: the walk back's legs, the boxer's guard above them
    if (guardUp) { guardUp.time = 0.3; guardUp.weight += ((back && guard ? 4 : 0) - guardUp.weight) * Math.min(1, dt * 10); }
    if (D) { const I = infoOf(back ? 'rifle_back' : 'strafe_' + sideways); dirPh = (dirPh + dt * speed / Math.max(0.5, I?.speed || 1) / D.getClip().duration) % 1; D.time = dirPh * D.getClip().duration; for (const G of gaits) G.a.weight += (0 - G.a.weight) * Math.min(1, dt * 10); return; }
    let i = 0; while (i < gaits.length - 2 && speed > gaits[i + 1].at) i++;
    const A = gaits[i], B = gaits[i + 1], f = B ? THREE.MathUtils.clamp((speed - A.at) / (B.at - A.at), 0, 1) : 0;
    for (const G of gaits) { const w = G === A ? 1 - f : G === B ? f : 0; G.a.weight += (w - G.a.weight) * Math.min(1, dt * 10); }
    const cyc = B && B.n !== 'idle' ? (A.n === 'idle' ? B : (f > 0.5 ? B : A)) : null;
    if (cyc && speed > 0.05) { const rate = speed / cyc.v; phase = (phase + dt * rate / cyc.a.getClip().duration) % 1; for (const G of gaits) if (G.n !== 'idle') { G.a.time = phase * G.a.getClip().duration; G.a.timeScale = 0; } }
  };
  // A long gun in the shoulder: the butt in the pocket inside the right shoulder, the bore along the line you're looking down,
  // a hand's width under the eye; the right hand on the grip with its elbow out and down, the left under the handguard with
  // its elbow under the gun. (How it's done by real riflemen: stock in the pocket, cheek on the stock, support elbow down.)
  const UP = new THREE.Vector3(0, 1, 0), wq = new THREE.Quaternion(), wq2 = new THREE.Quaternion();
  const setWorldQuat = (b, q) => { b.parent.getWorldQuaternion(wq2).invert(); b.quaternion.copy(wq2.multiply(q)); b.updateMatrixWorld(true); };
  function shoulderGun(k) {
    const gun = held.children[0], meta = gun?.userData.meta; if (!meta?.two || !by.upperarm_r) return;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(root.getWorldQuaternion(wq)); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, UP).normalize(), pitch = gunPitch * 0.85;
    const D = fwd.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(UP, -Math.sin(pitch)).normalize();
    const sh = by.upperarm_r.getWorldPosition(new THREE.Vector3()), shL = by.upperarm_l.getWorldPosition(new THREE.Vector3());
    // the butt in the pocket between the shoulder joint and the collarbone, the shoulder hitched up a little to meet it; the bore through it
    const pocket = sh.clone().addScaledVector(right, -0.075).addScaledVector(fwd, 0.08).addScaledVector(UP, 0.05);
    if (gun.userData.butt == null) { const b = new THREE.Box3(); gun.traverse(o => { if (o.isMesh) { o.geometry.computeBoundingBox(); b.union(o.geometry.boundingBox); } }); gun.userData.butt = Math.max(0.12, -b.min.z); }      // (the butt: how far the stock reaches back behind the grip)
    const grip = pocket.clone().addScaledVector(D, gun.userData.butt + 0.01).addScaledVector(UP, -0.06);
    // the gun's frame: +z down the bore, +y up
    const X = new THREE.Vector3().crossVectors(UP, D).normalize(), Y = new THREE.Vector3().crossVectors(D, X), Qg = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, D));
    // the right hand turned so the gun lies that way, then the arm put so the palm's on the grip
    const hand = by.hand_r, hq = hand.getWorldQuaternion(new THREE.Quaternion()), gq = gun.getWorldQuaternion(new THREE.Quaternion()), off = hq.clone().invert().multiply(gq);
    const hq1 = hq.clone().slerp(Qg.clone().multiply(off.clone().invert()), k), hp = hand.getWorldPosition(new THREE.Vector3()), gp = gun.getWorldPosition(new THREE.Vector3());
    const v = gp.sub(hp).applyQuaternion(hq1.clone().multiply(hq.clone().invert())), wrist = hp.clone().lerp(grip.clone().sub(v), k);
    solveLimb(by.upperarm_r, by.lowerarm_r, hand, wrist, sh.clone().addScaledVector(UP, -0.7).addScaledVector(right, 0.55).addScaledVector(fwd, -0.15));
    setWorldQuat(hand, hq1);
    // the left hand under the handguard: palm up against it, the fingers round it from the left and over the top
    if (meta.off && by.upperarm_l && handAxes.l) { root.updateMatrixWorld(true); const o = gun.localToWorld(new THREE.Vector3(...meta.off)), A = handAxes.l;
      const F = right.clone().multiplyScalar(0.55).addScaledVector(D, 0.3).addScaledVector(UP, 0.6).normalize(), N0 = UP.clone().multiplyScalar(0.8).addScaledVector(right, 0.35), N = N0.addScaledVector(F, -N0.dot(F)).normalize();
      const want = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(F, N, new THREE.Vector3().crossVectors(F, N))).multiply(A.frame.clone().invert());
      const hq0 = by.hand_l.getWorldQuaternion(new THREE.Quaternion()), hq = hq0.clone().slerp(want, k);
      // the palm's middle 3 cm under the handguard's middle: the wrist is back from it along the hand
      const palm = A.palm.clone().applyQuaternion(hq), wl = by.hand_l.getWorldPosition(new THREE.Vector3()).lerp(o.addScaledVector(UP, -0.022).addScaledVector(right, -0.012).sub(palm), k);
      solveLimb(by.upperarm_l, by.lowerarm_l, by.hand_l, wl, shL.clone().addScaledVector(UP, -1).addScaledVector(right, 0.1).addScaledVector(fwd, 0.2));
      setWorldQuat(by.hand_l, hq); }
    // the head down and over onto the stock, the right eye behind the sights
    for (const [b, f, r] of [[by.spine_03, 0.08, 0.04], [by.neck_01, 0.3, 0.1], [by.head, 0.22, 0.16]]) if (b) { const q0 = b.getWorldQuaternion(new THREE.Quaternion()), tilt = new THREE.Quaternion().setFromAxisAngle(right, -f * k).multiply(new THREE.Quaternion().setFromAxisAngle(fwd, r * k)); setWorldQuat(b, tilt.multiply(q0)); b.updateMatrixWorld(true); }
  }
  // A long gun carried at your side when it isn't up: the right arm hanging a little out from the leg, the hand round the grip, the
  // gun lying forward and down along the thigh, the stock back past the hip. The hand's grip on the gun is the one it aims with
  // (the gun doesn't move in the hand); the wrist turns to lie it so. shoulderGun takes it from here up to the shoulder.
  function sideCarry() {
    const gun = held.children[0]; if (!gun || !by.upperarm_r) return; root.updateMatrixWorld(true);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(root.getWorldQuaternion(wq)); fwd.y = 0; fwd.normalize(); const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
    const sh = by.upperarm_r.getWorldPosition(new THREE.Vector3()), hand = by.hand_r;
    const off = hand.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(gun.getWorldQuaternion(new THREE.Quaternion()));
    solveLimb(by.upperarm_r, by.lowerarm_r, hand, sh.clone().addScaledVector(UP, -0.56).addScaledVector(right, 0.13).addScaledVector(fwd, 0.07), sh.clone().addScaledVector(UP, -0.3).addScaledVector(fwd, -0.6).addScaledVector(right, 0.2));
    const a = 0.5, D = fwd.clone().multiplyScalar(Math.cos(a)).addScaledVector(UP, -Math.sin(a)).addScaledVector(right, 0.06).normalize();
    const X = new THREE.Vector3().crossVectors(UP, D).normalize(), Y = new THREE.Vector3().crossVectors(D, X), Qg = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, D));
    setWorldQuat(hand, Qg.multiply(off.invert()));
  }
  // Crouched: the hips down and back, the feet where they were (the legs bent to reach them, knees out over the toes), the back
  // bent forward over them, the way a rifleman crouches behind cover or moves low.
  function crouchLegs(k) {
    if (!by.pelvis || !by.thigh_l) return; root.updateMatrixWorld(true);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(root.getWorldQuaternion(wq)); fwd.y = 0; fwd.normalize(); const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
    const feet = ['l', 'r'].map(s => ({ s, p: by['foot_' + s].getWorldPosition(new THREE.Vector3()), q: by['foot_' + s].getWorldQuaternion(new THREE.Quaternion()) }));
    const pw = by.pelvis.getWorldPosition(new THREE.Vector3()).addScaledVector(UP, -0.4 * k).addScaledVector(fwd, -0.1 * k);
    by.pelvis.position.copy(by.pelvis.parent.worldToLocal(pw)); by.pelvis.updateMatrixWorld(true);
    for (const F of feet) { const th = by['thigh_' + F.s], side = F.s === 'l' ? -1 : 1, pole = th.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, 1.2).addScaledVector(right, side * 0.25);
      solveLimb(th, by['calf_' + F.s], by['foot_' + F.s], F.p, pole); setWorldQuat(by['foot_' + F.s], F.q); }
    if (by.spine_01) { const q = by.spine_01.getWorldQuaternion(new THREE.Quaternion()); setWorldQuat(by.spine_01, new THREE.Quaternion().setFromAxisAngle(right, -0.32 * k).multiply(q)); }
    if (by.neck_01) { const q = by.neck_01.getWorldQuaternion(new THREE.Quaternion()); setWorldQuat(by.neck_01, new THREE.Quaternion().setFromAxisAngle(right, 0.22 * k).multiply(q)); }      // (head back up, eyes level)
  }
  const handAxes = {};
  { root.updateMatrixWorld(true); for (const s of ['l', 'r']) { const h = by['hand_' + s], m = by['middle_01_' + s], i = by['index_01_' + s], pk = by['pinky_01_' + s]; if (!h || !m || !i || !pk) continue;
    const hp = h.getWorldPosition(new THREE.Vector3()), hq = h.getWorldQuaternion(new THREE.Quaternion()).invert(), loc = b => b.getWorldPosition(new THREE.Vector3()).sub(hp).applyQuaternion(hq);
    const F = loc(m).normalize(), across = loc(i).sub(loc(pk)).normalize(), N = new THREE.Vector3().crossVectors(across, F).multiplyScalar(s === 'l' ? 1 : -1); N.addScaledVector(F, -N.dot(F)).normalize();
    handAxes[s] = { frame: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(F, N, new THREE.Vector3().crossVectors(F, N))), palm: loc(m).multiplyScalar(0.55).addScaledVector(N, 0.025) }; } }
  const contact = adventurerContact(by); let contactQ = null, airT = 0, lastSpeed = 0;
  const resetBones = () => { for (const b of Object.values(by)) if (b.isBone) b.quaternion.copy(b.userData.q0); if (pelvis0) by.pelvis.position.copy(pelvis0); };
  const api = {
    object: root, rig, isPlaceholder: false,
    // world hooks for the hands: what to probe, and how to get from render space back to the world
    setWorld(probe, fromRender) { rig.probe = probe; rig.fromRender = fromRender; },
    // the ground and the walls, for the takes to stop against (player/contact.js): { floor(x, y, z), solid(x, y, z) } in render space
    setContact(q) { contactQ = q; },
    // on a wall, over a ledge, a stone, a vault: the IK puts every joint (player/limbik.js); the hands are on what you're climbing, so what
    // was in them goes on you: a long gun slung across the back, muzzle up over the left shoulder; a pistol or a blade at the right hip
    climb(pose, toRender, o = {}) { onWall = true; root.position.set(0, 0, 0); applyClimbPose(rig, pose, toRender);
      if (o.sling !== false && held.children.length && by.spine_03) {
        root.updateMatrixWorld(true); const F = new THREE.Vector3(...pose.forward), U = new THREE.Vector3(...pose.up), Rt = new THREE.Vector3(...pose.right);
        const Z = long ? U.clone().multiplyScalar(0.8).addScaledVector(Rt, -0.6).normalize() : U.clone().negate().addScaledVector(F, 0.25).normalize();
        const Y = (long ? F.clone().negate() : Rt.clone()).addScaledVector(Z, -0).normalize(); Y.addScaledVector(Z, -Y.dot(Z)).normalize(); const X = new THREE.Vector3().crossVectors(Y, Z);
        const at = long ? by.spine_03.getWorldPosition(new THREE.Vector3()).addScaledVector(F, -0.2).addScaledVector(Z, -0.14) : by.pelvis.getWorldPosition(new THREE.Vector3()).addScaledVector(Rt, 0.21).addScaledVector(U, 0.02);
        const want = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
        held.quaternion.copy(socket.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(want)); held.position.copy(socket.worldToLocal(at));
        held.userData.slung = true; } },
    // out of the daylight (the decks of a dead ship): the sun's kept off you, all but a little
    setShade(k) { if (Math.abs(k - (this._shade ?? 1)) < 0.01) return; this._shade = k; for (const m of mats) { if (!m.color) continue; m.userData.c0 ||= m.color.clone(); m.userData.e0 ??= m.envMapIntensity ?? 1; m.color.copy(m.userData.c0).multiplyScalar(k); m.envMapIntensity = m.userData.e0 * k; } },
    setOpacity(o) {
      if (Math.abs(o - opacity) < 0.01) return; opacity = o; root.visible = o > 0.02;
      for (const m of mats) { m.transparent = o < 0.99 || m.userData.t0; m.opacity = o; m.depthWrite = o >= 0.99 ? m.userData.d0 : false; }
    },
    setHeld(id) {
      if (heldId === id) return; const was = heldId && WEAPONS[heldId], W = id && WEAPONS[id];
      // a long gun put away: the recorded put-back over the shoulder, the gun in the hand until it's there
      if (was?.ranged && was.two && !(W?.ranged && W.two) && clip('rifle_draw') && !this._stowing) { this._stowing = true; play('rifle_draw', { from: 3.3, to: 5.6, rate: 1.9, upper: true, done: () => { this._stowing = false; heldId = '__stowed'; this.setHeld(id); } }); return; }
      if (this._stowing) return;
      heldId = id; held.clear();
      if (W?.ranged && W.two && !(was?.ranged && was.two) && clip('rifle_draw')) play('rifle_draw', { from: 0.5, to: 3.1, rate: 1.9, upper: true });      // (and one taken up: off the back, into the hands)
      long = !!(W && W.ranged && W.two);
      aimIdle = W && id !== 'fists' && !(W.ranged && W.two) ? (W.ranged ? act.pistol_idle : act.sword_idle) || null : null; ranged = !!(W && W.ranged);      // (a long gun has no idle of its own: it's carried at your side, sideCarry)
      if (id && this.planet && W && id !== 'fists') held.add(armObject(this.planet, id));
    },
    // k 0..1 how far the gun's up; pitch the camera's (+ looking down)
    aimGun(k, pitch) { gunUp = k; gunPitch = pitch; },
    crouch(k) { crouchK = k; },
    punch() { side ^= 1; if (side && clip('hook')) { play('hook', { from: 0.45, to: 1.75, rate: 1.7, upper: true }); return; } const a = act.punch_jab || act.strike_straight_r_1; if (!a) return; oneShot = a; a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; a.weight = 1; a.timeScale = 1.2; a.play(); },
    // a blow with what's in your hand: fists, a blade (an inward slash), a long gun (the bayonet, or the muzzle, driven in)
    melee(id) { const W = WEAPONS[id]; if (!W || id === 'fists') return this.punch(); if (W.ranged && W.two) play('bayonet', { from: 0.55, to: 2.5, rate: 1.6, still: true }); else play('slash', { from: 0.3, to: 1.9, rate: 1.5, upper: true }); },
    moveDir(a) { moveAng = a; },
    guard(on) { guard = !!on; },      // (fists up, squared up to someone: you step round them sideways)
    weights() { const o = {}; for (const A of mixer._actions) if (A.weight > 0.05 && mixer._isActiveAction(A)) o[A.getClip().name] = +A.weight.toFixed(2); if (window.__dbg) Object.assign(o, { _guard: guard, _ang: +moveAng.toFixed(2), _ranged: ranged, _gunUp: +gunUp.toFixed(2), _two: !!held.children[0]?.userData.meta?.two, _held: held.children.length }); return o; },      // (what's playing: for the tests)      // which way you're going, against the way you face (+ to your left)
    fired() { firing = 0.35; proneFire = 0.4; },
    setProne(on) { prone = !!on; },
    // down again. The landing take starts at the moment the feet meet the ground (the recorded fall's landing: the knees give, and up), so it's
    // brought in at once, deeper the harder you come down; from a real height, the recorded jump down's landing, right down into a crouch
    land(v) { for (const T of takes) if (AIR.test(T.id)) T.out = T.fast = true; jumping = false;
      if (v > 12) play('jump_down', { from: 1.9, rate: 1.2, still: true, fast: true }); else if (clip('land_hard')) play('land_hard', { from: 0.04, rate: v > 6.5 ? 1.15 : 1.5, w: Math.min(1, 0.5 + v / 14), still: true, fast: true }); },
    // a jump: only the push off of the recorded one (off one foot at a run, the spring from a stand), and then, for as long as you're in the air,
    // the recorded fall: arms out for balance, legs loose under you (update), till land()
    jump(speed = 0) { if (prone || !clip('jump_down') || takes.some(T => AIR.test(T.id) && !T.out)) return; jumping = true;
      if (speed > 3.5 && clip('jump_run')) play('jump_run', { from: 0.1, to: 0.4, rate: 0.95, still: true, flat: true });
      else if (clip('jump_up')) play('jump_up', { from: 0.38, to: 0.66, rate: 1, still: true, flat: true }); },
    // knocked over: up off the ground over `sec` seconds
    knockedDown(sec = 3) { const I = infoOf('get_up'); if (!I) return; play('get_up', { from: 1.6, to: 6.6, rate: Math.max(1, Math.min(3.2, 5 / sec)), still: true }); },
    // killed: the way the shot (or whatever it was) took you; held there
    die(kind = 'dying') { for (const T of takes) T.out = true; play(kind, { hold: true, rate: kind === 'dying' ? 1.4 : 1 }); },
    revive() { for (const T of takes) T.out = true; },
    // a grenade lobbed; a round taken in the chest (a jolt, not the whole clip: you keep fighting)
    // → how long till it leaves the hand (s), so the game can let it go then
    throwIt() { if (prone && clip('grenade')) { play('grenade', { from: 0.5, to: 2.6, rate: 1.5, still: true }); return 0.55; }
      // standing or crouched: the recorded throws (the wind-up, the arm over, the follow-through); on the move, just its upper half over your legs
      const id = crouchK > 0.5 ? 'nade_crouch' : 'nade_stand'; if (clip(id)) { const moving = lastSpeed > 0.6, [from, rel, to] = id === 'nade_stand' ? [1.0, 1.97, 2.6] : [1.1, 2.0, 2.9], rate = 1.6;
        play(id, { from, to, rate, still: true, upper: moving }); return (rel - from) / rate; }
      const a = act.throw; if (!a) return; if (oneShot) oneShot.stop(); oneShot = a; a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; a.weight = 1; a.timeScale = 1.6; a.play(); return 0; },
    flinch(kind = null) { if (prone || takes.some(T => !T.upper && !T.out && T.k * T.w > 0.5 && !/^(hit_a|hit_b|punched)$/.test(T.id))) return; if (kind === 'punch' && clip('punched')) { play('punched', { from: 0.9, to: 2.5, rate: 1.4, w: 0.85, still: true }); return; }
      const id = Math.random() < 0.5 ? 'hit_a' : 'hit_b'; if (clip(id)) { play(id, id === 'hit_a' ? { from: 0.35, to: 1.5, rate: 1.6, w: 0.6, still: true } : { rate: 1.2, w: 0.55, still: true }); return; }
      const a = act.hit_chest; if (!a || oneShot) return; oneShot = a; a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; a.weight = 0.55; a.timeScale = 1.8; a.play(); },
    update(dt, speed, grounded, climb = null, pose = null) {
      lastSpeed = speed; if (onWall) { onWall = false; root.quaternion.identity(); }
      if (climb && !pose) return;       // (the climber puts every joint; climb() comes after this)
      held.visible = !pose;
      resetBones();
      if (pose === 'sit' || pose === 'lie') { for (const G of gaits) G.a.weight = G.n === 'idle' ? 1 : 0; }
      else if (pose === 'swim') setGait(Math.min(speed, 1.4), dt);
      else setGait(grounded ? speed : 0, dt);
      // a long gun ready (the recorded rifleman's stance, firing when you are); else the weapon's own idle
      { const up = long && gunUp > 0.3, want = up ? (firing > 0 ? act.rifle_fire : act.rifle_aim) || aimIdle : aimIdle; for (const A of [act.rifle_aim, act.rifle_fire, aimIdle]) if (A && A !== want) A.weight += (0 - A.weight) * Math.min(1, dt * 6);
        if (want && !pose) { want.play(); want.weight += ((speed < 0.3 ? 1 : 0) * (up ? 1 : 1 - gunUp) - want.weight) * Math.min(1, dt * 6); } }
      firing = Math.max(0, firing - dt);
      // prone: down on your front, the rifle in front of you (the recorded take, its shots played while you fire)
      if (prone && !pose && !climb) { if (!takes.some(T => T.id === 'prone_fire' && !T.out)) play('prone_fire', { loop: true, rate: 0, still: true }); const P = takes.find(T => T.id === 'prone_fire' && !T.out); if (P) P.rate = proneFire > 0 ? 1 : 0; proneFire = Math.max(0, proneFire - dt); }
      else for (const T of takes) if (T.id === 'prone_fire') T.out = true;
      stepTakes(dt);
      { const f = fullK(); if (f > 0) for (const G of gaits) G.a.weight *= 1 - f; for (const A of Object.values(dirGaits)) if (A) A.weight *= 1 - f; for (const A of [act.rifle_aim, act.rifle_fire, aimIdle]) if (A) A.weight *= 1 - f; }
      if (aimA.mid) { const w = ranged && !pose ? gunUp * 5 : 0, up = Math.max(0, Math.min(1, -gunPitch / 0.55)), down = Math.max(0, Math.min(1, gunPitch / 0.55));
        aimA.mid.weight = w * (1 - up - down); if (aimA.up) aimA.up.weight = w * up; if (aimA.down) aimA.down.weight = w * down; }
      if (oneShot && !oneShot.isRunning()) { oneShot.stop(); oneShot = null; }
      mixer.update(dt); stillHips();
      root.updateMatrixWorld(true);
      const busy = fullK() > 0.5;      // (a take with the whole body: a fall, a death, prone, a draw's reach; the IK keeps out of it)
      if (crouchK > 0.01 && !pose && !climb && grounded && !busy) crouchLegs(crouchK);
      const drawing = takes.some(T => T.upper && T.id === 'rifle_draw' && !T.out);
      if (long && !pose && !climb && !busy && !drawing) sideCarry();      // (at your side; shoulderGun brings it up from there)
      if (ranged && !pose && !climb && gunUp > 0.02 && !busy && !drawing) shoulderGun(gunUp);
      // in a take with the whole body (flat on your front, the bayonet) the take's own hands hold a long gun: it lies from the right hand to the left
      held.quaternion.identity(); if (held.userData.slung) { held.position.set(0, 0, 0); held.userData.slung = false; }
      if (long && busy && by.hand_l) { root.updateMatrixWorld(true); const r = by.hand_r.getWorldPosition(new THREE.Vector3()), l = by.hand_l.getWorldPosition(new THREE.Vector3()), d = l.sub(r), n = d.length();
        if (n > 0.15 && n < 1) { d.normalize(); const X = new THREE.Vector3().crossVectors(UP, d).normalize(), Y = new THREE.Vector3().crossVectors(d, X), want = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, d));
          held.quaternion.copy(socket.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(want)); } }
      if (pose === 'sit') {      // thighs level, shins down, hands on the knees
        const f = new THREE.Vector3(0, 0, 1).applyQuaternion(root.getWorldQuaternion(_q)), down = new THREE.Vector3(0, -1, 0);
        root.position.y -= 0.45; root.updateMatrixWorld(true);
        for (const s of ['l', 'r']) { aim(by['thigh_' + s], by['calf_' + s], f.clone().addScaledVector(down, 0.05).normalize()); aim(by['calf_' + s], by['foot_' + s], down.clone().addScaledVector(f, 0.12).normalize());
          aim(by['upperarm_' + s], by['lowerarm_' + s], down.clone().addScaledVector(f, 0.35).normalize()); aim(by['lowerarm_' + s], by['hand_' + s], f.clone().addScaledVector(down, 0.5).normalize()); }
      } else if (pose === 'lie') { root.rotateX(-Math.PI / 2); root.position.y += 0.12; }
      else if (pose === 'swim') { root.rotateX(1.25); root.position.y += 0.75; }
      // in the air: the recorded fall, looped, once the push off's done (or a moment after you've walked off an edge); down, it's let go (land() plays the landing)
      airT = grounded || climb || pose ? 0 : airT + dt;
      if (airT > (jumping ? 0.04 : 0.3) && !takes.some(T => AIR.test(T.id) && !T.out)) play(clip('fall') ? 'fall' : 'jump_down', clip('fall') ? { loop: true, hold: true, still: true, flat: true } : { from: 1.4, to: 1.75, rate: 0.8, hold: true, still: true, flat: true });
      if ((grounded || climb || pose) && airT === 0 && !jumping) for (const T of takes) if (AIR.test(T.id) && T.hold) T.out = true;
      if (jumping && airT > 0.1) jumping = 1; else if (jumping === 1 && airT === 0) jumping = false;      // (a jump that never got a landing call: over once you're down)
      // a take with the whole body (a death, a fall, a flinch, getting up) or lying stunned: the clip guides, the ground and the walls stop it
      if (contactQ && !climb && pose !== 'sit' && pose !== 'swim' && (fullK() > 0.02 || pose === 'lie')) { root.updateMatrixWorld(true); contact.apply(contactQ, dt, root.getWorldPosition(_v).y); }
      else contact.reset();
    },
  };
  return api;
}
