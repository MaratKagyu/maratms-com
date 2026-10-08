import { Container, Graphics } from "pixi.js";
import { lerpColor } from "./color";
import { computeSeason, type SeasonState } from "./season";
import { chance, mulberry32, range } from "./rng";

/**
 * Stationary park furniture: seeded bushes that follow the seasons (a few
 * flower in late spring), cast-iron lamps that come on at dusk with a warm
 * halo and a pool of light, mossy boulders and a sawn stump. Everything is
 * drawn from primitives, like the rest of the scene.
 */
export type SeasonalProp = {
  view: Container;
  setSeason: (s: SeasonState, month: number) => void;
};

export type Lamp = {
  view: Container;
  /** Halo + light pool, meant for a layer above the night grade. */
  glow: Container;
  setNight: (k: number) => void;
};

/** A low rounded shrub built from leaf clumps over a twig skeleton. */
export function makeBush(seed: number, scale: number, flowering = false): SeasonalProp {
  const rng = mulberry32(seed);
  const view = new Container();
  view.scale.set(scale);

  const w = range(rng, 20, 30); // half-width of the mound

  // Bare skeleton: a little fan of twigs, visible in winter.
  const twigs = new Graphics();
  for (let i = 0; i < 6; i++) {
    const tx = range(rng, -w * 0.6, w * 0.6);
    twigs
      .moveTo(tx * 0.3, 0)
      .lineTo(tx, -range(rng, 10, 20))
      .stroke({ width: 1.2, color: 0x5a4733 });
  }

  const shadow = new Graphics();
  shadow.ellipse(0, 1, w * 1.05, 4).fill({ color: 0x1c2e18, alpha: 0.18 });

  const shade = new Graphics();
  const body = new Graphics();
  const lite = new Graphics();
  const snow = new Graphics();
  view.addChild(shadow, twigs, shade, body, lite, snow);

  type Clump = { cx: number; cy: number; r: number; bias: number; thr: number; dots: [number, number][] };
  const clumps: Clump[] = [];
  const n = 6 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const cx = range(rng, -w, w);
    const k = 1 - Math.abs(cx) / w;
    const r = range(rng, 7, 10) * (0.75 + k * 0.35);
    const cy = -range(rng, 5, 8) - k * range(rng, 7, 14);
    const dots: [number, number][] = [];
    for (let d = 0; d < 3; d++) {
      dots.push([cx + range(rng, -r, r) * 0.6, cy + range(rng, -r, r) * 0.55]);
    }
    clumps.push({ cx, cy, r, bias: range(rng, -0.5, 0.5), thr: range(rng, 0.05, 0.7), dots });
  }
  clumps.sort((a, b) => a.cy - b.cy); // top clumps first, so snow sits right

  const setSeason = (s: SeasonState, month: number) => {
    shade.clear();
    body.clear();
    lite.clear();
    snow.clear();
    const bloom = flowering && month > 4.5 && month < 6.3;
    let bare = true;
    for (const c of clumps) {
      const cs = computeSeason(month + c.bias * 0.6);
      if (cs.leafDensity < c.thr) continue; // this clump has dropped
      bare = false;
      const leaf = cs.leaf;
      shade.circle(c.cx + 1.5, c.cy + 1.8, c.r).fill({ color: lerpColor(leaf, 0x1c2e18, 0.38) });
      body.circle(c.cx, c.cy, c.r * 0.95).fill({ color: leaf });
      lite
        .circle(c.cx - c.r * 0.25, c.cy - c.r * 0.32, c.r * 0.55)
        .fill({ color: lerpColor(leaf, 0xffffff, 0.3) });
      if (bloom) {
        for (const [dx, dy] of c.dots) {
          lite.circle(dx, dy, 1.4).fill({ color: 0xf2cfe0, alpha: 0.95 });
        }
      }
      if (s.snow > 0.05) {
        snow
          .ellipse(c.cx, c.cy - c.r * 0.55, c.r * 0.78, c.r * 0.34)
          .fill({ color: 0xffffff, alpha: Math.min(1, s.snow * 1.2) });
      }
    }
    // A bare bush under snow becomes a soft white mound over the twigs.
    if (bare && s.snow > 0.05) {
      snow.ellipse(0, -4, w * 0.8, 5.5).fill({ color: 0xffffff, alpha: Math.min(1, s.snow) });
    }
  };

  return { view, setSeason };
}

/** A mossy boulder; collects a snow cap in winter. */
export function makeRock(seed: number, scale: number): SeasonalProp {
  const rng = mulberry32(seed);
  const view = new Container();
  view.scale.set(scale);

  const rw = range(rng, 13, 20);
  const rh = rw * range(rng, 0.55, 0.75);
  // A lumpy outline around an ellipse.
  const pts: number[] = [];
  const N = 9;
  for (let i = 0; i <= N; i++) {
    const a = Math.PI + (i / N) * Math.PI; // top half, left to right
    const jitter = 0.82 + rng() * 0.3;
    pts.push(Math.cos(a) * rw * jitter, Math.sin(a) * rh * jitter * -1 - rh * 0.1);
  }

  const g = new Graphics();
  g.ellipse(0, 1, rw * 1.08, 3.2).fill({ color: 0x1c2430, alpha: 0.16 });
  g.poly([pts[0], 0, ...pts, rw, 0]).fill({ color: 0x8d9299 });
  // Shaded flank + a couple of cracks.
  g.poly([-rw * 0.95, 0, -rw * 0.4, -rh * 0.9, 0, -rh * 0.4, 0, 0]).fill({
    color: 0x6e737a,
    alpha: 0.7,
  });
  g.moveTo(rw * 0.2, -rh * 0.75)
    .lineTo(rw * 0.42, -rh * 0.3)
    .stroke({ width: 1, color: 0x5c6168, alpha: 0.7 });
  if (chance(rng, 0.7)) {
    g.ellipse(-rw * 0.35, -rh * 0.15, rw * 0.32, rh * 0.22).fill({ color: 0x5f7a44, alpha: 0.55 });
  }

  const snow = new Graphics();
  view.addChild(g, snow);

  const setSeason = (s: SeasonState) => {
    snow.clear();
    if (s.snow > 0.05) {
      snow.ellipse(0, -rh * 0.82, rw * 0.72, rh * 0.3).fill({ color: 0xffffff, alpha: Math.min(1, s.snow * 1.15) });
    }
  };

  return { view, setSeason };
}

/** A sawn stump with growth rings and a root flare. */
export function makeStump(seed: number, scale: number): SeasonalProp {
  const rng = mulberry32(seed);
  const view = new Container();
  view.scale.set(scale);

  const w = range(rng, 7, 9);
  const h = range(rng, 10, 14);
  const g = new Graphics();
  g.ellipse(0, 1, w * 1.5, 2.8).fill({ color: 0x1c2430, alpha: 0.16 });
  // Trunk with root flare.
  g.poly([-w, -h, w, -h, w * 1.3, 0, -w * 1.3, 0]).fill({ color: 0x7a5c3e });
  g.poly([w * 0.2, -h, w, -h, w * 1.3, 0, w * 0.5, 0]).fill({ color: 0x5f462e, alpha: 0.6 });
  g.moveTo(-w * 0.5, -h * 0.8).lineTo(-w * 0.62, -h * 0.1).stroke({ width: 1, color: 0x5f462e, alpha: 0.8 });
  // Sawn top with rings.
  g.ellipse(0, -h, w, w * 0.42).fill({ color: 0xc9a877 });
  g.ellipse(0, -h, w * 0.62, w * 0.26).stroke({ width: 1, color: 0xa8865a, alpha: 0.8 });
  g.ellipse(0, -h, w * 0.3, w * 0.13).stroke({ width: 1, color: 0xa8865a, alpha: 0.8 });

  const snow = new Graphics();
  view.addChild(g, snow);

  const setSeason = (s: SeasonState) => {
    snow.clear();
    if (s.snow > 0.05) {
      snow.ellipse(0, -h - 1, w * 0.95, w * 0.38).fill({ color: 0xffffff, alpha: Math.min(1, s.snow * 1.2) });
    }
  };

  return { view, setSeason };
}

/** A cast-iron park lamp; the lantern and glow are driven by setNight. */
export function makeLamp(scale: number): Lamp {
  const view = new Container();
  view.scale.set(scale);

  const H = 78; // post height
  const g = new Graphics();
  g.ellipse(0, 1, 5.5, 1.9).fill({ color: 0x1c2430, alpha: 0.2 });
  g.roundRect(-3.4, -7, 6.8, 7, 1.5).fill({ color: 0x262c31 }); // base block
  g.poly([-2.1, -6, 2.1, -6, 1.3, -H, -1.3, -H]).fill({ color: 0x30373d });
  g.poly([-2.1, -6, -1.1, -6, -0.6, -H, -1.3, -H]).fill({ color: 0x47525b }); // edge light
  g.rect(-5.5, -H - 2, 11, 2).fill({ color: 0x30373d }); // crossarm
  // Lantern frame + cap.
  g.poly([-5, -H - 2, 5, -H - 2, 3.6, -H - 14, -3.6, -H - 14]).stroke({ width: 1.2, color: 0x262c31 });
  g.poly([-6.2, -H - 14, 6.2, -H - 14, 0, -H - 21]).fill({ color: 0x30373d });
  g.circle(0, -H - 22.5, 1.7).fill({ color: 0x262c31 });

  const glassDay = new Graphics();
  glassDay.poly([-4.4, -H - 2.8, 4.4, -H - 2.8, 3.2, -H - 13.4, -3.2, -H - 13.4]).fill({
    color: 0x49535c,
    alpha: 0.9,
  });
  const glassNight = new Graphics();
  glassNight.poly([-4.4, -H - 2.8, 4.4, -H - 2.8, 3.2, -H - 13.4, -3.2, -H - 13.4]).fill({
    color: 0xffdf9e,
  });
  glassNight.alpha = 0;
  view.addChild(g, glassDay, glassNight);

  // Halo and ground pool live on their own layer above the night grade.
  const glow = new Container();
  glow.scale.set(scale);
  const halo = new Graphics();
  halo.circle(0, -H - 8, 30).fill({ color: 0xffc97a, alpha: 0.35 });
  halo.circle(0, -H - 8, 15).fill({ color: 0xffd98a, alpha: 0.5 });
  const pool = new Graphics();
  pool.ellipse(0, 0, 46, 12).fill({ color: 0xffc97a });
  glow.addChild(pool, halo);
  halo.alpha = 0;
  pool.alpha = 0;

  const setNight = (k: number) => {
    glassNight.alpha = k;
    halo.alpha = 0.22 * k;
    pool.alpha = 0.1 * k;
  };

  return { view, glow, setNight };
}
