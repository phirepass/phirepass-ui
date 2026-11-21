# Multi-stage build for minimal Next.js app with Bun
#
# The runtime is distroless (Debian/glibc), so every stage that installs or
# builds native modules must also be glibc — otherwise argon2 / sharp resolve
# their musl prebuilds and fail to load at runtime.
#
# Cross-arch strategy: everything up to the runner runs natively on the build
# host ($BUILDPLATFORM) — the `next build` output is arch-independent JS, so it
# is built once instead of once per platform under QEMU. Only the native
# modules differ per arch; the `target-deps` stage installs them for
# $TARGETARCH and the pruner swaps them into the traced standalone output.

# Runtime base. Override with :debug-nonroot (adds a busybox shell) for
# `make docker-build-debug`. Must be declared before the first FROM to be global.
ARG RUNNER_IMAGE=gcr.io/distroless/nodejs26-debian13:nonroot

# Stage 1: Dependencies for the build host (swc, lightningcss, tailwind oxide…)
FROM --platform=$BUILDPLATFORM oven/bun:1-slim AS deps
WORKDIR /app

COPY package.json bun.lockb ./
COPY scripts ./scripts

RUN --mount=type=cache,id=bun-install,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# Stage 2: Native runtime modules for the target arch (sharp, argon2)
FROM --platform=$BUILDPLATFORM oven/bun:1-slim AS target-deps
ARG TARGETARCH
WORKDIR /app

COPY package.json bun.lockb ./
COPY scripts ./scripts

RUN --mount=type=cache,id=bun-install,target=/root/.bun/install/cache \
    ARCH=$(echo "$TARGETARCH" | sed 's/amd64/x64/') \
 && bun install --frozen-lockfile --production --os=linux --cpu="$ARCH"

# Stage 3: Builder (runs once, natively)
FROM --platform=$BUILDPLATFORM oven/bun:1-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# .next/cache holds Turbopack's persistent build cache; keep it across builds
RUN --mount=type=cache,id=next-cache,target=/app/.next/cache \
    bun run build

# Stage 4: Swap in target-arch native modules and prune the rest
FROM --platform=$BUILDPLATFORM oven/bun:1-slim AS pruner
ARG TARGETARCH
WORKDIR /app

COPY --from=builder /app/.next/standalone ./

# Output tracing only copies the build host's binaries, so replace them with
# the target's. argon2 bundles prebuilds for every platform in one package.
RUN rm -rf node_modules/@img node_modules/argon2/prebuilds
COPY --from=target-deps /app/node_modules/@img ./node_modules/@img
COPY --from=target-deps /app/node_modules/argon2/prebuilds ./node_modules/argon2/prebuilds

# Keep only glibc binaries for the target arch (sharp ships ~17 MB of libvips
# per variant)
RUN ARCH=$(echo "$TARGETARCH" | sed 's/amd64/x64/') \
 && rm -rf node_modules/@img/*musl* \
 && find node_modules/@img -mindepth 1 -maxdepth 1 ! -name "*-${ARCH}" ! -name colour -exec rm -rf {} + \
 && find node_modules/argon2/prebuilds -mindepth 1 -maxdepth 1 ! -name "linux-${ARCH}" -exec rm -rf {} + \
 && rm -f node_modules/argon2/prebuilds/*/*.musl.node

# Stage 5: Runner (distroless, no shell, non-root) — the only per-arch stage
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
