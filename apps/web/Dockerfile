# syntax=docker/dockerfile:1.7
FROM node:24.14.0-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /workspace

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/shared-validation/package.json packages/shared-validation/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY apps/web apps/web
COPY packages packages
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @task-platform/web build

FROM node:24.14.0-bookworm-slim AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app
RUN groupadd --gid 10001 taskapp && useradd --uid 10001 --gid taskapp --no-create-home --shell /usr/sbin/nologin taskapp
COPY --from=builder --chown=taskapp:taskapp /workspace/apps/web/.next/standalone ./
COPY --from=builder --chown=taskapp:taskapp /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=taskapp:taskapp /workspace/apps/web/public ./apps/web/public
USER taskapp
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
