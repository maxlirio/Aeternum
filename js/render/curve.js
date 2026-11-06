// The ground falls away with distance, as it does on a ball. Every material's vertices go through
// this one piece of three.js, so patching it bends everything together: a few centimetres a kilometre
// off, tens of metres at the horizon (and not at all for stars and the like, hundreds of kilometres off). Nothing that's worked out in the game changes.
import * as THREE from 'three';
export function curveTheGround(R) {
  const C = THREE.ShaderChunk, a = 'gl_Position = projectionMatrix * mvPosition;';
  if (C.project_vertex.includes('GLOBE')) return;
  C.project_vertex = C.project_vertex.replace(a, `{ /* GLOBE */ vec3 gUp = mat3(viewMatrix) * vec3(0.0, 1.0, 0.0); vec3 gFlat = mvPosition.xyz - gUp * dot(mvPosition.xyz, gUp); float gD2 = dot(gFlat, gFlat); if (gD2 < 4.0e10) mvPosition.xyz -= gUp * gD2 / ${(2 * R).toFixed(1)}; }\n${a}`);
}
