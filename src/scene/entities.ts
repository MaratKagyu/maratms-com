import { Container, Graphics } from "pixi.js";
import type { Palette } from "./palette";
import type { SeasonState } from "./season";
import { lerpColor } from "./color";

export type Birch = { view: Container; setSeason: (s: SeasonState) => void };

const TRUNK_H = 150;
const BLOBS = [
  { x: 0, y: -TRUNK_H - 18, r: 46 },
  { x: -34, y: -TRUNK_H + 8, r: 32 },
  { x: 32, y: -TRUNK_H + 4, r: 34 },
  { x: -14, y: -TRUNK_H - 44, r: 32 },
  { x: 22, y: -TRUNK_H - 38, r: 28 },
];
// Bare-branch endpoints, drawn in winter/late autumn.
const TWIGS: [number, number][] = [
  [-30, -TRUNK_H + 10],
  [30, -TRUNK_H + 6],
  [-16, -TRUNK_H - 30],
  [18, -TRUNK_H - 26],
  [0, -TRUNK_H - 46],
];

/**
 * A birch tree. Origin (0,0) is at the base of the trunk. `setSeason` redraws
 * the canopy to reflect foliage colour, density and snow.
 */
export function makeBirch(p: Palette, scale: number): Birch {
  const c = new Container();
  const trunkW = 14;

  const trunk = new Graphics();
  trunk.rect(-trunkW / 2, -TRUNK_H, trunkW, TRUNK_H).fill({ color: p.birchTrunk });
  const marks = [0.2, 0.36, 0.52, 0.68, 0.84];
  for (let i = 0; i < marks.length; i++) {
    const y = -TRUNK_H * marks[i];
    const w = trunkW * (0.45 + (i % 2) * 0.35);
    trunk.rect(-w / 2 + (i % 2 ? 2 : -2), y, w, 3).fill({ color: p.birchMark });
  }

  const canopy = new Graphics();
  c.addChild(trunk, canopy);
  c.scale.set(scale);

  const setSeason = (s: SeasonState) => {
    canopy.clear();
    if (s.leafDensity > 0.15) {
      const k = 0.55 + 0.45 * s.leafDensity;
      const light = lerpColor(s.leaf, 0xffffff, 0.18);
      for (let i = 0; i < BLOBS.length; i++) {
        const b = BLOBS[i];
        canopy.circle(b.x, b.y, b.r * k).fill({ color: i % 2 ? light : s.leaf, alpha: 0.9 });
      }
      if (s.snow > 0.35) {
        for (let i = 0; i < BLOBS.length; i += 2) {
          const b = BLOBS[i];
          canopy.circle(b.x, b.y - b.r * 0.4, b.r * 0.5).fill({ color: 0xffffff, alpha: s.snow * 0.7 });
        }
      }
    } else {
      // Bare branches.
      for (const [tx, ty] of TWIGS) {
        canopy.moveTo(0, -TRUNK_H + 6).lineTo(tx, ty);
      }
      canopy.stroke({ width: 2, color: p.birchTrunk, alpha: 0.85 });
      if (s.snow > 0.3) {
        for (const [tx, ty] of TWIGS) {
          canopy.circle(tx, ty, 2.5).fill({ color: 0xffffff, alpha: s.snow * 0.8 });
        }
      }
    }
  };

  return { view: c, setSeason };
}

/** A park bench. Origin (0,0) is at the ground between the front legs. */
export function makeBench(p: Palette, scale: number): Container {
  const c = new Container();
  const g = new Graphics();
  const w = 74;
  const seatY = -26;
  const legH = 26;

  g.rect(-w / 2 + 6, seatY, 6, legH + 8).fill({ color: p.benchLeg });
  g.rect(w / 2 - 12, seatY, 6, legH + 8).fill({ color: p.benchLeg });
  g.rect(-w / 2, seatY, w, 8).fill({ color: p.benchWood });
  g.rect(-w / 2, seatY - 26, w, 7).fill({ color: p.benchWood });
  g.rect(-w / 2 + 6, seatY - 26, 5, 26).fill({ color: p.benchWood });
  g.rect(w / 2 - 11, seatY - 26, 5, 26).fill({ color: p.benchWood });

  c.addChild(g);
  c.scale.set(scale);
  return c;
}
