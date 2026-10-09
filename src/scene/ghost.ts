import { Container, Graphics, NoiseFilter, Sprite, Texture } from "pixi.js";
import { clamp01, lerp } from "./color";

/**
 * The Grudge girl. On deep nights, once in a long while, she appears out
 * of nowhere in the middle of the path and crawls along it — long black
 * hair curtaining her face to the ground, pale arms reaching out of a
 * white gown. Every move is a hard snap: poses change at ragged random
 * intervals with no easing, she freezes dead still, lurches forward,
 * sometimes drags back half a step. Then she simply goes about her
 * business and dissolves. She bothers no one. Probably.
 *
 * Hidden dev override: `?ghost=N` multiplies how often she comes
 * (N >= 30 summons her immediately).
 */
export type Ghost = {
  update: (dtMs: number, starAlpha: number) => void;
  /** Where she is right now, or null — passers-by flee at the sight. */
  pos: () => { x: number; y: number } | null;
};

const depthScale = (y: number) => lerp(0.82, 1.08, clamp01((y - 720) / (840 - 720)));

export function createGhost(
  land: Container,
  worldW: number,
  worldH: number,
  pathY: (x: number) => number,
  /** Full-screen layer above everything, for the TV interference. */
  fx: Container,
): Ghost {
  const freqMult = Math.max(
    0.1,
    Number(new URLSearchParams(window.location.search).get("ghost")) || 1,
  );

  const SKIN = 0xc9cfc7; // drowned pale
  const SKIN_FAR = 0xa9b0a8;
  const GOWN = 0xdfdfe2;
  const HAIR = 0x0d0d11;

  const root = new Container();
  root.visible = false;
  land.addChild(root);

  // Trailing bare foot and shin.
  const leg = new Graphics();
  leg.rect(-24, -3.4, 9, 2.6).fill({ color: SKIN_FAR });
  leg.ellipse(-25.5, -1.6, 3.2, 1.5).fill({ color: SKIN_FAR });

  // The gown: a low creeping hump, hem crumpled on the ground.
  const body = new Graphics();
  body
    .poly([-19, 0, -14, -7.5, -4, -10.5, 6, -11.5, 10, -7, 8, 0])
    .fill({ color: GOWN });
  body.poly([-19, 0, -10, -2.5, 8, 0]).fill({ color: 0x9aa0a8, alpha: 0.4 }); // grounded hem
  body.poly([-14, -7.5, -4, -10.5, -6, -4]).fill({ color: 0xffffff, alpha: 0.25 }); // moon catch

  // Arms snap between crawl poses; the far one is a shade darker.
  const armFar = new Graphics();
  armFar.roundRect(-1.2, 0, 2.4, 11, 1.2).fill({ color: SKIN_FAR });
  armFar.ellipse(0, 11, 2.4, 1.3).fill({ color: SKIN_FAR });
  armFar.position.set(4.5, -9);
  const armNear = new Graphics();
  armNear.roundRect(-1.3, 0, 2.6, 11.5, 1.3).fill({ color: SKIN });
  armNear.ellipse(0, 11.5, 2.6, 1.4).fill({ color: SKIN });
  armNear.position.set(8.5, -9.5);

  // The head exists only as a hair curtain pouring onto the ground.
  const head = new Container();
  head.position.set(10, -10);
  const hair = new Graphics();
  hair
    .poly([-4.5, -5.5, 3.5, -6.5, 7.5, -2, 8.5, 4, 6.5, 9.5, 1.5, 11, -2.5, 9.5, -5.5, 3])
    .fill({ color: HAIR });
  hair.poly([2, 10.5, 4.5, 10.8, 3, 13.5]).fill({ color: HAIR }); // strand on the ground
  hair.poly([-4.5, 2, -6.5, 6.5, -3.5, 5]).fill({ color: HAIR });
  hair.ellipse(1, -3.5, 4.5, 3).fill({ color: 0x1a1a20 }); // dull crown sheen
  head.addChild(hair);

  root.addChild(leg, armFar, body, armNear, head);

  // --- TV interference: analog snow with a rolling bar ---
  const tvWrap = new Container();
  const tv = new Sprite(Texture.WHITE);
  tv.width = worldW;
  tv.height = worldH;
  tv.tint = 0x9aa0a8;
  const noise = new NoiseFilter({ noise: 1 });
  tv.filters = [noise];
  const band = new Graphics();
  band.rect(0, 0, worldW, 70).fill({ color: 0x000000, alpha: 0.3 });
  band.rect(0, 70, worldW, 8).fill({ color: 0xffffff, alpha: 0.18 });
  tvWrap.addChild(tv, band);
  tvWrap.visible = false;
  fx.addChild(tvWrap);

  let curY = 0;
  let timer = (30 + Math.random() * 60) / freqMult;
  if (freqMult >= 30) timer = 0; // summoned: she is already here
  let active = false;
  let x = 0;
  let dir: 1 | -1 = 1;
  let yOff = 0;
  let life = 0;
  let age = 0;
  let appearT = 0;
  let vanishT = -1;
  let poseT = 0;
  let poseDur = 0.12;
  let freezeT = 0;
  let preT = -1; // countdown of the interference burst before she arrives
  let flickerT = 0;

  const snapPose = () => {
    // Hard cuts, no easing: wrong angles held for a ragged beat.
    // Negative rotation reaches the arm forward, past the hair curtain.
    armNear.rotation = -(0.45 + (Math.random() - 0.5) * 0.9);
    armFar.rotation = -(0.7 + (Math.random() - 0.5) * 0.9);
    body.y = (Math.random() - 0.5) * 2.2;
    body.rotation = (Math.random() - 0.5) * 0.12;
    head.rotation = (Math.random() - 0.5) * 0.55;
    head.y = -10 + (Math.random() - 0.5) * 2.5;
    leg.rotation = (Math.random() - 0.5) * 0.3;
  };

  const spawn = () => {
    active = true;
    x = worldW * (0.32 + Math.random() * 0.36); // out of nowhere, mid-path
    dir = Math.random() < 0.5 ? 1 : -1;
    yOff = -8 + Math.random() * 22;
    life = 20 + Math.random() * 15;
    age = 0;
    appearT = 0;
    vanishT = -1;
    freezeT = 0;
    snapPose();
    root.visible = true;
  };

  const despawn = (nextIn: number) => {
    active = false;
    root.visible = false;
    timer = nextIn;
  };

  /** Render the interference overlay; strength 0 hides it. */
  const stepStatic = (dt: number, strength: number) => {
    if (strength <= 0) {
      tvWrap.visible = false;
      return;
    }
    flickerT += dt;
    // The signal cuts in and out at a broken rhythm.
    const on = Math.sin(flickerT * 41) + Math.sin(flickerT * 15.7 + 2) > -0.4;
    tvWrap.visible = on;
    tv.alpha = (0.45 + Math.random() * 0.35) * strength;
    noise.seed = Math.random();
    band.y = ((flickerT * 640) % (worldH + 160)) - 80;
  };

  const update = (dtMs: number, starAlpha: number) => {
    const dt = Math.min(dtMs / 1000, 0.1);

    if (preT >= 0) preT -= dt;
    // Full-strength snow announces her; a weaker blip sees her off.
    const vanishK = active && vanishT >= 0 && vanishT < 0.35 ? 0.6 : 0;
    stepStatic(dt, Math.max(preT > 0 ? 1 : 0, vanishK));

    if (!active) {
      if (starAlpha > 0.7) {
        timer -= dt;
        // The TV goes bad first; she is there when the snow clears.
        if (timer <= 0 && preT < 0) preT = 1.15;
      }
      if (preT >= 0 && preT <= 0.3) spawn(); // falls through: placed this frame
      if (!active) return;
    }

    age += dt;
    appearT += dt;

    // Dawn dissolves her early; otherwise she leaves when she is done.
    if (vanishT < 0 && (age >= life || starAlpha < 0.55 || x < -40 || x > worldW + 40)) {
      vanishT = 0;
    }

    if (vanishT >= 0) {
      vanishT += dt;
      // A broken flicker, then gone.
      root.alpha = vanishT < 0.35 ? (Math.sin(vanishT * 70) > 0 ? 0.85 : 0.1) : 0;
      if (vanishT >= 0.45) despawn((120 + Math.random() * 240) / freqMult);
      return;
    }

    // She cuts in with the same broken flicker.
    root.alpha = appearT < 0.4 ? (Math.sin(appearT * 60) >= 0 ? 1 : 0.15) : 1;

    if (freezeT > 0) {
      // Dead still. Not even the hair moves.
      freezeT -= dt;
    } else {
      poseT += dt;
      if (poseT >= poseDur) {
        poseT = 0;
        poseDur = 0.07 + Math.random() * 0.18;
        snapPose();
        const r = Math.random();
        if (r < 0.1) {
          freezeT = 0.6 + Math.random() * 1.4; // long unblinking stop
        } else if (r < 0.22) {
          x += dir * (14 + Math.random() * 10); // sudden lurch
        } else if (r < 0.3) {
          x -= dir * (2 + Math.random() * 3); // drags back half a step
        } else {
          x += dir * (2 + Math.random() * 6); // ragged crawl
        }
      }
    }

    const y = pathY(Math.max(0, Math.min(worldW, x))) + yOff;
    curY = y;
    const sc = depthScale(y);
    root.x = x;
    root.y = y;
    root.zIndex = y;
    root.scale.set(dir * sc, sc);
  };

  return {
    update,
    pos: () => (active && vanishT < 0 ? { x, y: curY } : null),
  };
}
