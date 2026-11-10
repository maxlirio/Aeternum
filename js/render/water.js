// The sea and lakes (everything below sea level). A grid that follows the camera, finest
// near it, displaced by Gerstner waves whose height grows with the weather's wind; the
// baked ripple normals ride on top. The water's colour comes from its depth — the ground
// under it is read from a small heightmap baked around the camera — so the shallows are
// clear over sand, then turquoise, then deep blue; foam gathers on crests and along the
// shore. The sky reflects by Fresnel (through the scene's environment map) and the sun glints.
import * as THREE from 'three';
import { baked } from './materials.js';
import { surfaceHeight } from '../gen/surface.js';

// Gerstner waves: direction (radians, relative to the wind), wavelength (m), steepness
const WAVES = [[0.0, 38, 0.55], [0.55, 21, 0.45], [-0.7, 13, 0.42], [1.4, 7.5, 0.35], [-1.9, 4.2, 0.3]];
const HM = 192, HSPAN = 900;                 // heightmap texels, metres it covers

export function makeSea(planet) {
  const b = baked('water');
  const u = {
    uTime: { value: 0 }, uOff: { value: new THREE.Vector2() }, uAmp: { value: 0.4 }, uWindDir: { value: 0 },
    uHeight: { value: null }, uHOrigin: { value: new THREE.Vector2() }, uHSpan: { value: HSPAN }, uSea: { value: planet.seaLevel },
    uRefl: { value: null }, uReflMat: { value: new THREE.Matrix4() }, uReflOn: { value: 0 }, uCtr: { value: new THREE.Vector2() },
  };
  // the planet's own water (gen/genome.js): blue on most worlds, green, amber, violet, milky or ink on some
  const seaC = planet.climate.sea, V = c => `vec3(${c.map(v => v.toFixed(4)).join(', ')})`, SW = seaC ? { shallow: seaC.shallow.map(v => v * 0.85), mid: seaC.shallow.map((v, i) => (v * 0.3 + seaC.deep[i] * 0.7)), deep: seaC.deep.map(v => v * 0.4) } : { shallow: [0.06, 0.22, 0.2], mid: [0.012, 0.075, 0.09], deep: [0.004, 0.02, 0.035] };
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(...SW.mid.map(v => v * 0.9)), roughness: 0.04, metalness: 0.0, transparent: true, envMapIntensity: 0.25, ...(b ? { normalMap: b.normalMap } : {}) });
  m.normalScale.set(0.16, 0.16);
  const waveGLSL = WAVES.map(([d, L, q], i) => `wave(p, ${d.toFixed(3)} + uWindDir, ${L.toFixed(2)}, ${q.toFixed(3)}, ${(1 / (i + 1.4)).toFixed(3)}, disp, tan, bit);`).join('\n          ');
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      uniform float uTime; uniform vec2 uOff; uniform float uAmp; uniform float uWindDir; uniform sampler2D uHeight; uniform vec2 uHOrigin; uniform float uHSpan; uniform float uSea;
      varying vec2 vSeaXZ; varying float vCrest; float shoal; uniform mat4 uReflMat; varying vec4 vRefl;
      void wave(vec2 p, float dirA, float L, float q, float w, inout vec3 disp, inout vec3 tan, inout vec3 bit) {
        vec2 d = vec2(cos(dirA), sin(dirA)); float k = 6.28318 / L, c = sqrt(9.81 / k), a = uAmp * w * 0.55 * shoal;
        float f = k * (dot(d, p) - c * uTime);
        disp += vec3(d.x * q * a * cos(f), a * sin(f), d.y * q * a * cos(f));
        tan += vec3(-d.x * d.x * k * a * sin(f), d.x * k * a * cos(f), -d.x * d.y * k * a * sin(f));
        bit += vec3(-d.x * d.y * k * a * sin(f), d.y * k * a * cos(f), -d.y * d.y * k * a * sin(f));
      }`)
      .replace('#include <beginnormal_vertex>', `
        vec2 rp = (modelMatrix * vec4(position, 1.0)).xz, p = rp + uOff;
        vec2 hv = (rp - uHOrigin) / uHSpan + 0.5;
        float gnd = (hv.x > 0.0 && hv.x < 1.0 && hv.y > 0.0 && hv.y < 1.0) ? texture2D(uHeight, hv).r : uSea - 60.0;
        shoal = smoothstep(0.0, 6.0, uSea - gnd);                    // waves die down over shallows: water stays off the beach
        vec3 disp = vec3(0.0), tan = vec3(1.0, 0.0, 0.0), bit = vec3(0.0, 0.0, 1.0);
        ${waveGLSL}
        vec3 objectNormal = normalize(cross(bit, tan));
        vCrest = disp.y / max(uAmp * 0.55, 0.03);`)
      .replace('#include <begin_vertex>', `vec3 transformed = position + disp;`)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSeaXZ = (modelMatrix * vec4(transformed, 1.0)).xz; vRefl = uReflMat * modelMatrix * vec4(position, 1.0);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uTime; uniform vec2 uOff; uniform sampler2D uHeight; uniform vec2 uHOrigin; uniform float uHSpan; uniform float uSea;
      uniform sampler2D uRefl; uniform float uReflOn; varying vec4 vRefl; uniform vec2 uCtr;
      varying vec2 vSeaXZ; varying float vCrest; float waterFoam;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 huv = (vSeaXZ - uHOrigin) / uHSpan + 0.5;
        float ground = (huv.x > 0.0 && huv.x < 1.0 && huv.y > 0.0 && huv.y < 1.0) ? texture2D(uHeight, huv).r : uSea - 60.0;
        float depth = max(0.0, uSea - ground);
        vec3 shallow = ${V(SW.shallow)}, mid = ${V(SW.mid)}, deep = ${V(SW.deep)};
        diffuseColor.rgb = mix(shallow, mid, smoothstep(0.5, 4.0, depth));
        diffuseColor.rgb = mix(diffuseColor.rgb, deep, smoothstep(4.0, 30.0, depth));
        float foam = smoothstep(1.35, 1.8, vCrest) * 0.35 + (1.0 - smoothstep(0.0, 0.5, depth)) * step(0.02, depth) * (0.55 + 0.45 * sin(uTime * 1.3 + vSeaXZ.x * 0.4 + vSeaXZ.y * 0.3));
        foam *= smoothstep(0.35, 0.7, texture2D(normalMap, (vSeaXZ + uOff) / 3.0 + uTime * 0.02).r);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.9, 0.92), clamp(foam, 0.0, 1.0));
        diffuseColor.a = clamp(1.0 - 0.6 * exp(-depth * 1.1), 0.0, 1.0) + foam * 0.5;      // see the bottom only in the shallows
        waterFoam = clamp(foam, 0.0, 1.0);`)
      .replace('#include <opaque_fragment>', `
        // the mirror: the world above, seen in the water, rippled by the surface; Fresnel says how much
        if (uReflOn > 0.5) {
          vec3 V = normalize(vViewPosition), Nn = normalize(normal);
          float fres = 0.02 + 0.98 * pow(1.0 - clamp(dot(Nn, V), 0.0, 1.0), 5.0);
          vec2 ruv = vRefl.xy / vRefl.w + Nn.xy * 0.05;
          vec3 refl = texture2D(uRefl, ruv).rgb;
          outgoingLight = mix(outgoingLight, refl, clamp(fres, 0.0, 1.0) * (1.0 - waterFoam) * 0.92);
          diffuseColor.a = max(diffuseColor.a, fres);
        }
        diffuseColor.a *= 1.0 - smoothstep(${(R * 0.55).toFixed(1)}, ${(R * 0.93).toFixed(1)}, length(vSeaXZ - uCtr));      // (the waves give way to the far sea before their square edge: render/water.js far ring)
        #include <opaque_fragment>`)
      .replace('#include <normal_fragment_maps>', `
        vec2 wp = vSeaXZ + uOff;
        vec3 n1 = texture2D(normalMap, wp / 14.0 + vec2(uTime * 0.012, uTime * 0.007)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(normalMap, wp / 5.0 * mat2(0.8, -0.6, 0.6, 0.8) - vec2(uTime * 0.02, -uTime * 0.016)).xyz * 2.0 - 1.0;
        vec2 rip = (n1.xy + n2.xy * 0.7) * normalScale * clamp(1.0 - vViewPosition.z / 2500.0, 0.2, 1.0);
        normal = normalize(normal + (viewMatrix * vec4(rip.x, 0.0, -rip.y, 0.0)).xyz);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.06, 0.6, clamp(foam, 0.0, 1.0));');
  };
  // a grid finest near the camera: vertex spacing grows with distance
  const N = 220, R = 6000, P = [], I = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const map = t => { const v = t * 2 - 1; return Math.sign(v) * Math.pow(Math.abs(v), 2.4) * R; };
    P.push(map(i / N), 0, map(j / N));
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i; I.push(a, a + N + 1, a + 1, a + 1, a + N + 1, a + N + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((N + 1) ** 2 * 2).fill(0), 2)); g.setIndex(I);
  g.computeVertexNormals();
  const sea = new THREE.Mesh(g, m); sea.frustumCulled = false; sea.renderOrder = 1;
  // beyond the waves: the open sea to the horizon, calm at this distance, so from high up the water never ends at an edge
  { const far = new THREE.Mesh(new THREE.RingGeometry(R * 0.55, 160000, 160, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: new THREE.Color(...SW.mid.map(v => v * 0.8)), roughness: 0.12, metalness: 0.1, envMapIntensity: 0.9, fog: false }));      // (no fog: the near water has none either, or the two would meet in a line)
    far.position.y = -0.08; far.frustumCulled = false; far.renderOrder = 0.5; far.receiveShadow = false; sea.add(far); }
  sea.position.y = planet.seaLevel;
  // the ground under the water, around the camera (rebuilt when you've moved a third of its span)
  const hdata = new Float32Array(HM * HM), htex = new THREE.DataTexture(hdata, HM, HM, THREE.RedFormat, THREE.FloatType);
  htex.magFilter = htex.minFilter = THREE.LinearFilter; u.uHeight.value = htex;
  let hAt = null, hRow = HM, hNext = null;
  const bakeRows = (budgetMs) => {           // fill the pending heightmap a few rows per frame
    if (!hNext) return;
    const t0 = performance.now();
    while (hRow < HM && performance.now() - t0 < budgetMs) {
      for (let i = 0; i < HM; i++) hNext.data[hRow * HM + i] = surfaceHeight(planet, hNext.x + (i + 0.5) / HM * HSPAN - HSPAN / 2, hNext.z + (hRow + 0.5) / HM * HSPAN - HSPAN / 2);
      hRow++;
    }
    if (hRow >= HM) { hdata.set(hNext.data); htex.needsUpdate = true; hAt = [hNext.x, hNext.z]; hNext = null; }
  };
  sea.update = (dt, camera, origin, wind) => {
    u.uTime.value += dt; u.uOff.value.set(origin[0], origin[2]);
    const ws = wind ? Math.hypot(wind[0], wind[1]) : 4;
    u.uAmp.value += (0.06 + ws * 0.035 - u.uAmp.value) * Math.min(1, dt * 0.2);   // ~0.1 m on a still day, ~0.5 m in a gale
    if (wind) u.uWindDir.value = Math.atan2(wind[1], wind[0]);
    const S = 16;                                         // snap so the grid doesn't swim
    sea.position.set(Math.round(camera.position.x / S) * S, planet.seaLevel, Math.round(camera.position.z / S) * S); u.uCtr.value.set(sea.position.x, sea.position.z);
    const wx = camera.position.x + origin[0], wz = camera.position.z + origin[2];
    if (!hNext && (!hAt || Math.hypot(wx - hAt[0], wz - hAt[1]) > HSPAN / 3)) { hNext = { x: wx, z: wz, data: new Float32Array(HM * HM) }; hRow = 0; }
    bakeRows(hAt ? 3 : 40);
    u.uHOrigin.value.set(hAt ? hAt[0] - origin[0] : 1e9, hAt ? hAt[1] - origin[2] : 1e9);
  };
  // ---- planar reflection: a mirrored camera renders the world above the water at reduced resolution
  const rt = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType }); let frameN = 0;
  u.uRefl.value = rt.texture;
  const mirror = new THREE.PerspectiveCamera(), clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  sea.renderReflection = (renderer, scene, camera, hide = []) => {
    const h = planet.seaLevel;
    if (!sea.visible) return;                                  // from high up there is no sea plane to mirror anything
    if (camera.position.y < h + 0.3) { u.uReflOn.value = 0; return; }
    // Every other frame is plenty for a reflection; with no water anywhere near, a distant glint can't show whether it's a second old.
    const every = sea.waterNear === false ? 45 : 2;
    if ((frameN++ % every) && u.uReflOn.value) return;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2()), w = Math.max(256, Math.round(size.x * 0.4)), ht = Math.max(256, Math.round(size.y * 0.4));
    if (rt.width !== w || rt.height !== ht) rt.setSize(w, ht);
    mirror.copy(camera);
    mirror.position.set(camera.position.x, 2 * h - camera.position.y, camera.position.z);
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = -dir.y;
    mirror.up.set(0, 1, 0); mirror.lookAt(mirror.position.clone().add(dir));
    mirror.projectionMatrix.copy(camera.projectionMatrix); mirror.updateMatrixWorld();
    u.uReflMat.value.copy(bias).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
    clip.constant = -h + 0.05;
    const was = hide.map(o => o.visible), oldClip = renderer.clippingPlanes, oldTarget = renderer.getRenderTarget(), oldShadow = renderer.shadowMap.autoUpdate;
    sea.visible = false; hide.forEach(o => { o.visible = false; });
    renderer.clippingPlanes = [clip]; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, mirror);
    renderer.setRenderTarget(oldTarget); renderer.clippingPlanes = oldClip; renderer.shadowMap.autoUpdate = oldShadow;
    sea.visible = true; hide.forEach((o, i) => { o.visible = was[i]; });
    u.uReflOn.value = 1;
  };
  return sea;
}
