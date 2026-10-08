import { Application, Container, Graphics } from "pixi.js";
import { buildPerson, lookFromIndex } from "./person";

/**
 * Dev-only character gallery (`/?gallery=1`): a zoomed lineup of figures
 * walking in place on a neutral background, for judging silhouettes and gait
 * without the scale and busyness of the full scene.
 *
 * Extra params: `n` figures in the row (default 8 — fewer means larger),
 * `zoom` extra magnification (default 4 = fit), `pace` 0..1 (default 0.3),
 * `phase` freeze the walk cycle at a given radian value.
 */
export function buildGallery(app: Application) {
  const params = new URLSearchParams(window.location.search);
  const zoom = Number(params.get("zoom")) || 4;
  const pace = params.has("pace") ? Number(params.get("pace")) : 0.3;
  const frozen = params.get("phase") !== null ? Number(params.get("phase")) : null;

  const root = new Container();
  app.stage.addChild(root);

  const bg = new Graphics();
  root.addChild(bg);

  const COUNT = Math.max(1, Math.min(16, Number(params.get("n")) || 8));
  const figures = Array.from({ length: COUNT }, (_, i) => buildPerson(lookFromIndex(i)));
  const row = new Container();
  for (let i = 0; i < COUNT; i++) {
    figures[i].view.x = (i + 0.5) * 110;
    row.addChild(figures[i].view);
  }
  // Half the lineup faces left so both profiles are visible.
  for (let i = 0; i < COUNT; i += 2) figures[i].view.scale.x = -1;
  root.addChild(row);

  const layout = () => {
    const w = app.screen.width;
    const h = app.screen.height;
    bg.clear();
    bg.rect(0, 0, w, h).fill({ color: 0x2b3038 });
    bg.rect(0, h * 0.72, w, h * 0.28).fill({ color: 0x3a414c });
    // Fit the row to the width, then apply zoom relative to the default 4.
    const fit = w / (COUNT * 110);
    row.scale.set(fit * (zoom / 4));
    row.y = h * 0.72;
    row.x = (w - COUNT * 110 * row.scale.x) / 2;
  };
  layout();
  window.addEventListener("resize", () => layout());

  let phase = 0;
  app.ticker.add((t) => {
    phase += (t.deltaMS / 1000) * (3.2 + pace * 2.5);
    const p = frozen ?? phase;
    for (let i = 0; i < COUNT; i++) figures[i].animate(p + i * 0.7, pace);
  });
}
