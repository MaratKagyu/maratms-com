import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import type { Environment } from "./environment";
import { paletteFor } from "./palette";
import { makeBench } from "./entities";
import { createGroundDetail } from "./ground";
import { createLeafFall, makeTree, type Tree, type TreeSpecies } from "./trees";
import { createAgents, type BenchSpot } from "./agents";
import { clamp01, lerp, lerpColor } from "./color";
import { computeLighting } from "./lighting";
import { computeSeason, type SeasonState } from "./season";
import { createWater } from "./water";
import { createWeather, createWeatherView } from "./weather";

/**
 * The scene is composed in a fixed virtual resolution and then scaled to
 * "cover" the viewport (like CSS background-size: cover), so the composition
 * stays consistent on any screen and we never rebuild geometry on resize.
 */
export const WORLD = { width: 1600, height: 900 };

export type Scene = {
  /** Rescale/recenter the world to cover the given viewport. */
  layout: (screenW: number, screenH: number) => void;
  /**
   * Advance the scene: set time of day (hour, 0..24) and season (month, 0..12),
   * and step agents by dtMs.
   */
  update: (timeOfDay: number, month: number, dtMs: number) => void;
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

  // --- Sea: living water (see water.ts), from the horizon to the grass edge ---
  const water = createWater(root, W, HORIZON_Y, grassTopY);

  // Water life (ducks) lives above the sea but below the grassy foreground.
  const waterLife = new Container();
  root.addChild(waterLife);

  // --- Grass slope (recoloured + snowed by season) ---
  const grass = new Graphics();
  const gPts: number[] = [0, H];
  for (let x = 0; x <= W; x += SAMPLE_STEP) gPts.push(x, grassTopY(x));
  gPts.push(W, H);
  const shade: number[] = [];
  for (let x = 0; x <= W; x += SAMPLE_STEP) shade.push(x, grassTopY(x));
  for (let x = W; x >= 0; x -= SAMPLE_STEP) shade.push(x, grassTopY(x) + 26);
  const drawGround = (s: SeasonState) => {
    grass.clear();
    grass.poly(gPts).fill({ color: s.grass });
    grass.poly(shade).fill({ color: s.grassShade, alpha: 0.5 });
    if (s.snow > 0.01) grass.poly(gPts).fill({ color: 0xffffff, alpha: s.snow * 0.85 });
  };
  root.addChild(grass);

  // Meadow texture: tufts, tone patches, seasonal wildflowers.
  const groundDetail = createGroundDetail(W, H, grassTopY, pathY);
  root.addChild(groundDetail.view);

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

  const placements: { x: number; y: number; kind: TreeSpecies | "bench" }[] = [
    { x: 60, y: 770, kind: "poplar" },
    { x: 180, y: 690, kind: "birch" },
    { x: 360, y: 800, kind: "bench" },
    { x: 520, y: 640, kind: "poplar" },
    { x: 680, y: 615, kind: "conifer" },
    { x: 720, y: 770, kind: "bench" },
    { x: 900, y: 700, kind: "birch" },
    { x: 1080, y: 850, kind: "bench" },
    { x: 1180, y: 660, kind: "conifer" },
    { x: 1360, y: 800, kind: "birch" },
    { x: 1500, y: 730, kind: "bench" },
  ];
  const trees: Tree[] = [];
  const leafSpots: { x: number; y: number; scale: number }[] = [];
  const benchSpots: BenchSpot[] = [];
  placements.forEach((pl, i) => {
    const depth = clamp01((pl.y - 620) / (860 - 620));
    const scale = lerp(0.55, 1.2, depth);
    let node;
    if (pl.kind === "bench") {
      node = makeBench(p, scale);
      benchSpots.push({ x: pl.x, y: pl.y, scale });
    } else {
      const tree = makeTree(i * 331 + 7, pl.kind, p, scale);
      trees.push(tree);
      if (pl.kind !== "conifer") leafSpots.push({ x: pl.x, y: pl.y, scale });
      node = tree.view;
    }
    node.x = pl.x;
    node.y = pl.y;
    node.zIndex = pl.y; // nearer (lower on screen) draws on top
    entities.addChild(node);
  });

  const leafFall = createLeafFall(leafSpots);
  root.addChild(leafFall.view);

  // --- Living agents: people & dogs on the path, ducks on the water ---
  const agents = createAgents(entities, waterLife, pathY, W, benchSpots);

  // --- Time-of-day overlays (above the static scene) ---

  // Full-scene tint: darkens at night, warms at golden hour.
  const grade = new Sprite(Texture.WHITE);
  grade.width = W;
  grade.height = H;
  grade.tint = 0x000000;
  grade.alpha = 0;
  root.addChild(grade);

  // Stars: a random field (a lattice reads as a pattern) with a wide
  // brightness spread, faint colour tints, and a slowly twinkling subset
  // (atmospheric scintillation). Faded in/out via the layer alpha.
  const stars = new Container();
  const starsStatic = new Graphics();
  const starsTwinkle = new Graphics();
  stars.addChild(starsStatic, starsTwinkle);
  const STAR_TINTS = [0xffffff, 0xffffff, 0xeaf0ff, 0xfff2da];
  type Star = { x: number; y: number; r: number; a: number; color: number; speed: number; phase: number };
  const twinklers: Star[] = [];
  for (let i = 0; i < 130; i++) {
    const x = Math.random() * W;
    const y = 10 + Math.random() * (HORIZON_Y - 55);
    const b = Math.pow(Math.random(), 2.2); // many dim stars, a few bright
    const r = 0.5 + b * 1.4 + Math.random() * 0.3;
    const a = 0.16 + b * 0.84;
    const color = STAR_TINTS[Math.floor(Math.random() * STAR_TINTS.length)];
    if (Math.random() < 0.32) {
      twinklers.push({ x, y, r, a, color, speed: 0.4 + Math.random() * 1.1, phase: Math.random() * 6.28 });
    } else {
      starsStatic.circle(x, y, r).fill({ color, alpha: a });
    }
  }
  stars.alpha = 0;
  root.addChild(stars);

  // Sun / moon: a single object, redrawn when the kind or colour changes.
  // Masked to the sky so a low sun (and its glow) sinks behind the horizon
  // instead of overlapping the water — the reflection path takes over there.
  const celestial = new Graphics();
  const skyMask = new Graphics().rect(0, 0, W, HORIZON_Y).fill({ color: 0xffffff });
  celestial.mask = skyMask;
  root.addChild(celestial, skyMask);

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

  // Explicit layer order so weather can interleave (clouds behind the grade,
  // precipitation above the land, celestial + fog + stars on top).
  root.sortableChildren = true;
  sky.zIndex = 0;
  waterLife.zIndex = 35;
  grass.zIndex = 40;
  path.zIndex = 45;
  entities.zIndex = 50;
  grade.zIndex = 70;
  celestial.zIndex = 72; // above the grade so sun/moon stay bright at night
  stars.zIndex = 80;

  const weather = createWeather();
  const weatherView = createWeatherView(root, app.stage, W, H);

  // Draw the initial season so the ground and canopies exist from frame 0.
  let daylight = 0;
  let windT = 0;
  {
    const s = computeSeason(5);
    daylight = s.daylight;
    drawGround(s);
    groundDetail.setSeason(s, 5);
    for (const tree of trees) tree.setSeason(s, 5);
  }

  // Redraw the time-driven graphics only when the ~3-minute bucket changes;
  // the season graphics only when the month bucket changes.
  let lastBucket = Number.NaN;
  let lastKind: "sun" | "moon" | "" = "";
  let lastSeasonBucket = Number.NaN;

  function update(timeOfDay: number, month: number, dtMs: number) {
    const w = weather.sample(month, dtMs);

    agents.update(dtMs, { month, hour: timeOfDay, weather: w });

    // Wind sways the crowns (the trunks stay put).
    windT += dtMs / 1000;
    for (let i = 0; i < trees.length; i++) {
      trees[i].sway(w.wind * Math.sin(windT * 1.6 + i) * 0.05);
    }
    leafFall.update(dtMs, month, w.wind);

    const seasonBucket = Math.round(month * 8);
    if (seasonBucket !== lastSeasonBucket) {
      lastSeasonBucket = seasonBucket;
      const s = computeSeason(month);
      daylight = s.daylight;
      drawGround(s);
      groundDetail.setSeason(s, month);
      for (const tree of trees) tree.setSeason(s, month);
    }

    const L = computeLighting(timeOfDay, W, HORIZON_Y, daylight);

    weatherView.update(w, dtMs, L);
    water.update(dtMs, L, w);

    const bucket = Math.round(timeOfDay * 20);
    if (bucket !== lastBucket || L.celestial !== lastKind) {
      lastBucket = bucket;
      lastKind = L.celestial;
      drawSky(L.skyTop, L.skyBottom);
      drawCelestial(L.celestial, L.celestialColor);
    }

    celestial.x = L.celestialX;
    celestial.y = L.celestialY;
    // Heavy cloud cover dims and cools the whole scene a little.
    const cloudDim = w.cloud * 0.14;
    const total = L.gradeAlpha + cloudDim;
    grade.tint = total > 0 ? lerpColor(L.gradeColor, 0x404a58, cloudDim / total) : L.gradeColor;
    grade.alpha = total;
    stars.alpha = L.starAlpha * (1 - w.cloud * 0.85); // clouds hide the stars
    if (stars.alpha > 0.01) {
      starsTwinkle.clear();
      for (const st of twinklers) {
        const tw = 0.55 + 0.45 * Math.sin(windT * st.speed + st.phase);
        starsTwinkle.circle(st.x, st.y, st.r).fill({ color: st.color, alpha: st.a * tw });
      }
    }
  }

  function layout(screenW: number, screenH: number) {
    const scale = Math.max(screenW / W, screenH / H);
    root.scale.set(scale);
    root.x = (screenW - W * scale) / 2;
    root.y = (screenH - H * scale) / 2;
  }

  return { layout, update };
}
