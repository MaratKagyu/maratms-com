A personal site built as a plain **React 19 + Vite + TypeScript** single-page app.
`npm run build` produces a static bundle in `dist/` — no SSR, no Node.js runtime.
In production the static files are served by **nginx** (listening on port `3000`)
behind a Cloudflare tunnel.

# Dev commands
```bash
# Run the project in dev mode with hot reload (http://localhost:5173)
npm run dev

# Build the static bundle into dist/
npm run build

# Preview the production build locally
npm run preview
```


# Home page scene (Pixi)

The home page renders a live side-elevation shore scene (`src/scene/`). By
default it follows the real local **time of day**, **date/season** and a
procedural, season-biased **weather**. These URL query parameters override that
for development and preview — combine them freely:

| Parameter | Values | Effect |
|-----------|--------|--------|
| `hour`    | `0`–`24` (e.g. `20`, `6.5`) | Freeze the time of day. Drives sky colour, sun/moon arc and stars. |
| `speed`   | number (e.g. `600`, `800`) | Run the time of day N× faster from load instead of real time (a full day in ~`86400/speed` s). Ignored when `hour` is set. |
| `month`   | `0`–`12` (e.g. `1`=Feb, `9.7`=mid-Oct) | Freeze the season. Drives foliage, ground colour, snow cover and day length. |
| `weather` | `clear`, `cloudy`, `rain`, `snow`, `fog` | Force the weather condition. |
| `wind`    | `-1`–`1` (e.g. `0.6`, `-0.4`) | Force wind direction/strength (sways trees, slants precipitation, drifts clouds). |

Examples:
```
/?hour=13                     # midday
/?hour=22&month=1             # winter night
/?month=9.7                   # golden autumn
/?weather=rain&wind=0.6       # rain driven by wind
/?month=1&weather=snow&hour=20  # snowy winter evening
/?speed=800                   # fast day/night cycle with evolving weather
```


# Run in production
## Initial run
_**IMPORTANT**_. If you're running this under linux, you'll have to run all these commands as root (sudo won't work)
Build the frontend image
```bash
# Drop existing containers
docker compose down
 
# This command deletes previously built front images and builds a new one
./bin/docker-build.sh
```

Please make sure you set up `.env` including `CF_TUNNEL_TOKEN` parameter.
```bash
# Run with specified paths to compose.yml and .env files
docker compose up
```

## Rolling out updates
```bash
# Build a new image for the front (without deleting the previous ones)
./bin/docker-roll-build.sh

# Restart the front container
docker compose up -d --no-deps --force-recreate front
```

## Accessing containers
```bash
# Accessing the Front container
docker compose exec front sh
```

# Install Docker Compose as a Service (Debian)
Replace `/mnt/ssd/maratms.com` with the project location.
Replace `docker-compose-maratms-com` with whatever name you want

1. Setup service config
```bash

sudo nano /etc/systemd/system/docker-compose-maratms-com.service
```
Paste this:
```
[Unit]
Description=maratms.com web app
After=network-online.target docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=true
WorkingDirectory=/mnt/ssd/maratms.com
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```
2. Reload Systemd and Enable the Service
```bash

sudo systemctl daemon-reload
sudo systemctl enable docker-compose-maratms-com.service 
```

3. Start the service
```bash

sudo systemctl start docker-compose-maratms-com.service 
# You can verify the status by running this command
sudo systemctl status docker-compose-maratms-com.service

# Check the logs
sudo docker logs maratmscom-front-1
```
