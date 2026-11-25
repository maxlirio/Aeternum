// Every lamp in the scene is paid for by every pixel drawn, lit by it or not, so the scene keeps only a few real point lights. The lights the rest
// of the game makes (a muzzle flash, a fire's glow, an engine's, a room's) stay where they are as requests: each frame the strongest few, as
// seen from where you stand, are given the real ones.
import * as THREE from 'three';

export class LightPool {
  constructor(scene, n = 3) {
    this.scene = scene; this.asks = []; this._p = new THREE.Vector3(); this._c = new THREE.Vector3();
    this.real = Array.from({ length: n }, () => { const l = new THREE.PointLight(0xffffff, 0, 30, 1.6); l.userData.pooled = true; scene.add(l); return l; });
  }
  // take over every point light in the scene that isn't one of the pool's own (call again when more may have been made)
  adopt() { this.scene.traverse(o => { if (o.isPointLight && !o.userData.pooled && !o.userData.asked) { o.userData.asked = true; o.visible = false; this.asks.push(o); } }); }
  update(camera) {
    camera.getWorldPosition(this._c); const best = [];
    for (const a of this.asks) {
      if (!(a.intensity > 0)) continue; let on = true; for (let p = a.parent; p; p = p.parent) if (!p.visible) { on = false; break; } if (!on) continue;
      a.getWorldPosition(this._p); const d2 = this._p.distanceToSquared(this._c), reach = a.distance || 60; if (d2 > (reach * 3 + 80) ** 2) continue;
      best.push([a.intensity * reach * reach / (25 + d2), a, this._p.x, this._p.y, this._p.z]);
    }
    best.sort((x, y) => y[0] - x[0]);
    this.real.forEach((l, i) => { const b = best[i]; if (!b) { l.intensity = 0; return; } const a = b[1]; l.position.set(b[2], b[3], b[4]); l.color.copy(a.color); l.intensity = a.intensity; l.distance = a.distance; l.decay = a.decay; });
  }
}
