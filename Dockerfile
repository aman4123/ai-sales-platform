FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS runtime

RUN apk add --no-cache dumb-init postgresql17-client
WORKDIR /app

ENV NODE_ENV=production \
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
COPY scripts ./scripts

USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health/live >/dev/null || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server/dist/index.js"]
