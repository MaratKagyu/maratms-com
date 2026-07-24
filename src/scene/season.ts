import { lerp, lerpColor } from "./color";

export type SeasonState = {
  grass: number;
  grassShade: number;
  leaf: number;
  /** 0 = bare branches, 1 = full canopy. */
  leafDensity: number;
  /** 0..1 ground + tree snow coverage. */
  snow: number;
  /** -1 (short winter days) .. +1 (long summer days). */
  daylight: number;
};

type Stop = SeasonState & { t: number };

// Keyframes across the year by continuous month (0 = Jan .. 12 wraps to Jan),
// northern hemisphere.
const STOPS: Stop[] = [
  { t: 0, grass: 0xdfe7ea, grassShade: 0xc3d0d4, leaf: 0x9bbf6a, leafDensity: 0, snow: 0.9, daylight: -1 },
  { t: 2, grass: 0xcdd6cf, grassShade: 0xb4c1bb, leaf: 0x9bbf6a, leafDensity: 0, snow: 0.5, daylight: -0.5 },
  { t: 3.3, grass: 0x86c05a, grassShade: 0x6fa347, leaf: 0x9ccf5e, leafDensity: 0.5, snow: 0.1, daylight: 0.05 },
  { t: 5, grass: 0x6ab04c, grassShade: 0x548f3a, leaf: 0x6fae3f, leafDensity: 1, snow: 0, daylight: 1 },
  { t: 7, grass: 0x74a84a, grassShade: 0x5c8c39, leaf: 0x6fae3f, leafDensity: 1, snow: 0, daylight: 0.6 },
  { t: 8.7, grass: 0x8f9a3f, grassShade: 0x74801f, leaf: 0xd7a53a, leafDensity: 0.85, snow: 0, daylight: 0.1 },
  { t: 9.7, grass: 0xa6852f, grassShade: 0x876a22, leaf: 0xe08a2e, leafDensity: 0.6, snow: 0, daylight: -0.2 },
  { t: 10.6, grass: 0x8a7b53, grassShade: 0x6f6240, leaf: 0xb56a2a, leafDensity: 0.15, snow: 0.1, daylight: -0.6 },
  { t: 11.3, grass: 0xd0dade, grassShade: 0xb6c3c8, leaf: 0xb56a2a, leafDensity: 0, snow: 0.7, daylight: -0.9 },
  { t: 12, grass: 0xdfe7ea, grassShade: 0xc3d0d4, leaf: 0x9bbf6a, leafDensity: 0, snow: 0.9, daylight: -1 },
];

export function computeSeason(month: number): SeasonState {
  const t = ((month % 12) + 12) % 12;
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
    grass: lerpColor(a.grass, b.grass, f),
    grassShade: lerpColor(a.grassShade, b.grassShade, f),
    leaf: lerpColor(a.leaf, b.leaf, f),
    leafDensity: lerp(a.leafDensity, b.leafDensity, f),
    snow: lerp(a.snow, b.snow, f),
    daylight: lerp(a.daylight, b.daylight, f),
  };
}
