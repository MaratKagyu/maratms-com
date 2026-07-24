import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import type { Environment } from "./environment";
import { paletteFor } from "./palette";
import { makeBirch, makeBench } from "./entities";
import { createAgents } from "./agents";
import { clamp01, lerp, lerpColor } from "./color";
import { computeLighting } from "./lighting";

/**
 * The scene is composed in a fixed virtual resolution and then scaled to
 * "cover" the viewport (like CSS background-size: cover), so the composition
 * stays consistent on any screen and we never rebuild geometry on resize.
 */
export const WORLD = { width: 1600, height: 900 };

export type Scene = {
  /** Rescale/recenter the world to cover the given viewport. */
  layout: (screenW: number, screenH: number) => void;
  /** Advance the scene: set time of day (hour, 0..24) and step agents by dtMs. */
  update: (timeOfDay: number, dtMs: number) => void;
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

  // --- Sky: banded vertical gradient, recoloured by time of day ---
  const sky = new Graphics();
  const SKY_BANDS = 48;
  const drawSky = (top: number, bottom: number) => {
    sky.clear();
    for (let i = 0; i < SKY_BANDS; i++) {
      const t = i / (SKY_BANDS - 1);
      sky
        .rect(0, (HORIZON_Y * i) / SKY_BANDS, W, HORIZON_Y / SKY_BANDS + 1)
        .fill({ color: lerpColor(top, bottom, t) });
    }
  };
  root.addChild(sky);

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

  // Water life (ducks) lives above the sea but below the grassy foreground.
  const waterLife = new Container();
  root.addChild(waterLife);

  // --- Grass slope ---
  const grass = new Graphics();
  const gPts: number[] = [0, H];
  for (let x = 0; x <= W; x += SAMPLE_STEP) gPts.push(x, grassTopY(x));
  gPts.push(W, H);
  grass.poly(gPts).fill({ color: p.grass });
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

  // --- Living agents: people & dogs on the path, ducks on the water ---
  const agents = createAgents(entities, waterLife, pathY, W);

  // --- Time-of-day overlays (above the static scene) ---

  // Full-scene tint: darkens at night, warms at golden hour.
  const grade = new Sprite(Texture.WHITE);
  grade.width = W;
  grade.height = H;
  grade.tint = 0x000000;
  grade.alpha = 0;
  root.addChild(grade);

  // Stars: fixed field, faded in/out via the layer alpha.
  const stars = new Graphics();
  for (let i = 0; i < 90; i++) {
    const x = (i * 137.5) % W;
    const y = ((i * 89.3) % (HORIZON_Y - 40)) + 12;
    const r = 0.8 + (i % 3) * 0.5;
    stars.circle(x, y, r).fill({ color: 0xffffff, alpha: 0.6 + (i % 4) * 0.1 });
  }
  stars.alpha = 0;
  root.addChild(stars);

  // Sun / moon: a single object, redrawn when the kind or colour changes.
  const celestial = new Graphics();
  root.addChild(celestial);

  const drawCelestial = (kind: "sun" | "moon", color: number) => {
    celestial.clear();
    if (kind === "sun") {
      for (let i = 4; i >= 1; i--) {
        celestial.circle(0, 0, 55 + i * 22).fill({ color, alpha: 0.08 });
      }
      celestial.circle(0, 0, 55).fill({ color });
    } else {
      celestial.circle(0, 0, 52).fill({ color: 0xdfe6ff, alpha: 0.2 });
      celestial.circle(0, 0, 40).fill({ color });
      celestial.circle(-12, -8, 7).fill({ color: 0x000000, alpha: 0.05 });
      celestial.circle(11, 10, 5).fill({ color: 0x000000, alpha: 0.05 });
    }
  };

  // Redraw the time-driven graphics only when the ~3-minute bucket changes.
  let lastBucket = Number.NaN;
  let lastKind: "sun" | "moon" | "" = "";

  function update(timeOfDay: number, dtMs: number) {
    agents.update(dtMs);

    const L = computeLighting(timeOfDay, W, HORIZON_Y);

    const bucket = Math.round(timeOfDay * 20);
    if (bucket !== lastBucket || L.celestial !== lastKind) {
      lastBucket = bucket;
      lastKind = L.celestial;
      drawSky(L.skyTop, L.skyBottom);
      drawCelestial(L.celestial, L.celestialColor);
    }

    celestial.x = L.celestialX;
    celestial.y = L.celestialY;
    grade.tint = L.gradeColor;
    grade.alpha = L.gradeAlpha;
    stars.alpha = L.starAlpha;
  }

  function layout(screenW: number, screenH: number) {
    const scale = Math.max(screenW / W, screenH / H);
    root.scale.set(scale);
    root.x = (screenW - W * scale) / 2;
    root.y = (screenH - H * scale) / 2;
  }

  return { layout, update };
}
