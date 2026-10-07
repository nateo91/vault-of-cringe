// World-space surface detail for static scenery: breaks up flat colors with grime, roughness variation,
// rain streaks on walls and a fine bump, so a plain box reads as concrete/stone/metal instead of plastic.
// Patches MeshStandardMaterial via onBeforeCompile; one shared program per variant.
import { G } from './game.js';

const NOISE = /* glsl */`
  varying vec3 vSurfPos; varying vec3 vSurfN;
  float sd_h(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float sd_n(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(sd_h(i), sd_h(i + vec3(1, 0, 0)), f.x), mix(sd_h(i + vec3(0, 1, 0)), sd_h(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(sd_h(i + vec3(0, 0, 1)), sd_h(i + vec3(1, 0, 1)), f.x), mix(sd_h(i + vec3(0, 1, 1)), sd_h(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float sd_fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * sd_n(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
`;

export function addSurfaceDetail(m, { strength = 1, bump = 1, scale = 1 } = {}) {
  if ((G.settings.quality || 'high') === 'low') return m;
  m.userData.surface = true;
  const key = `surf-${strength}-${bump}-${scale}`;
  m.customProgramCacheKey = () => key;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurfPos; varying vec3 vSurfN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 sdW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          sdW = instanceMatrix * sdW;
        #endif
        vSurfPos = (modelMatrix * sdW).xyz;
        vSurfN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NOISE)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 sdP = vSurfPos * ${(0.22 * scale).toFixed(3)};
        float sdMacro = sd_fbm(sdP), sdMid = sd_fbm(sdP * 6.0);
        float sdVert = 1.0 - abs(normalize(vSurfN).y);
        // grime + colour drift, then rain/drip streaks on vertical faces
        float sdStreak = sd_n(vec3(vSurfPos.x * 2.6, vSurfPos.y * 0.12, vSurfPos.z * 2.6)) * sdVert;
        float sdK = ${(0.42 * strength).toFixed(3)};
        diffuseColor.rgb *= 1.0 + sdK * ((sdMacro - 0.5) * 0.5 + (sdMid - 0.5) * 0.22 - smoothstep(0.55, 0.9, sdStreak) * 0.3);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (1.0 + ${(0.5 * strength).toFixed(3)} * (sdMid - 0.5) + ${(0.3 * strength).toFixed(3)} * (sdMacro - 0.5)), 0.05, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // fine bump from the noise height, via screen-space derivatives; fades out with distance so it never shimmers
          float sdH = sd_fbm(vSurfPos * 2.2) * 0.7 + sd_n(vSurfPos * 7.0) * 0.3;
          float sdFade = smoothstep(26.0, 3.0, length(vViewPosition)) * ${(0.006 * bump).toFixed(4)};
          vec2 dHdxy = vec2(dFdx(sdH), dFdy(sdH)) * sdFade;
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
          vec3 R1 = cross(sy, normal), R2 = cross(normal, sx);
          float det = dot(sx, R1) * faceDirection;
          vec3 grad = sign(det) * (dHdxy.x * R1 + dHdxy.y * R2);
          normal = normalize(abs(det) * normal - grad);
        }`);
  };
  return m;
}
