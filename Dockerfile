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

ARG NODE_ENV
ARG NEXT_TELEMETRY_DISABLED=1
ARG PORT=8084
ARG NEXT_PUBLIC_SERVER_HOST=localhost
ARG NEXT_PUBLIC_SERVER_PORT=8080

# Set production environment
ENV NODE_ENV=${NODE_ENV}
ENV NEXT_TELEMETRY_DISABLED=${NEXT_TELEMETRY_DISABLED}
ENV PORT=${PORT}
ENV NEXT_PUBLIC_SERVER_HOST=${NEXT_PUBLIC_SERVER_HOST}
ENV NEXT_PUBLIC_SERVER_PORT=${NEXT_PUBLIC_SERVER_PORT}

# github oauth (placeholders, replace with real values or use secrets management)
ARG NEXT_PUBLIC_GITHUB_CLIENT_ID=client
ARG GITHUB_CLIENT_SECRET=secret
ENV NEXT_PUBLIC_GITHUB_CLIENT_ID=${NEXT_PUBLIC_GITHUB_CLIENT_ID}
ENV GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}

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
