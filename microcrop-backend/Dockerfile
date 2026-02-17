# ── Build stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# bcrypt needs build tools for native compilation
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

RUN npm ci && npx prisma generate

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

# Run migrations then start the server
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
