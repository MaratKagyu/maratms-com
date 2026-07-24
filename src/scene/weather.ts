import { Container, Graphics, Sprite, Texture } from "pixi.js";

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

  const state: WeatherState = { kind: "clear", intensity: 0, cloud: 0.12, fog: 0, wind: 0.2 };
  let target: WeatherState = {
    ...targetFor(forcedKind ?? "clear"),
    wind: forcedWind ?? 0.2,
  };
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

export type WeatherView = { update: (s: WeatherState, dtMs: number) => void };

/**
 * Weather visuals, added to `root` with explicit zIndex so they interleave with
 * the scene layers (clouds behind the darkening grade, precipitation above the
 * land, fog on top). Requires root.sortableChildren = true.
 */
export function createWeatherView(root: Container, W: number, H: number): WeatherView {
  // --- Clouds ---
  const clouds = new Container();
  clouds.zIndex = 20;
  clouds.alpha = 0;
  const cloudDefs = [
    { x: 200, y: 90, s: 1.2, spd: 8 },
    { x: 620, y: 60, s: 1.6, spd: 6 },
    { x: 1000, y: 120, s: 1.1, spd: 10 },
    { x: 1350, y: 80, s: 1.4, spd: 7 },
    { x: 820, y: 160, s: 0.9, spd: 12 },
  ];
  const cloudList: { g: Graphics; spd: number }[] = [];
  const puffs: [number, number, number][] = [
    [0, 0, 46],
    [38, 6, 34],
    [-40, 8, 34],
    [10, -18, 32],
    [70, 4, 26],
    [-70, 6, 24],
  ];
  for (const d of cloudDefs) {
    const g = new Graphics();
    for (const [px, py, r] of puffs) {
      g.ellipse(px, py, r * 1.2, r).fill({ color: 0xffffff, alpha: 0.9 });
    }
    g.position.set(d.x, d.y);
    g.scale.set(d.s);
    clouds.addChild(g);
    cloudList.push({ g, spd: d.spd });
  }
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

  // --- Fog ---
  const fog = new Sprite(Texture.WHITE);
  fog.width = W;
  fog.height = H;
  fog.tint = 0xcdd6de;
  fog.alpha = 0;
  fog.zIndex = 75;
  root.addChild(fog);

  const update = (s: WeatherState, dtMs: number) => {
    const dt = dtMs / 1000;

    clouds.alpha = s.cloud;
    for (const c of cloudList) {
      c.g.x += s.wind * c.spd * dt * 10;
      if (c.g.x > W + 320) c.g.x = -320;
      else if (c.g.x < -320) c.g.x = W + 320;
    }

    fog.alpha = s.fog * 0.55;

    precip.clear();
    const active = s.kind === "rain" || s.kind === "snow";
    if (!active || s.intensity < 0.02) return;
    const count = Math.floor(s.intensity * MAX);

    if (s.kind === "rain") {
      for (let i = 0; i < count; i++) {
        const p = parts[i];
        p.y += (720 + p.f * 320) * dt;
        p.x += s.wind * 120 * dt;
        if (p.y > H) p.y -= H;
        if (p.x > W) p.x -= W;
        else if (p.x < 0) p.x += W;
        precip.moveTo(p.x, p.y).lineTo(p.x - s.wind * 14, p.y + 12 + p.f * 10);
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
