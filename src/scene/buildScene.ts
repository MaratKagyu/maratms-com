import { Application, Container, Graphics } from "pixi.js";
import type { Environment } from "./environment";
import { paletteFor } from "./palette";
import { makeBirch, makeBench } from "./entities";
import { clamp01, lerp, lerpColor } from "./color";

/**
 * The scene is composed in a fixed virtual resolution and then scaled to
 * "cover" the viewport (like CSS background-size: cover), so the composition
 * stays consistent on any screen and we never rebuild geometry on resize.
 */
export const WORLD = { width: 1600, height: 900 };

export type Scene = {
  /** Rescale/recenter the world to cover the given viewport. */
  layout: (screenW: number, screenH: number) => void;
};

const HORIZON_Y = 380;
const SAMPLE_STEP = 40;

// Terrain profile (side elevation): the grass edge and the path gently slope
// down to the right and wave a little, so the bank reads as a slope.
const grassTopY = (x: number) => 560 + 30 * Math.sin(x / 300) + 60 * (x / WORLD.width);
const pathY = (x: number) => 760 + 22 * Math.sin(x / 260 + 1) + 40 * (x / WORLD.width);

export function buildScene(app: Application, env: Environment): Scene {
  const p = paletteFor(env);
  const W = WORLD.width;
  const H = WORLD.height;

  const root = new Container();
  app.stage.addChild(root);

  // --- Sky: banded vertical gradient ---
  const sky = new Graphics();
  const bands = 48;
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    sky
      .rect(0, (HORIZON_Y * i) / bands, W, HORIZON_Y / bands + 1)
      .fill({ color: lerpColor(p.skyTop, p.skyBottom, t) });
  }
  root.addChild(sky);

  // --- Sun with soft glow ---
  const sun = new Graphics();
  const sx = 1240;
  const sy = 150;
  for (let i = 4; i >= 1; i--) {
    sun.circle(sx, sy, 55 + i * 22).fill({ color: p.sun, alpha: 0.08 });
  }
  sun.circle(sx, sy, 55).fill({ color: p.sun });
  root.addChild(sun);

  // --- Sea: from the horizon down to the grass edge ---
  const sea = new Graphics();
  const seaPts: number[] = [0, HORIZON_Y];
  for (let x = 0; x <= W; x += SAMPLE_STEP) seaPts.push(x, grassTopY(x));
  seaPts.push(W, HORIZON_Y);
  sea.poly(seaPts).fill({ color: p.sea });
  for (let i = 0; i < 6; i++) {
    const ry = HORIZON_Y + 24 + i * 22;
    sea.rect(0, ry, W, 3).fill({ color: p.seaRipple, alpha: 0.25 - i * 0.02 });
  }
  root.addChild(sea);

  // --- Grass slope ---
  const grass = new Graphics();
  const gPts: number[] = [0, H];
  for (let x = 0; x <= W; x += SAMPLE_STEP) gPts.push(x, grassTopY(x));
  gPts.push(W, H);
  grass.poly(gPts).fill({ color: p.grass });
  // shaded strip along the waterline edge for a bit of relief
  const shade: number[] = [];
  for (let x = 0; x <= W; x += SAMPLE_STEP) shade.push(x, grassTopY(x));
  for (let x = W; x >= 0; x -= SAMPLE_STEP) shade.push(x, grassTopY(x) + 26);
  grass.poly(shade).fill({ color: p.grassShade, alpha: 0.5 });
  root.addChild(grass);

  // --- Path ribbon along the slope ---
  const path = new Graphics();
  const hw = 26;
  const ribbon: number[] = [];
  for (let x = 0; x <= W; x += SAMPLE_STEP) ribbon.push(x, pathY(x) - hw);
  for (let x = W; x >= 0; x -= SAMPLE_STEP) ribbon.push(x, pathY(x) + hw);
  path.poly(ribbon).fill({ color: p.path });
  path.poly(ribbon).stroke({ width: 3, color: p.pathEdge, alpha: 0.7 });
  root.addChild(path);

  // --- Entities: birches and benches, depth-sorted by their base y ---
  const entities = new Container();
  entities.sortableChildren = true;
  root.addChild(entities);

  const placements: { x: number; y: number; kind: "birch" | "bench" }[] = [
    { x: 180, y: 690, kind: "birch" },
    { x: 360, y: 800, kind: "bench" },
    { x: 520, y: 640, kind: "birch" },
    { x: 720, y: 770, kind: "bench" },
    { x: 900, y: 700, kind: "birch" },
    { x: 1080, y: 850, kind: "bench" },
    { x: 1180, y: 660, kind: "birch" },
    { x: 1360, y: 800, kind: "birch" },
    { x: 1500, y: 730, kind: "bench" },
  ];

  for (const pl of placements) {
    const depth = clamp01((pl.y - 620) / (860 - 620));
    const scale = lerp(0.55, 1.2, depth);
    const node = pl.kind === "birch" ? makeBirch(p, scale) : makeBench(p, scale);
    node.x = pl.x;
    node.y = pl.y;
    node.zIndex = pl.y; // nearer (lower on screen) draws on top
    entities.addChild(node);
  }

  function layout(screenW: number, screenH: number) {
    const scale = Math.max(screenW / W, screenH / H);
    root.scale.set(scale);
    root.x = (screenW - W * scale) / 2;
    root.y = (screenH - H * scale) / 2;
  }

  return { layout };
}
