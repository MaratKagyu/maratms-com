export type Clock = { now: () => number };

/** Local wall-clock time as a continuous hour in [0, 24). */
function realHour(): number {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

/**
 * Drives the scene's time of day. Defaults to the real local clock (the chosen
 * "real time" model). Dev/preview overrides via URL query:
 *   ?hour=20     freeze the scene at 20:00
 *   ?speed=600   run time 600x faster from load (a day in ~2.4 min)
 */
export function createClock(): Clock {
  const params = new URLSearchParams(window.location.search);

  const hourParam = params.get("hour");
  if (hourParam !== null) {
    const h = ((Number(hourParam) % 24) + 24) % 24;
    return { now: () => h };
  }

  const speed = Number(params.get("speed")) || 1;
  if (speed === 1) return { now: realHour };

  const start = performance.now();
  const base = realHour();
  return {
    now: () => {
      const elapsedH = ((performance.now() - start) / 3_600_000) * speed;
      return (((base + elapsedH) % 24) + 24) % 24;
    },
  };
}
