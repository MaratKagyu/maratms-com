import { Graphics } from "pixi.js";
import { clamp01, lerpColor } from "./color";
import type { SeasonState } from "./season";
import { chance, mulberry32, range } from "./rng";

/**
 * Meadow detail that keeps the ground from reading as a flat fill: seeded
 * grass tufts (denser and larger toward the viewer, parted around the path),
 * soft tone patches, and wildflowers in late spring and summer. Everything
 * is static geometry redrawn only when the season bucket changes; colours
 * derive from the current grass colour, so the meadow yellows in autumn and
 * vanishes under snow — except for a few dry stalks poking through.
 */
export type GroundDetail = {
  view: Graphics;
  setSeason: (s: SeasonState, month: number) => void;
};

type Tuft = {
  x: number;
  y: number;
  sc: number;
  tone: number;
  dry: boolean;
  blades: { a: number; len: number }[];
};

export function createGroundDetail(
  W: number,
  H: number,
  grassTopY: (x: number) => number,
  pathY: (x: number) => number,
): GroundDetail {
  const rng = mulberry32(0x5eed);
  const open = (x: number, y: number, margin: number) =>
    y > grassTopY(x) + margin && Math.abs(y - pathY(x)) > 36;

  const tufts: Tuft[] = [];
  let guard = 0;
  while (tufts.length < 230 && guard++ < 5000) {
    const x = rng() * W;
    const y = 525 + Math.pow(rng(), 0.75) * (H - 525); // bias toward the front
    if (!open(x, y, 10)) continue;
    const depth = clamp01((y - 530) / (H - 530));
    const n = 3 + Math.floor(rng() * 3);
    const blades = [];
    for (let i = 0; i < n; i++) {
      blades.push({
        a: -0.55 + (i / (n - 1)) * 1.1 + range(rng, -0.12, 0.12),
        len: range(rng, 4.5, 9),
      });
    }
    tufts.push({
      x,
      y,
      sc: 0.55 + depth * 0.9,
      tone: Math.floor(rng() * 3),
      dry: chance(rng, 0.16),
      blades,
    });
  }

  const patches: { x: number; y: number; rx: number; tone: number }[] = [];
  guard = 0;
  while (patches.length < 8 && guard++ < 500) {
    const x = rng() * W;
    const y = 560 + rng() * (H - 580);
    if (y < grassTopY(x) + 25) continue;
    patches.push({ x, y, rx: range(rng, 70, 190), tone: Math.floor(rng() * 2) });
  }

  const flowers: { x: number; y: number; sc: number; kind: number }[] = [];
  guard = 0;
  while (flowers.length < 46 && guard++ < 2000) {
    const x = rng() * W;
    const y = 540 + Math.pow(rng(), 0.8) * (H - 540);
    if (!open(x, y, 14)) continue;
    const depth = clamp01((y - 530) / (H - 530));
    flowers.push({ x, y, sc: 0.6 + depth * 0.8, kind: Math.floor(rng() * 2) });
  }

  const view = new Graphics();
  view.zIndex = 42; // above the grass fill, below the path

  const setSeason = (s: SeasonState, month: number) => {
    view.clear();
    const snowK = clamp01(s.snow * 1.6);
    const m = ((month % 12) + 12) % 12;
    const flowerK = clamp01((m - 4.3) / 0.7) * clamp01((8.3 - m) / 0.7);

    // Soft tone patches give the meadow its unevenness.
    const pAlpha = 0.45 * (1 - snowK);
    if (pAlpha > 0.02) {
      for (const p of patches) {
        const col =
          p.tone === 0
            ? lerpColor(s.grass, 0xffffff, 0.07)
            : lerpColor(s.grass, 0x1c3a14, 0.1);
        view.ellipse(p.x, p.y, p.rx, p.rx * 0.22).fill({ color: col, alpha: pAlpha });
      }
    }

    // Grass tufts; in deep snow only the dry stalks survive.
    const tones = [
      lerpColor(s.grass, 0xffffff, 0.16),
      lerpColor(s.grass, 0x1c3a14, 0.25),
      lerpColor(s.grass, 0xffffff, 0.07),
    ];
    for (const t of tufts) {
      const winterDry = t.dry && snowK > 0.4;
      const alpha = winterDry ? 0.85 : 1 - snowK;
      if (alpha <= 0.04) continue;
      const col = winterDry ? 0xb8a56a : tones[t.tone];
      for (const b of t.blades) {
        view
          .moveTo(t.x, t.y)
          .lineTo(t.x + Math.sin(b.a) * b.len * t.sc, t.y - Math.cos(b.a) * b.len * t.sc);
      }
      view.stroke({ width: 1.1 * t.sc, color: col, alpha, cap: "round" });
    }

    // Wildflowers in late spring and summer.
    if (flowerK > 0.03 && snowK < 0.2) {
      for (const f of flowers) {
        const col = f.kind === 0 ? 0xf7f4ea : 0xf2d84a;
        view.circle(f.x, f.y - 2.5 * f.sc, 1.6 * f.sc).fill({ color: col, alpha: flowerK * 0.9 });
        if (f.kind === 0) {
          view.circle(f.x, f.y - 2.5 * f.sc, 0.6 * f.sc).fill({
            color: 0xe0b63a,
            alpha: flowerK * 0.9,
          });
        }
      }
    }
  };

  return { view, setSeason };
}
