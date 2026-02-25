FROM node:20-alpine AS base
RUN apk add --no-cache curl
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json turbo.json ./
COPY apps/server/package.json apps/server/
COPY packages/types/package.json packages/types/
RUN npm install --workspace=apps/server --workspace=packages/types

# Build
FROM deps AS builder
COPY tsconfig.base.json ./
COPY packages/types/ packages/types/
COPY apps/server/ apps/server/
RUN npm run build --workspace=packages/types
RUN npm run build --workspace=apps/server

# Production image
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 wasp && \
    adduser --system --uid 1001 wasp

# Only copy what's needed to run
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/types/dist ./packages/types/dist

USER wasp
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
