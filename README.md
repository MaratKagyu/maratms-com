
# Dev commands 
```bash
# Run the project in dev mode with auto-update
npm run dev

# Build the project
npm run build
```


# Run in production
## Initial run
_**IMPORTANT**_. If you're running this under linux, you'll have to run all these commands as root (sudo won't work)
Build the frontend image
```bash
# Drop existing containers
docker compose down
 
# This command deletes previously built front images and builds a new one
sudo ./bin/docker-build.sh
```

Please make sure you set up `.env` including `CF_TUNNEL_TOKEN` parameter.
```bash
# Run with specified paths to compose.yml and .env files
docker compose up
```

## Rolling out updates
```bash
# Build a new image for the front (without deleting the previous ones)
sudo ./bin/docker-roll-build.sh

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
