# Multi-stage build for minimal Next.js app with Bun

# Stage 1: Dependencies
FROM oven/bun:1-alpine AS deps
WORKDIR /app

# Copy package files
COPY package.json bun.lockb ./

# Install dependencies (includes devDependencies needed for build)
RUN bun install

# Stage 2: Builder
FROM oven/bun:1-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# generic
ENV PORT=8084
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# database
ENV DATABASE_HOST=localhost
ENV DATABASE_PORT=5432
ENV DATABASE_NAME=postgres
ENV DATABASE_USER=postgres
ENV DATABASE_PASSWORD=password

# server configuration
ENV NEXT_PUBLIC_SERVER_HOST=localhost
ENV NEXT_PUBLIC_SERVER_PORT=8080

# secrets
ENV COOKIE_DOMAIN=localhost
ENV JWT_SECRET=something-strong-and-random

# github
ENV NEXT_PUBLIC_GITHUB_CLIENT_ID=client
ENV GITHUB_CLIENT_SECRET=secret

RUN bun run build

# Stage 3: Runner (minimal production image)
FROM oven/bun:1-alpine AS runner
WORKDIR /app

# Copy necessary files from builder with proper ownership
COPY --from=builder --chown=1001:1001 /app/public ./public
COPY --from=builder --chown=1001:1001 /app/.next/standalone ./
COPY --from=builder --chown=1001:1001 /app/.next/static ./.next/static

# Switch to non-root user (numeric UID avoids need to create user)
USER 1001

EXPOSE 8084

# Start the app
CMD ["bun", "server.js"]
