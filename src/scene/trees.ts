import { Container, Graphics } from "pixi.js";
import { clamp01, lerpColor } from "./color";
import type { Palette } from "./palette";
import { computeSeason, type SeasonState } from "./season";
import { mulberry32, range, type Rng } from "./rng";

/**
 * Procedural park trees, one seeded generator per species. Every tree is
 * unique: a tapered, slightly leaning trunk with bark details and a root
 * flare, a canopy of layered leaf clumps (shadow / body / sunlit caps) that
 * turn and fall clump-by-clump through autumn, a recursive winter branch
 * skeleton, a soft ground shadow and an autumn leaf carpet. Conifers keep
 * their needles and collect snow on each tier instead.
 */

export type TreeSpecies = "birch" | "poplar" | "conifer";

export type Tree = {
  view: Container;
  setSeason: (s: SeasonState, month: number) => void;
  /** Wind sway in radians — rotates the crown, not the trunk. */
  sway: (r: number) => void;
};

const darken = (c: number, f: number) => lerpColor(c, 0x1a2418, f);
const lighten = (c: number, f: number) => lerpColor(c, 0xffffff, f);

/** Seasonal ramp for fallen-leaf effects: 0 outside autumn, 1 at its peak. */
export function autumnAmount(month: number): number {
  const m = ((month % 12) + 12) % 12;
  return clamp01((m - 8) / 0.7) * clamp01((11.5 - m) / 0.5);
}

type Seg = { x1: number; y1: number; x2: number; y2: number; w: number };

function genBranches(
  rng: Rng,
  species: "birch" | "poplar",
  topX: number,
  topY: number,
  size: number,
): { segs: Seg[]; tips: [number, number][] } {
  const segs: Seg[] = [];
  const tips: [number, number][] = [];
  const upright = species === "poplar";
  const nMain = upright ? 5 : 3 + (rng() < 0.5 ? 1 : 0);
  for (let i = 0; i < nMain; i++) {
    const spread = upright ? 0.28 : 1.0;
    const a = -Math.PI / 2 + ((i / (nMain - 1)) * 2 - 1) * spread + range(rng, -0.12, 0.12);
    const len = size * (upright ? range(rng, 0.8, 1.1) : range(rng, 0.55, 0.8));
    const ex = topX + Math.cos(a) * len;
    const ey = topY + Math.sin(a) * len;
    segs.push({ x1: topX, y1: topY, x2: ex, y2: ey, w: 3 });
    const kids = 2 + (rng() < 0.4 ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      // One child forks mid-branch, the rest continue from the end.
      const t = k === 0 ? range(rng, 0.45, 0.7) : 1;
      const bx = topX + (ex - topX) * t;
      const by = topY + (ey - topY) * t;
      const ka = a + range(rng, -0.55, 0.55) * (upright ? 0.5 : 1);
      const kl = len * range(rng, 0.4, 0.6);
      const kx = bx + Math.cos(ka) * kl;
      const ky = by + Math.sin(ka) * kl;
      segs.push({ x1: bx, y1: by, x2: kx, y2: ky, w: 1.6 });
      tips.push([kx, ky]);
    }
    tips.push([ex, ey]);
  }
  return { segs, tips };
}

type Clump = { x: number; y: number; r: number; bias: number; thr: number };

function makeDeciduous(rng: Rng, species: "birch" | "poplar", p: Palette): Tree {
  const birch = species === "birch";
  const H = birch ? range(rng, 135, 170) : range(rng, 150, 190); // trunk to crown anchor
  const w0 = birch ? range(rng, 12, 16) : range(rng, 14, 18);
  const lean = range(rng, -0.1, 0.1);
  const barkCol = birch ? p.birchTrunk : 0x857463;
  const branchCol = birch ? 0x5a5048 : 0x66594a;

  const view = new Container();

  // Ground shadow.
  const shadow = new Graphics();
  shadow.ellipse(0, -1, w0 * 3.2, w0 * 0.75).fill({ color: 0x1c2430, alpha: 0.13 });
  view.addChild(shadow);

  // Autumn leaf carpet (shown only while the leaves are coming down).
  const carpet = new Graphics();
  carpet.ellipse(-w0 * 0.8, -2, w0 * 4.6, w0 * 1.05).fill({ color: 0xc08430, alpha: 0.55 });
  carpet.ellipse(w0 * 1.4, -3, w0 * 3.4, w0 * 0.8).fill({ color: 0xa86f2c, alpha: 0.45 });
  carpet.alpha = 0;
  view.addChild(carpet);

  // Tapered trunk with a lean and a root flare.
  const xoff = (k: number) => lean * H * k * k;
  const halfW = (k: number) => (w0 / 2) * (1 - 0.55 * k);
  const trunk = new Graphics();
  const KS = [0, 0.33, 0.66, 1];
  const left = KS.map((k) => [xoff(k) - halfW(k) * (k === 0 ? 1.4 : 1), -H * k]);
  const right = KS.map((k) => [xoff(k) + halfW(k) * (k === 0 ? 1.4 : 1), -H * k]).reverse();
  trunk.poly([...left.flat(), ...right.flat()]).fill({ color: barkCol });
  // Shaded side of the cylinder.
  const shadeSide = KS.map((k) => [xoff(k) + halfW(k) * 0.3, -H * k]);
  const shadeEdge = KS.map((k) => [xoff(k) + halfW(k), -H * k]).reverse();
  trunk.poly([...shadeSide.flat(), ...shadeEdge.flat()]).fill({ color: 0x000000, alpha: 0.14 });
  if (birch) {
    const nMarks = Math.round(range(rng, 6, 9));
    for (let i = 0; i < nMarks; i++) {
      const k = range(rng, 0.08, 0.92);
      const mw = w0 * range(rng, 0.3, 0.75);
      const g = new Graphics()
        .rect(-mw / 2, -1.5, mw, 3)
        .fill({ color: p.birchMark, alpha: 0.9 });
      g.position.set(xoff(k) + range(rng, -1, 1) * halfW(k) * 0.6, -H * k);
      g.rotation = range(rng, -0.3, 0.3);
      trunk.addChild(g);
    }
  } else {
    // Poplar: dark vertical fissures.
    for (let i = 0; i < 5; i++) {
      const k0 = range(rng, 0.05, 0.6);
      const k1 = k0 + range(rng, 0.15, 0.3);
      trunk
        .poly([
          xoff(k0) + range(rng, -0.4, 0.4) * halfW(k0), -H * k0,
          xoff(k1) - 0.8, -H * k1,
          xoff(k1) + 0.8, -H * k1,
        ])
        .fill({ color: 0x5d5042, alpha: 0.55 });
    }
  }
  // A knot or two.
  for (let i = 0; i < 2; i++) {
    if (rng() < 0.7) {
      const k = range(rng, 0.25, 0.75);
      trunk
        .ellipse(xoff(k) + range(rng, -0.3, 0.3) * halfW(k), -H * k, 1.6, 2.6)
        .fill({ color: birch ? 0x2c2c2c : 0x4a4036, alpha: 0.7 });
    }
  }
  view.addChild(trunk);

  // Crown pivots at the trunk top so the wind bends leaves, not bark.
  const crown = new Container();
  crown.position.set(xoff(1), -H);
  view.addChild(crown);

  const size = birch ? range(rng, 52, 68) : range(rng, 42, 52);
  const { segs, tips } = genBranches(rng, species, 0, 0, size * (birch ? 1 : 1.15));
  const branches = new Graphics();
  for (const s of segs) {
    branches.moveTo(s.x1, s.y1).lineTo(s.x2, s.y2).stroke({ width: s.w, color: branchCol });
  }
  const twigSnow = new Graphics();
  crown.addChild(branches, twigSnow);

  // Leaf clumps in an ellipse around the crown centre; poplars are columnar.
  const rx = birch ? size * 1.15 : size * 0.72;
  const ry = birch ? size * 0.85 : size * 1.9;
  const cy = birch ? -size * 0.75 : -ry * 0.58;
  const n = Math.round(birch ? range(rng, 11, 14) : range(rng, 16, 19));
  const clumps: Clump[] = [];
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng());
    clumps.push({
      x: Math.cos(a) * rx * d,
      y: cy + Math.sin(a) * ry * d * 0.9,
      r: size * range(rng, 0.3, 0.46) * (birch ? 1 : 0.92),
      bias: range(rng, -0.5, 0.7),
      thr: 0.04 + (i / n) * 0.88,
    });
  }
  const shadeL = new Graphics();
  const bodyL = new Graphics();
  const liteL = new Graphics();
  crown.addChild(shadeL, bodyL, liteL);

  const setSeason = (s: SeasonState, month: number) => {
    shadeL.clear();
    bodyL.clear();
    liteL.clear();
    twigSnow.clear();
    let shown = 0;
    for (const c of clumps) {
      if (s.leafDensity <= c.thr) continue;
      shown++;
      // Each clump turns on its own schedule.
      const col = computeSeason(month + c.bias * Math.min(1, s.leafDensity + 0.5)).leaf;
      shadeL.circle(c.x + c.r * 0.12, c.y + c.r * 0.2, c.r * 1.02).fill({
        color: darken(col, 0.3),
        alpha: 0.85,
      });
      bodyL.circle(c.x, c.y, c.r).fill({ color: col, alpha: 0.95 });
      liteL.circle(c.x - c.r * 0.24, c.y - c.r * 0.3, c.r * 0.55).fill({
        color: lighten(col, 0.22),
        alpha: 0.85,
      });
      if (s.snow > 0.35 && c.y < cy) {
        liteL.circle(c.x, c.y - c.r * 0.45, c.r * 0.5).fill({
          color: 0xffffff,
          alpha: s.snow * 0.7,
        });
      }
    }
    if (s.snow > 0.3 && shown === 0) {
      for (const [tx, ty] of tips) {
        twigSnow.circle(tx, ty, 2.4).fill({ color: 0xffffff, alpha: s.snow * 0.8 });
      }
    }
    carpet.alpha =
      autumnAmount(month) * (1 - s.leafDensity) * (1 - Math.min(1, s.snow * 2.5));
  };

  return { view, setSeason, sway: (r) => (crown.rotation = r) };
}

function makeConifer(rng: Rng): Tree {
  const view = new Container();
  const totalH = range(rng, 165, 215);
  const baseW = totalH * range(rng, 0.5, 0.58);
  const trunkVis = range(rng, 16, 26);
  const tiers = Math.round(range(rng, 5, 6.4));
  const green = lerpColor(0x2e5d3f, 0x3a7049, rng());

  const shadow = new Graphics();
  shadow.ellipse(0, -1, baseW * 0.42, baseW * 0.09).fill({ color: 0x1c2430, alpha: 0.13 });
  const trunk = new Graphics();
  trunk.rect(-3.5, -trunkVis - 6, 7, trunkVis + 6).fill({ color: 0x6e4f35 });
  view.addChild(shadow, trunk);

  const crown = new Container();
  crown.y = -trunkVis;
  view.addChild(crown);

  const snowG = new Graphics();
  const tierH = totalH / tiers;
  type Tier = { w: number; yTop: number; yBot: number };
  const tierList: Tier[] = [];
  for (let t = 0; t < tiers; t++) {
    const w = baseW * (1 - (t / tiers) * 0.8) * range(rng, 0.92, 1.05);
    const yBot = -t * tierH * 0.82;
    const yTop = yBot - tierH * 1.35;
    tierList.push({ w, yTop, yBot });
    const g = new Graphics();
    const dip = tierH * 0.18;
    g.poly([
      -w / 2, yBot,
      -w * 0.16, yBot - dip,
      w * 0.16, yBot - dip * 0.6,
      w / 2, yBot,
      range(rng, -3, 3), yTop,
    ]).fill({ color: t % 2 ? lighten(green, 0.08) : green });
    // Shadowed skirt under each tier.
    g.poly([-w / 2, yBot, w / 2, yBot, w * 0.28, yBot - tierH * 0.16, -w * 0.28, yBot - tierH * 0.16])
      .fill({ color: darken(green, 0.3), alpha: 0.5 });
    crown.addChild(g);
  }
  crown.addChild(snowG);

  const setSeason = (s: SeasonState) => {
    snowG.clear();
    if (s.snow < 0.15) return;
    for (const t of tierList) {
      const mid = t.yTop + (t.yBot - t.yTop) * 0.52;
      snowG
        .poly([-t.w * 0.34, mid, 0, t.yTop + 2, t.w * 0.34, mid])
        .fill({ color: 0xffffff, alpha: Math.min(0.9, s.snow * 0.85) });
    }
  };

  return { view, setSeason, sway: (r) => (crown.rotation = r * 0.45) };
}

export function makeTree(seed: number, species: TreeSpecies, p: Palette, scale: number): Tree {
  const rng = mulberry32(seed);
  const tree = species === "conifer" ? makeConifer(rng) : makeDeciduous(rng, species, p);
  tree.view.scale.set(scale);
  return tree;
}

// --- Falling leaves ----------------------------------------------------------

export type LeafFall = {
  view: Graphics;
  update: (dtMs: number, month: number, wind: number) => void;
};

const LEAF_COLORS = [0xd9922f, 0xc9772a, 0xe0b23a, 0xa86a28, 0xcc5f2a];

type LeafSpot = { x: number; y: number; scale: number };
type Leaf = {
  x: number;
  y: number;
  groundY: number;
  phase: number;
  rate: number;
  f: number;
  col: number;
  spot: LeafSpot;
};

/** Leaves drifting down from the deciduous canopies through autumn. */
export function createLeafFall(spots: LeafSpot[]): LeafFall {
  const view = new Graphics();
  view.zIndex = 55;
  const rng = mulberry32(0xa868);
  const MAX = 30;
  const leaves: Leaf[] = [];

  const respawn = (l: Leaf, mid: boolean) => {
    const spot = spots[Math.floor(rng() * spots.length)];
    const top = spot.y - range(rng, 120, 200) * spot.scale;
    l.spot = spot;
    l.x = spot.x + range(rng, -60, 60) * spot.scale;
    l.y = mid ? range(rng, top, spot.y) : top;
    l.groundY = spot.y - 4 + rng() * 10;
    l.phase = rng() * 6.28;
    l.rate = range(rng, 2.4, 3.6);
    l.f = rng();
    l.col = LEAF_COLORS[Math.floor(rng() * LEAF_COLORS.length)];
  };

  for (let i = 0; i < MAX; i++) {
    const l = {} as Leaf;
    respawn(l, true);
    leaves.push(l);
  }

  const update = (dtMs: number, month: number, wind: number) => {
    const dt = Math.min(dtMs / 1000, 0.1);
    const count = Math.round(autumnAmount(month) * MAX * (0.45 + Math.abs(wind) * 0.55));
    view.clear();
    if (count === 0) return;
    for (let i = 0; i < count; i++) {
      const l = leaves[i];
      l.phase += dt * l.rate;
      l.y += (26 + l.f * 20) * dt;
      l.x += (wind * 42 + Math.sin(l.phase) * 16) * dt;
      if (l.y >= l.groundY) respawn(l, false);
      const flutter = 1 + Math.abs(Math.sin(l.phase * 1.7)) * 1.4;
      view.ellipse(l.x, l.y, 3, 1.1 * flutter).fill({ color: l.col, alpha: 0.9 });
    }
  };

  return { view, update };
}
