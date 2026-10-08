import { Container, Graphics } from "pixi.js";
import { clamp01, lerp, lerpColor } from "./color";
import type { Lighting } from "./lighting";
import type { WeatherState } from "./weather";

/**
 * Living water: the sea base recoloured by the sky, drifting ripple bands,
 * twinkling sparkles, rain rings and a shimmering reflection path under the
 * sun / moon that widens toward the shore and wobbles with the waves.
 * Everything is flat-vector, redrawn into a single Graphics per frame.
 */
export type Water = {
  update: (dtMs: number, L: Lighting, w: WeatherState) => void;
};

type Row = {
  y: number;
  /** [startX, endX] runs of open water on this row (the shore cuts in). */
  runs: [number, number][];
  drift: number;
  speed: number;
  dashLen: number;
  gap: number;
  alpha: number;
};

type Ring = { x: number; y: number; age: number; life: number; r: number };

const MAX_RINGS = 22;

export function createWater(
  root: Container,
  W: number,
  horizonY: number,
  shoreY: (x: number) => number,
): Water {
  const view = new Container();
  view.zIndex = 30;
  root.addChild(view);

  const base = new Graphics();
  const overlay = new Graphics();
  view.addChild(base, overlay);

  // The sea polygon: from the horizon down to the grass edge.
  const SAMPLE = 40;
  const seaPts: number[] = [0, horizonY];
  for (let x = 0; x <= W; x += SAMPLE) seaPts.push(x, shoreY(x));
  seaPts.push(W, horizonY);

  // Precompute ripple rows and where each row is actually water.
  const rows: Row[] = [];
  {
    let y = horizonY + 10;
    let i = 0;
    while (y < 648) {
      const runs: [number, number][] = [];
      let start: number | null = null;
      for (let x = 0; x <= W; x += 20) {
        const open = shoreY(x) > y + 4;
        if (open && start === null) start = x;
        if ((!open || x >= W) && start !== null) {
          if (x - start > 50) runs.push([start, Math.min(x, W)]);
          start = null;
        }
      }
      if (runs.length) {
        const t = (y - horizonY) / (648 - horizonY);
        rows.push({
          y,
          runs,
          drift: (i * 137.5) % 400,
          speed: (6 + t * 14) * (i % 2 ? 1 : -0.7),
          dashLen: 26 + ((i * 53) % 40) + t * 30,
          gap: 60 + ((i * 97) % 90),
          alpha: 0.05 + 0.1 * Math.abs(Math.sin(i * 2.4)) + t * 0.04,
        });
      }
      y += 9 + (y - horizonY) * 0.09;
      i++;
    }
  }

  // Fixed sparkle field (position, twinkle phase/speed), masked to water.
  const sparkles: { x: number; y: number; ph: number; sp: number; len: number }[] = [];
  for (let i = 0; i < 64; i++) {
    const x = (i * 211.7) % W;
    const y = horizonY + 14 + ((i * 83.3) % (640 - horizonY - 14));
    if (shoreY(x) > y + 6) {
      sparkles.push({ x, y, ph: i * 1.73, sp: 0.9 + ((i * 7) % 10) / 6, len: 2 + ((i * 13) % 4) });
    }
  }

  const rings: Ring[] = [];
  let ringTimer = 0;

  const waterRunAt = (y: number, x: number): [number, number] | null => {
    // Nearest precomputed row for masking the glitter path.
    let best: Row | null = null;
    for (const r of rows) {
      if (!best || Math.abs(r.y - y) < Math.abs(best.y - y)) best = r;
    }
    if (!best) return null;
    for (const run of best.runs) {
      if (x >= run[0] && x <= run[1]) return run;
    }
    return null;
  };

  let t = 0;
  let lastBase = -1;

  const update = (dtMs: number, L: Lighting, w: WeatherState) => {
    const dt = Math.min(dtMs / 1000, 0.1);
    t += dt;

    // --- Base colour follows the sky (dark at night, warm at sunset).
    // Darken with the scene grade first so the blend never goes grey.
    const dark = clamp01(L.gradeAlpha * 1.6);
    const seaCol = lerpColor(lerpColor(0x4f9ec4, 0x1f4260, dark), L.skyBottom, 0.2);
    if (seaCol !== lastBase) {
      lastBase = seaCol;
      base.clear();
      base.poly(seaPts).fill({ color: seaCol });
      // A brighter hairline at the horizon gives the water depth.
      base.rect(0, horizonY, W, 2).fill({
        color: lerpColor(seaCol, 0xffffff, 0.35),
        alpha: 0.6,
      });
    }

    overlay.clear();

    const rippleCol = lerpColor(seaCol, 0xffffff, 0.42);
    const windK = 0.4 + Math.abs(w.wind) * 1.4;

    // --- Drifting ripple bands ---
    for (const r of rows) {
      r.drift += r.speed * windK * (w.wind < 0 && r.speed > 0 ? -1 : 1) * dt;
      const period = r.dashLen + r.gap;
      const breathe = 0.75 + 0.25 * Math.sin(t * 0.8 + r.y * 0.13);
      for (const [x0, x1] of r.runs) {
        const off = ((r.drift % period) + period) % period;
        for (let x = x0 - period + off; x < x1; x += period) {
          const s = Math.max(x, x0);
          const e = Math.min(x + r.dashLen * breathe, x1);
          if (e - s > 6) {
            overlay
              .rect(s, r.y, e - s, 1.6)
              .fill({ color: rippleCol, alpha: r.alpha * (0.7 + 0.6 * Math.abs(w.wind)) });
          }
        }
      }
    }

    // --- Sparkles (daytime glints, hidden by clouds and night) ---
    const dayGlint = clamp01(1 - L.gradeAlpha * 2.2) * (1 - w.cloud * 0.8) * (1 - w.fog);
    if (dayGlint > 0.03) {
      for (const s of sparkles) {
        const tw = Math.sin(t * s.sp + s.ph);
        if (tw > 0.55) {
          const a = Math.pow((tw - 0.55) / 0.45, 2) * 0.55 * dayGlint;
          overlay.rect(s.x - s.len, s.y, s.len * 2, 1.4).fill({ color: 0xffffff, alpha: a });
        }
      }
    }

    // --- Reflection path under the sun / moon ---
    const elevation = 1 - (L.celestialY - 40) / (horizonY - 70); // ~0 near horizon
    const lowSun = clamp01(1 - elevation * 1.15);
    const glow =
      (L.celestial === "moon"
        ? 0.35 + 0.55 * L.starAlpha // brightest against a dark sky
        : 0.18 + 0.7 * lowSun) * // golden path when the sun is low
      (1 - w.cloud * 0.85) *
      (1 - w.fog * 0.9);
    if (glow > 0.02) {
      const col =
        L.celestial === "moon" ? 0xeef4ff : lerpColor(L.celestialColor, 0xffffff, 0.15);
      let y = horizonY + 5;
      let i = 0;
      while (y < 640) {
        const t01 = (y - horizonY) / (640 - horizonY);
        const spread = 5 + t01 * t01 * 85;
        const wob =
          Math.sin(t * 1.6 + y * 0.33 + w.wind * 2.5) * spread * 0.55 +
          Math.sin(t * 0.9 + y * 1.05) * spread * 0.25;
        const halfW =
          (6 + t01 * 42) *
          (0.55 + 0.45 * Math.sin(t * 2.2 + y * 0.6 + i * 1.9)) *
          lerp(0.7, 1.15, Math.abs(Math.sin(i * 3.7)));
        const cx = L.celestialX + wob;
        const run = waterRunAt(y, cx);
        if (run) {
          // Soft wide sheen behind the bright dash.
          const ss = Math.max(cx - spread * 0.9, run[0]);
          const se = Math.min(cx + spread * 0.9, run[1]);
          if (se - ss > 2) {
            overlay.rect(ss, y - 1, se - ss, 4).fill({ color: col, alpha: glow * 0.07 });
          }
          const s = Math.max(cx - halfW, run[0]);
          const e = Math.min(cx + halfW, run[1]);
          if (e - s > 2) {
            const a =
              glow * (1 - t01 * 0.35) * (0.5 + 0.5 * Math.abs(Math.sin(i * 2.1 + t * 1.1)));
            overlay.rect(s, y, e - s, 2.4).fill({ color: col, alpha: a });
          }
        }
        y += 6 + t01 * 14;
        i++;
      }
    }

    // --- Rain rings ---
    if (w.kind === "rain" && w.intensity > 0.05) {
      ringTimer -= dt;
      if (ringTimer <= 0 && rings.length < MAX_RINGS) {
        ringTimer = 0.09 / w.intensity;
        const x = Math.random() * W;
        const y = horizonY + 12 + Math.random() * (635 - horizonY - 12);
        if (shoreY(x) > y + 6) {
          rings.push({ x, y, age: 0, life: 0.9 + Math.random() * 0.7, r: 8 + Math.random() * 11 });
        }
      }
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const ring = rings[i];
      ring.age += dt;
      const k = ring.age / ring.life;
      if (k >= 1) {
        rings.splice(i, 1);
        continue;
      }
      const depth = 0.25 + 0.3 * clamp01((ring.y - horizonY) / (640 - horizonY));
      const rr = ring.r * k + 1.5;
      overlay
        .ellipse(ring.x, ring.y, rr, rr * depth)
        .stroke({ width: 1.6, color: 0xe8f2f8, alpha: 0.75 * (1 - k) });
      if (k < 0.5) {
        // A second, younger ripple inside the first.
        overlay
          .ellipse(ring.x, ring.y, rr * 0.45, rr * 0.45 * depth)
          .stroke({ width: 1.2, color: 0xe8f2f8, alpha: 0.6 * (1 - k * 2) });
      }
    }
  };

  return { update };
}
