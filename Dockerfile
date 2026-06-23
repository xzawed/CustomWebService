# ── Stage 1: Install dependencies ──
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9 --activate
# better-sqlite3 네이티브 모듈 빌드 도구 (musl alpine에 프리빌트가 없으면 소스 컴파일).
# DB_PROVIDER=sqlite 경로에서만 런타임 사용되지만, deps는 항상 빌드해 둔다.
RUN apk add --no-cache g++ make python3
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# ── Stage 2: Build ──
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
# 클라이언트 인라인 값 — local 모드 로그인 폼 분기용. 미설정 시 빈 값(=supabase OAuth 기본).
ARG NEXT_PUBLIC_AUTH_PROVIDER

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_AUTH_PROVIDER=$NEXT_PUBLIC_AUTH_PROVIDER

RUN mkdir -p /app/public && pnpm build
# nft traces coreBundle.js to the .pnpm path but misses browsers.json because it is
# required dynamically: require(path.join(__dirname, '..', 'browsers.json')).
# Copy browsers.json to every playwright-core location nft placed in standalone.
RUN find /app/.next/standalone/node_modules -path "*/playwright-core/lib/coreBundle.js" | \
    while read f; do \
      dest="$(dirname "$(dirname "$f")")/browsers.json"; \
      [ ! -f "$dest" ] && cp /app/node_modules/playwright-core/browsers.json "$dest" && echo "copied browsers.json → $dest"; \
    done
# Fail fast if coreBundle.js is present but browsers.json is still missing —
# guards against silent failure when playwright-core upgrades change lib/ structure.
RUN if find /app/.next/standalone/node_modules -path "*/playwright-core/lib/coreBundle.js" -print -quit | grep -q .; then \
      find /app/.next/standalone/node_modules -path "*/playwright-core/browsers.json" -print -quit | grep -q . || \
      { echo "ERROR: playwright-core/browsers.json missing in standalone after copy — update Dockerfile copy script after playwright-core upgrade"; exit 1; }; \
    fi

# ── Stage 3: Production runner ──
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# SQLite 영속 데이터 디렉터리 (DB_PROVIDER=sqlite): Railway Volume을 /data에 마운트한다.
# nextjs(uid 1001)가 app.db를 쓸 수 있도록 소유권을 부여한다. SQLITE_PATH 기본=/data/app.db.
RUN apk add --no-cache \
    ca-certificates \
    chromium \
    freetype \
    harfbuzz \
    libstdc++ \
    nss \
    ttf-freefont && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p /data && chown nextjs:nodejs /data
VOLUME /data

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# SQLite 마이그레이션 폴더(+ meta/_journal.json) — 런타임 bootstrapSqlite가
# runSqliteMigrations('./drizzle/sqlite')로 읽는다. standalone은 이 비추적 자산을
# 자동 포함하지 않으므로 명시적으로 복사한다(미포함 시 sqlite 모드 부팅 크래시).
COPY --from=builder --chown=nextjs:nodejs /app/drizzle/sqlite ./drizzle/sqlite

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
