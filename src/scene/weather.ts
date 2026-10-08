import { Container, Graphics, Text } from "pixi.js";
import type { Lighting } from "./lighting";
import { mulberry32, range } from "./rng";

export type WeatherKind = "clear" | "cloudy" | "rain" | "snow" | "fog";

export type WeatherState = {
  kind: WeatherKind;
  intensity: number; // 0..1 precipitation strength
  cloud: number; // 0..1 cloud cover
  fog: number; // 0..1
  wind: number; // -1..1
};

export type WeatherController = {
  sample: (month: number, dtMs: number) => WeatherState;
};

const KINDS: WeatherKind[] = ["clear", "cloudy", "rain", "snow", "fog"];

function targetFor(kind: WeatherKind): Omit<WeatherState, "wind"> {
  switch (kind) {
    case "clear":
      return { kind, intensity: 0, cloud: 0.12, fog: 0 };
    case "cloudy":
      return { kind, intensity: 0, cloud: 0.7, fog: 0.05 };
    case "rain":
      return { kind, intensity: 0.75, cloud: 0.85, fog: 0.12 };
    case "snow":
      return { kind, intensity: 0.7, cloud: 0.7, fog: 0.06 };
    case "fog":
      return { kind, intensity: 0, cloud: 0.4, fog: 0.72 };
  }
}

/** Season-biased random weather pick. */
function pickKind(month: number): WeatherKind {
  const m = ((month % 12) + 12) % 12;
  const r = Math.random();
  const winter = m < 2 || m >= 11;
  const summer = m >= 5 && m < 8;
  if (winter) return r < 0.5 ? "snow" : r < 0.7 ? "cloudy" : r < 0.85 ? "clear" : "fog";
  if (summer) return r < 0.55 ? "clear" : r < 0.82 ? "cloudy" : "rain";
  return r < 0.33 ? "rain" : r < 0.5 ? "cloudy" : r < 0.65 ? "fog" : r < 0.85 ? "clear" : "snow";
}

/**
 * Evolving weather. Defaults to season-biased procedural weather that changes
 * every ~30s with smooth transitions. Dev/preview overrides via URL:
 *   ?weather=rain|snow|fog|cloudy|clear   force the condition
 *   ?wind=-0.6                            force wind (-1..1)
 */
export function createWeather(): WeatherController {
  const params = new URLSearchParams(window.location.search);
  const fk = params.get("weather");
  const forcedKind = fk && KINDS.includes(fk as WeatherKind) ? (fk as WeatherKind) : null;
  const windParam = params.get("wind");
  const forcedWind = windParam !== null ? Number(windParam) : null;

  // A forced condition starts fully developed so previews show it instantly.
  const state: WeatherState = {
    ...targetFor(forcedKind ?? "clear"),
    wind: forcedWind ?? 0.2,
  };
  let target: WeatherState = { ...state };
  let timer = 0;
  let nextChange = 6;

  const approach = (cur: number, to: number, rate: number, dt: number) =>
    cur + (to - cur) * Math.min(1, rate * dt);

  const sample = (month: number, dtMs: number): WeatherState => {
    const dt = dtMs / 1000;

    if (forcedKind === null) {
      timer += dt;
      if (timer >= nextChange) {
        timer = 0;
        nextChange = 25 + Math.random() * 30;
        target = { ...targetFor(pickKind(month)), wind: Math.random() * 2 - 1 };
      }
    }

    state.cloud = approach(state.cloud, target.cloud, 0.4, dt);
    state.fog = approach(state.fog, target.fog, 0.4, dt);
    state.wind = forcedWind ?? approach(state.wind, target.wind, 0.3, dt);

    // Fade precipitation out before switching kind, then fade the new one in.
    if (state.kind !== target.kind) {
      state.intensity = approach(state.intensity, 0, 1.2, dt);
      if (state.intensity < 0.02) state.kind = target.kind;
    } else {
      state.intensity = approach(state.intensity, target.intensity, 0.5, dt);
    }
    return state;
  };

  return { sample };
}

export type WeatherView = {
  update: (s: WeatherState, dtMs: number, L: Lighting) => void;
};

type CloudKind = "towering" | "puffy" | "wisp";
type Cloud = {
  view: Container;
  body: Graphics;
  shade: Graphics;
  lite: Graphics;
  spd: number;
};

/**
 * A cumulus built from stacked puffs, drawn white in three layers — body,
 * shadowed underside, sunlit tops — each tinted separately by the time of
 * day, so clouds go cream-and-rose at sunset and moonlit slate at night.
 */
function makeCloud(seed: number, kind: CloudKind, spd: number): Cloud {
  const rng = mulberry32(seed);
  const view = new Container();
  const body = new Graphics();
  const shade = new Graphics();
  const lite = new Graphics();

  if (kind === "wisp") {
    // Thin horizontal streaks, body layer only.
    const len = range(rng, 130, 230);
    for (let i = 0; i < 3; i++) {
      body
        .ellipse(
          range(rng, -len * 0.3, len * 0.3),
          i * range(rng, 4, 9) - 8,
          range(rng, 55, len * 0.5 + 30),
          range(rng, 4.5, 8),
        )
        .fill({ color: 0xffffff, alpha: 0.5 });
    }
    view.addChild(body, shade, lite);
    return { view, body, shade, lite, spd };
  }

  const w = kind === "towering" ? range(rng, 250, 330) : range(rng, 150, 230);
  const baseR = w * 0.17;
  const puffs: { x: number; y: number; r: number }[] = [];

  // Base row with roughly aligned bottoms, then shrinking dome tiers.
  const nBase = Math.round(w / (baseR * 1.1));
  for (let i = 0; i < nBase; i++) {
    const r = baseR * range(rng, 0.85, 1.2);
    puffs.push({
      x: -w / 2 + (i + 0.5) * (w / nBase) + range(rng, -6, 6),
      y: -r * 0.8,
      r,
    });
  }
  const tiers = kind === "towering" ? 3 : 2;
  let tierW = w * 0.68;
  let tierY = -baseR * 1.5;
  for (let t = 1; t < tiers; t++) {
    const n = Math.max(2, Math.round(nBase * (1 - t * 0.33)));
    for (let i = 0; i < n; i++) {
      puffs.push({
        x: (-tierW / 2 + (i + 0.5) * (tierW / n)) * range(rng, 0.85, 1) + range(rng, -8, 8),
        y: tierY - range(rng, 0, baseR * 0.4),
        r: baseR * range(rng, 0.75, 1.1) * (1 - t * 0.12),
      });
    }
    tierW *= 0.6;
    tierY -= baseR * range(rng, 0.9, 1.2);
  }

  for (const p of puffs) body.circle(p.x, p.y, p.r).fill({ color: 0xffffff, alpha: 0.97 });
  body.ellipse(0, -baseR * 0.35, w * 0.52, baseR * 0.55).fill({ color: 0xffffff, alpha: 0.97 });

  // Flat shadowed underside.
  shade.ellipse(0, -baseR * 0.22, w * 0.48, baseR * 0.42).fill({ color: 0xffffff, alpha: 0.5 });
  for (const p of puffs) {
    if (p.y > -baseR * 1.2) {
      shade
        .circle(p.x + p.r * 0.1, p.y + p.r * 0.45, p.r * 0.62)
        .fill({ color: 0xffffff, alpha: 0.32 });
    }
  }

  // Sunlit caps on the upper puffs.
  for (const p of puffs) {
    if (p.y < -baseR * 1.1) {
      lite
        .circle(p.x - p.r * 0.25, p.y - p.r * 0.32, p.r * 0.55)
        .fill({ color: 0xffffff, alpha: 0.75 });
    }
  }

  view.addChild(body, shade, lite);
  return { view, body, shade, lite, spd };
}

/**
 * Weather visuals, added to `root` with explicit zIndex so they interleave with
 * the scene layers (clouds behind the darkening grade, precipitation above the
 * land). Requires root.sortableChildren = true. Fog deliberately has no visual:
 * it only raises a small screen-space notice, added to `hud` (untransformed).
 */
export function createWeatherView(
  root: Container,
  hud: Container,
  W: number,
  H: number,
): WeatherView {
  // --- Clouds: a seeded sky of cumulus, puffs and wisps ---
  const clouds = new Container();
  clouds.zIndex = 20;
  clouds.alpha = 0;
  const cloudDefs: { kind: CloudKind; x: number; y: number; s: number; spd: number }[] = [
    { kind: "towering", x: 620, y: 205, s: 1.15, spd: 6 },
    { kind: "towering", x: 1360, y: 185, s: 0.95, spd: 7 },
    { kind: "puffy", x: 200, y: 160, s: 1.0, spd: 9 },
    { kind: "puffy", x: 1000, y: 180, s: 0.8, spd: 11 },
    { kind: "puffy", x: 60, y: 230, s: 0.62, spd: 13 },
    { kind: "wisp", x: 460, y: 55, s: 1.0, spd: 4 },
    { kind: "wisp", x: 1120, y: 38, s: 1.2, spd: 3.5 },
    { kind: "wisp", x: 810, y: 235, s: 0.75, spd: 5 },
  ];
  const cloudList: Cloud[] = [];
  cloudDefs.forEach((d, i) => {
    const c = makeCloud(i * 7919 + 13, d.kind, d.spd);
    c.view.position.set(d.x, d.y);
    c.view.scale.set(d.s);
    clouds.addChild(c.view);
    cloudList.push(c);
  });
  root.addChild(clouds);

  // --- Precipitation (redrawn each frame) ---
  const precip = new Graphics();
  precip.zIndex = 60;
  root.addChild(precip);
  const MAX = 260;
  const parts = Array.from({ length: MAX }, (_, i) => ({
    x: (i * 167) % W,
    y: (i * 97) % H,
    f: (i % 13) / 13,
    phase: i,
  }));

  // --- Fog notice (fog itself is intentionally not rendered) ---
  const fogNote = new Container();
  const fogText = new Text({
    text: "Fog is not implemented yet",
    style: {
      fontFamily:
        "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      fontSize: 13,
      fill: 0xf2f5f8,
    },
  });
  fogText.position.set(10, 5);
  const fogBg = new Graphics()
    .roundRect(0, 0, fogText.width + 20, fogText.height + 10, 8)
    .fill({ color: 0x10141c, alpha: 0.45 });
  fogNote.addChild(fogBg, fogText);
  fogNote.position.set(12, 10);
  fogNote.alpha = 0;
  hud.addChild(fogNote);

  const update = (s: WeatherState, dtMs: number, L: Lighting) => {
    const dt = dtMs / 1000;

    clouds.alpha = Math.min(1, s.cloud * 1.1);
    for (const c of cloudList) {
      c.view.x += s.wind * c.spd * dt * 10;
      if (c.view.x > W + 400) c.view.x = -400;
      else if (c.view.x < -400) c.view.x = W + 400;
      c.body.tint = L.cloudBody;
      c.shade.tint = L.cloudShade;
      c.lite.tint = L.cloudLite;
    }

    fogNote.alpha = s.fog > 0.25 ? Math.min(1, (s.fog - 0.25) / 0.3) * 0.9 : 0;

    precip.clear();
    const active = s.kind === "rain" || s.kind === "snow";
    if (!active || s.intensity < 0.02) return;
    const count = Math.floor(s.intensity * MAX);

    if (s.kind === "rain") {
      // Streaks are drawn along their own velocity vector, so the slant
      // always matches the direction the drops actually travel.
      const vx = s.wind * 260;
      for (let i = 0; i < count; i++) {
        const p = parts[i];
        const vy = 720 + p.f * 320;
        p.y += vy * dt;
        p.x += vx * dt;
        if (p.y > H) p.y -= H;
        if (p.x > W) p.x -= W;
        else if (p.x < 0) p.x += W;
        const k = (13 + p.f * 9) / Math.hypot(vx, vy);
        precip.moveTo(p.x, p.y).lineTo(p.x - vx * k, p.y - vy * k);
      }
      precip.stroke({ width: 1.4, color: 0x9fb8d0, alpha: 0.5 });
    } else {
      for (let i = 0; i < count; i++) {
        const p = parts[i];
        p.phase += dt;
        p.y += (50 + p.f * 70) * dt;
        p.x += (s.wind * 40 + Math.sin(p.phase) * 18) * dt;
        if (p.y > H) p.y -= H;
        if (p.x > W) p.x -= W;
        else if (p.x < 0) p.x += W;
        precip.circle(p.x, p.y, 1.5 + p.f * 2).fill({ color: 0xffffff, alpha: 0.9 });
      }
    }
  };

  return { update };
}
