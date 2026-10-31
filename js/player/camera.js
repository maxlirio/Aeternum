// Orbit-follow third-person camera. Mouse (pointer lock) orbits, wheel zooms; the
// boom shortens when geometry is in the way, using the collision world (not mesh
// raycasts), so it is cheap and agrees with what the player collides with.
export class FollowCamera {
  constructor(camera, world, dom) {
    this.camera = camera; this.world = world;
    this.yaw = 0; this.pitch = 0.25; this.dist = 4.2; this.cur = 4.2;
    dom.addEventListener('mousemove', e => {
      if (document.pointerLockElement !== dom) return;
      this.yaw -= e.movementX * 0.0025;
      this.pitch = Math.max(-0.9, Math.min(1.2, this.pitch + e.movementY * 0.0022));
    });
    dom.addEventListener('wheel', e => { this.dist = Math.max(1.6, Math.min(14, this.dist * (1 + Math.sign(e.deltaY) * 0.1))); }, { passive: true });
  }
  update(dt, target, toRender) {
    const tx = target[0], ty = target[1] + 1.55, tz = target[2];
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dx = -Math.sin(this.yaw) * cp, dy = sp, dz = -Math.cos(this.yaw) * cp;
    // shoulder offset to the right
    const rx = Math.cos(this.yaw) * -0.45, rz = -Math.sin(this.yaw) * -0.45;
    let free = this.dist;
    for (let d = 0.3; d <= this.dist; d += 0.15) {
      const f = d / this.dist;
      if (this.world.solidAt(tx + rx * f + dx * d, ty + dy * d, tz + rz * f + dz * d, 0.2)) { free = Math.max(0.4, d - 0.25); break; }
    }
    this.cur = free < this.cur ? free : this.cur + (free - this.cur) * Math.min(1, dt * 3);
    const f = this.cur / this.dist;
    const p = toRender(tx + rx * f + dx * this.cur, ty + dy * this.cur, tz + rz * f + dz * this.cur);
    this.camera.position.set(p[0], p[1], p[2]);
    const l = toRender(tx + rx * f, ty, tz + rz * f);
    this.camera.lookAt(l[0], l[1], l[2]);
  }
}
