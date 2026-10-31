// Avatar adapter. The game talks to { object, update(dt, speed, grounded) } only.
// This is a PLACEHOLDER body built from primitives: the humanoid models are coming
// from the ADVENTURER project as a GLB with UE-style bone names and clips, and will
// replace createPlaceholderAvatar() behind this same interface.
import * as THREE from 'three';

export function createPlaceholderAvatar() {
  const suit = new THREE.MeshStandardMaterial({ color: 0x46505a, roughness: 0.75 });
  const pad = new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.6, metalness: 0.3 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xb48a6e, roughness: 0.6 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xc98b2a, roughness: 0.5 });
  const cap = (r, l, m) => { const g = new THREE.CapsuleGeometry(r, l, 4, 10); g.translate(0, -l / 2 - r, 0); const o = new THREE.Mesh(g, m); o.castShadow = true; return o; };
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.95; root.add(hips);
  const torso = new THREE.Group(); hips.add(torso);
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.36, 4, 12), suit); chest.position.y = 0.3; chest.scale.set(1.05, 1, 0.72); chest.castShadow = true; torso.add(chest);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.26), pad); vest.position.set(0, 0.38, 0); vest.castShadow = true; torso.add(vest);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.03, 0.27), accent); stripe.position.set(0, 0.45, 0); torso.add(stripe);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8), skin); neck.position.y = 0.62; torso.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), skin); head.scale.set(0.9, 1.1, 1); head.position.y = 0.76; head.castShadow = true; torso.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), pad); hair.scale.set(0.92, 1.1, 1.02); hair.position.y = 0.775; torso.add(hair);
  const limb = (parent, x, y, r1, l1, r2, l2, m1, m2) => {
    const upper = new THREE.Group(); upper.position.set(x, y, 0); parent.add(upper);
    upper.add(cap(r1, l1, m1));
    const lower = new THREE.Group(); lower.position.y = -(l1 + 2 * r1) + r1 * 0.5; upper.add(lower);
    lower.add(cap(r2, l2, m2));
    return { upper, lower };
  };
  const legL = limb(hips, 0.1, 0, 0.075, 0.33, 0.06, 0.34, suit, suit), legR = limb(hips, -0.1, 0, 0.075, 0.33, 0.06, 0.34, suit, suit);
  for (const L of [legL, legR]) { const boot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.24), pad); boot.position.set(0, -0.5, 0.04); boot.castShadow = true; L.lower.add(boot); }
  const armL = limb(torso, 0.25, 0.52, 0.055, 0.22, 0.045, 0.22, suit, suit), armR = limb(torso, -0.25, 0.52, 0.055, 0.22, 0.045, 0.22, suit, suit);
  for (const A of [armL, armR]) { const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), skin); hand.position.y = -0.36; A.lower.add(hand); }
  let phase = 0, blend = 0, opacity = 1;
  const mats = [suit, pad, skin, accent];
  return {
    object: root,
    isPlaceholder: true,
    // fades the body out when the camera is pressed against it in tight rooms
    setOpacity(o) {
      if (Math.abs(o - opacity) < 0.01) return;
      opacity = o; root.visible = o > 0.02;
      for (const m of mats) { m.transparent = o < 0.99; m.opacity = o; m.depthWrite = o >= 0.99; }
    },
    update(dt, speed, grounded) {
      const k = Math.min(1, speed / 5.4);
      blend += ((speed > 0.15 ? 1 : 0) - blend) * Math.min(1, dt * 8);
      phase += dt * (speed > 0.15 ? 2.2 + speed * 1.15 : 0);
      const s = Math.sin(phase), amp = (0.35 + 0.55 * k) * blend;
      legL.upper.rotation.x = s * amp; legR.upper.rotation.x = -s * amp;
      legL.lower.rotation.x = Math.max(0, -Math.cos(phase)) * amp * 1.3; legR.lower.rotation.x = Math.max(0, Math.cos(phase)) * amp * 1.3;
      armL.upper.rotation.x = -s * amp * 0.8; armR.upper.rotation.x = s * amp * 0.8;
      armL.lower.rotation.x = armR.lower.rotation.x = -0.25 - 0.5 * k * blend;
      armL.upper.rotation.z = 0.08; armR.upper.rotation.z = -0.08;
      torso.rotation.x = 0.12 * k * blend; torso.rotation.y = s * 0.08 * blend;
      hips.position.y = 0.95 - Math.abs(Math.cos(phase)) * 0.04 * blend * (0.5 + k);
      if (!grounded) { legL.upper.rotation.x = -0.4; legR.upper.rotation.x = 0.2; legL.lower.rotation.x = legR.lower.rotation.x = 0.7; }
    },
  };
}
