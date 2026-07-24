import { useEffect, useRef } from "react";
import { Application } from "pixi.js";
import { buildScene } from "./scene/buildScene";
import { createEnvironment } from "./scene/environment";
import { createClock } from "./scene/clock";
import styles from "./ShoreScene.module.css";

export default function ShoreScene() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let app: Application | null = null;
    let detach: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      const instance = new Application();
      await instance.init({
        resizeTo: host,
        antialias: true,
        background: 0x0a0a12,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      // Effect was cleaned up while init() was still running (StrictMode).
      if (cancelled) {
        instance.destroy(true, { children: true, texture: true });
        return;
      }

      app = instance;
      host.appendChild(instance.canvas);

      const scene = buildScene(instance, createEnvironment());
      const clock = createClock();

      const onResize = () => scene.layout(host.clientWidth, host.clientHeight);
      window.addEventListener("resize", onResize);
      onResize();

      const tick = () => scene.update(clock.now());
      tick();
      instance.ticker.add(tick);

      detach = () => window.removeEventListener("resize", onResize);
    })();

    return () => {
      cancelled = true;
      if (detach) detach();
      if (app) {
        app.destroy(true, { children: true, texture: true });
        app = null;
      }
    };
  }, []);

  return <div ref={hostRef} className={styles.host} aria-hidden="true" />;
}
