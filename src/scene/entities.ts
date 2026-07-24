import { Container, Graphics } from "pixi.js";
import type { Palette } from "./palette";

/**
 * A birch tree. Origin (0,0) is at the base of the trunk (ground contact
 * point), so callers position it directly on the terrain and use that same
 * y for depth sorting.
 */
export function makeBirch(p: Palette, scale: number): Container {
  const c = new Container();
  const trunkH = 150;
  const trunkW = 14;

  const trunk = new Graphics();
  trunk.rect(-trunkW / 2, -trunkH, trunkW, trunkH).fill({ color: p.birchTrunk });
  // characteristic black birch marks
  const marks = [0.2, 0.36, 0.52, 0.68, 0.84];
  for (let i = 0; i < marks.length; i++) {
    const y = -trunkH * marks[i];
    const w = trunkW * (0.45 + (i % 2) * 0.35);
    trunk.rect(-w / 2 + (i % 2 ? 2 : -2), y, w, 3).fill({ color: p.birchMark });
  }

  const canopy = new Graphics();
  const blobs = [
    { x: 0, y: -trunkH - 18, r: 46 },
    { x: -34, y: -trunkH + 8, r: 32 },
    { x: 32, y: -trunkH + 4, r: 34 },
    { x: -14, y: -trunkH - 44, r: 32 },
    { x: 22, y: -trunkH - 38, r: 28 },
  ];
  for (let i = 0; i < blobs.length; i++) {
    const b = blobs[i];
    const color = i % 2 ? p.birchLeafLight : p.birchLeaf;
    canopy.circle(b.x, b.y, b.r).fill({ color });
  }

  c.addChild(trunk, canopy);
  c.scale.set(scale);
  return c;
}

/** A park bench. Origin (0,0) is at the ground between the front legs. */
export function makeBench(p: Palette, scale: number): Container {
  const c = new Container();
  const g = new Graphics();
  const w = 74;
  const seatY = -26;
  const legH = 26;

  // legs
  g.rect(-w / 2 + 6, seatY, 6, legH + 8).fill({ color: p.benchLeg });
  g.rect(w / 2 - 12, seatY, 6, legH + 8).fill({ color: p.benchLeg });
  // seat
  g.rect(-w / 2, seatY, w, 8).fill({ color: p.benchWood });
  // backrest
  g.rect(-w / 2, seatY - 26, w, 7).fill({ color: p.benchWood });
  g.rect(-w / 2 + 6, seatY - 26, 5, 26).fill({ color: p.benchWood });
  g.rect(w / 2 - 11, seatY - 26, 5, 26).fill({ color: p.benchWood });

  c.addChild(g);
  c.scale.set(scale);
  return c;
}
