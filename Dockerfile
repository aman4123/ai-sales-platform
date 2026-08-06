FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4 AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4 AS runtime

RUN apk add --no-cache dumb-init postgresql17-client
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    SERVE_STATIC=true

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npm cache clean --force \
    && rm -rf \
      /usr/local/lib/node_modules/npm \
      /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm \
      /usr/local/bin/npx \
      /usr/local/bin/corepack \
      /usr/local/bin/yarn \
      /usr/local/bin/yarnpkg \
      /opt/yarn-v*

COPY --from=build /app/dist ./dist
COPY --from=build /app/server/dist ./server/dist
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
COPY scripts/database-backup.mjs scripts/database-restore.mjs ./scripts/
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/ai-sales-start

USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health/live >/dev/null || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server/dist/index.js"]
