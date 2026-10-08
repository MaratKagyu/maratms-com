import { Container, Graphics } from "pixi.js";
import { lerpColor } from "./color";
import type { Palette } from "./palette";

/**
 * A park bench with a hint of depth: visible top faces on the seat and
 * backrest slats, darker back legs set into the scene, board end caps and
 * an under-seat shadow. Origin (0,0) is at the ground between the front
 * legs; the seat's front edge stays at y = -26 (agents sit on it).
 */
export function makeBench(p: Palette, scale: number): Container {
  const c = new Container();
  const g = new Graphics();
  const w = 74;
  const seatY = -26;
  const dx = 5; // depth offset: the back edge sits up-right
  const dy = 5;
  const wood = p.benchWood;
  const woodTop = lerpColor(wood, 0xffe8c0, 0.3);
  const woodDark = lerpColor(wood, 0x241506, 0.35);
  const legDark = lerpColor(p.benchLeg, 0x120a04, 0.4);

  // Ground shadow.
  g.ellipse(dx / 2, -1, w * 0.62 + 4, 7).fill({ color: 0x1c2430, alpha: 0.13 });

  // Back legs, set deeper and darker.
  g.rect(-w / 2 + 6 + dx, seatY - dy + 4, 5, 24).fill({ color: legDark });
  g.rect(w / 2 - 11 + dx, seatY - dy + 4, 5, 24).fill({ color: legDark });

  // Backrest: two slats with thin top faces and shaded right end caps.
  for (const top of [seatY - 26, seatY - 16.5]) {
    const h = 5.5;
    g.poly([
      -w / 2, top, w / 2, top,
      w / 2 + dx * 0.5, top - dy * 0.5, -w / 2 + dx * 0.5, top - dy * 0.5,
    ]).fill({ color: woodTop });
    g.rect(-w / 2, top, w, h).fill({ color: wood });
    g.poly([
      w / 2, top, w / 2 + dx * 0.5, top - dy * 0.5,
      w / 2 + dx * 0.5, top - dy * 0.5 + h, w / 2, top + h,
    ]).fill({ color: woodDark });
  }

  // Backrest posts.
  g.rect(-w / 2 + 6, seatY - 26, 5, 26).fill({ color: wood });
  g.rect(w / 2 - 11, seatY - 26, 5, 26).fill({ color: wood });

  // Seat: sunlit top face with slat grooves, front face, right end cap.
  g.poly([
    -w / 2, seatY, w / 2, seatY,
    w / 2 + dx, seatY - dy, -w / 2 + dx, seatY - dy,
  ]).fill({ color: woodTop });
  for (const k of [0.45, 0.78]) {
    g.moveTo(-w / 2 + dx * k, seatY - dy * k)
      .lineTo(w / 2 + dx * k, seatY - dy * k)
      .stroke({ width: 1, color: woodDark, alpha: 0.5 });
  }
  g.rect(-w / 2, seatY, w, 6).fill({ color: wood });
  g.poly([
    w / 2, seatY, w / 2 + dx, seatY - dy,
    w / 2 + dx, seatY - dy + 6, w / 2, seatY + 6,
  ]).fill({ color: woodDark });

  // Shadow under the seat.
  g.rect(-w / 2 + 3, seatY + 6, w - 6, 2.2).fill({ color: 0x000000, alpha: 0.22 });

  // Front legs with a lit edge.
  g.rect(-w / 2 + 6, seatY + 4, 6, 28).fill({ color: p.benchLeg });
  g.rect(w / 2 - 12, seatY + 4, 6, 28).fill({ color: p.benchLeg });
  g.rect(-w / 2 + 6, seatY + 4, 1.5, 28).fill({ color: 0xffffff, alpha: 0.12 });
  g.rect(w / 2 - 12, seatY + 4, 1.5, 28).fill({ color: 0xffffff, alpha: 0.12 });

  c.addChild(g);
  c.scale.set(scale);
  return c;
}
