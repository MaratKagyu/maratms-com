import type { Environment } from "./environment";

export type Palette = {
  skyTop: number;
  skyBottom: number;
  sun: number;
  sea: number;
  seaRipple: number;
  grass: number;
  grassShade: number;
  path: number;
  pathEdge: number;
  birchTrunk: number;
  birchMark: number;
  birchLeaf: number;
  birchLeafLight: number;
  benchWood: number;
  benchLeg: number;
};

/**
 * M1: a fixed clear-summer-midday palette.
 * M2/M4 will interpolate these from env.timeOfDay and env.season.
 */
export function paletteFor(_env: Environment): Palette {
  return {
    skyTop: 0x5b9bd5,
    skyBottom: 0xcfe6f2,
    sun: 0xfff4c2,
    sea: 0x4f9ec4,
    seaRipple: 0x9fd3e6,
    grass: 0x6ab04c,
    grassShade: 0x548f3a,
    path: 0xdcc9a0,
    pathEdge: 0xc3ad81,
    birchTrunk: 0xf3f1ea,
    birchMark: 0x2c2c2c,
    birchLeaf: 0x6fae3f,
    birchLeafLight: 0x8cc757,
    benchWood: 0x9c6b34,
    benchLeg: 0x5f3f1e,
  };
}
