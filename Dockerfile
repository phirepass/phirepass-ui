# Multi-stage build for minimal Next.js app with Bun

# Stage 1: Dependencies
FROM imbios/bun-node:20-alpine AS deps
WORKDIR /app

# Copy package files
COPY package.json bun.lockb ./
COPY scripts ./scripts

# Install dependencies (includes devDependencies needed for build)
RUN bun install --frozen-lockfile

# Stage 2: Builder
FROM oven/bun:1-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN bun run build

# Stage 3: Runner (minimal production image)
FROM node:20-alpine AS runner
WORKDIR /app

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

ENV PORT=8084
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 8084

USER node

CMD ["node", "server.js"]
