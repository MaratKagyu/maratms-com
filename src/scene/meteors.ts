import { Graphics } from "pixi.js";
import { clamp01, lerp } from "./color";

/**
 * Shooting stars. At night they are frequent and detailed: a bright head
 * with a halo, a tapering trail, embers sparking off and burning out, and
 * the occasional bolide with a terminal flash. By day they are rare, thin,
 * barely-there pale streaks. Cloud cover suppresses them. The afterglow
 * lingers briefly after the head burns out.
 *
 * Dev override: `?meteors=N` multiplies the spawn frequency (try 20).
 */
export type Meteors = {
  view: Graphics;
  update: (dtMs: number, starAlpha: number, cloud: number) => void;
};

type Meteor = {
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  speed: number;
  dur: number;
  t: number;
  fadeT: number;
  len: number;
  bright: number;
  day: boolean;
  bolide: boolean;
  color: number;
};

type Ember = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  r: number;
};

const FADE = 0.45; // afterglow seconds

export function createMeteors(W: number, horizonY: number): Meteors {
  const view = new Graphics();
  view.zIndex = 82; // above the stars, unaffected by the night grade

  const freqMult = Math.max(
    0.1,
    Number(new URLSearchParams(window.location.search).get("meteors")) || 1,
  );

  const meteors: Meteor[] = [];
  const embers: Ember[] = [];
  let timer = (3 + Math.random() * 5) / freqMult;

  const spawn = (starAlpha: number) => {
    const day = starAlpha < 0.35;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const angle = ((18 + Math.random() * 27) * Math.PI) / 180;
    const dx = dir * Math.cos(angle);
    const dy = Math.sin(angle);
    const speed = 500 + Math.random() * 450;
    const bolide = !day && Math.random() < 0.12;
    const dur = (0.45 + Math.random() * 0.55) * (bolide ? 1.4 : 1);
    const travelY = dy * speed * dur;
    const band = Math.max(40, horizonY - 160 - travelY);
    const y0 = 18 + Math.random() * band;
    const x0 = dir > 0 ? Math.random() * W * 0.6 : W * 0.4 + Math.random() * W * 0.6;
    meteors.push({
      x0,
      y0,
      dx,
      dy,
      speed,
      dur,
      t: 0,
      fadeT: 0,
      len: (90 + Math.random() * 70) * (bolide ? 1.6 : 1) * (day ? 0.65 : 1),
      bright: day ? 0.2 + starAlpha * 0.3 : 0.55 + 0.45 * starAlpha,
      day,
      bolide,
      color: day ? 0xf4f7fa : Math.random() < 0.3 ? 0xcfe0ff : 0xfff4e0,
    });
  };

  const update = (dtMs: number, starAlpha: number, cloud: number) => {
    const dt = Math.min(dtMs / 1000, 0.1);

    timer -= dt;
    if (timer <= 0) {
      // Night: a meteor every ~6-13s; day: every minute or so.
      timer = (lerp(70, 9, clamp01(starAlpha)) * (0.6 + Math.random() * 0.8)) / freqMult;
      if (Math.random() > cloud && meteors.length < 3) spawn(starAlpha);
    }

    view.clear();

    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.t += dt;
      let alphaK = 1;
      if (m.t >= m.dur) {
        m.fadeT += dt;
        if (m.fadeT >= FADE) {
          meteors.splice(i, 1);
          continue;
        }
        alphaK = 1 - m.fadeT / FADE;
      }
      const tt = Math.min(m.t, m.dur);
      const hx = m.x0 + m.dx * m.speed * tt;
      const hy = m.y0 + m.dy * m.speed * tt;
      const flying = m.t < m.dur;

      // Tapering trail, white-hot near the head, tinted further back.
      const K = 7;
      for (let k = 0; k < K; k++) {
        const a0 = k / K;
        const a1 = (k + 1) / K;
        view
          .moveTo(hx - m.dx * m.len * a0, hy - m.dy * m.len * a0)
          .lineTo(hx - m.dx * m.len * a1, hy - m.dy * m.len * a1)
          .stroke({
            width: lerp(2.3, 0.35, a0) * (m.bolide ? 1.5 : 1) * (m.day ? 0.55 : 1),
            color: k === 0 ? 0xffffff : m.color,
            alpha: m.bright * alphaK * Math.pow(1 - a0, 1.6),
          });
      }

      if (flying && !m.day) {
        // Glowing head.
        view.circle(hx, hy, m.bolide ? 2.3 : 1.5).fill({ color: 0xffffff, alpha: m.bright * alphaK });
        view
          .circle(hx, hy, m.bolide ? 6 : 3.6)
          .fill({ color: m.color, alpha: 0.25 * m.bright * alphaK });
        // Embers sparking off behind the head.
        if (embers.length < 40 && Math.random() < (m.bolide ? 0.75 : 0.4)) {
          embers.push({
            x: hx - m.dx * (6 + Math.random() * 14) + (Math.random() - 0.5) * 3,
            y: hy - m.dy * (6 + Math.random() * 14) + (Math.random() - 0.5) * 3,
            vx: -m.dx * 25 + (Math.random() - 0.5) * 30,
            vy: -m.dy * 25 + 14 + Math.random() * 18,
            age: 0,
            life: 0.3 + Math.random() * 0.35,
            r: 0.5 + Math.random() * 0.9,
          });
        }
      }

      // A bolide goes out with a brief flash.
      if (m.bolide && !flying) {
        view.circle(hx, hy, 4 + m.fadeT * 30).fill({ color: 0xfff4e0, alpha: 0.28 * alphaK });
      }
    }

    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i];
      e.age += dt;
      if (e.age >= e.life) {
        embers.splice(i, 1);
        continue;
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      const k = 1 - e.age / e.life;
      view.circle(e.x, e.y, e.r * k).fill({ color: 0xffd9a0, alpha: 0.8 * k });
    }
  };

  return { view, update };
}
