# Changelog

## 2026-10-08 — NPC graphics & behavior overhaul

Rebuilt the home-page scene's inhabitants from scratch, keeping the flat-vector
no-asset approach (everything is still drawn from Pixi primitives in code).

### Added
- Skeletal character rig: two-segment legs and arms (knees, elbows, feet,
  hands), far-side limb shading, forward lean, per-step bob; walking, idle
  standing and bench-sitting poses.
- Seeded character generator: archetypes (adult, kid, elder with cane,
  jogger), hair styles, seasonal outfits (t-shirts to winter coats, caps and
  beanies chosen by month), bags, kids' backpacks, five skin tones.
- NPC behavior: walkers enter/leave at the scene edges, pause, sit on benches,
  walk dogs on sagging leashes, raise umbrellas in rain; population density
  follows the time of day, weather and season (empty park at night).
- Dog variety: fur colours, floppy/pointy ears, tail poses, belly patches.
- Soft contact shadows under walkers; cloud cover dims the whole scene; ducks
  fly off for the deepest winter weeks.
- Living water (`src/scene/water.ts`), shaded per-pixel by a GLSL fragment
  shader on a single quad (the app pins Pixi to its WebGL renderer): the sea
  colour follows the sky, waves are posterized scrolling noise driven by the
  wind, the sun/moon casts a glinting reflection path that widens toward the
  shore and wobbles with the waves, daytime sparkles, a foam line along the
  grass edge; sitters can hold umbrellas on benches.
- Detailed clouds: seeded cumulus built from stacked puff tiers with a flat
  shadowed underside and sunlit caps, plus thin high wisps; each layer is
  tinted by the time of day (white at noon, cream-and-rose at the golden
  hours, moonlit slate at night).
- Seeded trees in three species (`src/scene/trees.ts`): birches, columnar
  poplars and tiered conifers. Tapered leaning trunks with root flare, bark
  marks/fissures, knots and a shaded side; canopies of layered leaf clumps
  (shadow/body/sunlit caps) that turn colour clump-by-clump and fall off
  gradually through autumn; recursive winter branch skeletons with snow on
  the twig tips; conifers stay green and collect snow per tier. Soft ground
  shadows under trees and benches, autumn leaf carpets, and leaves drifting
  down from the canopies on the wind. Wind now sways crowns, not trunks.
- Shooting stars (`src/scene/meteors.ts`): frequent and detailed at night —
  glowing head with a halo, tapering trail, embers burning out behind, rare
  bolides with a terminal flash and a lingering afterglow; by day only an
  occasional faint pale streak. Clouds suppress them. `?meteors=N`
  multiplies the frequency for a meteor-shower preview.
- Dev character gallery at `/?gallery=1` (see README).

### Changed
- Forced `?weather=X` now starts fully developed instead of fading in.
- Fog no longer renders at all (the old veil looked poor); the weather state
  keeps a fog condition, but on screen it only shows a small corner notice —
  "Fog is not implemented yet".

## 2026-07-24 — Migrated from Next.js to React + Vite

Replaced the Next.js stack with a plain React single-page app to avoid the
recurring Next.js/Node.js vulnerabilities that could only be resolved through
major version upgrades.

### Changed
- Replaced Next.js 15 (App Router) with **Vite 6 + React 19 + TypeScript**.
- `npm run build` now produces a static bundle in `dist/` — no SSR, no Node.js
  runtime required to serve the site.
- Production is now served by **nginx (alpine)** instead of `next start`.
  - The final Docker image contains only nginx and the static files — no
    Next.js and no Node.js runtime, drastically reducing the attack surface.
  - nginx listens on port `3000` with an SPA fallback, so the Cloudflare tunnel,
    `compose.yml`, and `bin/` scripts did not need any changes.
- Rewrote `.docker/prod/front/Dockerfile` as a multi-stage build: a Node stage
  builds the bundle, and an nginx stage serves it.
- Updated `README.md` to document the new stack and dev/build/preview commands.
- Replaced ESLint/TypeScript configs with the Vite-based setup
  (`eslint.config.js`, `tsconfig.app.json`, `tsconfig.node.json`).
- Moved the home page from `src/app/page.tsx` to `src/App.tsx`; the page content
  (the Raspberry Pi test message) was preserved.

### Removed
- Dropped `next/font` (Geist) in favor of a system font stack to remove an
  external dependency.
- Removed Next.js configuration (`next.config.ts`, `next-env.d.ts`) and the
  default Next.js branding assets from `public/` (`next.svg`, `vercel.svg`,
  `file.svg`, `globe.svg`, `window.svg`).

### Added
- `.docker/prod/front/nginx.conf` — nginx config with SPA fallback, asset
  caching, and gzip.
- `.dockerignore` to keep build context small.
- Vite entry points: `index.html`, `src/main.tsx`, `src/index.css`,
  `src/App.module.css`, `src/vite-env.d.ts`.
