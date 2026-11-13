// A hand that holds what it's on. Given the real shape of what's under the hand, the hand is put where a climber's
// would go: on a shallow lip the knuckles over the edge, the palm against the front, the fingers hooked over the top
// with their tips pressed down short of the wall behind (a crimp); on a deep ledge or a roof's edge the palm flat on
// top, heel at the lip, fingers cupped; at an outside corner the palm on this face and the fingers round onto the next;
// on a drainpipe a fist round it, the fingers in the gap between pipe and wall. Every finger is solved on its own:
// its knuckle is where the palm put it, and its three joints are swept for the bend that brings the fingertip onto
// the surface with no part of the finger inside it (the solid's distance field, less the flesh: the bones are in the
// middle of a finger, not on its skin). The plan for each shape is worked out once and cached; per frame it's a pose.
//
//   rig.hands[s] = captureHand(rig, s, skinnedMeshes)   once, in the rest pose
//   gripHand(H, grip)                                  each frame, after the arm's IK has put the wrist near its spot
// A grip: { kind: 'ledge'|'top'|'corner'|'pipe', E: [x,y,z] the edge (on the lip, at the top of its front face; the
//   arris; the pipe's axis at that height), O: out of the face, Y: the face the fingers go over (up for a ledge, round
//   the corner for an arris), d (depth of the top before the wall), th (height of the lip's front face), r (a pipe's
//   radius), C (pipe centre, as [out, side] from E), amount 0..1 (0 = open hand reaching, 1 = closed) }
import * as THREE from 'three';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
const FINGERS = ['index', 'middle', 'ring', 'pinky'];

// ---- the solid, in the grip's cross-section (o out of the face, y up the face / over the edge). Positive outside.
function sdBox(o, y, o0, o1, y0, y1) { const dx = Math.max(o0 - o, o - o1), dy = Math.max(y0 - y, y - y1); return dx > 0 && dy > 0 ? Math.hypot(dx, dy) : Math.max(dx, dy); }
export function solidOf(g) {
  if (g.kind === 'pipe') { const [co, cy] = g.C, r = g.r; return (o, y) => Math.min(Math.hypot(o - co, y - cy) - r, o - co + g.standoff); }     // the pipe, and the wall behind it
  const d = g.kind === 'ledge' ? g.d : 10, th = g.kind === 'ledge' ? g.th : 10, wall = g.kind === 'ledge' && g.d < 1;
  return (o, y) => { const a = sdBox(o, y, -d, 0, -th, 0); return wall ? Math.min(a, o + d) : a; };
}

// ---- the hand, measured once from the rig in its rest pose
const tipLen = l2 => l2 * 0.86;      // (no bone past the last knuckle: a fingertip is a little shorter than the middle phalanx)
export function captureHand(rig, s, meshes = []) {
  const by = rig.handBones[s], hand = by.hand; rig.root.updateMatrixWorld(true);
  const wp = b => b.getWorldPosition(new THREE.Vector3()), wq = b => b.getWorldQuaternion(new THREE.Quaternion());
  const w0 = wp(hand), k0 = wp(by.middle[0]), F = k0.clone().sub(w0).normalize();
  const A = wp(by.index[0]).sub(wp(by.pinky[0])); A.addScaledVector(F, -A.dot(F)).normalize();        // across the palm, toward the thumb
  const N = s === 'r' ? new THREE.Vector3().crossVectors(A, F) : new THREE.Vector3().crossVectors(F, A);     // out of the palm
  const inv = wq(hand).invert(), H = { s, hand, Lp: w0.distanceTo(k0), local: { F: F.clone().applyQuaternion(inv), N: N.clone().applyQuaternion(inv), A: A.clone().applyQuaternion(inv) }, fingers: {}, cache: new Map() };
  for (const f of FINGERS) { const ch = by[f], p = ch.map(wp); H.fingers[f] = { mcp: p[0].clone().sub(w0).applyQuaternion(inv), bones: ch, len: [p[0].distanceTo(p[1]), p[1].distanceTo(p[2]), tipLen(p[1].distanceTo(p[2]))], q0: ch.map(b => b.quaternion.clone()) }; }
  { const ch = by.thumb, p = ch.map(wp); H.thumb = { mcp: p[0].clone().sub(w0).applyQuaternion(inv), bones: ch, len: [p[0].distanceTo(p[1]), p[1].distanceTo(p[2]), tipLen(p[1].distanceTo(p[2])) * 1.1], q0: ch.map(b => b.quaternion.clone()) }; }
  H.hand.userData.q0 = H.hand.quaternion.clone();
  // flesh: how far the skin of the palm and of a finger is from the bones, read off the skinned body itself
  H.rp = 0.016; H.rf = 0.0085; H.rw = 0.03; H.tipBias = 0.0048;     // (the last bone stops short of the fingertip's pad: measured on the skinned hand, tools/grasplab)
  for (const m of meshes) {
    const sk = m.skeleton, ai = sk.bones.indexOf(hand), pos = m.geometry.attributes.position, sw = m.geometry.attributes.skinWeight, si = m.geometry.attributes.skinIndex; if (ai < 0 || !sw) continue;
    const midIdx = sk.bones.indexOf(by.middle[1]), thIdx = sk.bones.indexOf(by.thumb[0]), pal = [], fin = [], v = new THREE.Vector3(), mid0 = wp(by.middle[1]), mid1 = wp(by.middle[2]), md = mid1.clone().sub(mid0).normalize();
    m.updateMatrixWorld(true);
    for (let i = 0; i < pos.count; i++) {
      let best = -1, bw = 0; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
      if (bw < 0.6 || (best !== ai && best !== midIdx && best !== thIdx)) continue;
      m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld);
      if (best === ai || best === thIdx) { const r = v.clone().sub(w0), along = r.dot(F), st = Math.round(along / H.Lp * 6); if (st >= 0 && st <= 6) (pal[st] ||= []).push(r.dot(N)); }
      else { const r = v.clone().sub(mid0), t = r.dot(md); if (t > 0.008 && t < mid0.distanceTo(mid1) - 0.008) fin.push(r.addScaledVector(md, -t).length()); }
    }
    H.prof = []; for (let st = 0; st <= 6; st++) { const a = (pal[st] || []).sort((x, y) => x - y); H.prof[st] = a.length > 6 ? a[a.length - 1 - Math.floor(a.length * 0.02)] : null; }
    for (let st = 0; st <= 6; st++) if (H.prof[st] == null) H.prof[st] = H.prof[st - 1] ?? 0.018;
    H.rp = H.prof[Math.round(6 * 0.6)];
    if (fin.length > 20) { fin.sort((a, b) => a - b); H.rf = fin[Math.floor(fin.length * 0.5)]; }
  }
  return H;
}

// ---- planning a grip in two dimensions
const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];     // counter-clockwise: toward the palm
const ccw = v => [-v[1], v[0]];
// where the palm goes: its line W→K, the palm side facing pn. → { W, pdir, pn }
function palmPlan(g, H, sd) {
  const rp = H.rp, Lp = H.Lp;
  if (g.kind === 'pipe') {      // palm on the near side of the pipe, fingers pointing at the wall, knuckles level with its back
    const [co, cy] = g.C, pdir = [-1, 0], pn = ccw(pdir), K = [co - g.r * 0.25, cy + g.r + rp];
    return settle({ W: [K[0] + Lp, K[1]], pdir, pn }, H, sd, [0.9, 0.43]);
  }
  // deep tops lie the palm down on them; shallow lips hook the fingers over (φ: 0 hooked, π/2 flat)
  const phi = g.kind === 'corner' ? 0 : g.kind === 'top' ? 1.25 : clamp((g.d - 0.06) / 0.1, 0, 1) * 1.3;
  const u = phi / (Math.PI / 2), pdir = [-Math.sin(phi), Math.cos(phi)], pn = ccw(pdir), s = (Lp - 0.9 * H.rf) * (1 - u) + 0.03 * u;     // (hooked: the knuckles level with the top, so the fingers lie over it)
  const W = [-pdir[0] * s - pn[0] * rp, -pdir[1] * s - pn[1] * rp];      // the lip's edge on the palm's skin, s along it
  return settle({ W, pdir, pn }, H, sd, g.kind === 'corner' ? [0.6, -0.8] : [0.32, -0.95]);     // (the forearm runs down and out to a hanging body, or back from a corner to it)
}
// nothing of the palm inside the solid: back it off along its back until clear
function settle(P, H, sd, fa = null) {
  for (let it = 0; it < 16; it++) {
    let pen = 0, push = null;
    if (fa) for (let k = 1; k <= 5; k++) { const t = k * 0.03, x = P.W[0] + fa[0] * t, y = P.W[1] + fa[1] * t, e = H.rw - sd(x, y); if (e > pen) { pen = e; push = fa.map(c => -c); } }      // the forearm, from the wrist toward the elbow
    const pen0 = pen; pen = 0; for (let k = 0; k <= 6; k++) { const t = k / 6 * H.Lp, r = H.prof?.[k] ?? H.rp, x = P.W[0] + P.pdir[0] * t + P.pn[0] * r, y = P.W[1] + P.pdir[1] * t + P.pn[1] * r; pen = Math.max(pen, -sd(x, y)); }     // (the heel of the hand is thicker than the middle of the palm)
    if (pen0 > pen && pen0 > 0.0005) { const o = [P.pn[0] * -1, P.pn[1] * -1]; P.W = [P.W[0] + (o[0] * 0.5 + push[0] * 0.0) * pen0 + (fa[0] > 0 ? 0 : 0), P.W[1] + o[1] * 0.5 * pen0]; const n = [-fa[1], fa[0]], side = n[0] * -P.pn[0] + n[1] * -P.pn[1] > 0 ? 1 : -1; P.W = [P.W[0] + n[0] * side * pen0 * 0.6, P.W[1] + n[1] * side * pen0 * 0.6]; continue; }
    if (pen < 0.0005) break;
    P.W = [P.W[0] - P.pn[0] * (pen + 0.0005), P.W[1] - P.pn[1] * (pen + 0.0005)];
  }
  return P;
}
// a finger from its knuckle K (2D), starting along pdir: the three bends that put the tip on the surface, nothing inside
function planFinger(K, pdir, len, rf, sd, prior = null, held = null, bias = 0) {
  let best = null;
  const pts = (a1, a2, a3) => { const d1 = rot(pdir, a1), d2 = rot(d1, a2), d3 = rot(d2, a3), P1 = [K[0] + d1[0] * len[0], K[1] + d1[1] * len[0]], P2 = [P1[0] + d2[0] * len[1], P1[1] + d2[1] * len[1]], T = [P2[0] + d3[0] * len[2], P2[1] + d3[1] * len[2]]; return { d: [d1, d2, d3], P: [K, P1, P2, T] }; };
  for (let a1 = -0.1; a1 <= 1.65; a1 += 0.05) for (let a2 = 0; a2 <= 1.85; a2 += 0.05) {
    const a3 = a2 * 0.68, c = pts(a1, a2, a3); let pen = 0, touch = 0;
    for (let sgm = 0; sgm < 3; sgm++) for (let k = 1; k <= 4; k++) { const A = c.P[sgm], B = c.P[sgm + 1], f = k / 4, e = sd(A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f) - rf + (sgm === 2 ? bias * f : 0); if (e < 0) pen = Math.max(pen, -e); else if (e < 0.003) touch++; }
    const tip = sd(...c.P[3]) - rf + bias, score = (held && !held(c.P[3]) ? 0.5 : 0) + pen * 800 + Math.max(0, tip) * 60 + a1 * 0.006 + a2 * 0.02 - touch * 0.004 + (prior ? (Math.abs(a1 - prior[0]) + Math.abs(a2 - prior[1])) * 0.03 : 0);     // (a hook bends at the knuckle first; the fingers of a hand bend alike)
    if (!best || score < best.score) best = { score, a: [a1, a2, a3], d: c.d, pen, tip, P: c.P };
  }
  return best;
}
function planThumb(K, pdir, len, rf, sd) {      // the thumb lies along the side of the hand, bending onto the surface if it can
  let best = null;
  for (let a1 = -0.2; a1 <= 1.2; a1 += 0.05) for (let a2 = 0; a2 <= 1.2; a2 += 0.05) {
    const d1 = rot(pdir, a1), d2 = rot(d1, a2), P1 = [K[0] + d1[0] * len[0], K[1] + d1[1] * len[0]], T = [P1[0] + d2[0] * (len[1] + len[2]), P1[1] + d2[1] * (len[1] + len[2])];
    let pen = 0; for (const [A, B] of [[K, P1], [P1, T]]) for (let k = 1; k <= 4; k++) { const f = k / 4, e = sd(A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f) - rf * 1.15; if (e < 0) pen = Math.max(pen, -e); }
    const tip = sd(...T) - rf * 1.15, score = pen * 800 + Math.abs(tip) * 20 + (a1 + a2) * 0.02;
    if (!best || score < best.score) best = { score, d: [d1, d2], pen, tip };
  }
  return best;
}

// ---- putting the hand on: wrist where the plan says, palm turned to it, every finger aimed down its planned bends
function setWorldQuat(bone, q) { bone.parent.getWorldQuaternion(_p).invert(); bone.quaternion.copy(_p).multiply(q); bone.updateMatrixWorld(true); }
function aimY(bone, dir) {      // turn a bone (its +y runs to the next) so that +y points along dir, by the smallest turn
  bone.getWorldQuaternion(_p); _v.set(0, 1, 0).applyQuaternion(_p); _q.setFromUnitVectors(_v, dir); setWorldQuat(bone, _q.multiply(_p).clone());
}
const keyOf = (g, H) => `${g.kind}|${H.s}|${Math.round((g.d ?? 0) * 200)}|${Math.round((g.th ?? 0) * 200)}|${Math.round((g.r ?? 0) * 500)}|${Math.round((g.C?.[0] ?? 0) * 500)}`;
// the grip's 3D frame: o out of the face, y over the edge, t along it (a right-handed set: t = o × y)
// Ys is the face's own way round; Y is the plane the hand is laid out in. On an arris (vertical) that plane is tipped up the edge by CORNER_TILT:
// a hand reaching up takes a corner pointing up it, the palm on one face and the fingers over the edge on a slant, the wrist straight on the forearm
// (laid square across it, the hand would point sideways off an upright forearm: the wrist bent 90°, the elbow thrown back behind the body to help).
// The tip follows the arm (g.tilt, set by whoever puts the arm there: the way the forearm comes up into the corner), so the hand is in line with it.
// The solid is the same all the way up an arris, so the cross-section in the tipped plane has the same inside and outside.
const CORNER_TILT = 1.0;
export function frameOf(g) { const O = new THREE.Vector3(...g.O).normalize(), Ys = new THREE.Vector3(...g.Y).normalize(); let Y = Ys;
  if (g.kind === 'corner') { const up = new THREE.Vector3().crossVectors(O, Ys); if (up.y < 0) up.negate(); const a = g.tilt ?? CORNER_TILT; Y = Ys.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a)).normalize(); }
  return { O, Y, Ys, T: new THREE.Vector3().crossVectors(O, Y), E: new THREE.Vector3(...g.E) }; }
// Where the wrist will be for this grip, before any arm has reached: [x, y, z] (for the climber's planner, so the body is put where the arm can reach it)
export function wristFor(g, H) { const P = plan(g, H), f = frameOf(g); return f.E.clone().addScaledVector(f.O, P.palm.W[0]).addScaledVector(f.Y, P.palm.W[1]).addScaledVector(f.T, g.slide || 0).toArray(); }
function plan(g, H) {
  const key = keyOf(g, H); let P = H.cache.get(key); if (P) return P;
  const sd = solidOf(g), palm = palmPlan(g, H, sd), L = H.local;
  const knuckle = off => { const a = off.dot(L.F), b = off.dot(L.N); return [palm.W[0] + palm.pdir[0] * a + palm.pn[0] * b, palm.W[1] + palm.pdir[1] * a + palm.pn[1] * b]; };     // (each finger from its own knuckle)
  P = { palm, fingers: {}, sd };
  const held = g.kind === 'pipe' ? T => T[0] < g.C[0] && Math.hypot(T[0] - g.C[0], T[1] - g.C[1]) < g.r + H.rf + 0.005 : T => T[0] < -0.004 && T[1] < H.rf + 0.005;      // a finger holds when its tip is down on the top, over the edge (round behind the pipe, on it)
  P.fingers.middle = planFinger(knuckle(H.fingers.middle.mcp), palm.pdir, H.fingers.middle.len, H.rf, sd, null, held, H.tipBias);
  for (const f of FINGERS) if (f !== 'middle') P.fingers[f] = planFinger(knuckle(H.fingers[f].mcp), palm.pdir, H.fingers[f].len, H.rf, sd, P.fingers.middle.a, held, H.tipBias);
  P.thumb = planThumb(knuckle(H.thumb.mcp), palm.pdir, H.thumb.len, H.rf, sd);
  if (H.cache.size > 200) H.cache.clear(); H.cache.set(key, P); return P;
}
const ROLL = 1.4;
// How far the forearm would have to roll about its own line for the palm to come round to Rw (the hand's wanted world rotation), from where it is now.
function rollFor(H, Rw) {
  const fore = H.hand.parent, L = H.local, e = fore.getWorldPosition(new THREE.Vector3()), X = H.hand.getWorldPosition(new THREE.Vector3()).sub(e).normalize();
  H.hand.getWorldQuaternion(_p); const nCur = L.N.clone().applyQuaternion(_p), nWant = L.N.clone().applyQuaternion(Rw);
  nCur.addScaledVector(X, -nCur.dot(X)); nWant.addScaledVector(X, -nWant.dot(X));
  if (nCur.lengthSq() < 1e-6 || nWant.lengthSq() < 1e-6) return 0;
  nCur.normalize(); nWant.normalize(); return Math.atan2(new THREE.Vector3().crossVectors(nCur, nWant).dot(X), nCur.dot(nWant));
}
function handRot(H, g) {
  const P = plan(g, H), f = frameOf(g), { pdir, pn } = P.palm, to3 = v => new THREE.Vector3().addScaledVector(f.O, v[0]).addScaledVector(f.Y, v[1]);
  const F3 = to3(pdir).normalize(), N3 = to3(pn).normalize(), A3 = H.s === 'r' ? new THREE.Vector3().crossVectors(F3, N3) : new THREE.Vector3().crossVectors(N3, F3);
  const L = H.local, Ml = new THREE.Matrix4().makeBasis(L.F, L.N, L.A), Mw = new THREE.Matrix4().makeBasis(F3, N3, A3);
  return new THREE.Quaternion().setFromRotationMatrix(Mw.multiply(Ml.transpose()));
}
// For the arm's solver: with the arm where it is now (and the hand at its modelled turn on the forearm), how much roll this grip still asks of the forearm.
export function rollNeed(H, g) { return rollFor(H, handRot(H, g)); }
export const FOREARM_ROLL = ROLL;
// A wrist only bends so far: 70° toward the palm, 60° back, 25° to either side, and it barely turns (the forearm does the turning). The hand's
// turn on the forearm, from its modelled pose, is split into those and each held to its range. → the bends it was asked for, in degrees (for tests).
export const WRIST = { flex: 1.22, ext: 1.05, dev: 0.44, twist: 0.17 };
function limitWrist(H) {
  const q0 = H.hand.userData.q0, d = q0.clone().invert().multiply(H.hand.quaternion), L = H.local, Fl = L.F.clone().normalize(), Nl = L.N.clone().normalize(), Al = new THREE.Vector3().crossVectors(Fl, Nl).normalize();
  const r = new THREE.Vector3(d.x, d.y, d.z), pr = Fl.clone().multiplyScalar(r.dot(Fl)), tw = new THREE.Quaternion(pr.x, pr.y, pr.z, d.w); if (tw.lengthSq() < 1e-12) tw.identity(); else tw.normalize();
  const sw = d.clone().multiply(tw.clone().invert()); if (sw.w < 0) { sw.x = -sw.x; sw.y = -sw.y; sw.z = -sw.z; sw.w = -sw.w; }
  const sa = 2 * Math.acos(clamp(sw.w, -1, 1)), sv = new THREE.Vector3(sw.x, sw.y, sw.z); if (sv.lengthSq() > 1e-12) sv.normalize().multiplyScalar(sa); else sv.set(0, 0, 0);
  let twa = 2 * Math.atan2(pr.dot(Fl), d.w); if (twa > Math.PI) twa -= 2 * Math.PI; if (twa < -Math.PI) twa += 2 * Math.PI;
  const flex = sv.dot(Al), dev = sv.dot(Nl), out = { flex: flex * 57.3, dev: dev * 57.3, twist: twa * 57.3 };
  const f2 = clamp(flex, -WRIST.ext, WRIST.flex), d2 = clamp(dev, -WRIST.dev, WRIST.dev), t2 = clamp(twa, -WRIST.twist, WRIST.twist);
  if (f2 !== flex || d2 !== dev || t2 !== twa) {
    const v = Al.clone().multiplyScalar(f2).addScaledVector(Nl, d2), a = v.length(), q = a > 1e-9 ? new THREE.Quaternion().setFromAxisAngle(v.normalize(), a) : new THREE.Quaternion();
    H.hand.quaternion.copy(q0).multiply(q.multiply(new THREE.Quaternion().setFromAxisAngle(Fl, t2))); H.hand.updateMatrixWorld(true); out.held = true;
  }
  return out;
}
// Pose the hand. The wrist bone is moved to exactly where the plan puts it only by the arm (the caller's IK aimed there);
// here it's turned, and the fingers bent. `amount` opens the hand toward its rest (reaching) and closes it on the hold.
export function gripHand(H, g, amount = 1) {
  const P = plan(g, H), f = frameOf(g), { pdir, pn } = P.palm, to3 = v => new THREE.Vector3().addScaledVector(f.O, v[0]).addScaledVector(f.Y, v[1]);
  const F3 = to3(pdir).normalize(), N3 = to3(pn).normalize();         // (the palm faces what it presses on)
  const A3 = H.s === 'r' ? new THREE.Vector3().crossVectors(F3, N3) : new THREE.Vector3().crossVectors(N3, F3);
  // world rotation taking the hand's own F, N, A onto these
  const L = H.local, Ml = new THREE.Matrix4().makeBasis(L.F, L.N, L.A), Mw = new THREE.Matrix4().makeBasis(F3, N3, A3), Rw = new THREE.Quaternion().setFromRotationMatrix(Mw.multiply(Ml.transpose()));
  // the forearm rolls (pronation, supination) to bring the palm round, but only as far as a forearm turns (ROLL either way of the modelled pose,
  // which has the palm to the thigh): past that the skin at the elbow wrings. The caller swings the elbow to keep it inside that; what's left the wrist takes.
  const fore = H.hand.parent; if (fore?.isBone) {
    const tw = clamp(rollFor(H, Rw), -ROLL, ROLL) * clamp(amount * 1.6, 0, 1), X = H.hand.getWorldPosition(new THREE.Vector3()).sub(fore.getWorldPosition(new THREE.Vector3())).normalize(); H.lastTw = tw;
    fore.getWorldQuaternion(_p); setWorldQuat(fore, new THREE.Quaternion().setFromAxisAngle(X, tw).multiply(_p));
  }
  // open: the hand turned the same way, fingers barely bent (the rest pose's own curl)
  H.hand.getWorldQuaternion(_p); const cur = _p.clone(); setWorldQuat(H.hand, cur.slerp(Rw, clamp(amount * 1.6, 0, 1)));
  H.wrist = limitWrist(H);
  for (const fn of FINGERS) {
    const F = H.fingers[fn], pl = P.fingers[fn]; F.bones.forEach((b, i) => { b.quaternion.copy(F.q0[i]); b.updateMatrixWorld(true); });
    const k = clamp((amount - 0.35) / 0.65, 0, 1);
    pl.d.forEach((d, i) => { const dir = to3(d).normalize(), open = F.bones[i].getWorldQuaternion(new THREE.Quaternion()); _v.set(0, 1, 0).applyQuaternion(open); dir.lerp(_v, 1 - k).normalize(); aimY(F.bones[i], dir); });
  }
  // the thumb: folded in from the rig's spread toward the index (alongside it on an edge; round in front of the fingers on a pipe), its outer
  // joints closing toward the palm; then backed off anything solid, joint by joint, as far as it has to
  if (!globalThis.__noThumb) { const T = H.thumb, k = clamp((amount - 0.35) / 0.65, 0, 1), sd = P.sd, rt = H.rf * 1.2; T.bones.forEach((b, i) => { b.quaternion.copy(T.q0[i]); b.updateMatrixWorld(true); });
    const b0 = T.bones[0]; b0.getWorldQuaternion(_p); _v.set(0, 1, 0).applyQuaternion(_p);
    const tp = _v.clone().addScaledVector(N3, -_v.dot(N3)).normalize(), fp = F3.clone().addScaledVector(N3, -F3.dot(N3)).normalize(), add = Math.acos(clamp(tp.dot(fp), -1, 1)), sg = Math.sign(new THREE.Vector3().crossVectors(tp, fp).dot(N3)) || 1;
    const pts = () => { const out = []; for (let i = 1; i < 3; i++) out.push(T.bones[i].getWorldPosition(new THREE.Vector3())); const e = T.bones[2]; e.getWorldQuaternion(_p); out.push(e.getWorldPosition(new THREE.Vector3()).addScaledVector(_v.set(0, 1, 0).applyQuaternion(_p), T.len[2])); return out; };
    const penOf = () => { let m = 0; for (const q of pts()) { const r = q.sub(f.E); m = Math.max(m, rt - sd(r.dot(f.O), r.dot(f.Ys))); } return m; };
    if (g.kind === 'corner' || g.kind === 'pipe') {
      // round a corner or a pipe the thumb isn't laid along the index (that heaps it over the knuckles): it's searched for, its base turned
      // in the palm's plane and pressed toward or away from it, the outer joints bent a little, until it lies on the surface without going in.
      // Its base turns no further than 50° from the modelled pose, so the flesh at the root of the thumb keeps its shape.
      if (!P.thumbQ && amount * 1.6 >= 1) {
        const ax1 = N3.clone().multiplyScalar(sg), ax2 = new THREE.Vector3().crossVectors(_v.clone(), N3).normalize(), p0 = _p.clone(), curl = g.kind === 'pipe' ? [0.55, 0.6] : [0.12, 0.15];
        let best = null;
        for (let fa = -0.5; fa <= 0.9001; fa += 0.1) for (let pa = -0.9; pa <= 0.9001; pa += 0.1) {
          const qb = new THREE.Quaternion().setFromAxisAngle(ax2, pa).multiply(new THREE.Quaternion().setFromAxisAngle(ax1, fa)).multiply(p0);
          if (2 * Math.acos(clamp(Math.abs(qb.dot(p0)), 0, 1)) > 0.87) continue;
          setWorldQuat(b0, qb); [1, 2].forEach(i => T.bones[i].quaternion.copy(T.q0[i]));
          [[1, curl[0]], [2, curl[1]]].forEach(([i, a]) => { const b = T.bones[i]; b.getWorldQuaternion(_p); _v.set(0, 1, 0).applyQuaternion(_p); const ax = new THREE.Vector3().crossVectors(_v, N3).normalize(); setWorldQuat(b, new THREE.Quaternion().setFromAxisAngle(ax, a).multiply(_p)); });
          let pen = 0, tip = 0, ty = 0; const ps = pts(), tdir = ps[ps.length - 1].clone().sub(ps[0]).normalize(); ps.forEach((q, j) => { const r = q.sub(f.E), d = sd(r.dot(f.O), r.dot(f.Ys)) - rt; pen = Math.max(pen, -d); if (j === ps.length - 1) { tip = d; ty = r.dot(f.Ys); } });
          const score = pen * 800 + Math.abs(tip) * 25 + (Math.abs(fa) + Math.abs(pa)) * 0.03 + (g.kind === 'corner' ? Math.abs(tdir.dot(f.O)) * 0.6 + Math.max(0, ty) * 4 : 0);     // (on a corner, lying along the face the palm is on, not standing off it or over the edge)
          if (!best || score < best.score) best = { score, fa, pa, pen, tip, q: T.bones.map(b => b.quaternion.clone()) };
        }
        P.thumbQ = best ? best.q : T.q0.map(q => q.clone()); H.thumbDbg = best && { fa: best.fa, pa: best.pa, pen: best.pen, tip: best.tip };
      }
      if (P.thumbQ) T.bones.forEach((b, i) => { b.quaternion.copy(T.q0[i]).slerp(P.thumbQ[i], k); b.updateMatrixWorld(true); });
    } else {
    const fold = (g.kind === 'pipe' ? 0.45 : 0.72) * add * k, opp = (g.kind === 'pipe' ? 0.75 : 0.15) * k;
    setWorldQuat(b0, new THREE.Quaternion().setFromAxisAngle(F3, opp * (H.s === 'r' ? -1 : 1) * 0).multiply(new THREE.Quaternion().setFromAxisAngle(N3.clone().multiplyScalar(sg), fold)).multiply(_p));
    if (opp) { b0.getWorldQuaternion(_p); _v.set(0, 1, 0).applyQuaternion(_p); const ax = new THREE.Vector3().crossVectors(_v, N3).normalize(); setWorldQuat(b0, new THREE.Quaternion().setFromAxisAngle(ax, opp).multiply(_p)); }
    const curl = g.kind === 'pipe' ? [0.7, 0.8] : [0.25, 0.35];
    [[1, curl[0]], [2, curl[1]]].forEach(([i, a]) => { const b = T.bones[i]; b.getWorldQuaternion(_p); _v.set(0, 1, 0).applyQuaternion(_p); const ax = new THREE.Vector3().crossVectors(_v, N3).normalize(); setWorldQuat(b, new THREE.Quaternion().setFromAxisAngle(ax, a * k).multiply(_p)); });
    }
    for (let it = 0; it < 14 && penOf() > 0.0005; it++) for (const i of [0, 1, 2]) { const b = T.bones[i]; b.getWorldQuaternion(_p); _v.set(0, 1, 0).applyQuaternion(_p); const ax = new THREE.Vector3().crossVectors(_v, N3).normalize(); setWorldQuat(b, new THREE.Quaternion().setFromAxisAngle(ax, -0.06).multiply(_p)); }
  }
  return P;
}
// For tests: where each finger's bones end up in the plan, and how far inside the solid any part goes (m)
export function gripReport(g, H) { const P = plan(g, H), r = {}; for (const f of FINGERS) r[f] = { a: P.fingers[f].a.map(x => +x.toFixed(2)), pen: +P.fingers[f].pen.toFixed(4), tip: +P.fingers[f].tip.toFixed(4) }; r.thumb = { pen: +P.thumb.pen.toFixed(4), tip: +P.thumb.tip.toFixed(4) }; r.W = P.palm.W.map(x => +x.toFixed(3)); r.prof = H.prof?.map(x => +x.toFixed(3)); return r; }
