# syntax=docker/dockerfile:1.7
# Agents runtime (Mastra). Build context: repository root.
# `mastra build` emits a self-contained server in .mastra/output (bundle +
# its own node_modules), so the runtime stage copies only that directory.

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates tini \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /app
ENV YARN_ENABLE_TELEMETRY=0

FROM base AS builder
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
RUN --mount=type=cache,target=/root/.yarn/berry/cache \
  yarn workspaces focus designsai-boilerplate @boilerplate/agents
COPY tsconfig.base.json turbo.json ./
COPY packages/shared-schemas ./packages/shared-schemas
COPY apps/agents ./apps/agents
RUN yarn turbo run build --filter=@boilerplate/agents...

FROM base AS runtime
ENV NODE_ENV=production PORT=8111
COPY --from=builder --chown=node:node /app/apps/agents/.mastra/output ./
USER node
EXPOSE 8111
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8111)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "index.mjs"]
