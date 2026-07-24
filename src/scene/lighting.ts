import { lerp, lerpColor } from "./color";

export type Lighting = {
  skyTop: number;
  skyBottom: number;
  /** Full-scene tint overlay (warm at golden hour, dark at night). */
  gradeColor: number;
  gradeAlpha: number;
  celestial: "sun" | "moon";
  celestialX: number;
  celestialY: number;
  celestialColor: number;
  starAlpha: number;
};

type Stop = {
  t: number;
  skyTop: number;
  skyBottom: number;
  gradeColor: number;
  gradeAlpha: number;
  starAlpha: number;
};

// Keyframes across the day; values are interpolated between neighbours.
const STOPS: Stop[] = [
  { t: 0, skyTop: 0x0b1026, skyBottom: 0x1b2340, gradeColor: 0x0a1030, gradeAlpha: 0.55, starAlpha: 1 },
  { t: 5, skyTop: 0x1d2748, skyBottom: 0x4a4a6a, gradeColor: 0x101838, gradeAlpha: 0.45, starAlpha: 0.6 },
  { t: 6.5, skyTop: 0x3a5a8c, skyBottom: 0xe9a35c, gradeColor: 0xff8a3d, gradeAlpha: 0.18, starAlpha: 0 },
  { t: 8, skyTop: 0x4f86c0, skyBottom: 0xd7ebf5, gradeColor: 0x000000, gradeAlpha: 0, starAlpha: 0 },
  { t: 12, skyTop: 0x5b9bd5, skyBottom: 0xcfe6f2, gradeColor: 0x000000, gradeAlpha: 0, starAlpha: 0 },
  { t: 17, skyTop: 0x5b93c8, skyBottom: 0xdfeaf0, gradeColor: 0xffe0a0, gradeAlpha: 0.06, starAlpha: 0 },
  { t: 19, skyTop: 0x3f5a8f, skyBottom: 0xf1854a, gradeColor: 0xff7a2d, gradeAlpha: 0.22, starAlpha: 0 },
  { t: 20.5, skyTop: 0x24305c, skyBottom: 0x6b4a6e, gradeColor: 0x241848, gradeAlpha: 0.4, starAlpha: 0.35 },
  { t: 22, skyTop: 0x0d1330, skyBottom: 0x1b2340, gradeColor: 0x0a1030, gradeAlpha: 0.52, starAlpha: 1 },
  { t: 24, skyTop: 0x0b1026, skyBottom: 0x1b2340, gradeColor: 0x0a1030, gradeAlpha: 0.55, starAlpha: 1 },
];

function interpStops(t: number) {
  let a = STOPS[0];
  let b = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (t >= STOPS[i].t && t <= STOPS[i + 1].t) {
      a = STOPS[i];
      b = STOPS[i + 1];
      break;
    }
  }
  const f = (t - a.t) / (b.t - a.t || 1);
  return {
    skyTop: lerpColor(a.skyTop, b.skyTop, f),
    skyBottom: lerpColor(a.skyBottom, b.skyBottom, f),
    gradeColor: lerpColor(a.gradeColor, b.gradeColor, f),
    gradeAlpha: lerp(a.gradeAlpha, b.gradeAlpha, f),
    starAlpha: lerp(a.starAlpha, b.starAlpha, f),
  };
}

const SUN_UP = 6.3;
const SUN_DOWN = 19.7;

export function computeLighting(t: number, worldW: number, horizonY: number): Lighting {
  const s = interpStops(t);

  // Sun during the day, moon otherwise; both arc left -> right across the sky.
  let celestial: "sun" | "moon";
  let frac: number;
  if (t >= SUN_UP && t <= SUN_DOWN) {
    celestial = "sun";
    frac = (t - SUN_UP) / (SUN_DOWN - SUN_UP);
  } else {
    celestial = "moon";
    const nt = t < SUN_UP ? t + 24 : t;
    frac = (nt - SUN_DOWN) / (24 + SUN_UP - SUN_DOWN);
  }

  const elevation = Math.sin(frac * Math.PI); // 0 at horizon, 1 at peak
  const x = lerp(worldW * 0.08, worldW * 0.92, frac);
  const y = horizonY - 30 - elevation * ((horizonY - 40) * 0.7);
  const color =
    celestial === "sun" ? lerpColor(0xff7a3d, 0xfff4c2, elevation) : 0xeef2ff;

  return {
    skyTop: s.skyTop,
    skyBottom: s.skyBottom,
    gradeColor: s.gradeColor,
    gradeAlpha: s.gradeAlpha,
    celestial,
    celestialX: x,
    celestialY: y,
    celestialColor: color,
    starAlpha: s.starAlpha,
  };
}
