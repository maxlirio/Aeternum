// Instanced meshes that use the same model each need their own vertex-array state, or the renderer rebuilds it on every draw. A shallow copy of the
// geometry gets its own state while sharing every buffer: no more memory, and it looks exactly the same.
import * as THREE from 'three';
export function share(g) {
  const v = new THREE.BufferGeometry(); v.index = g.index; for (const k of Object.keys(g.attributes)) v.attributes[k] = g.attributes[k]; for (const k of Object.keys(g.morphAttributes || {})) v.morphAttributes[k] = g.morphAttributes[k];
  v.groups = g.groups; v.drawRange = g.drawRange; v.boundingBox = g.boundingBox; v.boundingSphere = g.boundingSphere; return v;
}
