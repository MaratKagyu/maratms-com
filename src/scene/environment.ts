export type Season = "spring" | "summer" | "autumn" | "winter";

/**
 * Global, shared world state. Every layer and entity reads from this instead of
 * baking time/season/weather into itself — that is what keeps the scene
 * composable as we add day/night (M2), seasons (M4) and weather (M5).
 */
export type Environment = {
  /** Continuous hour of day, 0..24. */
  timeOfDay: number;
  season: Season;
  // weather, wind, ... come in later milestones
};

/**
 * M1: a fixed clear-summer-midday snapshot.
 * M2 will replace this with a value derived from the real local clock/date
 * (the chosen "real time" model) and animate it every frame.
 */
export function createEnvironment(): Environment {
  return { timeOfDay: 13, season: "summer" };
}
