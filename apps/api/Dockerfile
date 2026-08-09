# syntax=docker/dockerfile:1.7
FROM node:24.14.0-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /workspace

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/shared-validation/package.json packages/shared-validation/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY apps/api apps/api
COPY packages packages
RUN pnpm --filter @task-platform/api db:generate && pnpm --filter @task-platform/api build
RUN pnpm deploy --filter @task-platform/api --prod --legacy /prod/api
RUN cp -R apps/api/dist /prod/api/dist \
  && cp -R apps/api/prisma /prod/api/prisma \
  && cp apps/api/prisma.config.ts /prod/api/prisma.config.ts

FROM node:24.14.0-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --gid 10001 taskapp && useradd --uid 10001 --gid taskapp --no-create-home --shell /usr/sbin/nologin taskapp
COPY --from=builder --chown=taskapp:taskapp /prod/api ./
USER taskapp
EXPOSE 3001
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/src/main.js"]
