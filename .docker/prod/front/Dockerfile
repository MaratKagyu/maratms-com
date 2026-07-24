ARG NODE_VERSION=22
ARG NGINX_VERSION=1.27

# ---- Build stage: compile the React app to static files ----
FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app

# Install dependencies based on the lockfile
COPY package.json package-lock.json* ./
RUN npm ci

# Build the static bundle into /app/dist
COPY . .
RUN npm run build

# ---- Runtime stage: serve static files with nginx ----
# No Node.js in the final image -> tiny attack surface, no Next.js/Node CVEs.
FROM nginx:${NGINX_VERSION}-alpine AS runner

COPY .docker/prod/front/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
