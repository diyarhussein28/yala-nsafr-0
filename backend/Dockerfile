# syntax=docker/dockerfile:1.7
# Production image for the Yala Nsafr API.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
RUN apk add --no-cache tini
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node admin-panel ./admin-panel
# Upload folders are volumes in production (or replaced by STORAGE_DRIVER=s3)
RUN mkdir -p uploads uploads-private && chown node:node uploads uploads-private
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/v1/health || exit 1
# Pending migrations run at boot (DB_MIGRATIONS_RUN=false disables that)
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
