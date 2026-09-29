# syntax=docker/dockerfile:1.7
# Multi-stage build for the API. Build context: repository root.
#   docker build -f apps/api/Dockerfile .                    -> runtime image
#   docker build -f apps/api/Dockerfile --target migrator .  -> one-shot migrate + seed image

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates tini \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /app
ENV YARN_ENABLE_TELEMETRY=0

# ---- dependency manifests only: maximises layer caching -----------------------
FROM base AS manifests
COPY package.json yarn.lock .yarnrc.yml ./
COPY apps/api/package.json apps/api/
COPY apps/agents/package.json apps/agents/
COPY apps/web/package.json apps/web/
COPY packages/shared-audit/package.json packages/shared-audit/
COPY packages/shared-cache/package.json packages/shared-cache/
COPY packages/shared-logger/package.json packages/shared-logger/
COPY packages/shared-prisma/package.json packages/shared-prisma/
COPY packages/shared-schemas/package.json packages/shared-schemas/
COPY packages/shared-storage/package.json packages/shared-storage/
COPY packages/shared-utils/package.json packages/shared-utils/

# ---- full toolchain for the api and its workspace dependencies -----------------
FROM manifests AS builder
RUN --mount=type=cache,target=/root/.yarn/berry/cache \
  yarn workspaces focus designsai-boilerplate @boilerplate/api
COPY tsconfig.base.json turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN yarn turbo run build --filter=@boilerplate/api...

# ---- migrations + idempotent seed (run once per deploy, before the api) --------
FROM builder AS migrator
ENV NODE_ENV=production
CMD ["sh", "-c", "yarn workspace @boilerplate/shared-prisma db:migrate && yarn workspace @boilerplate/api db:seed"]

# ---- production dependencies only --------------------------------------------
FROM manifests AS prod-deps
RUN --mount=type=cache,target=/root/.yarn/berry/cache \
  yarn workspaces focus --production @boilerplate/api

# ---- runtime -------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production DOCKER_ENV=true PORT=8000
COPY --from=prod-deps /app/node_modules ./node_modules
# The generated Prisma client lives in node_modules and is produced at build time.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY package.json ./
COPY --from=builder /app/packages/shared-audit/package.json ./packages/shared-audit/
COPY --from=builder /app/packages/shared-audit/dist ./packages/shared-audit/dist
COPY --from=builder /app/packages/shared-cache/package.json ./packages/shared-cache/
COPY --from=builder /app/packages/shared-cache/dist ./packages/shared-cache/dist
COPY --from=builder /app/packages/shared-logger/package.json ./packages/shared-logger/
COPY --from=builder /app/packages/shared-logger/dist ./packages/shared-logger/dist
COPY --from=builder /app/packages/shared-prisma/package.json ./packages/shared-prisma/
COPY --from=builder /app/packages/shared-prisma/dist ./packages/shared-prisma/dist
COPY --from=builder /app/packages/shared-schemas/package.json ./packages/shared-schemas/
COPY --from=builder /app/packages/shared-schemas/dist ./packages/shared-schemas/dist
COPY --from=builder /app/packages/shared-storage/package.json ./packages/shared-storage/
COPY --from=builder /app/packages/shared-storage/dist ./packages/shared-storage/dist
COPY --from=builder /app/packages/shared-utils/package.json ./packages/shared-utils/
COPY --from=builder /app/packages/shared-utils/dist ./packages/shared-utils/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist

USER node
WORKDIR /app/apps/api
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
