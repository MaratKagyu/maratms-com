import { Container, Graphics } from "pixi.js";
import { clamp01, lerp } from "./color";

export type Agent = { view: Container; update: (dtMs: number) => void };
export type AgentSystem = { update: (dtMs: number) => void };

const SHIRT = [0xcc4b4b, 0x3f6fb0, 0x4a9d5b, 0xd8a13a, 0x8a5aa8, 0x50a0a0];
const PANTS = [0x394a5a, 0x5a4636, 0x2f3e4d, 0x444444];
const SKIN = [0xf0c8a0, 0xe0aa80, 0xcaa06e];
const FUR = [0x8a5a2b, 0x9a9a9a, 0x3a3a3a, 0xcaa15a];

/** A walking person, drawn in side profile with pivoting limbs. Feet at (0,0). */
function buildPerson(i: number) {
  const root = new Container();
  const body = new Container();

  const legLen = 22;
  const hipY = -legLen;
  const torsoH = 24;
  const shirt = SHIRT[i % SHIRT.length];
  const pants = PANTS[i % PANTS.length];
  const skin = SKIN[i % SKIN.length];

  const legL = new Graphics().rect(-3, 0, 6, legLen).fill({ color: pants });
  const legR = new Graphics().rect(-3, 0, 6, legLen).fill({ color: pants });
  legL.position.set(-4, hipY);
  legR.position.set(4, hipY);

  const armL = new Graphics().rect(-2, 0, 4, 18).fill({ color: shirt });
  const armR = new Graphics().rect(-2, 0, 4, 18).fill({ color: shirt });
  armL.position.set(-6, hipY - torsoH + 4);
  armR.position.set(6, hipY - torsoH + 4);

  const torso = new Graphics();
  torso.rect(-6, hipY - torsoH, 12, torsoH).fill({ color: shirt });
  torso.circle(0, hipY - torsoH - 8, 7).fill({ color: skin });

  body.addChild(armL, armR, torso);
  root.addChild(legL, legR, body);

  const swing = 0.5;
  const animate = (phase: number) => {
    legL.rotation = Math.sin(phase) * swing;
    legR.rotation = Math.sin(phase + Math.PI) * swing;
    armL.rotation = Math.sin(phase + Math.PI) * swing * 0.8;
    armR.rotation = Math.sin(phase) * swing * 0.8;
    body.y = -Math.abs(Math.sin(phase)) * 2;
  };
  return { root, animate };
}

/** A dog in side profile, facing +x by default. Feet at (0,0). */
function buildDog(i: number) {
  const root = new Container();
  const fur = FUR[i % FUR.length];
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
  body.circle(20, hipY - 12, 8).fill({ color: fur }); // head
  body.poly([26, hipY - 14, 33, hipY - 11, 26, hipY - 8]).fill({ color: fur }); // snout
  body.poly([15, hipY - 20, 20, hipY - 20, 17, hipY - 12]).fill({ color: fur }); // ear

  const tail = new Graphics().rect(0, -2, 12, 4).fill({ color: fur });
  tail.position.set(-18, hipY - 10);
  tail.rotation = -0.5;

  root.addChild(body, tail);

  const swing = 0.6;
  const animate = (phase: number) => {
    legs[0].rotation = Math.sin(phase) * swing;
    legs[3].rotation = Math.sin(phase) * swing;
    legs[1].rotation = Math.sin(phase + Math.PI) * swing;
    legs[2].rotation = Math.sin(phase + Math.PI) * swing;
    tail.rotation = -0.5 + Math.sin(phase * 2) * 0.2;
  };
  return { root, animate };
}

type WalkerCfg = {
  kind: "person" | "dog";
  index: number;
  x: number;
  speed: number; // world px/sec, sign = direction
  yAt: (x: number) => number;
  min: number;
  max: number;
};

/** Wraps a figure with path-following movement, turning and a walk cycle. */
function createWalker(cfg: WalkerCfg): Agent {
  const built = cfg.kind === "person" ? buildPerson(cfg.index) : buildDog(cfg.index);
  const view = built.root;
  const baseScale = cfg.kind === "dog" ? 0.9 : 1;
  let x = cfg.x;
  let speed = cfg.speed;
  let phase = cfg.index; // desync gaits

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
    phase += dt * Math.abs(speed) * 0.06;

    const y = cfg.yAt(x);
    const sc = lerp(0.82, 1.08, clamp01((y - 720) / (840 - 720))) * baseScale;
    view.x = x;
    view.y = y;
    view.zIndex = y; // sort with trees and benches
    view.scale.set(dir * sc, sc);
    built.animate(phase);
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

/**
 * Populate the scene with walkers (added to the y-sorted land layer) and ducks
 * (added to the water layer). Returns a system whose update() drives them all.
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

  const people = [
    { x: 200, s: 42 },
    { x: 500, s: -34 },
    { x: 780, s: 30 },
    { x: 1020, s: -48 },
    { x: 1300, s: 38 },
  ];
  people.forEach((c, i) => {
    const a = createWalker({ kind: "person", index: i, x: c.x, speed: c.s, yAt, min, max });
    land.addChild(a.view);
    agents.push(a);
  });

  const dogs = [
    { x: 620, s: 55 },
    { x: 1150, s: -50 },
  ];
  dogs.forEach((c, i) => {
    const a = createWalker({ kind: "dog", index: i, x: c.x, speed: c.s, yAt, min, max });
    land.addChild(a.view);
    agents.push(a);
  });

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

  return {
    update: (dtMs: number) => {
      for (const a of agents) a.update(dtMs);
    },
  };
}
