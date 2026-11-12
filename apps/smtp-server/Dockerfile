# SMTP proxy image. Build from the repository root so dependencies come from
# the monorepo lockfile:
#   docker build -f apps/smtp-server/Dockerfile .
# Update the Node version with each Node security release (and .nvmrc).

# --- Build stage
FROM node:22.23.5-alpine3.24 AS builder

# pnpm at the version in package.json's packageManager
RUN npm install -g corepack@0.34.5 && corepack enable

WORKDIR /repo

# Workspace manifests and the lockfile first, so the install layer is cached
# until dependencies change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/smtp-server/package.json apps/smtp-server/package.json
RUN pnpm install --frozen-lockfile --filter smtp-server

# Only what the build needs, never local files like .env or node_modules
COPY apps/smtp-server/src apps/smtp-server/src
COPY apps/smtp-server/tsconfig.json apps/smtp-server/tsup.config.ts apps/smtp-server/
RUN pnpm --filter smtp-server run build

# Reinstall with only production dependencies, still from the lockfile.
RUN rm -rf node_modules apps/smtp-server/node_modules \
  && pnpm install --frozen-lockfile --prod --filter smtp-server

# --- Production stage
FROM node:22.23.5-alpine3.24 AS production

# Same layout as the repo: pnpm links the app's dependencies from the root
# node_modules/.pnpm store.
WORKDIR /app
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/apps/smtp-server/node_modules ./apps/smtp-server/node_modules
COPY --from=builder /repo/apps/smtp-server/package.json ./apps/smtp-server/package.json
COPY --from=builder /repo/apps/smtp-server/dist ./apps/smtp-server/dist

# Runs from /app, as before this layout, so a mounted /app/.env still loads.
# 25 and 587: STARTTLS. 465: implicit TLS. 2465 and 2587: alternates for
# networks that block the standard ports.
EXPOSE 25 465 587 2465 2587

CMD ["node", "apps/smtp-server/dist/server.js"]
