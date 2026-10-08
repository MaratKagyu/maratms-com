import { Container, Graphics } from "pixi.js";
import type { Lighting } from "./lighting";
import { buildPerson, randomLook, type Person } from "./person";
import { mulberry32 } from "./rng";
import type { WeatherState } from "./weather";

/**
 * A campsite on the meadow: an A-frame tent, a stone fire pit with two
 * sitting logs and a pair of campers. By day the campers idle around the
 * tent (under umbrellas if it rains). At night a flickering campfire
 * burns and they sit on the logs around it — unless it rains, in which
 * case the fire is out and everyone hides inside the tent.
 */
export type Camp = {
  view: Container;
  /** Fire glow, meant for the layer above the night grade. */
  glow: Container;
  update: (dtMs: number, L: Lighting, w: WeatherState) => void;
};

type Ember = { x: number; y: number; vx: number; vy: number; age: number; life: number };

const FIRE = { x: -56, y: 8 }; // fire pit, local to the tent base

export function createCamp(scale: number): Camp {
  const rng = mulberry32(0x5eedca);
  const view = new Container();
  view.scale.set(scale);

  // --- Tent: a bright A-frame with a dark doorway and guy ropes ---
  const tent = new Graphics();
  tent.ellipse(0, 2, 34, 5).fill({ color: 0x1c2430, alpha: 0.16 });
  tent.moveTo(-28, 0).lineTo(-39, 3).stroke({ width: 1, color: 0x8a7b60 }); // guy ropes
  tent.moveTo(28, 0).lineTo(39, 3).stroke({ width: 1, color: 0x8a7b60 });
  tent.rect(-40, 1, 2.4, 2.4).fill({ color: 0x6a5c44 }); // pegs
  tent.rect(37.6, 1, 2.4, 2.4).fill({ color: 0x6a5c44 });
  tent.poly([-28, 0, 0, -36, 28, 0]).fill({ color: 0xc96f3b });
  tent.poly([0, -36, 28, 0, 0, 0]).fill({ color: 0x000000, alpha: 0.14 }); // shaded half
  tent.poly([-9, 0, 0, -22, 9, 0]).fill({ color: 0x5a3822 }); // doorway
  tent.moveTo(-9, 0).lineTo(3, -14).stroke({ width: 1.4, color: 0xe8a06a }); // open flap
  tent.moveTo(0, -36).lineTo(0, -41).stroke({ width: 1.6, color: 0x6a5c44 }); // ridge pole
  view.addChild(tent);

  // --- Fire pit: stones, logs to burn, logs to sit on ---
  const pit = new Graphics();
  pit.ellipse(FIRE.x, FIRE.y + 1, 13, 3.4).fill({ color: 0x3a3228, alpha: 0.7 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    pit
      .circle(FIRE.x + Math.cos(a) * 11, FIRE.y + 1 + Math.sin(a) * 2.8, 1.9)
      .fill({ color: i % 2 ? 0x8d9299 : 0x767b82 });
  }
  pit.roundRect(FIRE.x - 7, FIRE.y - 2.4, 14, 3, 1.5).fill({ color: 0x5a3f28 });
  pit.roundRect(FIRE.x - 5, FIRE.y - 4.2, 10, 2.6, 1.3).fill({ color: 0x6a4a30 });
  view.addChild(pit);

  const LOG_H = 13;
  const logs = new Graphics();
  for (const lx of [FIRE.x - 36, FIRE.x + 36]) {
    logs.roundRect(lx - 13, -LOG_H + 10, 26, LOG_H - 4, 4).fill({ color: 0x7a5c3e });
    logs.roundRect(lx - 13, -LOG_H + 10, 26, 3.5, 1.7).fill({ color: 0x93714e });
    logs.ellipse(lx + 13, -LOG_H + 10 + (LOG_H - 4) / 2, 2.2, (LOG_H - 4) / 2).fill({ color: 0xc9a877 });
  }
  view.addChild(logs);

  // --- Campers ---
  const campers: { person: Person; home: number }[] = [];
  for (let i = 0; i < 2; i++) {
    const look = randomLook(rng, 6, "adult");
    const person = buildPerson(look);
    view.addChild(person.view);
    campers.push({ person, home: i });
  }

  // --- Fire: flame redrawn each frame, embers, glow on its own layer ---
  const flame = new Graphics();
  view.addChild(flame);

  const glow = new Container();
  glow.scale.set(scale);
  const glowHalo = new Graphics();
  glowHalo.circle(0, -8, 64).fill({ color: 0xff9a4a, alpha: 0.3 });
  glowHalo.circle(0, -8, 32).fill({ color: 0xffb060, alpha: 0.45 });
  const glowPool = new Graphics();
  glowPool.ellipse(0, 2, 66, 16).fill({ color: 0xffa050 });
  glow.addChild(glowPool, glowHalo);
  glowHalo.alpha = 0;
  glowPool.alpha = 0;

  const embers: Ember[] = [];
  let flameT = 0;
  let fireK = 0; // eased fire intensity
  let outK = 1; // eased camper presence
  let seated = false; // current camper pose
  let idleT = 0;
  let first = true; // snap to the current state on the first frame

  const place = () => {
    for (const c of campers) {
      const p = c.person;
      const sc = 0.92;
      if (seated) {
        // On the logs, facing the fire.
        const lx = c.home === 0 ? FIRE.x - 36 : FIRE.x + 36;
        const dir = c.home === 0 ? 1 : -1;
        p.view.x = lx;
        p.view.y = -LOG_H + 10 + p.look.height * 0.47 * sc;
        p.view.scale.set(dir * sc, sc);
      } else {
        // Idling by the tent.
        const lx = c.home === 0 ? -46 : 36;
        const dir = c.home === 0 ? 1 : -1;
        p.view.x = lx;
        p.view.y = 4;
        p.view.scale.set(dir * sc, sc);
      }
    }
  };
  place();

  const update = (dtMs: number, L: Lighting, w: WeatherState) => {
    const dt = Math.min(dtMs / 1000, 0.1);
    flameT += dt;
    idleT += dt;

    const night = L.starAlpha > 0.35;
    const raining = w.kind === "rain" && w.intensity > 0.25;
    const fireOn = night && !raining;
    // At night in the rain everyone shelters inside the tent.
    const campersOut = !night || fireOn;

    // The scene can load mid-night: start fully developed, no fade-in.
    if (first) {
      first = false;
      fireK = fireOn ? 1 : 0;
      outK = campersOut ? 1 : 0;
      seated = night && fireOn;
      place();
    }
    fireK += ((fireOn ? 1 : 0) - fireK) * Math.min(1, 2.5 * dt);
    outK += ((campersOut ? 1 : 0) - outK) * Math.min(1, 3 * dt);

    // Swap poses while the campers are (nearly) faded out, or on day/night
    // flips while they stay visible.
    const wantSeated = night && fireOn;
    if (wantSeated !== seated && (outK < 0.1 || Math.abs(outK - 1) < 0.05)) {
      seated = wantSeated;
      place();
    }

    for (const c of campers) {
      c.person.view.alpha = outK;
      c.person.view.visible = outK > 0.03;
      if (!c.person.view.visible) continue;
      const t = idleT + c.home * 3.7;
      if (seated) c.person.sit(t);
      else c.person.stand(t, !night && raining);
    }

    // Flame + embers.
    flame.clear();
    if (fireK > 0.02) {
      const n =
        Math.sin(flameT * 9.3) * 0.5 + Math.sin(flameT * 23.7 + 1.3) * 0.3 + Math.sin(flameT * 5.1 + 4) * 0.2;
      const h = 17 * (1 + n * 0.16) * (0.5 + fireK * 0.5);
      const lean = Math.sin(flameT * 7.7) * 1.8;
      const tip = (k: number) => [FIRE.x + lean * k, FIRE.y - 4 - h * k] as const;
      const layer = (wk: number, hk: number, color: number, alpha: number) => {
        const [tx, ty] = tip(hk);
        flame
          .moveTo(FIRE.x - 6 * wk, FIRE.y - 3)
          .quadraticCurveTo(FIRE.x - 7 * wk, FIRE.y - 3 - h * hk * 0.5, tx, ty)
          .quadraticCurveTo(FIRE.x + 7 * wk, FIRE.y - 3 - h * hk * 0.5, FIRE.x + 6 * wk, FIRE.y - 3)
          .closePath()
          .fill({ color, alpha: alpha * fireK });
      };
      layer(1, 1, 0xe8732a, 0.9);
      layer(0.66, 0.68, 0xf7a03c, 0.95);
      layer(0.36, 0.38, 0xffd978, 1);

      if (embers.length < 10 && Math.random() < 0.3) {
        embers.push({
          x: FIRE.x + (Math.random() - 0.5) * 8,
          y: FIRE.y - 8,
          vx: (Math.random() - 0.5) * 8,
          vy: -(14 + Math.random() * 16),
          age: 0,
          life: 0.7 + Math.random() * 0.9,
        });
      }
    }
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i];
      e.age += dt;
      if (e.age >= e.life || fireK < 0.02) {
        embers.splice(i, 1);
        continue;
      }
      e.x += (e.vx + Math.sin((e.age + e.life) * 9) * 6) * dt;
      e.y += e.vy * dt;
      const k = 1 - e.age / e.life;
      flame.circle(e.x, e.y, 0.9 * k + 0.3).fill({ color: 0xffb060, alpha: 0.9 * k * fireK });
    }

    // Glow flicker.
    const flick = 1 + Math.sin(flameT * 11.4) * 0.07 + Math.sin(flameT * 27.2) * 0.04;
    glowHalo.alpha = 0.2 * fireK * flick;
    glowPool.alpha = 0.12 * fireK * flick;
  };

  return { view, glow, update };
}
