import { Container, Graphics } from "pixi.js";
import { clamp01, lerp } from "./color";
import { buildPerson, randomLook, type Archetype, type PersonLook } from "./person";
import { chance, mulberry32, pick, range, type Rng } from "./rng";

export type Agent = { view: Container; update: (dtMs: number) => void };
export type AgentSystem = {
  /** Step all agents; `month` dresses newly spawned agents for the season. */
  update: (dtMs: number, month: number) => void;
};

const FUR = [0x8a5a2b, 0x9a9a9a, 0x3a3a3a, 0xcaa15a, 0x6e4a30, 0xe8e2d4];

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
    // Lighter chest/belly patch.
    body.ellipse(6, hipY - 3, 10, 4).fill({ color: 0xe8e2d4, alpha: 0.85 });
  }
  body.circle(20, hipY - 12, 8).fill({ color: fur }); // head
  body.poly([26, hipY - 14, 33, hipY - 11, 26, hipY - 8]).fill({ color: fur }); // snout
  if (earFlop) {
    // Floppy ear hanging beside the head.
    body.roundRect(13, hipY - 18, 5, 9, 2.5).fill({ color: fur === 0x3a3a3a ? 0x2a2a2a : 0x5a3b22 });
  } else {
    body.poly([15, hipY - 20, 20, hipY - 20, 17, hipY - 12]).fill({ color: fur }); // pointy ear
  }

  const tail = new Graphics().roundRect(0, -2, 12, 4, 2).fill({ color: fur });
  tail.position.set(-18, hipY - 10);
  tail.rotation = tailUp ? -0.9 : -0.3;

  root.addChild(body, tail);

  const tailBase = tail.rotation;
  const swing = 0.6;
  const animate = (phase: number, _pace: number) => {
    legs[0].rotation = Math.sin(phase) * swing;
    legs[3].rotation = Math.sin(phase) * swing;
    legs[1].rotation = Math.sin(phase + Math.PI) * swing;
    legs[2].rotation = Math.sin(phase + Math.PI) * swing;
    tail.rotation = tailBase + Math.sin(phase * 2) * 0.2;
  };
  return { root, animate };
}

type WalkerCfg = {
  kind: "person" | "dog";
  rng: Rng;
  look?: PersonLook;
  x: number;
  speed: number; // world px/sec, sign = direction
  yAt: (x: number) => number;
  min: number;
  max: number;
};

function paceFor(look: PersonLook | undefined, speed: number): number {
  const v = Math.abs(speed);
  if (!look) return clamp01((v - 25) / 50); // dog
  switch (look.archetype) {
    case "jogger":
      return clamp01((v - 35) / 65);
    case "elder":
      return 0.05;
    default:
      return clamp01((v - 25) / 50);
  }
}

/** Wraps a figure with path-following movement, turning and a walk cycle. */
function createWalker(cfg: WalkerCfg): Agent {
  const built =
    cfg.kind === "person"
      ? (() => {
          const p = buildPerson(cfg.look!);
          return { root: p.view, animate: p.animate };
        })()
      : buildDog(cfg.rng);
  const view = built.root;
  const baseScale = cfg.kind === "dog" ? range(cfg.rng, 0.7, 1.15) : 1;
  const pace = paceFor(cfg.look, cfg.speed);
  // Shorter legs take quicker steps to cover the same ground.
  const phaseRate = cfg.kind === "dog" ? 0.13 : 0.11 * (60 / cfg.look!.height);
  let x = cfg.x;
  let speed = cfg.speed;
  let phase = cfg.rng() * 6.28; // desync gaits

  const update = (dtMs: number) => {
    const dt = dtMs / 1000;
    x += speed * dt;
    if (x < cfg.min) {
      x = cfg.min;
      speed = Math.abs(speed);
    } else if (x > cfg.max) {
      x = cfg.max;
      speed = -Math.abs(speed);
    }
    const dir = speed >= 0 ? 1 : -1;
    phase += dt * Math.abs(speed) * phaseRate;

    const y = cfg.yAt(x);
    const sc = lerp(0.82, 1.08, clamp01((y - 720) / (840 - 720))) * baseScale;
    view.x = x;
    view.y = y;
    view.zIndex = y; // sort with trees and benches
    view.scale.set(dir * sc, sc);
    built.animate(phase, pace);
  };
  return { view, update };
}

/** A duck floating and drifting on the water. */
function createDuck(index: number, baseX: number, baseY: number, speed: number, worldW: number): Agent {
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

/**
 * Populate the scene with walkers (added to the y-sorted land layer) and ducks
 * (added to the water layer). Returns a system whose update() drives them all.
 * Walkers spawn on the first update, once the current month is known, so their
 * outfits match the season.
 */
export function createAgents(
  land: Container,
  water: Container,
  yAt: (x: number) => number,
  worldW: number,
): AgentSystem {
  const agents: Agent[] = [];
  const min = 90;
  const max = worldW - 90;
  const rng = mulberry32((Math.random() * 2 ** 32) >>> 0);
  let spawned = false;

  const spawn = (month: number) => {
    const mix: Archetype[] = ["adult", "adult", "adult", "kid", "elder", "jogger"];
    for (const archetype of mix) {
      const look = randomLook(rng, month, archetype);
      const [lo, hi] = SPEED_BY_ARCHETYPE[archetype];
      const a = createWalker({
        kind: "person",
        rng,
        look,
        x: range(rng, min, max),
        speed: range(rng, lo, hi) * (chance(rng, 0.5) ? 1 : -1),
        yAt,
        min,
        max,
      });
      land.addChild(a.view);
      agents.push(a);
    }

    for (let i = 0; i < 2; i++) {
      const a = createWalker({
        kind: "dog",
        rng,
        x: range(rng, min, max),
        speed: range(rng, 45, 65) * (chance(rng, 0.5) ? 1 : -1),
        yAt,
        min,
        max,
      });
      land.addChild(a.view);
      agents.push(a);
    }

    const ducks = [
      { x: 300, y: 470, s: 12 },
      { x: 700, y: 500, s: -9 },
      { x: 1100, y: 455, s: 10 },
    ];
    ducks.forEach((c, i) => {
      const a = createDuck(i, c.x, c.y, c.s, worldW);
      water.addChild(a.view);
      agents.push(a);
    });
  };

  return {
    update: (dtMs: number, month: number) => {
      if (!spawned) {
        spawned = true;
        spawn(month);
      }
      for (const a of agents) a.update(dtMs);
    },
  };
}
