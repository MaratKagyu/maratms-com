# CLAUDE.md

Guidance for working in this repository.

## What this is

Personal website (maratms.com) — a single test home page. Plain **React 19 +
Vite + TypeScript** single-page app. No SSR, no framework, no backend.

Migrated off Next.js on 2026-07-24 to avoid recurring Next.js/Node.js CVEs that
required major version bumps (see `CHANGELOG.md`). Keep the dependency surface
small — that low-maintenance, low-CVE footprint is the point of this stack.

## Commands

```bash
npm run dev      # dev server with hot reload (http://localhost:5173)
npm run build    # type-check (tsc -b) + build static bundle into dist/
npm run preview  # serve the production build locally
npm run lint     # eslint
```

## Layout

- `index.html` — Vite entry point (the app root, not a static asset). `<head>`,
  title, favicon, fonts go here.
- `src/main.tsx` — React bootstrap.
- `src/App.tsx` — the page. `App.module.css` for its styles, `index.css` global.
- `public/` — files copied to `dist/` verbatim, not processed by the build.
- `tsconfig.json` references `tsconfig.app.json` (browser/`src`) and
  `tsconfig.node.json` (Node/`vite.config.ts`) — Vite's standard split.

## Production / deployment

- `npm run build` → static files in `dist/`. No Node.js runtime is used to serve.
- Served by **nginx (alpine)** — `.docker/prod/front/Dockerfile` is a multi-stage
  build (Node stage builds, nginx stage serves). Config in
  `.docker/prod/front/nginx.conf` (SPA fallback, asset caching, gzip).
- **nginx listens on port 3000** with an SPA fallback. Keep this port — the
  Cloudflare tunnel, `compose.yml`, and `bin/` scripts all assume 3000. Don't
  change it without updating the Cloudflare tunnel ingress.
- Runs on a Raspberry Pi behind a Cloudflare tunnel (`cloudflared` service in
  `compose.yml`). Build/run/rollout scripts are in `bin/`; see `README.md`.

## Conventions

- Keep dependencies minimal; prefer system fonts / no external requests.
- Match the existing code style.

## Git

- **Never commit or push.** The user always does git commits and pushes himself.
  Make the changes, leave them in the working tree, and stop.
