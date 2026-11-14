# syntax=docker/dockerfile:1
# QuestClass production image: one Node process serves the API, the built SPA and media
# (Range); Caddy in front only terminates TLS. Build from the repository root:
#
#   docker build -f deploy/Dockerfile -t questclass .
#
# Runtime configuration is PORT, DATA_DIR and NODE_ENV only (CLAUDE.md 7); the data volume is
# /data and must be writable by uid 1000. Dev tools (sharp, ffmpeg, Playwright) are never
# installed here (CLAUDE.md 13): only the API and the web app are installed and built.
# Alpine keeps the image under the 250 MB budget; better-sqlite3 ships a musl prebuild. The
# runtime is plain Alpine plus the Node binary: deleting npm/yarn from a node image in a later
# layer would only hide them, the image would still ship them. Both tags name one Alpine release.

ARG NODE_IMAGE=node:22-alpine3.24
ARG ALPINE_IMAGE=alpine:3.24

# ---------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /src
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=1
RUN corepack enable

# Manifests first: the dependency layer is rebuilt only when they change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY tools/lesson-prep/package.json tools/lesson-prep/
COPY e2e/package.json e2e/
RUN --mount=type=cache,id=questclass-pnpm-store,target=/pnpm-store \
    pnpm install --frozen-lockfile --store-dir /pnpm-store \
      --filter "@questclass/api..." --filter "@questclass/web..."

COPY packages packages
COPY apps/api apps/api
COPY apps/web apps/web
RUN pnpm --filter @questclass/api --filter @questclass/web build

# What the runtime needs, in the layout static.ts and migrate.ts expect (apps/api/dist next to
# apps/web/dist). The API bundle inlines every dependency except native better-sqlite3
# (apps/api/build.mjs); of it only the JS and this platform's prebuilt binding are kept.
RUN set -eux; \
    mkdir -p /out/apps/api /out/apps/web /out/node_modules; \
    cp apps/api/package.json /out/apps/api/; \
    cp -r apps/api/dist /out/apps/api/dist; \
    find /out/apps/api/dist -name '*.map' -delete; \
    cp -r apps/web/dist /out/apps/web/dist; \
    sqlite="$(readlink -f apps/api/node_modules/better-sqlite3)"; \
    dest=/out/node_modules/better-sqlite3; \
    mkdir -p "$dest/prebuilds"; \
    cp -r "$sqlite/package.json" "$sqlite/LICENSE" "$sqlite/lib" "$dest/"; \
    cp "$sqlite/prebuilds/linuxmusl-$(node -p process.arch).node" "$dest/prebuilds/"

# ---------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS node

# ---------------------------------------------------------------------------------------------
FROM ${ALPINE_IMAGE} AS runtime
# Node's shared libraries; tini as PID 1 forwards SIGTERM to Node (graceful shutdown) and reaps
# zombies. User `node` has uid/gid 1000 as in the official images.
RUN apk add --no-cache libstdc++ libgcc tini \
  && addgroup -g 1000 node \
  && adduser -u 1000 -G node -s /bin/sh -D node \
  && mkdir -p /data \
  && chown node:node /data
COPY --from=node /usr/local/bin/node /usr/local/bin/node

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    NODE_OPTIONS=--max-old-space-size=96

COPY --from=build /out /app
COPY deploy/healthcheck.mjs /app/healthcheck.mjs
WORKDIR /app/apps/api

# Fail the build, not the server: every module of both bundles resolves, the native binding
# loads, and the SPA is in place.
RUN node dist/cli.js > /dev/null 2>&1; test $? -eq 2 \
  && node -e "new (require('better-sqlite3'))(':memory:').prepare('select 1').get()" \
  && test -f /app/apps/web/dist/index.html

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "/app/healthcheck.mjs"]
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
