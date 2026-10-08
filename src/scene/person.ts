import { Container, Graphics } from "pixi.js";
import { clamp01, lerpColor } from "./color";
import { chance, pick, range, type Rng } from "./rng";

/**
 * Procedural park visitor, drawn in side profile from flat-vector primitives.
 * The figure is rigged: two-segment legs (knee) and arms (elbow) with feet and
 * hands, so poses bend joints instead of swinging rectangles. Besides the walk
 * cycle it can stand idle, sit on a bench and hold an umbrella.
 *
 * Origin (0,0) is between the feet; the figure faces +x. Flip with scale.x.
 */

export type Archetype = "adult" | "kid" | "elder" | "jogger";
export type HairStyle = "bald" | "short" | "bob" | "long" | "bun" | "ponytail";
export type TopKind = "tshirt" | "shirt" | "jacket" | "coat" | "hoodie";
export type HatKind = "none" | "cap" | "beanie";

export type PersonLook = {
  archetype: Archetype;
  /** Feet-to-crown height in world px. */
  height: number;
  /** 0 slim .. 1 stocky. */
  build: number;
  skin: number;
  hairStyle: HairStyle;
  hairColor: number;
  top: TopKind;
  topColor: number;
  bottomColor: number;
  /** Bare shins (shorts) — joggers in warm weather. */
  bareShins: boolean;
  shoeColor: number;
  hat: HatKind;
  hatColor: number;
  umbrellaColor: number;
  bag: boolean;
  backpack: boolean;
  cane: boolean;
};

export type Person = {
  view: Container;
  look: PersonLook;
  /** Advance the walk cycle. `phase` in radians; `pace` 0 stroll .. 1 jog. */
  animate: (phase: number, pace: number, umbrella?: boolean) => void;
  /** Idle standing pose; `t` is time in seconds for subtle motion. */
  stand: (t: number, umbrella?: boolean) => void;
  /** Sitting pose (hips level with the origin minus leg length — place the
   *  figure so its hips land on the seat; the feet dangle). */
  sit: (t: number) => void;
};

const SKIN = [0xf2cfae, 0xf0c8a0, 0xe0aa80, 0xb98354, 0x8d5a33];
const HAIR = [0x1f1f22, 0x3a2a1c, 0x5a3b22, 0x7a4a24, 0xb08a4a, 0xc7622e];
const HAIR_GREY = [0xd6d2cc, 0xb8b2a8, 0x918b83];
const TSHIRT = [0xcc4b4b, 0x3f6fb0, 0x4a9d5b, 0xd8a13a, 0x8a5aa8, 0x50a0a0, 0xdde1e6, 0xd96a8b];
const SHIRT_C = [0xb0c4d8, 0xc8b89a, 0x9ab8a0, 0xd8c8d8, 0x8aa8c0];
const HOODIE_C = [0x9a4a4a, 0x4a5a8a, 0x5a7a52, 0x8a8a92, 0x6a4a7a];
const JACKET_C = [0x3a4a62, 0x6a4a32, 0x4a6a52, 0x8a3a3a, 0x3a3a42, 0x946c38];
const COAT_C = [0x2f3a52, 0x5a4432, 0x4a523a, 0x6e2f38, 0x3c3c46, 0x74583a];
const PANTS = [0x394a5a, 0x44546a, 0x5a4636, 0x2f3e4d, 0x444444, 0x6b6456];
const SHORTS = [0x2f3e4d, 0x444444, 0x8a3a3a, 0x3a6a8a];
const SHOES = [0x33302c, 0x4a4440, 0x5a3b28, 0xe8e4dc];
const BRIGHT = [0xd84b7a, 0x3fa0d0, 0x58b858, 0xe8a43a, 0x9a6ad8];
const UMBRELLAS = [0x3a3a46, 0x6e2f38, 0x2f4a62, 0xd8a13a, 0x4a6a52, 0xb04a6a];
const HAIRSTYLES: HairStyle[] = ["short", "bob", "long", "bun", "ponytail", "short", "bald"];

/** 0 = midsummer .. 1 = midwinter, for dressing agents by month (0..12). */
export function coldness(month: number): number {
  const m = ((month % 12) + 12) % 12;
  const d = Math.min(Math.abs(m - 6.5), 12 - Math.abs(m - 6.5));
  return clamp01((d - 1.5) / 4);
}

/** Roll a full outfit + body for the given month's weather. */
export function randomLook(rng: Rng, month: number, forced?: Archetype): PersonLook {
  const r = rng();
  const archetype: Archetype =
    forced ?? (r < 0.62 ? "adult" : r < 0.74 ? "kid" : r < 0.88 ? "elder" : "jogger");
  const cold = coldness(month);
  const kid = archetype === "kid";
  const elder = archetype === "elder";
  const jogger = archetype === "jogger";

  let top: TopKind;
  if (jogger) top = cold > 0.55 ? "hoodie" : "tshirt";
  else if (cold > 0.72) top = rng() < 0.55 ? "coat" : rng() < 0.6 ? "jacket" : "hoodie";
  else if (cold > 0.38) top = pick(rng, ["jacket", "hoodie", "shirt", "jacket"] as const);
  else top = rng() < 0.55 ? "tshirt" : rng() < 0.6 ? "shirt" : "hoodie";

  const topColor =
    top === "tshirt"
      ? pick(rng, jogger ? BRIGHT : TSHIRT)
      : top === "shirt"
        ? pick(rng, SHIRT_C)
        : top === "jacket"
          ? pick(rng, JACKET_C)
          : top === "coat"
            ? pick(rng, COAT_C)
            : pick(rng, HOODIE_C);

  let hat: HatKind = "none";
  if (cold > 0.65 && top !== "hoodie") hat = chance(rng, kid ? 0.9 : 0.7) ? "beanie" : "none";
  else if (chance(rng, elder ? 0.35 : kid ? 0.3 : 0.15)) hat = "cap";

  let hairStyle = pick(rng, HAIRSTYLES);
  if (kid && hairStyle === "bald") hairStyle = "short";
  if (elder && chance(rng, 0.3)) hairStyle = "bald";

  const bareShins = jogger && cold < 0.55;
  return {
    archetype,
    height: kid ? range(rng, 36, 46) : elder ? range(rng, 52, 60) : range(rng, 56, 68),
    build: elder ? range(rng, 0.3, 1) : range(rng, 0, 1),
    skin: pick(rng, SKIN),
    hairStyle,
    hairColor: elder ? pick(rng, HAIR_GREY) : pick(rng, HAIR),
    top,
    topColor,
    bottomColor: bareShins ? pick(rng, SHORTS) : pick(rng, PANTS),
    bareShins,
    shoeColor: jogger ? SHOES[3] : pick(rng, SHOES),
    hat,
    hatColor: pick(rng, kid ? BRIGHT : [0x4a4a52, 0x8a3a3a, 0x3a5a7a, 0x5a5244]),
    umbrellaColor: pick(rng, UMBRELLAS),
    bag: !kid && !jogger && chance(rng, 0.3),
    backpack: kid && chance(rng, 0.55),
    cane: elder && chance(rng, 0.65),
  };
}

/** Darken a colour for the far-side limbs so the profile reads with depth. */
const far = (c: number) => lerpColor(c, 0x1a1a24, 0.3);
const darker = (c: number) => lerpColor(c, 0x000000, 0.25);

type Leg = { hip: Container; knee: Container; foot: Graphics };
type Arm = { shoulder: Container; elbow: Container };

export function buildPerson(look: PersonLook): Person {
  const h = look.height;
  const kid = look.archetype === "kid";
  const headR = h * (kid ? 0.135 : 0.1);
  const legLen = h * 0.47;
  const thighLen = legLen * 0.52;
  const shinLen = legLen * 0.48;
  const torsoH = h - legLen - headR * 2 - h * 0.045;
  const torsoW = h * (kid ? 0.22 : 0.19 + look.build * 0.08);
  const legW = h * (kid ? 0.065 : 0.058);
  const armW = h * (kid ? 0.055 : 0.05);
  const upperLen = torsoH * 0.58;
  const foreLen = torsoH * 0.52;
  const footLen = h * 0.15;
  const footH = h * 0.042;
  const hipY = -legLen;
  const coat = look.top === "coat";
  const shortSleeve = look.top === "tshirt";

  const root = new Container();

  const makeLeg = (isFar: boolean): Leg => {
    const sh = (c: number) => (isFar ? far(c) : c);
    const hip = new Container();
    hip.position.set(isFar ? -1.5 : 1.5, hipY);
    const thigh = new Graphics()
      .roundRect(-legW / 2, -2, legW, thighLen + 4, legW / 2)
      .fill({ color: sh(look.bottomColor) });
    const knee = new Container();
    knee.y = thighLen;
    const shin = new Graphics()
      .roundRect(-legW * 0.45, -2, legW * 0.9, shinLen + 2, legW / 2)
      .fill({ color: sh(look.bareShins ? look.skin : look.bottomColor) });
    const foot = new Graphics()
      .roundRect(-footLen * 0.3, -footH, footLen, footH, footH / 2)
      .fill({ color: sh(look.shoeColor) });
    foot.y = shinLen;
    knee.addChild(shin, foot);
    hip.addChild(thigh, knee);
    return { hip, knee, foot };
  };

  const makeArm = (isFar: boolean): Arm => {
    const sh = (c: number) => (isFar ? far(c) : c);
    const shoulder = new Container();
    shoulder.position.set(isFar ? -1 : 1, -torsoH + armW * 0.9);
    const upper = new Graphics();
    if (shortSleeve) {
      upper
        .roundRect(-armW / 2, -armW / 2, armW, upperLen + armW / 2, armW / 2)
        .fill({ color: sh(look.skin) });
      upper
        .roundRect(-armW / 2 - 0.5, -armW / 2, armW + 1, upperLen * 0.5, armW / 2)
        .fill({ color: sh(look.topColor) });
    } else {
      upper
        .roundRect(-armW / 2, -armW / 2, armW, upperLen + armW / 2, armW / 2)
        .fill({ color: sh(look.topColor) });
    }
    const elbow = new Container();
    elbow.y = upperLen;
    const fore = new Graphics()
      .roundRect(-armW * 0.42, -2, armW * 0.84, foreLen, armW / 2)
      .fill({ color: sh(shortSleeve ? look.skin : look.topColor) });
    fore.circle(0, foreLen, armW * 0.55).fill({ color: sh(look.skin) });
    elbow.addChild(fore);
    shoulder.addChild(upper, elbow);
    return { shoulder, elbow };
  };

  const legFar = makeLeg(true);
  const legNear = makeLeg(false);
  const armFar = makeArm(true);
  const armNear = makeArm(false);

  let cane: Graphics | null = null;
  if (look.cane) {
    // Walking cane held in the near hand, reaching the ground.
    const handY = hipY + (-torsoH + armW * 0.9) + upperLen + foreLen;
    cane = new Graphics();
    cane.roundRect(-1.1, 0, 2.2, -handY, 1).fill({ color: 0x6b4a2f });
    cane.y = foreLen;
    armNear.elbow.addChild(cane);
  }

  // Umbrella gripped by the near hand; shown on demand. The stick runs from
  // the hand up past the head, where the canopy dome opens.
  const stickLen = h * 0.46;
  const uR = h * 0.3;
  const umbrella = new Container();
  {
    const g = new Graphics();
    g.roundRect(-0.9, -stickLen, 1.8, stickLen + h * 0.07, 1).fill({ color: 0x5a4a3a });
    g.rect(-0.8, -stickLen - uR * 0.22, 1.6, uR * 0.25).fill({ color: 0x5a4a3a });
    g.moveTo(-uR, -stickLen)
      .arc(0, -stickLen, uR, Math.PI, Math.PI * 2)
      .closePath()
      .fill({ color: look.umbrellaColor });
    umbrella.addChild(g);
    umbrella.y = foreLen; // at the hand
    umbrella.visible = false;
    armNear.elbow.addChild(umbrella);
  }

  // Body container holds torso, arms and head so the whole upper body can
  // bob and lean while the hips stay put.
  const body = new Container();
  body.y = hipY;

  const torso = new Graphics();
  if (look.top === "hoodie") {
    // Hood resting on the back of the neck.
    torso
      .ellipse(-torsoW * 0.5, -torsoH + headR * 0.2, headR * 0.72, headR * 0.82)
      .fill({ color: darker(look.topColor) });
  }
  if (coat) {
    const drop = thighLen * 0.55;
    torso
      .roundRect(-torsoW / 2 - 1, -torsoH, torsoW + 2, torsoH + drop, torsoW * 0.28)
      .fill({ color: look.topColor });
    torso
      .rect(-torsoW / 2 - 1, -2.5, torsoW + 2, 2.5)
      .fill({ color: darker(look.topColor) });
  } else {
    torso
      .roundRect(-torsoW / 2, -torsoH, torsoW, torsoH + 3, torsoW * 0.32)
      .fill({ color: look.topColor });
  }
  if (look.top === "jacket") {
    torso.rect(torsoW * 0.12, -torsoH + 2, 1.3, torsoH).fill({ color: darker(look.topColor) });
  }

  // Kid's backpack rides on the back (-x side).
  const backpack = new Graphics();
  if (look.backpack) {
    backpack
      .roundRect(-torsoW / 2 - h * 0.09, -torsoH + 2, h * 0.095, torsoH * 0.62, 3)
      .fill({ color: pickBright(look) });
  }

  // Shoulder bag: strap across the torso, pouch at the hip.
  const bag = new Graphics();
  if (look.bag) {
    const bagC = 0x4a3b2d;
    bag
      .moveTo(-torsoW * 0.1, -torsoH + 2)
      .lineTo(torsoW * 0.55, -4)
      .stroke({ width: 2, color: bagC, alpha: 0.9 });
    bag.roundRect(torsoW * 0.35, -6, h * 0.1, h * 0.085, 2).fill({ color: bagC });
  }

  const head = new Container();
  head.y = -torsoH + 1;
  const neckH = h * 0.03;
  const cy = -neckH - headR; // face centre in head-local coords
  const headG = new Graphics();
  // Hair behind the face (skull side).
  if (look.hairStyle !== "bald") {
    if (look.hairStyle === "long") {
      headG
        .roundRect(-headR * 1.3, cy - headR * 0.5, headR * 1.15, headR * 2.6, headR * 0.5)
        .fill({ color: look.hairColor });
    }
    if (look.hairStyle === "ponytail") {
      headG
        .roundRect(-headR * 1.35, cy - headR * 0.2, headR * 0.5, headR * 1.7, headR * 0.25)
        .fill({ color: look.hairColor });
    }
    headG
      .circle(-headR * 0.15, cy - headR * 0.1, headR * (look.hairStyle === "bob" ? 1.18 : 1.02))
      .fill({ color: look.hairColor });
    if (look.hairStyle === "bob") {
      headG
        .roundRect(-headR * 1.3, cy - headR * 0.3, headR * 1.3, headR * 1.5, headR * 0.4)
        .fill({ color: look.hairColor });
    }
    if (look.hairStyle === "bun") {
      headG.circle(-headR * 0.95, cy - headR * 0.6, headR * 0.42).fill({ color: look.hairColor });
    }
  }
  headG.rect(-headR * 0.35, -neckH - 2, headR * 0.7, neckH + 4).fill({ color: look.skin });
  headG.circle(0, cy, headR).fill({ color: look.skin });
  // Nose hint sells the facing direction at a glance.
  headG
    .poly([headR * 0.78, cy - headR * 0.1, headR * 1.12, cy + headR * 0.18, headR * 0.72, cy + headR * 0.34])
    .fill({ color: look.skin });
  if (look.hairStyle !== "bald" && look.hat !== "beanie") {
    // Fringe over the forehead.
    headG
      .ellipse(headR * 0.12, cy - headR * 0.78, headR * 0.52, headR * 0.32)
      .fill({ color: look.hairColor });
  }
  if (look.hat === "cap") {
    headG
      .ellipse(-headR * 0.05, cy - headR * 0.55, headR * 1.04, headR * 0.6)
      .fill({ color: look.hatColor });
    headG
      .roundRect(headR * 0.5, cy - headR * 0.68, headR * 1.0, headR * 0.24, 2)
      .fill({ color: look.hatColor });
  } else if (look.hat === "beanie") {
    headG
      .ellipse(0, cy - headR * 0.55, headR * 1.06, headR * 0.72)
      .fill({ color: look.hatColor });
    headG
      .rect(-headR * 1.04, cy - headR * 0.5, headR * 2.08, headR * 0.3)
      .fill({ color: darker(look.hatColor) });
    if (kid) {
      headG.circle(0, cy - headR * 1.3, headR * 0.28).fill({ color: 0xf0ece4 });
    }
  }
  head.addChild(headG);

  body.addChild(armFar.shoulder, backpack, torso, bag, head, armNear.shoulder);
  // A coat covers both hips, so both legs go behind the body.
  if (coat) root.addChild(legFar.hip, legNear.hip, body);
  else root.addChild(legFar.hip, body, legNear.hip);

  const elder = look.archetype === "elder";
  const amp = elder ? 0.62 : 1;
  const baseLean = elder ? 0.16 : 0.05;

  // Grip pose for the near arm while the umbrella is up; the umbrella
  // counter-rotates so its stick stays near-vertical.
  const GRIP_SHOULDER = -0.55;
  const GRIP_ELBOW = -1.25;

  const setUmbrella = (on: boolean, t: number) => {
    umbrella.visible = on;
    if (!on) return;
    armNear.shoulder.rotation = GRIP_SHOULDER;
    armNear.elbow.rotation = GRIP_ELBOW;
    umbrella.rotation = -(GRIP_SHOULDER + GRIP_ELBOW) + 0.06 + Math.sin(t * 1.3) * 0.03;
  };

  const animate = (phase: number, pace: number, withUmbrella = false) => {
    const hipA = (0.42 + 0.3 * pace) * amp;
    const armA = (0.3 + 0.28 * pace) * (elder ? 0.42 : 1);
    const kneeA = (0.6 + 0.5 * pace) * amp;

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
      A.elbow.rotation = -(0.25 + 0.5 * pace + 0.35 * Math.max(0, Math.sin(t)));
    };

    poseLeg(legNear, phase);
    poseLeg(legFar, phase + Math.PI);
    poseArm(armFar, phase);
    if (!withUmbrella) poseArm(armNear, phase + Math.PI);

    body.y = hipY - Math.abs(Math.sin(phase)) * (1.1 + pace * 1.5) * amp;
    body.rotation = baseLean + pace * 0.1;
    head.rotation = -body.rotation * 0.55 + (elder ? 0.07 : 0) + Math.sin(phase * 2) * 0.02;
    if (cane) cane.visible = !withUmbrella;
    setUmbrella(withUmbrella, phase);
  };

  const stand = (t: number, withUmbrella = false) => {
    const poseLeg = (L: Leg, off: number) => {
      L.hip.rotation = off;
      L.knee.rotation = 0.05;
      L.foot.rotation = -off;
    };
    poseLeg(legFar, -0.06);
    poseLeg(legNear, 0.06);
    armFar.shoulder.rotation = 0.08;
    armFar.elbow.rotation = -0.18;
    armNear.shoulder.rotation = -0.08;
    armNear.elbow.rotation = -0.18;
    body.y = hipY - 0.4 - Math.sin(t * 1.6) * 0.35; // breathing
    body.rotation = baseLean * 0.7;
    head.rotation = -body.rotation * 0.4 + (elder ? 0.07 : 0);
    if (cane) cane.visible = !withUmbrella;
    setUmbrella(withUmbrella, t);
  };

  const sit = (t: number) => {
    const poseLeg = (L: Leg, off: number) => {
      L.hip.rotation = -1.52 + off;
      L.knee.rotation = 1.42;
      L.foot.rotation = 0.12;
    };
    poseLeg(legFar, -0.05);
    poseLeg(legNear, 0.06);
    // Hands rest on the lap.
    armFar.shoulder.rotation = -0.5;
    armFar.elbow.rotation = -0.75;
    armNear.shoulder.rotation = -0.5;
    armNear.elbow.rotation = -0.75;
    body.y = hipY - 0.2 - Math.sin(t * 1.6) * 0.3;
    body.rotation = elder ? 0.1 : 0.02;
    head.rotation = -body.rotation * 0.4 + (elder ? 0.05 : 0);
    if (cane) cane.visible = false; // would float mid-air while seated
    umbrella.visible = false;
  };

  animate(0, 0);
  return { view: root, look, animate, stand, sit };
}

/** Stable bright accent colour derived from the look itself. */
function pickBright(look: PersonLook): number {
  return BRIGHT[(look.height * 7 + look.topColor) % BRIGHT.length | 0];
}
