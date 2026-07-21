# Browser versions are baked into this image tag — it MUST match the `playwright`
# / `playwright-core` npm version in the workspace (currently 1.61.1).
FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.14.0 --activate

# Install deps against the whole workspace graph the worker needs.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY apps/worker ./apps/worker
RUN pnpm install --frozen-lockfile && pnpm -r build

# Run with `--ipc=host` (or a large --shm-size) so Chromium doesn't exhaust /dev/shm.
CMD ["pnpm", "--filter", "@ghostwright/worker", "dev"]
