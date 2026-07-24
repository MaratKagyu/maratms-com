export type Clock = {
  /** Hour of day, 0..24. */
  hour: () => number;
  /** Continuous month, 0 (Jan) .. 12 (wraps). */
  month: () => number;
};

function realHour(): number {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

function realMonth(): number {
  const d = new Date();
  return d.getMonth() + (d.getDate() - 1) / 30.4;
}

/**
 * Drives the scene's time of day and season. Defaults to the real local
 * clock/date (the chosen "real time" model). Dev/preview overrides via URL:
 *   ?hour=20     freeze time of day at 20:00
 *   ?speed=600   run time of day 600x faster from load
 *   ?month=9.7   freeze the season at mid-October (0 = Jan)
 */
export function createClock(): Clock {
  const params = new URLSearchParams(window.location.search);

  const hourParam = params.get("hour");
  const fixedHour = hourParam !== null ? ((Number(hourParam) % 24) + 24) % 24 : null;
  const speed = Number(params.get("speed")) || 1;

  const monthParam = params.get("month");
  const fixedMonth = monthParam !== null ? ((Number(monthParam) % 12) + 12) % 12 : null;

  const start = performance.now();
  const baseHour = realHour();

  const hour = () => {
    if (fixedHour !== null) return fixedHour;
    if (speed === 1) return realHour();
    const elapsedH = ((performance.now() - start) / 3_600_000) * speed;
    return (((baseHour + elapsedH) % 24) + 24) % 24;
  };

  const month = () => (fixedMonth !== null ? fixedMonth : realMonth());

  return { hour, month };
}
