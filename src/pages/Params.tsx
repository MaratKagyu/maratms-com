import { Link } from "react-router-dom";
import styles from "./Params.module.css";

type Row = { name: string; values: string; effect: string };

const SCENE_PARAMS: Row[] = [
  {
    name: "hour",
    values: "0–24, e.g. 20 or 6.5",
    effect: "Freeze the time of day. Drives sky colour, sun/moon arc and stars.",
  },
  {
    name: "speed",
    values: "number, e.g. 600",
    effect:
      "Run the time of day N× faster from load (a full day in ~86400/N seconds). Ignored when hour is set.",
  },
  {
    name: "month",
    values: "0–12, 0 = January",
    effect:
      "Freeze the season. Drives foliage, ground colour, snow, day length and how the crowd dresses.",
  },
  {
    name: "weather",
    values: "clear · cloudy · rain · snow · fog",
    effect:
      "Force the weather, fully developed from the start. Rain raises umbrellas and thins the crowd; fog only shows a corner notice.",
  },
  {
    name: "wind",
    values: "-1–1, e.g. 0.6 or -0.4",
    effect:
      "Force wind direction/strength: sways trees, drifts clouds, slants rain, drives the waves.",
  },
  {
    name: "meteors",
    values: "number, e.g. 20",
    effect:
      "Multiply the shooting-star frequency (they are rare by default, mostly at night). Big values make a meteor shower.",
  },
];

const GALLERY_PARAMS: Row[] = [
  { name: "n", values: "1–16, default 8", effect: "Figures in the row — fewer means larger." },
  { name: "seed", values: "number", effect: "Reroll the outfits and bodies." },
  { name: "month", values: "0–12, default 6", effect: "Dress the lineup for a season." },
  { name: "pose", values: "stand · sit", effect: "Idle or bench pose instead of walking." },
  { name: "umbrella", values: "1", effect: "Everyone raises an umbrella." },
  { name: "pace", values: "0–1, default 0.3", effect: "Stroll … jog, for the non-forced figures." },
  { name: "phase", values: "radians, e.g. 2.6", effect: "Freeze the walk cycle at a fixed phase." },
  { name: "zoom", values: "number, default 4", effect: "Extra magnification (4 = fit to width)." },
];

const SCENE_EXAMPLES: [string, string][] = [
  ["/?hour=13", "midday"],
  ["/?hour=19.6", "sunset with a golden reflection path"],
  ["/?hour=23.5", "moonlit night"],
  ["/?hour=22&month=1", "winter night"],
  ["/?month=9.7", "golden autumn"],
  ["/?weather=rain&wind=0.6", "wind-driven rain, umbrellas up"],
  ["/?month=1&weather=snow&hour=20", "snowy winter evening"],
  ["/?speed=800", "fast day/night cycle with evolving weather"],
  ["/?hour=23.5&meteors=20", "a meteor shower over the moonlit sea"],
];

const GALLERY_EXAMPLES: [string, string][] = [
  ["/?gallery=1", "the full lineup"],
  ["/?gallery=1&n=4&month=0", "winter outfits, close up"],
  ["/?gallery=1&pose=sit", "bench-sitting pose"],
  ["/?gallery=1&umbrella=1&seed=5", "umbrellas up, rerolled looks"],
];

function ParamTable({ rows }: { rows: Row[] }) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Param</th>
          <th>Values</th>
          <th>Effect</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name}>
            <td>
              <code>{r.name}</code>
            </td>
            <td className={styles.values}>{r.values}</td>
            <td>{r.effect}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Examples({ items }: { items: [string, string][] }) {
  return (
    <ul className={styles.examples}>
      {items.map(([url, label]) => (
        <li key={url}>
          <Link to={url}>
            <code>{url}</code>
          </Link>
          <span> — {label}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Params() {
  return (
    <div className={styles.wrap}>
      <h1>Scene URL params</h1>
      <p>
        The home page simulates real local time, date and weather. These query
        parameters override the simulation for preview — combine them freely.
        Examples are clickable.
      </p>

      <h2>Shore scene</h2>
      <ParamTable rows={SCENE_PARAMS} />
      <Examples items={SCENE_EXAMPLES} />

      <h2>
        Character gallery — <code>/?gallery=1</code>
      </h2>
      <p>
        Renders a zoomed lineup of the procedural characters instead of the
        scene. The first four figures are always adult / kid / elder / jogger.
      </p>
      <ParamTable rows={GALLERY_PARAMS} />
      <Examples items={GALLERY_EXAMPLES} />
    </div>
  );
}
