# ── Stage 1: Install dependencies ──
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# ── Stage 2: Build ──
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

RUN mkdir -p /app/public && pnpm build
# playwright-core: pnpm symlinks cause __dirname to resolve to .pnpm path at runtime.
# Install in an isolated temp dir (npm flat layout, no symlinks), then copy real files
# into standalone — ensures __dirname resolves correctly inside coreBundle.js.
# We also rm the existing nft-traced symlink first so cp targets a real directory.
RUN PW_VER=$(node -p "require('/app/node_modules/playwright-core/package.json').version") && \
    mkdir -p /tmp/pw-root && \
    printf '{"name":"pw","private":true}' > /tmp/pw-root/package.json && \
    npm install --prefix /tmp/pw-root "playwright-core@${PW_VER}" --no-package-lock && \
    rm -rf /app/.next/standalone/node_modules/playwright-core && \
    mkdir -p /app/.next/standalone/node_modules && \
    cp -r /tmp/pw-root/node_modules/playwright-core /app/.next/standalone/node_modules/playwright-core && \
    rm -rf /tmp/pw-root

# ── Stage 3: Production runner ──
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
