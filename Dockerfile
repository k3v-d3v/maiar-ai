# Base stage with Node.js and pnpm
FROM node:22.13.1-slim AS base
RUN apt-get update && \
  apt-get install -y curl && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/* && \
  npm install -g pnpm
WORKDIR /app

# Dependencies stage
FROM base AS deps
COPY package.json pnpm-workspace.yaml tsconfig.base.json tsup.config.base.ts turbo.json ./
COPY maiar-starter/package.json ./maiar-starter/
COPY packages/memory-filesystem/package.json ./packages/memory-filesystem/
COPY packages/memory-sqlite/package.json ./packages/memory-sqlite/
COPY packages/model-ollama/package.json ./packages/model-ollama/
COPY packages/model-openai/package.json ./packages/model-openai/
COPY packages/plugin-character/package.json ./packages/plugin-character/
COPY packages/plugin-express/package.json ./packages/plugin-express/
COPY packages/plugin-image/package.json ./packages/plugin-image/
COPY packages/plugin-search/package.json ./packages/plugin-search/
COPY packages/plugin-telegram/package.json ./packages/plugin-telegram/
COPY packages/plugin-terminal/package.json ./packages/plugin-terminal/
COPY packages/plugin-text/package.json ./packages/plugin-text/
COPY packages/plugin-time/package.json ./packages/plugin-time/
COPY packages/plugin-websocket/package.json ./packages/plugin-websocket/
COPY packages/plugin-x/package.json ./packages/plugin-x/
COPY packages/core/package.json ./packages/core/
RUN pnpm install

# Builder stage
FROM deps AS builder
COPY packages ./packages
COPY maiar-starter ./maiar-starter
RUN pnpm build
RUN pnpm build:starter

# Runner stage
FROM base AS runner
WORKDIR /app

# Copy built files and dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/maiar-starter ./maiar-starter

# Create data directory
RUN mkdir -p /app/maiar-starter/data

# Set working directory to maiar-starter
WORKDIR /app/maiar-starter

# Expose port 3000
EXPOSE 3000

# Start the application
CMD ["pnpm", "start"]