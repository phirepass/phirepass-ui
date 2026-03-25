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
FROM oven/bun:1-alpine AS runner
WORKDIR /app

COPY --from=builder --chown=1001:1001 /app/public ./public
COPY --from=builder --chown=1001:1001 /app/.next/standalone ./
COPY --from=builder --chown=1001:1001 /app/.next/static ./.next/static

USER 1001

ENV PORT=8084
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

CMD ["bun", "server.js"]
