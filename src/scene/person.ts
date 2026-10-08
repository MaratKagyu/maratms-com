import { Container, Graphics } from "pixi.js";
import { lerpColor } from "./color";

/**
 * Procedural park visitor, drawn in side profile from flat-vector primitives.
 * The figure is rigged: two-segment legs (knee) and arms (elbow) with feet and
 * hands, so the walk cycle bends joints instead of swinging rectangles.
 *
 * Origin (0,0) is between the feet; the figure faces +x. Flip with scale.x.
 */

export type HairStyle = "bald" | "short" | "bob";

export type PersonLook = {
  /** Feet-to-crown height in world px. */
  height: number;
  /** 0 slim .. 1 stocky. */
  build: number;
  skin: number;
  hairStyle: HairStyle;
  hairColor: number;
  topColor: number;
  bottomColor: number;
  shoeColor: number;
};

export type Person = {
  view: Container;
  /** Advance the walk cycle. `phase` in radians; `pace` 0 stroll .. 1 jog. */
  animate: (phase: number, pace: number) => void;
};

const SHIRT = [0xcc4b4b, 0x3f6fb0, 0x4a9d5b, 0xd8a13a, 0x8a5aa8, 0x50a0a0];
const PANTS = [0x394a5a, 0x5a4636, 0x2f3e4d, 0x444444];
const SKIN = [0xf0c8a0, 0xe0aa80, 0xcaa06e];
const HAIR = [0x3a2a1c, 0x1f1f22, 0x8a5a2b, 0xb8b2a8, 0x6e3a1e];
const SHOES = [0x33302c, 0x4a4440, 0x5a3b28];
const STYLES: HairStyle[] = ["short", "bob", "short", "bald", "bob", "short"];

/** Deterministic look for agent `i` (seeded generator arrives with M7). */
export function lookFromIndex(i: number): PersonLook {
  return {
    height: 58 + ((i * 7) % 5) * 3,
    build: ((i * 5) % 4) / 3,
    skin: SKIN[i % SKIN.length],
    hairStyle: STYLES[i % STYLES.length],
    hairColor: HAIR[i % HAIR.length],
    topColor: SHIRT[i % SHIRT.length],
    bottomColor: PANTS[i % PANTS.length],
    shoeColor: SHOES[i % SHOES.length],
  };
}

/** Darken a colour for the far-side limbs so the profile reads with depth. */
const far = (c: number) => lerpColor(c, 0x1a1a24, 0.3);

type Leg = { hip: Container; knee: Container; foot: Graphics };
type Arm = { shoulder: Container; elbow: Container };

export function buildPerson(look: PersonLook): Person {
  const h = look.height;
  const headR = h * 0.1;
  const legLen = h * 0.47;
  const thighLen = legLen * 0.52;
  const shinLen = legLen * 0.48;
  const torsoH = h - legLen - headR * 2 - h * 0.045;
  const torsoW = h * (0.19 + look.build * 0.08);
  const legW = h * 0.058;
  const armW = h * 0.05;
  const upperLen = torsoH * 0.58;
  const foreLen = torsoH * 0.52;
  const footLen = h * 0.15;
  const footH = h * 0.042;
  const hipY = -legLen;

  const root = new Container();

  const makeLeg = (isFar: boolean): Leg => {
    const pants = isFar ? far(look.bottomColor) : look.bottomColor;
    const shoe = isFar ? far(look.shoeColor) : look.shoeColor;
    const hip = new Container();
    hip.position.set(isFar ? -1.5 : 1.5, hipY);
    const thigh = new Graphics()
      .roundRect(-legW / 2, -2, legW, thighLen + 4, legW / 2)
      .fill({ color: pants });
    const knee = new Container();
    knee.y = thighLen;
    const shin = new Graphics()
      .roundRect(-legW * 0.45, -2, legW * 0.9, shinLen + 2, legW / 2)
      .fill({ color: pants });
    const foot = new Graphics()
      .roundRect(-footLen * 0.3, -footH, footLen, footH, footH / 2)
      .fill({ color: shoe });
    foot.y = shinLen;
    knee.addChild(shin, foot);
    hip.addChild(thigh, knee);
    return { hip, knee, foot };
  };

  const makeArm = (isFar: boolean): Arm => {
    const sleeve = isFar ? far(look.topColor) : look.topColor;
    const hand = isFar ? far(look.skin) : look.skin;
    const shoulder = new Container();
    shoulder.position.set(isFar ? -1 : 1, -torsoH + armW * 0.9);
    const upper = new Graphics()
      .roundRect(-armW / 2, -armW / 2, armW, upperLen + armW / 2, armW / 2)
      .fill({ color: sleeve });
    const elbow = new Container();
    elbow.y = upperLen;
    const fore = new Graphics()
      .roundRect(-armW * 0.42, -2, armW * 0.84, foreLen, armW / 2)
      .fill({ color: sleeve });
    fore.circle(0, foreLen, armW * 0.55).fill({ color: hand });
    elbow.addChild(fore);
    shoulder.addChild(upper, elbow);
    return { shoulder, elbow };
  };

  const legFar = makeLeg(true);
  const legNear = makeLeg(false);
  const armFar = makeArm(true);
  const armNear = makeArm(false);

  // Body container holds torso, arms and head so the whole upper body can
  // bob and lean while the hips stay put.
  const body = new Container();
  body.y = hipY;

  const torso = new Graphics()
    .roundRect(-torsoW / 2, -torsoH, torsoW, torsoH + 3, torsoW * 0.32)
    .fill({ color: look.topColor });

  const head = new Container();
  head.y = -torsoH + 1;
  const neckH = h * 0.03;
  const cy = -neckH - headR; // face centre in head-local coords
  const headG = new Graphics();
  // Hair behind the face (skull side).
  if (look.hairStyle !== "bald") {
    headG
      .circle(-headR * 0.15, cy - headR * 0.1, headR * (look.hairStyle === "bob" ? 1.18 : 1.02))
      .fill({ color: look.hairColor });
    if (look.hairStyle === "bob") {
      headG
        .roundRect(-headR * 1.3, cy - headR * 0.3, headR * 1.3, headR * 1.5, headR * 0.4)
        .fill({ color: look.hairColor });
    }
  }
  headG.rect(-headR * 0.35, -neckH - 2, headR * 0.7, neckH + 4).fill({ color: look.skin });
  headG.circle(0, cy, headR).fill({ color: look.skin });
  // Nose hint sells the facing direction at a glance.
  headG
    .poly([headR * 0.78, cy - headR * 0.1, headR * 1.12, cy + headR * 0.18, headR * 0.72, cy + headR * 0.34])
    .fill({ color: look.skin });
  if (look.hairStyle !== "bald") {
    // Fringe over the forehead.
    headG
      .ellipse(headR * 0.12, cy - headR * 0.78, headR * 0.52, headR * 0.32)
      .fill({ color: look.hairColor });
  }
  head.addChild(headG);

  body.addChild(armFar.shoulder, torso, head, armNear.shoulder);
  root.addChild(legFar.hip, body, legNear.hip);

  const animate = (phase: number, pace: number) => {
    const hipA = 0.42 + 0.3 * pace;
    const armA = 0.3 + 0.28 * pace;
    const kneeA = 0.6 + 0.5 * pace;

    const poseLeg = (L: Leg, t: number) => {
      const thighRot = -hipA * Math.sin(t);
      const kneeRot = 0.06 + kneeA * Math.pow(Math.max(0, Math.cos(t - 0.2)), 1.4);
      L.hip.rotation = thighRot;
      L.knee.rotation = kneeRot;
      // Keep the sole roughly level, with a heel lift through late stance.
      L.foot.rotation = -(thighRot + kneeRot) * 0.8 + 0.5 * Math.max(0, Math.sin(t - 2.4));
    };
    const poseArm = (A: Arm, t: number) => {
      A.shoulder.rotation = -armA * Math.sin(t);
      A.elbow.rotation = -(0.25 + 0.4 * Math.max(0, Math.sin(t)));
    };

    poseLeg(legNear, phase);
    poseLeg(legFar, phase + Math.PI);
    poseArm(armNear, phase + Math.PI);
    poseArm(armFar, phase);

    body.y = hipY - Math.abs(Math.sin(phase)) * (1.1 + pace * 1.5);
    body.rotation = 0.05 + pace * 0.1;
    head.rotation = -body.rotation * 0.55 + Math.sin(phase * 2) * 0.02;
  };

  animate(0, 0);
  return { view: root, animate };
}
