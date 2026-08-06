# Multi-stage build for minimal Next.js app with Bun
#
# The runtime is distroless (Debian/glibc), so every stage that installs or
# builds native modules must also be glibc — otherwise argon2 / sharp resolve
# their musl prebuilds and fail to load at runtime.

# Runtime base. Override with :debug-nonroot (adds a busybox shell) for
# `make docker-build-debug`. Must be declared before the first FROM to be global.
ARG RUNNER_IMAGE=gcr.io/distroless/nodejs22-debian12:nonroot

# Stage 1: Dependencies
FROM oven/bun:1-slim AS deps
WORKDIR /app

# Copy package files
COPY package.json bun.lockb ./
COPY scripts ./scripts

# Install dependencies (includes devDependencies needed for build)
RUN bun install --frozen-lockfile

# Stage 2: Builder
FROM oven/bun:1-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN bun run build

# Stage 3: Prune the traced output down to what glibc actually loads
FROM oven/bun:1-slim AS pruner
WORKDIR /app

COPY --from=builder /app/.next/standalone ./

# sharp ships a full libvips per libc (~17 MB each); keep only the glibc one
RUN rm -rf node_modules/@img/*musl* \
           node_modules/argon2/prebuilds/*/*.musl.node

# Stage 4: Runner (distroless, no shell, non-root)
FROM ${RUNNER_IMAGE} AS runner

WORKDIR /app

COPY --from=builder --chown=65532:65532 /app/public ./public
COPY --from=pruner  --chown=65532:65532 /app ./
COPY --from=builder --chown=65532:65532 /app/.next/static ./.next/static

ENV PORT=8084
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 8084

USER 65532

# ENTRYPOINT is /nodejs/bin/node
CMD ["server.js"]
