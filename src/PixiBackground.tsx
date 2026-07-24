import { useEffect, useRef } from "react";
import { Application, Container, Graphics } from "pixi.js";
import styles from "./PixiBackground.module.css";

const COLORS = [0xff4d6d, 0xffd166, 0x06d6a0, 0x118ab2, 0x8338ec, 0xff7b00];
const PARTICLE_COUNT = 60;

type Particle = {
  gfx: Graphics;
  vx: number;
  vy: number;
  r: number;
};

export default function PixiBackground() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let app: Application | null = null;
    let cancelled = false;

    (async () => {
      const instance = new Application();
      await instance.init({
        resizeTo: host,
        background: "#0a0a12",
        antialias: true,
        // deterministic-ish seed independent of Date.now
        autoStart: true,
      });

      // Effect was cleaned up while init() was still running (StrictMode).
      if (cancelled) {
        instance.destroy(true, { children: true, texture: true });
        return;
      }

      app = instance;
      host.appendChild(instance.canvas);

      const layer = new Container();
      instance.stage.addChild(layer);

      const { width, height } = instance.screen;
      const particles: Particle[] = [];

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const r = 6 + (i % 9) * 4;
        const color = COLORS[i % COLORS.length];
        const gfx = new Graphics().circle(0, 0, r).fill({ color, alpha: 0.85 });
        gfx.x = ((i * 137) % Math.max(1, width - r * 2)) + r;
        gfx.y = ((i * 89) % Math.max(1, height - r * 2)) + r;

        // Pseudo-random velocities derived from the index (no Math.random needed).
        const angle = (i * 0.61803) * Math.PI * 2;
        const speed = 1.2 + (i % 5) * 0.4;
        particles.push({
          gfx,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          r,
        });
        layer.addChild(gfx);
      }

      instance.ticker.add((ticker) => {
        const dt = ticker.deltaTime;
        const w = instance.screen.width;
        const h = instance.screen.height;
        for (const p of particles) {
          p.gfx.x += p.vx * dt;
          p.gfx.y += p.vy * dt;

          if (p.gfx.x - p.r < 0) {
            p.gfx.x = p.r;
            p.vx = Math.abs(p.vx);
          } else if (p.gfx.x + p.r > w) {
            p.gfx.x = w - p.r;
            p.vx = -Math.abs(p.vx);
          }
          if (p.gfx.y - p.r < 0) {
            p.gfx.y = p.r;
            p.vy = Math.abs(p.vy);
          } else if (p.gfx.y + p.r > h) {
            p.gfx.y = h - p.r;
            p.vy = -Math.abs(p.vy);
          }
        }
        layer.rotation += 0.0006 * dt;
      });
    })();

    return () => {
      cancelled = true;
      if (app) {
        app.destroy(true, { children: true, texture: true });
        app = null;
      }
    };
  }, []);

  return <div ref={hostRef} className={styles.host} aria-hidden="true" />;
}
