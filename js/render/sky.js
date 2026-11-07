// Physical sky (Preetham scattering), sun light + shadow that follow the player,
// image-based lighting regenerated from the sky as the sun moves, fog tinted to the
// horizon, and stars at night. The sun's position is computed from planet time.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { solarHour } from '../sim/clock.js';
import { Rng } from '../core/prng.js';
import { derive } from '../core/hash.js';

export function sunDirection(planet, t) {
  const H = (solarHour(planet, t) - 12) / 24 * Math.PI * 2;
  const decl = planet.axialTilt * Math.sin(t / planet.yearLength * Math.PI * 2);
  const lat = planet.latHere ?? planet.latitude;
  const el = Math.asin(Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) + (planet.turnHere || 0);
  return { el, az, dir: new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize() };
}

export class SkySystem {
  constructor(renderer, scene, planet) {
    this.renderer = renderer; this.scene = scene; this.planet = planet;
    this.sky = new Sky(); this.sky.scale.setScalar(45000); this.sky.renderOrder = -1;
    const u = this.sky.material.uniforms, A = planet.atmosphere;
    u.turbidity.value = A.turbidity; u.rayleigh.value = A.rayleigh; u.mieCoefficient.value = A.mie; u.mieDirectionalG.value = 0.8;
    this.sky.material.uniforms.uFade = { value: 1 };
    this.sky.material.uniforms.uHigh = { value: 0 }; this.sky.material.uniforms.uDip = { value: 0 }; this.sky.material.uniforms.uLit = { value: 1 };
    // Seen from high up you look down past the horizon, where this sky model is at its brightest. Up there the air is a thin band: pale at the planet's edge, deep blue above it.
    this.sky.material.fragmentShader = 'uniform float uFade, uHigh, uDip, uLit;\n' + this.sky.material.fragmentShader.replace('#include <tonemapping_fragment>', `
      { vec3 vd = normalize(vWorldPosition - cameraPosition); float a = clamp((vd.y + uDip) / (uDip + 0.3), 0.0, 1.0);
        vec3 thin = mix(vec3(0.5, 0.66, 0.95), mix(vec3(0.1, 0.22, 0.56), vec3(0.015, 0.035, 0.11), a), pow(a, 0.4)) * uLit;
        // Even from the ground this sky model is washed out overhead. Real skies deepen quickly going up from the haze at the horizon; the sun's glow is left alone.
        float up = clamp(vd.y, 0.0, 1.0), lum = dot(gl_FragColor.rgb, vec3(0.3, 0.59, 0.11)); vec3 sat = mix(vec3(lum), gl_FragColor.rgb, 1.0 + 0.55 * smoothstep(0.0, 0.3, up));
        vec3 deep = sat * mix(1.0, 0.56, smoothstep(0.03, 0.7, up));
        // This model's glow towards the sun has no ceiling and floods half the sky. Only near the sun itself is it allowed to be that bright, and less so the higher you are (less air to scatter it).
        { float glow = pow(max(dot(vd, vSunDirection), 0.0), 90.0), cap = mix(1.5, 0.62, uHigh) + 14.0 * glow, L = dot(deep, vec3(0.3, 0.59, 0.11)); if (L > cap) deep *= cap / L; }
        gl_FragColor.rgb = mix(deep, thin, uHigh) * uFade; }
      #include <tonemapping_fragment>`);
    scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const sc = this.sun.shadow;
    sc.mapSize.set(4096, 4096); sc.bias = -0.0004; sc.normalBias = 0.04;
    const R = 70; Object.assign(sc.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 600 });
    scene.add(this.sun, this.sun.target);
    this.ambient = new THREE.HemisphereLight(0x8fa6c4, 0x3a3226, 0.0);
    scene.add(this.ambient);

    // stars
    const rng = new Rng(derive(planet.seed, 'stars'));
    const n = 4000, p = new Float32Array(n * 3), c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const z = rng.range(-0.2, 1), r = Math.sqrt(1 - z * z), a = rng.range(0, Math.PI * 2);
      p.set([r * Math.cos(a) * 40000, z * 40000, r * Math.sin(a) * 40000], i * 3);
      const b = Math.pow(rng.next(), 6) * 2 + 0.15, warm = rng.next();
      c.set([b * (0.85 + 0.15 * warm), b * 0.9, b * (1 - 0.2 * warm)], i * 3);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(p, 3)); sg.setAttribute('color', new THREE.BufferAttribute(c, 3));
    this.starMat = new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, fog: false });
    this.stars = new THREE.Points(sg, this.starMat); this.stars.renderOrder = -1;
    { const below = new THREE.Points(sg, this.starMat); below.scale.y = -1; below.renderOrder = -1; below.rotation.y = 1.7; this.stars.add(below); }     // (from the ground the land's in the way of these)
    scene.add(this.stars);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene(); this.envSky = new Sky(); this.envSky.scale.setScalar(1000);
    Object.assign(this.envSky.material.uniforms.turbidity, { value: A.turbidity });
    this.envSky.material.uniforms.rayleigh.value = A.rayleigh; this.envSky.material.uniforms.mieCoefficient.value = A.mie;
    this.envScene.add(this.envSky);
    this.envRT = null; this.lastEnvDir = null;
    scene.fog = new THREE.FogExp2(0xa0b0c0, 0.00012);
    this.state = {};
  }

  update(t, focus, cameraPos, w = null, alt = 0) {        // w: weather (gen/weather.js) — overcast dims the sun and thickens the air
    const { el, dir } = sunDirection(this.planet, t);
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(dir);
    this.sky.position.copy(cameraPos);
    this.stars.position.copy(cameraPos);
    const day = THREE.MathUtils.smoothstep(el, -0.12, 0.08);           // 0 night .. 1 day
    const low = 1 - THREE.MathUtils.smoothstep(el, 0.02, 0.35);        // golden hour warmth
    // sun light: warm and weak near the horizon, off below it; a dim blue moonlight at night
    const sunCol = new THREE.Color().setRGB(1, 0.93 - 0.35 * low, 0.85 - 0.6 * low);
    const lightDir = el > -0.05 ? dir : new THREE.Vector3(-dir.x, Math.abs(dir.y) + 0.4, -dir.z).normalize();
    this.sun.color.copy(el > -0.05 ? sunCol : new THREE.Color(0.55, 0.65, 0.9));
    const cover = w ? w.cloud : 0;
    this.sun.intensity = (el > -0.05 ? 4.6 * THREE.MathUtils.smoothstep(el, -0.05, 0.12) : 0.45) * (1 - 0.72 * THREE.MathUtils.smoothstep(cover, 0.45, 0.95));
    const snap = 70 * 2 / 4096;
    const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + lightDir.x * 300, focus.y + lightDir.y * 300, fz + lightDir.z * 300);
    this.ambient.intensity = 0.05 + 0.55 * (1 - day) + day * (0.2 + 0.25 * THREE.MathUtils.smoothstep(cover, 0.4, 0.95)) + 0.75 * low * day;     // (a low sun lights the whole sky: the shadows are open, not black)   // (the open sky lights whatever the sun doesn't reach: shade is never black by day)
    const space = THREE.MathUtils.smoothstep(alt, 18000, 70000);
    this.starMat.opacity = Math.max(1 - THREE.MathUtils.smoothstep(el, -0.2, 0.0), THREE.MathUtils.smoothstep(alt, 32000, 80000));
    this.sky.material.uniforms.uFade.value = 1 - space;
    u.uHigh.value = THREE.MathUtils.smoothstep(alt, 400, 4200); u.uDip.value = Math.sqrt(Math.max(0, 2 * alt / 6.5e6)); u.uLit.value = day * (1 - 0.8 * THREE.MathUtils.smoothstep(alt, 9000, 50000));
    this.stars.rotation.y = (t / this.planet.dayLength) * Math.PI * 2;
    // fog: horizon colour by day, deep blue by night
    const fogDay = new THREE.Color(0.66, 0.74, 0.84).lerp(new THREE.Color(0.85, 0.62, 0.45), low * 0.6);
    fogDay.lerp(new THREE.Color(0.58, 0.6, 0.63), THREE.MathUtils.smoothstep(cover, 0.5, 1.0) * 0.8);   // grey under overcast
    fogDay.lerp(new THREE.Color(0.42, 0.55, 0.78), THREE.MathUtils.smoothstep(alt, 300, 3000) * 0.72);    // (from up high, haze is the colour of the sky behind it, or far towers glow white against it)
    const fog = new THREE.Color(0.012, 0.016, 0.03).lerp(fogDay, day);
    this.scene.fog.color.copy(fog);
    this.scene.fog.density = (0.00009 + 0.00006 * this.planet.atmosphere.turbidity / 6) * (1 + 2.5 * (w ? w.rain : 0)) * Math.exp(-Math.max(0, alt) / 7000);
    this.renderer.toneMappingExposure = 0.7 - 0.1 * day;
    // regenerate the environment map when the sun has moved noticeably
    if (!this.lastEnvDir || this.lastEnvDir.angleTo(dir) > 0.02) {
      this.envSky.material.uniforms.sunPosition.value.copy(dir);
      const old = this.envRT;
      this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 2000);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = 0.08 + 0.42 * day;
      old?.dispose();
      this.lastEnvDir = dir.clone();
    }
    this.state = { el, day, dir: dir.clone(), sunColor: this.sun.color.clone() };
    return this.state;
  }
}
