# ── Build stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

RUN npm ci --ignore-scripts && npx prisma generate

# ── Production stage ────────────────────────────────────────────────────────
FROM node:20-alpine

RUN apk add --no-cache dumb-init

WORKDIR /app

# Non-root user
RUN addgroup -S microcrop && adduser -S microcrop -G microcrop

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY package.json ./
COPY src ./src

# Create logs directory
RUN mkdir -p logs && chown -R microcrop:microcrop /app

USER microcrop

EXPOSE 3000

# Use dumb-init for proper signal handling (SIGTERM forwarding)
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
