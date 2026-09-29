# syntax=docker/dockerfile:1.7
# Next.js standalone build. Build context: repository root.
# NEXT_PUBLIC_* values are inlined at build time, so they are build args.

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates tini \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /app
ENV YARN_ENABLE_TELEMETRY=0 NEXT_TELEMETRY_DISABLED=1

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
  yarn workspaces focus designsai-boilerplate @boilerplate/web
COPY tsconfig.base.json turbo.json ./
COPY packages/shared-schemas ./packages/shared-schemas
COPY apps/web ./apps/web

ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_APP_NAME="Boilerplate AI"
ARG NEXT_PUBLIC_SIGNUP_BONUS_CREDITS=50
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
  NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME} \
  NEXT_PUBLIC_SIGNUP_BONUS_CREDITS=${NEXT_PUBLIC_SIGNUP_BONUS_CREDITS}
RUN yarn turbo run build --filter=@boilerplate/web...

FROM base AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/web/server.js"]
