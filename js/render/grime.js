// Weathering for materials that would otherwise be one flat colour: dirt that gathers low down,
// grime in soft patches, rust if it's metal, and a roughness that isn't uniform. World-space noise,
// so no two instances of a model wear the same way, and no extra textures to load.
export function weather(m, { dirt = 0.5, rust = 0, ground = true } = {}) {
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n varying vec3 vWP; varying float vLY;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vWP = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz; vLY = position.y;
        #else
          vWP = (modelMatrix * vec4(position, 1.0)).xyz; vLY = position.y;
        #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vWP; varying float vLY; float gRough;
        float gh(vec3 p) { p = fract(p * 0.3183 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float gn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(gh(i), gh(i + vec3(1, 0, 0)), f.x), mix(gh(i + vec3(0, 1, 0)), gh(i + vec3(1, 1, 0)), f.x), f.y), mix(mix(gh(i + vec3(0, 0, 1)), gh(i + vec3(1, 0, 1)), f.x), mix(gh(i + vec3(0, 1, 1)), gh(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        { float big = gn(vWP * 1.3), fine = gn(vWP * 9.0), streak = gn(vec3(vWP.x * 7.0, vWP.y * 0.8, vWP.z * 7.0));
          float low = ${ground ? 'smoothstep(0.7, 0.0, vLY) * 0.5' : '0.0'};
          float d = clamp((big * 0.7 + streak * 0.5 - 0.42) * 1.4 + low, 0.0, 1.0) * ${dirt.toFixed(2)};
          diffuseColor.rgb *= 1.0 - d * 0.62; diffuseColor.rgb *= 0.92 + 0.16 * fine;
          ${rust ? `float r = smoothstep(0.62, 0.8, big * 0.6 + fine * 0.45) * ${rust.toFixed(2)}; diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.27, 0.13, 0.07) * (0.7 + 0.6 * fine), r);` : ''}
          gRough = d * 0.35 + (fine - 0.5) * 0.14${rust ? ' + r * 0.4' : ''}; }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n roughnessFactor = clamp(roughnessFactor + gRough, 0.04, 1.0);`);
  };
  m.customProgramCacheKey = () => `orbis-grime-${dirt}-${rust}-${ground}`;
  return m;
}
