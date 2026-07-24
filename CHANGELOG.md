# Changelog

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
