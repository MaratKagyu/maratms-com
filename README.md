
# Dev commands 
```bash
# Run the project in dev mode with auto-update
npm run dev

# Build the project
npm run build
```


# Run in production
Build the frontend image
```bash
# Drop existing containers
docker compose -f ./.docker/prod/compose.yml --env-file ./.env down
 
# This command deletes previously built front images and builds a new one
./bin/docker-build.sh
```

Please make sure you set up `.env` including `CF_TUNNEL_TOKEN` parameter.
```bash
# Run with specified paths to compose.yml and .env files
docker compose -f ./.docker/prod/compose.yml --env-file ./.env up
```
