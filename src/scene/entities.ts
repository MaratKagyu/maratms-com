import { Container, Graphics } from "pixi.js";
import type { Palette } from "./palette";

/** A park bench. Origin (0,0) is at the ground between the front legs. */
export function makeBench(p: Palette, scale: number): Container {
  const c = new Container();
  const g = new Graphics();
  const w = 74;
  const seatY = -26;
  const legH = 26;

  g.ellipse(0, -1, w * 0.62, 7).fill({ color: 0x1c2430, alpha: 0.13 });
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
