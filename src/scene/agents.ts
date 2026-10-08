import { Container, Graphics } from "pixi.js";
import { clamp01, lerp } from "./color";
import {
  buildPerson,
  coldness,
  randomLook,
  type Archetype,
  type Person,
} from "./person";
import { chance, mulberry32, pick, range, type Rng } from "./rng";
import type { WeatherState } from "./weather";

export type AgentCtx = { month: number; hour: number; weather: WeatherState };
export type AgentSystem = { update: (dtMs: number, ctx: AgentCtx) => void };

/** A bench the walkers can sit on (world coords of its base, and its scale). */
export type BenchSpot = { x: number; y: number; scale: number };

const FUR = [0x8a5a2b, 0x9a9a9a, 0x3a3a3a, 0xcaa15a, 0x6e4a30, 0xe8e2d4];
const BENCH_SEAT_H = 26; // seat height in bench-local units (see entities.ts)

/** A dog in side profile, facing +x by default. Feet at (0,0). */
function buildDog(rng: Rng) {
  const root = new Container();
  const fur = pick(rng, FUR);
  const belly = chance(rng, 0.5);
  const earFlop = chance(rng, 0.5);
  const tailUp = chance(rng, 0.6);
  const legLen = 13;
  const hipY = -legLen;

  const legs: Graphics[] = [];
  for (const lx of [-13, -7, 7, 13]) {
    const leg = new Graphics().rect(-1.5, 0, 3, legLen).fill({ color: fur });
    leg.position.set(lx, hipY);
    legs.push(leg);
    root.addChild(leg);
  }

  const body = new Graphics();
  body.roundRect(-18, hipY - 14, 36, 15, 7).fill({ color: fur });
  if (belly) {
    body.ellipse(6, hipY - 3, 10, 4).fill({ color: 0xe8e2d4, alpha: 0.85 });
  }
  body.circle(20, hipY - 12, 8).fill({ color: fur }); // head
  body.poly([26, hipY - 14, 33, hipY - 11, 26, hipY - 8]).fill({ color: fur }); // snout
  if (earFlop) {
    body.roundRect(13, hipY - 18, 5, 9, 2.5).fill({ color: fur === 0x3a3a3a ? 0x2a2a2a : 0x5a3b22 });
  } else {
    body.poly([15, hipY - 20, 20, hipY - 20, 17, hipY - 12]).fill({ color: fur }); // pointy ear
  }

  const tail = new Graphics().roundRect(0, -2, 12, 4, 2).fill({ color: fur });
  tail.position.set(-18, hipY - 10);

  root.addChild(body, tail);

  const tailBase = tailUp ? -0.9 : -0.3;
  const swing = 0.6;
  const animate = (phase: number) => {
    legs[0].rotation = Math.sin(phase) * swing;
    legs[3].rotation = Math.sin(phase) * swing;
    legs[1].rotation = Math.sin(phase + Math.PI) * swing;
    legs[2].rotation = Math.sin(phase + Math.PI) * swing;
    tail.rotation = tailBase + Math.sin(phase * 2) * 0.2;
  };
  return { root, animate };
}

/** A duck floating and drifting on the water. */
function createDuck(
  index: number,
  baseX: number,
  baseY: number,
  speed: number,
  worldW: number,
) {
  const view = new Container();
  const g = new Graphics();
  g.ellipse(0, 0, 10, 6).fill({ color: 0xf2f2ea }); // body
  g.circle(7, -6, 4).fill({ color: 0xf2f2ea }); // head
  g.poly([10, -6, 15, -5, 10, -4]).fill({ color: 0xe8a33a }); // beak
  g.ellipse(-4, -1, 6, 3).fill({ color: 0xcfcfc4 }); // wing
  view.addChild(g);

  let x = baseX;
  let spd = speed;
  let phase = index;

  const update = (dtMs: number) => {
    const dt = dtMs / 1000;
    x += spd * dt;
    if (x < 40) {
      x = 40;
      spd = Math.abs(spd);
    } else if (x > worldW - 40) {
      x = worldW - 40;
      spd = -Math.abs(spd);
    }
    phase += dt * 2;
    view.x = x;
    view.y = baseY + Math.sin(phase) * 1.6;
    view.scale.x = spd >= 0 ? 1 : -1;
  };
  return { view, update };
}

const SPEED_BY_ARCHETYPE: Record<Archetype, [number, number]> = {
  adult: [28, 52],
  kid: [40, 58],
  elder: [15, 22],
  jogger: [80, 105],
};

type Seat = { x: number; groundY: number; scale: number; taken: boolean };

type NpcState = "walk" | "pause" | "toSeat" | "sit" | "leave";

type Dog = {
  view: Container;
  animate: (phase: number) => void;
  shadow: Graphics;
  x: number;
  dir: 1 | -1;
  phase: number;
  baseScale: number;
};

/** Soft contact shadow, inserted under a figure's feet. */
function addShadow(view: Container, rx: number): Graphics {
  const g = new Graphics();
  g.ellipse(0, 1, rx, rx * 0.26).fill({ color: 0x1c2430 });
  g.alpha = 0.18;
  view.addChildAt(g, 0);
  return g;
}

type Npc = {
  person: Person;
  state: NpcState;
  x: number;
  dir: 1 | -1;
  cruise: number;
  speed: number;
  targetSpeed: number;
  phase: number;
  idleT: number;
  stateT: number;
  stateDur: number;
  pace: number;
  phaseRate: number;
  umbrella: boolean;
  seat: Seat | null;
  /** Last seat, for blending y between the path and the bench ground. */
  nearSeat: Seat | null;
  dog: Dog | null;
  leash: Graphics | null;
  shadow: Graphics;
};

const depthScale = (y: number) => lerp(0.82, 1.08, clamp01((y - 720) / (840 - 720)));

/**
 * The living population: walkers enter from the edges, stroll, pause, sit on
 * benches, walk dogs on leashes, raise umbrellas in rain and leave the scene.
 * Density follows the time of day, weather and season. Ducks drift on the
 * water as before.
 */
export function createAgents(
  land: Container,
  water: Container,
  yAt: (x: number) => number,
  worldW: number,
  benches: BenchSpot[],
): AgentSystem {
  const rng = mulberry32((Math.random() * 2 ** 32) >>> 0);
  const EDGE = 80;
  const npcs: Npc[] = [];
  const seats: Seat[] = benches.flatMap((b) => [
    { x: b.x - 15 * b.scale, groundY: b.y, scale: b.scale, taken: false },
    { x: b.x + 15 * b.scale, groundY: b.y, scale: b.scale, taken: false },
  ]);

  const ducks = [
    createDuck(0, 300, 470, 12, worldW),
    createDuck(1, 700, 500, -9, worldW),
    createDuck(2, 1100, 455, 10, worldW),
  ];
  for (const d of ducks) water.addChild(d.view);

  const pickArchetype = (hour: number): Archetype => {
    const morning = hour >= 6 && hour < 9.5;
    const evening = hour >= 17 && hour < 21;
    const r = rng();
    const jog = morning || evening ? 0.3 : 0.08;
    if (r < jog) return "jogger";
    if (hour >= 9 && hour < 19 && r < jog + 0.18) return "kid";
    if (hour >= 9 && hour < 17 && r < jog + 0.36) return "elder";
    return "adult";
  };

  const spawnNpc = (ctx: AgentCtx, opts: { atEdge?: boolean; seated?: boolean } = {}) => {
    const archetype = pickArchetype(ctx.hour);
    const look = randomLook(rng, ctx.month, archetype);
    const person = buildPerson(look);
    const [lo, hi] = SPEED_BY_ARCHETYPE[archetype];
    const cruise = range(rng, lo, hi);
    const npc: Npc = {
      person,
      state: "walk",
      x: 0,
      dir: chance(rng, 0.5) ? 1 : -1,
      cruise,
      speed: cruise,
      targetSpeed: cruise,
      phase: rng() * 6.28,
      idleT: rng() * 10,
      stateT: 0,
      stateDur: range(rng, 6, 18),
      pace:
        archetype === "jogger"
          ? clamp01((cruise - 35) / 65)
          : archetype === "elder"
            ? 0.05
            : clamp01((cruise - 25) / 50),
      phaseRate: 0.11 * (60 / look.height),
      umbrella: false,
      seat: null,
      nearSeat: null,
      dog: null,
      leash: null,
      shadow: addShadow(person.view, look.height * 0.2),
    };

    const freeSeat = seats.find((s) => !s.taken);
    if (opts.seated && freeSeat) {
      freeSeat.taken = true;
      npc.seat = freeSeat;
      npc.nearSeat = freeSeat;
      npc.state = "sit";
      npc.stateDur = range(rng, 10, 45);
      npc.x = freeSeat.x;
      npc.speed = 0;
      npc.targetSpeed = 0;
    } else if (opts.atEdge) {
      npc.x = npc.dir === 1 ? -EDGE + 10 : worldW + EDGE - 10;
    } else {
      npc.x = range(rng, 60, worldW - 60);
    }

    // Some adults walk a dog on a leash.
    if (archetype === "adult" && npc.state === "walk" && chance(rng, 0.3)) {
      const d = buildDog(rng);
      npc.dog = {
        view: d.root,
        animate: d.animate,
        shadow: addShadow(d.root, 15),
        x: npc.x - npc.dir * 34,
        dir: npc.dir,
        phase: rng() * 6.28,
        baseScale: range(rng, 0.65, 1.1),
      };
      land.addChild(npc.dog.view);
      npc.leash = new Graphics();
      land.addChild(npc.leash);
    }

    land.addChild(person.view);
    npcs.push(npc);
  };

  const despawn = (npc: Npc) => {
    if (npc.seat) npc.seat.taken = false;
    land.removeChild(npc.person.view);
    npc.person.view.destroy({ children: true });
    if (npc.dog) {
      land.removeChild(npc.dog.view);
      npc.dog.view.destroy({ children: true });
    }
    if (npc.leash) {
      land.removeChild(npc.leash);
      npc.leash.destroy();
    }
    npcs.splice(npcs.indexOf(npc), 1);
  };

  const targetCount = (ctx: AgentCtx): number => {
    const h = ctx.hour;
    const base =
      h < 5 ? 0 : h < 7 ? 2 : h < 10 ? 5 : h < 16 ? 6 : h < 19 ? 7 : h < 22 ? 3 : 1;
    const w = ctx.weather;
    let f = 1;
    if (w.kind === "rain") f = lerp(1, 0.35, w.intensity);
    else if (w.kind === "snow") f = lerp(1, 0.55, w.intensity);
    else if (w.kind === "fog") f = 0.75;
    else if (w.cloud > 0.5) f = 0.9;
    f *= 1 - coldness(ctx.month) * 0.35;
    return Math.round(base * f);
  };

  const stepDog = (npc: Npc, dt: number, ownerY: number, ownerSc: number) => {
    const dog = npc.dog!;
    const target = npc.x - npc.dir * 34;
    const dx = target - dog.x;
    const step = dx * Math.min(1, 2.6 * dt);
    dog.x += step;
    const vel = Math.abs(step / Math.max(dt, 1e-6));
    if (Math.abs(dx) > 4) dog.dir = dx > 0 ? 1 : -1;
    dog.phase += dt * Math.max(vel, Math.abs(npc.speed) * 0.6) * 0.13;
    const y = yAt(dog.x);
    const sc = depthScale(y) * dog.baseScale;
    dog.view.x = dog.x;
    dog.view.y = y;
    dog.view.zIndex = y;
    dog.view.scale.set(dog.dir * sc, sc);
    dog.animate(dog.phase);

    // Leash: a sagging line from the owner's hand to the dog's collar.
    const leash = npc.leash!;
    const hx = npc.x + npc.dir * 5 * ownerSc;
    const hy = ownerY - npc.person.look.height * 0.36 * ownerSc;
    const cx2 = dog.x + dog.dir * 13 * sc;
    const cy2 = y - 20 * sc;
    leash.clear();
    leash
      .moveTo(hx, hy)
      .quadraticCurveTo((hx + cx2) / 2, Math.max(hy, cy2) + 10, cx2, cy2)
      .stroke({ width: 1.4, color: 0x4a3b2d, alpha: 0.85 });
    leash.zIndex = Math.max(y, ownerY) + 1;
  };

  const stepNpc = (npc: Npc, dt: number, ctx: AgentCtx) => {
    npc.stateT += dt;
    npc.idleT += dt;

    // Umbrellas go up in real rain (joggers and kids tough it out).
    const a = npc.person.look.archetype;
    npc.umbrella =
      ctx.weather.kind === "rain" &&
      ctx.weather.intensity > 0.25 &&
      a !== "jogger" &&
      a !== "kid";

    // Ease speed toward the target.
    const accel = 90;
    if (npc.speed < npc.targetSpeed) npc.speed = Math.min(npc.targetSpeed, npc.speed + accel * dt);
    else if (npc.speed > npc.targetSpeed) npc.speed = Math.max(npc.targetSpeed, npc.speed - accel * dt);

    switch (npc.state) {
      case "walk": {
        npc.x += npc.dir * npc.speed * dt;
        if (npc.stateT >= npc.stateDur) {
          npc.stateT = 0;
          npc.stateDur = range(rng, 6, 18);
          const roll = rng();
          const freeSeat =
            a !== "jogger"
              ? seats.find(
                  (s) =>
                    !s.taken &&
                    (s.x - npc.x) * npc.dir > 40 &&
                    Math.abs(s.x - npc.x) < 500,
                )
              : undefined;
          if (roll < 0.2 && a !== "jogger") {
            npc.state = "pause";
            npc.stateDur = range(rng, 2.5, 7);
            npc.targetSpeed = 0;
          } else if (roll < 0.38 && freeSeat) {
            freeSeat.taken = true;
            npc.seat = freeSeat;
            npc.nearSeat = freeSeat;
            npc.state = "toSeat";
          }
        }
        break;
      }
      case "pause": {
        if (npc.stateT >= npc.stateDur) {
          npc.state = "walk";
          npc.stateT = 0;
          npc.stateDur = range(rng, 6, 18);
          npc.targetSpeed = npc.cruise;
        }
        break;
      }
      case "toSeat": {
        const seat = npc.seat!;
        npc.dir = seat.x > npc.x ? 1 : -1;
        npc.targetSpeed = Math.min(npc.cruise, 40);
        npc.x += npc.dir * npc.speed * dt;
        if (Math.abs(npc.x - seat.x) < 4) {
          npc.x = seat.x;
          npc.state = "sit";
          npc.stateT = 0;
          npc.stateDur = range(rng, 10, 45);
          npc.speed = 0;
          npc.targetSpeed = 0;
          npc.dir = chance(rng, 0.5) ? 1 : -1;
        }
        break;
      }
      case "sit": {
        // Rain chases sitters away early.
        const soaked = npc.umbrella === false && ctx.weather.kind === "rain" && ctx.weather.intensity > 0.3;
        if (npc.stateT >= npc.stateDur || soaked) {
          npc.seat!.taken = false;
          npc.seat = null;
          npc.state = chance(rng, 0.5) ? "walk" : "leave";
          npc.stateT = 0;
          npc.stateDur = range(rng, 6, 18);
          npc.targetSpeed = npc.cruise;
          npc.dir = chance(rng, 0.5) ? 1 : -1;
        }
        break;
      }
      case "leave": {
        npc.dir = npc.x < worldW / 2 ? -1 : 1;
        npc.targetSpeed = npc.cruise;
        npc.x += npc.dir * npc.speed * dt;
        break;
      }
    }

    if (npc.x < -EDGE || npc.x > worldW + EDGE) {
      despawn(npc);
      return;
    }

    // Drop the seat blend once we are clear of the bench.
    if (npc.nearSeat && !npc.seat && Math.abs(npc.x - npc.nearSeat.x) > 70) npc.nearSeat = null;

    // Shadows fade as cloud cover diffuses the light.
    npc.shadow.alpha = 0.2 - 0.13 * ctx.weather.cloud;
    npc.shadow.visible = npc.state !== "sit";
    if (npc.dog) npc.dog.shadow.alpha = npc.shadow.alpha;

    const view = npc.person.view;
    if (npc.state === "sit") {
      const seat = npc.seat!;
      const seatY = seat.groundY - BENCH_SEAT_H * seat.scale;
      const sc = depthScale(seat.groundY);
      view.x = npc.x;
      view.y = seatY + npc.person.look.height * 0.47 * sc;
      view.zIndex = seat.groundY + 1;
      view.scale.set(npc.dir * sc, sc);
      npc.person.sit(npc.idleT);
      return;
    }

    // Blend between the path and the bench ground near a seat.
    let y = yAt(npc.x);
    if (npc.nearSeat) {
      const k = clamp01(1 - Math.abs(npc.x - npc.nearSeat.x) / 70);
      y = lerp(y, npc.nearSeat.groundY, k);
    }
    const sc = depthScale(y);
    view.x = npc.x;
    view.y = y;
    view.zIndex = y;
    view.scale.set(npc.dir * sc, sc);

    if (npc.speed < 2) {
      npc.person.stand(npc.idleT, npc.umbrella);
    } else {
      npc.phase += dt * npc.speed * npc.phaseRate;
      npc.person.animate(npc.phase, npc.pace, npc.umbrella);
    }

    if (npc.dog) stepDog(npc, dt, y, sc);
  };

  let started = false;
  let spawnT = 0;

  const update = (dtMs: number, ctx: AgentCtx) => {
    const dt = Math.min(dtMs / 1000, 0.1);

    if (!started) {
      started = true;
      const n = Math.max(targetCount(ctx), ctx.hour >= 5 && ctx.hour < 23 ? 2 : 0);
      for (let i = 0; i < n; i++) {
        spawnNpc(ctx, { seated: i % 3 === 2 });
      }
    }

    spawnT -= dt;
    if (spawnT <= 0) {
      spawnT = range(rng, 1.5, 4.5);
      const target = targetCount(ctx);
      const leaving = npcs.filter((n) => n.state === "leave").length;
      const active = npcs.length - leaving;
      if (active < target) {
        spawnNpc(ctx, { atEdge: true });
      } else if (active > target && active > 0) {
        const candidates = npcs.filter((n) => n.state !== "leave" && n.state !== "sit");
        if (candidates.length > 0) {
          const n = pick(rng, candidates);
          n.state = "leave";
          n.stateT = 0;
        }
      }
    }

    for (let i = npcs.length - 1; i >= 0; i--) stepNpc(npcs[i], dt, ctx);

    // Ducks fly off for the deepest winter weeks.
    const ducksHome = coldness(ctx.month) < 0.85;
    for (const d of ducks) {
      d.view.visible = ducksHome;
      if (ducksHome) d.update(dtMs);
    }
  };

  return { update };
}
