import { Container, Geometry, Graphics, Mesh, Shader } from "pixi.js";
import { clamp01, lerpColor } from "./color";
import type { Lighting } from "./lighting";
import type { WeatherState } from "./weather";

/**
 * Living water, shaded per-pixel by a fragment shader (GLSL — the app forces
 * the WebGL renderer): a sky reflection that deepens toward the shore,
 * posterized wave shimmer driven by wind, a glinting sun/moon specular path
 * with wave wobble, daytime sparkles, a foam line along the grass edge.
 * The shore silhouette is computed analytically in the shader, so the mesh
 * is just one quad. A flat polygon stays underneath as a safety backdrop.
 */
export type Water = {
  update: (dtMs: number, L: Lighting, w: WeatherState) => void;
};

const VERT = /* glsl */ `
  in vec2 aPosition;
  out vec2 vPos;

  uniform mat3 uProjectionMatrix;
  uniform mat3 uWorldTransformMatrix;
  uniform mat3 uTransformMatrix;

  void main() {
    mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
    gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
    vPos = aPosition;
  }
`;

const FRAG = /* glsl */ `
  in vec2 vPos;
  out vec4 finalColor;

  uniform float uTime;
  uniform float uWaveT;  // wave phase, integrated on the CPU
  uniform float uScroll; // wind drift, integrated on the CPU
  uniform float uHorizon;
  uniform float uBottom;
  uniform float uWorldW;
  uniform vec3 uSeaCol;
  uniform vec3 uSkyTop;
  uniform vec3 uSkyBottom;
  uniform vec3 uCelCol;
  uniform vec2 uCel;    // x: celestial world x, y: path glow 0..1
  uniform float uWind;  // -1..1
  uniform float uGlint; // sparkle strength 0..1

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    float x = vPos.x;
    float y = vPos.y;
    float shore = 560.0 + 30.0 * sin(x / 300.0) + 60.0 * (x / uWorldW);
    float edge = shore - y;          // px above the grass line
    if (edge < 0.0) discard;
    float t01 = clamp((y - uHorizon) / (uBottom - uHorizon), 0.0, 1.0);

    // Waves: two octaves of scrolling noise, compressed toward the horizon
    // for perspective, driven along x by the wind. Phases arrive integrated
    // from the CPU — multiplying absolute time by a changing wind factor
    // would make the shimmer race whenever the weather shifts the wind.
    float stretch = mix(0.55, 0.16, t01);
    vec2 p1 = vec2(x * 0.020 - uScroll * 1.1, y * stretch * 0.55 - uWaveT * 0.7);
    vec2 p2 = vec2(x * 0.055 + uScroll * 1.9, y * stretch * 1.25 + uWaveT);
    float n = noise(p1) * 0.65 + noise(p2) * 0.35;

    // Sky reflection: low sky at the horizon, higher sky toward the viewer,
    // broken up by the waves.
    float refT = clamp(t01 * 0.85 + (n - 0.5) * 0.3, 0.0, 1.0);
    vec3 col = mix(uSeaCol, mix(uSkyBottom, uSkyTop, refT), 0.30 - t01 * 0.12);

    // Posterized shimmer: two hard tone steps read as flat-vector water.
    float windK = 0.45 + 0.55 * abs(uWind);
    vec3 lightCol = mix(col, vec3(1.0), 0.55);
    col = mix(col, lightCol, (step(0.74, n) * 0.16 + step(0.87, n) * 0.14) * windK);
    col *= 1.0 - step(n, 0.16) * 0.06; // shallow troughs

    // Specular path under the sun / moon, wobbling with the waves and
    // broken into glints; quantized to keep the toon look.
    float spreadW = (9.0 + t01 * t01 * 130.0) * (1.0 + 0.35 * abs(uWind));
    float wob = (noise(vec2(y * 0.11, uTime * 0.8)) - 0.5) * spreadW * 1.5;
    float d = abs(x - uCel.x + wob);
    float spec = exp(-(d * d) / (spreadW * spreadW) * 3.0);
    spec *= smoothstep(0.30, 0.72, noise(vec2(x * 0.045, y * 0.5 - uTime * 1.2)) * 0.55 + n * 0.45);
    spec *= uCel.y * (1.0 - t01 * 0.30);
    spec = floor(spec * 3.0 + 0.5) / 3.0;
    col = mix(col, uCelCol, clamp(spec, 0.0, 1.0) * 0.9);

    // Scattered daytime sparkles.
    float nz = noise(vec2(x * 0.7 + uTime * 0.55, y * 0.7 - uTime * 0.4));
    col = mix(col, vec3(1.0), smoothstep(0.945, 0.995, nz) * uGlint * 0.7);

    // Foam along the grass edge, and a bright hairline at the horizon.
    float foam = smoothstep(7.0, 1.5, edge) * (0.5 + 0.5 * sin(uTime * 1.7 + x * 0.055));
    col = mix(col, lightCol, foam * 0.3);
    col = mix(col, mix(col, vec3(1.0), 0.4), smoothstep(3.0, 0.0, y - uHorizon) * 0.55);

    finalColor = vec4(col, 1.0) * smoothstep(0.0, 1.5, edge);
  }
`;

const toRGB = (hex: number, out: Float32Array) => {
  out[0] = ((hex >> 16) & 0xff) / 255;
  out[1] = ((hex >> 8) & 0xff) / 255;
  out[2] = (hex & 0xff) / 255;
};

export function createWater(
  root: Container,
  W: number,
  horizonY: number,
  shoreY: (x: number) => number,
): Water {
  const view = new Container();
  view.zIndex = 30;
  root.addChild(view);

  // Flat backdrop under the shader (also the fallback if it ever fails).
  const base = new Graphics();
  view.addChild(base);
  const SAMPLE = 40;
  const seaPts: number[] = [0, horizonY];
  for (let x = 0; x <= W; x += SAMPLE) seaPts.push(x, shoreY(x));
  seaPts.push(W, horizonY);

  const BOTTOM = 662;
  const seaColArr = new Float32Array(3);
  const skyTopArr = new Float32Array(3);
  const skyBottomArr = new Float32Array(3);
  const celColArr = new Float32Array(3);

  let uniforms: Record<string, number | Float32Array> | null = null;
  try {
    const shader = Shader.from({
      gl: { vertex: VERT, fragment: FRAG },
      resources: {
        water: {
          uTime: { value: 0, type: "f32" },
          uWaveT: { value: 0, type: "f32" },
          uScroll: { value: 0, type: "f32" },
          uHorizon: { value: horizonY, type: "f32" },
          uBottom: { value: BOTTOM, type: "f32" },
          uWorldW: { value: W, type: "f32" },
          uSeaCol: { value: seaColArr, type: "vec3<f32>" },
          uSkyTop: { value: skyTopArr, type: "vec3<f32>" },
          uSkyBottom: { value: skyBottomArr, type: "vec3<f32>" },
          uCelCol: { value: celColArr, type: "vec3<f32>" },
          uCel: { value: new Float32Array([0, 0]), type: "vec2<f32>" },
          uWind: { value: 0, type: "f32" },
          uGlint: { value: 0, type: "f32" },
        },
      },
    });
    const geometry = new Geometry({
      attributes: {
        aPosition: [0, horizonY, W, horizonY, W, BOTTOM, 0, BOTTOM],
      },
      indexBuffer: [0, 1, 2, 0, 2, 3],
    });
    view.addChild(new Mesh({ geometry, shader }));
    uniforms = shader.resources.water.uniforms;
  } catch (e) {
    // Keep the flat backdrop; the scene stays functional without the shader.
    console.warn("water shader unavailable", e);
  }

  let t = 0;
  let waveT = 0;
  let scroll = 0;
  let lastBase = -1;

  const update = (dtMs: number, L: Lighting, w: WeatherState) => {
    const dt = Math.min(dtMs / 1000, 0.1);
    t += dt;
    // Integrate wind-dependent phases so a changing wind alters the speed
    // from now on instead of rescaling the whole elapsed timeline.
    waveT += dt * (0.25 + Math.abs(w.wind) * 0.9);
    scroll += dt * w.wind;

    // Base colour follows the sky, darkened with the grade so it never greys.
    const dark = clamp01(L.gradeAlpha * 1.6);
    const seaCol = lerpColor(lerpColor(0x4f9ec4, 0x1f4260, dark), L.skyBottom, 0.2);
    if (seaCol !== lastBase) {
      lastBase = seaCol;
      base.clear();
      base.poly(seaPts).fill({ color: seaCol });
    }
    if (!uniforms) return;

    toRGB(seaCol, seaColArr);
    toRGB(L.skyTop, skyTopArr);
    toRGB(L.skyBottom, skyBottomArr);
    toRGB(
      L.celestial === "moon" ? 0xeef4ff : lerpColor(L.celestialColor, 0xffffff, 0.15),
      celColArr,
    );

    const elevation = 1 - (L.celestialY - 40) / (horizonY - 70);
    const lowSun = clamp01(1 - elevation * 1.15);
    const glow =
      (L.celestial === "moon" ? 0.35 + 0.55 * L.starAlpha : 0.18 + 0.7 * lowSun) *
      (1 - w.cloud * 0.85);

    uniforms.uTime = t;
    uniforms.uWaveT = waveT;
    uniforms.uScroll = scroll;
    (uniforms.uCel as Float32Array)[0] = L.celestialX;
    (uniforms.uCel as Float32Array)[1] = glow;
    uniforms.uWind = w.wind;
    uniforms.uGlint = clamp01(1 - L.gradeAlpha * 2.2) * (1 - w.cloud * 0.8);
  };

  return { update };
}
