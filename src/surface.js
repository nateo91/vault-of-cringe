// World-space surface detail for static scenery: breaks up flat colors with grime, roughness variation,
// rain streaks on walls and a fine bump, so a plain box reads as concrete/stone/metal instead of plastic.
// Patches MeshStandardMaterial via onBeforeCompile; one shared program per variant.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
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

// Weapon wear: object-space (so it sticks to the gun as it moves) fine scratches along the barrel axis,
// handling grime, and brighter, polished edges where the bevels are (screen-space curvature).
export function addWear(m, { scratches = 1, edges = 1 } = {}) {
  if ((G.settings.quality || 'high') === 'low') return m;
  const metal = m.metalness > 0.4 ? 1 : 0;
  const key = `wear-${metal}-${scratches}-${edges}`;
  m.customProgramCacheKey = () => key;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurfPos; varying vec3 vSurfN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vSurfPos = transformed; vSurfN = objectNormal;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NOISE)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float wGrime = sd_fbm(vSurfPos * 38.0);
        float wScr = smoothstep(0.78, 0.95, sd_n(vec3(vSurfPos.x * 900.0, vSurfPos.y * 900.0, vSurfPos.z * 14.0))) * ${(0.9 * scratches).toFixed(2)};
        #ifdef FLAT_SHADED
          float wCurv = 0.0;
        #else
          float wCurv = clamp(length(fwidth(vNormal)) * 3.0, 0.0, 1.0);
        #endif
        float wEdge = smoothstep(0.12, 0.5, wCurv) * ${(1.0 * edges).toFixed(2)} * (0.6 + 0.4 * wGrime);
        diffuseColor.rgb *= 0.86 + 0.24 * wGrime;
        ${metal ? 'diffuseColor.rgb = mix(diffuseColor.rgb, max(diffuseColor.rgb * 1.6, vec3(0.55, 0.53, 0.5)), clamp(wEdge * 0.7 + wScr * 0.5, 0.0, 1.0));'
                : 'diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.45 + 0.04, clamp(wEdge * 0.5, 0.0, 1.0));'}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (0.8 + 0.45 * wGrime) - wEdge * ${metal ? '0.22' : '0.08'} - wScr * 0.12, 0.08, 1.0);`);
  };
  return m;
}

// Rounded box for small hard-surface parts (guns, gear): ~15% bevel, never smaller than looks sensible
export function bevelBox(w, h, d) {
  const r = Math.min(w, h, d) * 0.18;
  return (G.settings.quality || 'high') === 'low' || r < 0.0015 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 2, r);
}

// Characters: object-space so it rides along with the animation. Cloth/skin get a fine weave + mottling;
// stone (flat-shaded, rough) gets real bumps and cracks.
export function addCharacterDetail(m, { stone = false } = {}) {
  if ((G.settings.quality || 'high') === 'low') return m;
  const key = `char-${stone ? 1 : 0}`;
  m.customProgramCacheKey = () => key;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurfPos; varying vec3 vSurfN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vSurfPos = transformed; vSurfN = objectNormal;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NOISE)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float cMac = sd_fbm(vSurfPos * ${stone ? '5.0' : '3.0'});
        ${stone ? `float cCrack = (1.0 - smoothstep(0.0, 0.035, abs(sd_n(vSurfPos * 6.0) - 0.5))) * smoothstep(0.35, 0.65, sd_n(vSurfPos * 2.3 + 7.0));
        diffuseColor.rgb *= (0.8 + 0.36 * cMac) * (1.0 - cCrack * 0.35);`
        : 'diffuseColor.rgb *= 0.9 + 0.2 * cMac;'}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (0.85 + 0.3 * cMac), 0.05, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float cH = ${stone ? 'sd_fbm(vSurfPos * 9.0) + cCrack * 0.6' : 'sd_n(vSurfPos * 160.0) * 0.5 + sd_n(vSurfPos * 24.0) * 0.5'};
          float cFade = smoothstep(${stone ? '30.0, 3.0' : '9.0, 1.5'}, length(vViewPosition)) * ${stone ? '0.012' : '0.0035'};
          vec2 dHdxy = vec2(dFdx(cH), dFdy(cH)) * cFade;
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
          vec3 R1 = cross(sy, normal), R2 = cross(normal, sx);
          float det = dot(sx, R1) * faceDirection;
          normal = normalize(abs(det) * normal - sign(det) * (dHdxy.x * R1 + dHdxy.y * R2));
        }`);
  };
  return m;
}
