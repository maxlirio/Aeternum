// The sea (and anything below sea level): one large plane that follows the camera. Two
// layers of the baked ripple normals scroll across each other in world space, so the
// surface moves without tiling in step; the sky reflects in it, strongest at grazing
// angles, and the sun glints.
import * as THREE from 'three';
import { baked } from './materials.js';

export function makeSea(planet) {
  const b = baked('water');
  const m = new THREE.MeshStandardMaterial({ color: 0x0d2a33, roughness: 0.07, metalness: 0.0, transparent: true, opacity: 0.93, envMapIntensity: 1.25, ...(b ? { normalMap: b.normalMap } : {}) });
  const u = { uTime: { value: 0 }, uOff: { value: new THREE.Vector2() } };
  if (b) {
    m.normalScale.set(1.1, 1.1);
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vSeaXZ;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSeaXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec2 uOff; varying vec2 vSeaXZ;')
        .replace('#include <normal_fragment_maps>', `
          vec2 wp = vSeaXZ + uOff;
          vec3 n1 = texture2D(normalMap, wp / 14.0 + vec2(uTime * 0.012, uTime * 0.007)).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(normalMap, wp / 5.0 * mat2(0.8, -0.6, 0.6, 0.8) - vec2(uTime * 0.02, -uTime * 0.016)).xyz * 2.0 - 1.0;
          vec3 mapN = normalize(vec3(n1.xy + n2.xy * 0.7, n1.z * n2.z));
          mapN.xy *= normalScale * clamp(1.0 - vViewPosition.z / 2500.0, 0.25, 1.0);
          normal = normalize((viewMatrix * vec4(normalize(vec3(mapN.x, mapN.z, -mapN.y)), 0.0)).xyz);   // a level plane: tangent x → world x, y → −z, z → up
        `);
    };
  }
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000).rotateX(-Math.PI / 2), m);
  sea.position.y = planet.seaLevel;
  sea.update = (dt, camera, origin) => { u.uTime.value += dt; u.uOff.value.set(origin[0], origin[2]); sea.position.set(camera.position.x, planet.seaLevel, camera.position.z); };
  return sea;
}
