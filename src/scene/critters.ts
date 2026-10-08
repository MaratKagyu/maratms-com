import { Container, Graphics } from "pixi.js";
import { clamp01, lerp } from "./color";
import { coldness } from "./person";
import { chance, mulberry32, pick, range, type Rng } from "./rng";
import type { WeatherState } from "./weather";

/**
 * Small wildlife: a single cat and a colony of gophers.
 *
 * The cat prowls the meadow day and night (it is noticeably smaller than
 * the dogs). Gophers — one to five, depending on how much of the world
 * the viewport shows — dig burrows at random spots (the dirt mound grows
 * a little before anyone shows up), periscope out, nibble grass and dive
 * back. If one surfaces in the cat's field of view the cat drops into a
 * stalk, closes in and dashes — but the gopher always makes it
 * underground in time, leaving the cat to sniff at an empty hole.
 */
export type CritterCtx = { month: number; hour: number; weather: WeatherState };
export type Critters = { update: (dtMs: number, ctx: CritterCtx) => void };

const depthScale = (y: number) => lerp(0.82, 1.08, clamp01((y - 720) / (840 - 720)));

/** A cat in side profile, facing +x, feet at (0,0). */
function buildCat(rng: Rng) {
  const root = new Container();
  const kind = pick(rng, [
    { fur: 0x33322f, dark: 0x232220, chest: 0xd8d2c4, tabby: false },
    { fur: 0x8a8c90, dark: 0x66686d, chest: 0xdedbd2, tabby: true },
    { fur: 0xc07a38, dark: 0x96581f, chest: 0xe8d9b8, tabby: true },
    { fur: 0xe2ddd0, dark: 0xaaa699, chest: 0xffffff, tabby: false },
  ]);
  const legLen = 7.5;
  const hipY = -legLen;

  const shadow = new Graphics();
  shadow.ellipse(0, 1, 11, 2.8).fill({ color: 0x1c2430 });
  shadow.alpha = 0.18;
  root.addChild(shadow);

  const legs: Graphics[] = [];
  for (const lx of [-8, -4.5, 4.5, 8]) {
    const leg = new Graphics().rect(-1, 0, 2, legLen).fill({ color: kind.fur });
    leg.position.set(lx, hipY);
    legs.push(leg);
    root.addChild(leg);
  }

  const torso = new Container();
  const body = new Graphics();
  body.roundRect(-11, hipY - 8.5, 22, 9, 4.5).fill({ color: kind.fur });
  body.ellipse(5, hipY - 2, 5.5, 2.4).fill({ color: kind.chest, alpha: 0.7 });
  if (kind.tabby) {
    for (const sx of [-7, -2.5, 2]) {
      body.rect(sx, hipY - 8.5, 1.8, 4).fill({ color: kind.dark, alpha: 0.6 });
    }
  }

  const head = new Container();
  const HEAD_X = 11;
  head.position.set(HEAD_X, hipY - 7.5);
  const hg = new Graphics();
  hg.poly([-2.9, -3.0, -0.8, -6.6, 0.6, -3.4]).fill({ color: kind.dark }); // far ear
  hg.poly([1.0, -3.2, 3.0, -6.2, 4.0, -2.6]).fill({ color: kind.fur }); // near ear
  hg.circle(0, 0, 4.3).fill({ color: kind.fur });
  hg.poly([3.2, 0.2, 6.2, 1.6, 3.0, 2.4]).fill({ color: kind.fur }); // muzzle
  hg.circle(1.8, -0.9, 0.55).fill({ color: 0x1c1c20 }); // eye
  head.addChild(hg);

  const tail = new Container();
  tail.position.set(-10.5, hipY - 6.5);
  const tg = new Graphics();
  tg.moveTo(0, 0)
    .quadraticCurveTo(-7, -2, -8.5, -11)
    .stroke({ width: 2.4, color: kind.fur, cap: "round" });
  tg.circle(-8.4, -10.8, 1.3).fill({ color: kind.dark }); // tail tip
  tail.addChild(tg);

  torso.addChild(tail, body, head);
  root.addChild(torso);

  /**
   * walkK: leg swing amount; crouch 0..1 flattens into the stalking pose;
   * flick: extra tail swish; paw: front paw scratching at the burrow.
   */
  const animate = (phase: number, walkK: number, crouch: number, flick: number, paw: number) => {
    const swing = 0.52 * walkK;
    const s1 = Math.sin(phase);
    const s2 = Math.sin(phase + Math.PI);
    legs[0].rotation = s1 * swing;
    legs[1].rotation = s2 * swing;
    legs[2].rotation = s2 * swing;
    legs[3].rotation = s1 * swing + paw;
    for (const l of legs) l.scale.y = 1 - crouch * 0.32;
    torso.y = crouch * 2.6 + Math.sin(phase * 2) * 0.3 * walkK;
    head.rotation = -crouch * 0.3;
    head.x = HEAD_X + crouch * 1.8;
    tail.rotation = crouch * 1.05 + Math.sin(phase * 0.7) * 0.12 + flick;
  };
  return { root, shadow, animate };
}

/** A gopher standing upright in side profile, base of the body at (0,0). */
function buildGopher() {
  const holder = new Container(); // y slides it in/out of the burrow (masked)
  const rig = new Container(); // leans forward to nibble; scale.x flips dir
  const g = new Graphics();
  g.roundRect(-3.6, -15.5, 7.2, 15.5, 3.4).fill({ color: 0xb4935c });
  g.ellipse(1.2, -6.5, 2.4, 4.4).fill({ color: 0xdcc9a0, alpha: 0.9 }); // belly
  g.circle(0.4, -16.4, 4.1).fill({ color: 0xb4935c }); // head
  g.circle(-2.2, -19.4, 1.3).fill({ color: 0x96784a }); // ear
  g.poly([3.8, -17.2, 6.4, -16.2, 3.8, -15.2]).fill({ color: 0xa5854e }); // snout
  g.circle(5.1, -16.5, 0.5).fill({ color: 0x2a2018 }); // nose
  g.circle(2.2, -17.6, 0.65).fill({ color: 0x1c1c20 }); // eye
  g.rect(1.6, -11.5, 2.6, 1.6).fill({ color: 0x96784a }); // held forepaws
  rig.addChild(g);
  holder.addChild(rig);
  return { holder, rig };
}

type Puff = { x: number; y: number; vx: number; vy: number; age: number; life: number };

type CatState = "prowl" | "pause" | "stalk" | "dash" | "sniff" | "leave" | "away";
type BurrowState = "idle" | "grow" | "wait" | "peek" | "up" | "dive" | "linger" | "fade";

type GopherUnit = {
  view: Container;
  dirt: Graphics;
  rim: Graphics;
  fx: Graphics;
  holder: Container;
  rig: Container;
  x: number;
  y: number;
  dir: 1 | -1;
  state: BurrowState;
  stateT: number;
  stateDur: number;
  lift: number; // 0 = underground, 1 = fully out
  mound: number;
  nibble: number; // eased lean toward the grass
  nibbling: boolean;
  poseT: number;
  alert: boolean;
  puffs: Puff[];
};

const MAX_GOPHERS = 5;
const HIDE_Y = 24; // gopher holder y when fully underground
const SIGHT_X = 440; // the cat spots a surfaced gopher within this range
const SIGHT_Y = 190;

export function createCritters(
  land: Container,
  worldW: number,
  grassTopY: (x: number) => number,
  pathY: (x: number) => number,
  obstacles: { x: number; y: number }[],
): Critters {
  const rng = mulberry32((Math.random() * 2 ** 32) >>> 0);
  const EDGE = 60;

  // --- The cat ---
  const catBuild = buildCat(rng);
  land.addChild(catBuild.root);
  const cat = {
    x: range(rng, 200, worldW - 200),
    y: range(rng, 700, 860),
    dir: (chance(rng, 0.5) ? 1 : -1) as 1 | -1,
    tx: 0,
    ty: 0,
    state: "prowl" as CatState,
    stateT: 0,
    stateDur: 0,
    speed: 0,
    targetSpeed: 26,
    phase: rng() * 6.28,
    crouch: 0,
    idleT: rng() * 10,
    prey: null as GopherUnit | null,
  };

  // --- The gophers and their burrows ---
  const makeUnit = (i: number): GopherUnit => {
    const view = new Container();
    const dirt = new Graphics();
    dirt.ellipse(0, 0.5, 11.5, 3.6).fill({ color: 0x6e5a3e });
    dirt.ellipse(0, -0.5, 8, 2.6).fill({ color: 0x241b10 }); // the hole
    const gopher = buildGopher();
    const mask = new Graphics().rect(-22, -48, 44, 47).fill({ color: 0xffffff });
    gopher.holder.mask = mask;
    const rim = new Graphics();
    rim.ellipse(0, 1.9, 9.6, 2.1).fill({ color: 0x7c6848 }); // front lip
    const fx = new Graphics();
    view.addChild(dirt, gopher.holder, mask, rim, fx);
    view.visible = false;
    land.addChild(view);
    return {
      view,
      dirt,
      rim,
      fx,
      holder: gopher.holder,
      rig: gopher.rig,
      x: 0,
      y: 0,
      dir: chance(rng, 0.5) ? 1 : -1,
      state: "idle",
      stateT: 0,
      // Stagger the first appearances so the colony doesn't pop at once.
      stateDur: i === 0 ? range(rng, 4, 9) : range(rng, 8, 45),
      lift: 0,
      mound: 0,
      nibble: 0,
      nibbling: false,
      poseT: 0,
      alert: false,
      puffs: [],
    };
  };
  const units = Array.from({ length: MAX_GOPHERS }, (_, i) => makeUnit(i));

  // How many gophers the colony supports: with cover scaling the viewport
  // aspect decides how much world width is on screen (phones see a narrow
  // slice, wide monitors the full 1600).
  const activeCount = () => {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const visW = Math.min(worldW, 900 * aspect);
    return Math.max(1, Math.min(MAX_GOPHERS, Math.round(visW / 320)));
  };

  const kickPuff = (u: GopherUnit) => {
    for (let i = 0; i < 5; i++) {
      u.puffs.push({
        x: range(rng, -4, 4),
        y: range(rng, -3, 0),
        vx: range(rng, -26, 26),
        vy: range(rng, -46, -14),
        age: 0,
        life: range(rng, 0.3, 0.5),
      });
    }
  };

  const pickCatTarget = () => {
    for (let i = 0; i < 50; i++) {
      const x = range(rng, 50, worldW - 50);
      const y = range(rng, 600, 868);
      if (y > grassTopY(x) + 56) {
        cat.tx = x;
        cat.ty = y;
        return;
      }
    }
    cat.tx = worldW / 2;
    cat.ty = 820;
  };
  pickCatTarget();

  const pickBurrowSpot = (u: GopherUnit): boolean => {
    for (let i = 0; i < 40; i++) {
      const x = range(rng, 70, worldW - 70);
      const y = range(rng, 610, 866);
      if (y < grassTopY(x) + 58) continue;
      if (Math.abs(y - pathY(x)) < 46) continue;
      if (obstacles.some((o) => Math.abs(o.x - x) < 70 && Math.abs(o.y - y) < 55)) continue;
      if (cat.state !== "away" && Math.hypot(x - cat.x, y - cat.y) < 280) continue;
      if (units.some((o) => o !== u && o.view.visible && Math.hypot(o.x - x, o.y - y) < 170))
        continue;
      u.x = x;
      u.y = y;
      return true;
    }
    return false;
  };

  // Hysteresis so the cat doesn't flap in and out at the threshold: it
  // retreats only from real rain and returns once it has almost stopped.
  const catWantsOut = (w: WeatherState) =>
    (w.kind === "rain" && w.intensity > 0.45) || (w.kind === "snow" && w.intensity > 0.7);
  const catOkToReturn = (w: WeatherState) =>
    !((w.kind === "rain" && w.intensity > 0.25) || (w.kind === "snow" && w.intensity > 0.5));

  const gopherAwake = (ctx: CritterCtx) =>
    ctx.hour > 5.5 &&
    ctx.hour < 20.5 &&
    coldness(ctx.month) < 0.55 && // hibernates through the cold months
    !((ctx.weather.kind === "rain" || ctx.weather.kind === "snow") && ctx.weather.intensity > 0.25);

  const catDistTo = (u: GopherUnit) => Math.hypot(u.x - cat.x, u.y - cat.y);

  /** The nearest surfaced gopher in front of the cat, if any. */
  const spotPrey = (): GopherUnit | null => {
    let best: GopherUnit | null = null;
    let bestD = Infinity;
    for (const u of units) {
      if (!u.view.visible || u.lift <= 0.45) continue;
      if (u.state !== "peek" && u.state !== "up") continue;
      const dx = u.x - cat.x;
      const dy = u.y - cat.y;
      if (Math.abs(dx) >= SIGHT_X || Math.abs(dy) >= SIGHT_Y || dx * cat.dir <= 0) continue;
      const d = Math.hypot(dx, dy);
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  };

  const update = (dtMs: number, ctx: CritterCtx) => {
    const dt = Math.min(dtMs / 1000, 0.1);
    const w = ctx.weather;

    // ---------- Cat ----------
    cat.stateT += dt;
    cat.idleT += dt;

    if (catWantsOut(w) && cat.state !== "leave" && cat.state !== "away") {
      cat.state = "leave";
      cat.prey = null;
      cat.tx = cat.x < worldW / 2 ? -EDGE : worldW + EDGE;
      cat.ty = cat.y;
      cat.targetSpeed = 42;
    }

    // A surfaced gopher in front of the cat triggers the hunt.
    if (cat.state === "prowl" || cat.state === "pause") {
      const prey = spotPrey();
      if (prey) {
        cat.prey = prey;
        cat.state = "stalk";
        cat.stateT = 0;
        cat.targetSpeed = 32;
      }
    }

    switch (cat.state) {
      case "prowl": {
        cat.targetSpeed = 26;
        if (Math.hypot(cat.tx - cat.x, cat.ty - cat.y) < 4) {
          if (chance(rng, 0.45)) {
            cat.state = "pause";
            cat.stateT = 0;
            cat.stateDur = range(rng, 2.5, 7);
            cat.targetSpeed = 0;
          } else {
            pickCatTarget();
          }
        }
        break;
      }
      case "pause": {
        if (cat.stateT >= cat.stateDur) {
          cat.state = "prowl";
          pickCatTarget();
        }
        break;
      }
      case "stalk": {
        const prey = cat.prey;
        if (!prey || !prey.view.visible) {
          cat.state = "prowl"; // the hole vanished mid-stalk
          cat.prey = null;
          pickCatTarget();
          break;
        }
        cat.tx = prey.x;
        cat.ty = prey.y;
        cat.targetSpeed = 32;
        if (catDistTo(prey) < 150) {
          cat.state = "dash";
          cat.targetSpeed = 310;
          cat.speed = 120; // springs off its haunches
        }
        break;
      }
      case "dash": {
        const prey = cat.prey!;
        cat.tx = prey.x;
        cat.ty = prey.y;
        const d = catDistTo(prey);
        // The gopher always wins this race.
        if (d < 110 && (prey.state === "peek" || prey.state === "up")) {
          prey.state = "dive";
          prey.alert = false;
          kickPuff(prey);
        }
        if (d < 10) {
          cat.state = "sniff";
          cat.stateT = 0;
          cat.stateDur = range(rng, 2.5, 4.5);
          cat.targetSpeed = 0;
          cat.speed = 0;
        }
        break;
      }
      case "sniff": {
        if (cat.stateT >= cat.stateDur) {
          cat.state = "prowl";
          cat.prey = null;
          pickCatTarget();
        }
        break;
      }
      case "leave": {
        if (cat.x < -EDGE + 4 || cat.x > worldW + EDGE - 4) {
          cat.state = "away";
          cat.stateT = 0;
          cat.stateDur = range(rng, 4, 10);
          catBuild.root.visible = false;
        }
        break;
      }
      case "away": {
        if (catOkToReturn(w) && cat.stateT >= cat.stateDur) {
          cat.state = "prowl";
          cat.x = chance(rng, 0.5) ? -EDGE + 6 : worldW + EDGE - 6;
          cat.y = range(rng, 700, 860);
          catBuild.root.visible = true;
          pickCatTarget();
        }
        break;
      }
    }

    // Ease speed and move toward the target.
    const accel = cat.state === "dash" ? 900 : 120;
    if (cat.speed < cat.targetSpeed) cat.speed = Math.min(cat.targetSpeed, cat.speed + accel * dt);
    else cat.speed = Math.max(cat.targetSpeed, cat.speed - accel * dt);
    {
      const dx = cat.tx - cat.x;
      const dy = cat.ty - cat.y;
      const d = Math.hypot(dx, dy);
      if (d > 1 && cat.speed > 1) {
        const step = Math.min(d, cat.speed * dt);
        cat.x += (dx / d) * step;
        cat.y += (dy / d) * step;
      }
      if (Math.abs(dx) > 3 && cat.speed > 1) cat.dir = dx > 0 ? 1 : -1;
    }
    if (cat.state !== "leave" && cat.state !== "away") {
      cat.y = Math.max(cat.y, grassTopY(cat.x) + 54);
    }

    const crouchTarget =
      cat.state === "stalk" ? 1 : cat.state === "dash" ? 0.35 : cat.state === "sniff" ? 0.6 : 0;
    cat.crouch += (crouchTarget - cat.crouch) * Math.min(1, 5 * dt);

    if (catBuild.root.visible) {
      cat.phase += dt * cat.speed * 0.16;
      const sc = depthScale(cat.y) * 0.85;
      catBuild.root.x = cat.x;
      catBuild.root.y = cat.y;
      catBuild.root.zIndex = cat.y;
      catBuild.root.scale.set(cat.dir * sc, sc);
      catBuild.shadow.alpha = 0.18 - 0.11 * w.cloud;
      const walkK = clamp01(cat.speed / 26);
      const flick = cat.state === "pause" ? Math.sin(cat.idleT * 2.8) * 0.3 : 0;
      const paw = cat.state === "sniff" ? Math.sin(cat.idleT * 9) * 0.45 : 0;
      catBuild.animate(cat.phase, walkK, cat.crouch, flick, paw);
    }

    // ---------- Gophers ----------
    const hunted = cat.state === "stalk" || cat.state === "dash";
    const allowed = activeCount();

    units.forEach((u, i) => {
      u.stateT += dt;
      const catNear = cat.state !== "away" && catDistTo(u) < 200;
      const overQuota = i >= allowed;

      // A shrinking viewport retires the surplus gophers gracefully.
      if (overQuota && (u.state === "wait" || u.state === "peek" || u.state === "up")) {
        u.state = "dive";
        u.alert = false;
      }

      switch (u.state) {
        case "idle": {
          if (u.stateT >= u.stateDur && !overQuota && gopherAwake(ctx) && pickBurrowSpot(u)) {
            u.state = "grow";
            u.stateT = 0;
            u.mound = 0;
            u.lift = 0;
            u.dir = chance(rng, 0.5) ? 1 : -1;
            u.view.visible = true;
          }
          break;
        }
        case "grow": {
          u.mound = Math.min(1, u.mound + dt / 2.4);
          if (u.mound >= 1) {
            u.state = "wait";
            u.stateT = 0;
            u.stateDur = range(rng, 1, 3);
          }
          break;
        }
        case "wait": {
          if (u.stateT >= u.stateDur && !catNear && gopherAwake(ctx)) {
            u.state = "peek";
            u.stateT = 0;
            u.stateDur = range(rng, 1, 2.2);
          }
          break;
        }
        case "peek": {
          u.lift = Math.min(0.55, u.lift + dt * 2.2);
          if (u.stateT >= u.stateDur && !(hunted && cat.prey === u)) {
            u.state = "up";
            u.stateT = 0;
            // Long grazing sessions, so the cat has a fair chance to notice.
            u.stateDur = range(rng, 25, 55);
            u.poseT = range(rng, 1.5, 3);
          }
          break;
        }
        case "up": {
          u.lift = Math.min(1, u.lift + dt * 2.2);
          u.poseT -= dt;
          if (u.poseT <= 0 && !u.alert) {
            u.poseT = range(rng, 1.5, 3.5);
            u.nibbling = !u.nibbling;
            if (!u.nibbling && chance(rng, 0.4)) u.dir = -u.dir as 1 | -1;
          }
          // A frozen (alert) gopher holds its nerve until the cat springs.
          if (u.stateT >= u.stateDur && !u.alert) u.state = "dive";
          break;
        }
        case "dive": {
          u.lift -= dt * 6; // always faster than the cat
          u.nibbling = false;
          if (u.lift <= 0) {
            u.lift = 0;
            u.state = "linger";
            u.stateT = 0;
          }
          break;
        }
        case "linger": {
          // Keep the hole while the cat is poking around it.
          if (u.stateT >= 2.5 && !catNear) {
            u.state = "fade";
            u.stateT = 0;
          }
          break;
        }
        case "fade": {
          u.mound = Math.max(0, u.mound - dt / 1.2);
          if (u.mound <= 0) {
            u.state = "idle";
            u.stateT = 0;
            u.stateDur = range(rng, 10, 30);
            u.view.visible = false;
            if (cat.prey === u) cat.prey = null;
          }
          break;
        }
      }

      // The gopher freezes upright when the cat creeps toward it.
      u.alert = u.view.visible && u.lift > 0.3 && hunted && cat.prey === u && catDistTo(u) < 240;
      const nibbleTarget = u.nibbling && !u.alert && u.state === "up" ? 1 : 0;
      u.nibble += (nibbleTarget - u.nibble) * Math.min(1, 6 * dt);

      if (u.view.visible) {
        const sc = depthScale(u.y) * 0.85;
        u.view.x = u.x;
        u.view.y = u.y;
        u.view.zIndex = u.y;
        u.view.scale.set(sc);
        u.view.alpha = clamp01(u.mound * 1.4);
        u.dirt.scale.set(0.3 + 0.7 * u.mound);
        u.rim.scale.set(0.3 + 0.7 * u.mound);
        u.holder.y = (1 - u.lift) * HIDE_Y;
        u.holder.visible = u.lift > 0.02;
        u.rig.scale.x = u.dir;
        u.rig.rotation = u.nibble * 0.9 * u.dir + Math.sin(u.stateT * 2.3) * 0.03;

        u.fx.clear();
        for (let j = u.puffs.length - 1; j >= 0; j--) {
          const pf = u.puffs[j];
          pf.age += dt;
          if (pf.age >= pf.life) {
            u.puffs.splice(j, 1);
            continue;
          }
          pf.x += pf.vx * dt;
          pf.y += pf.vy * dt;
          pf.vy += 170 * dt;
          const k = 1 - pf.age / pf.life;
          u.fx.circle(pf.x, pf.y, 1.4 * k + 0.4).fill({ color: 0x6e5a3e, alpha: 0.8 * k });
        }
      } else if (u.puffs.length) {
        u.puffs.length = 0;
        u.fx.clear();
      }
    });
  };

  return { update };
}
