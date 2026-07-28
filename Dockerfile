# ── Stage 1: Install dependencies ──
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9 --activate
# 빌드 툴체인(g++/make/python3) 불필요 — better-sqlite3 v13이 N-API 프리빌트를
# 패키지에 직접 동봉하고(prebuilds/linuxmusl-x64.node), pnpm.onlyBuiltDependencies가
# 빈 배열이라 암묵적 node-gyp rebuild 자체가 실행되지 않는다.
# 네이티브 컴파일이 다시 필요해지면 `apk add --no-cache g++ make python3`를 복원할 것.
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# ── Stage 2: Build ──
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_APP_URL
# 클라이언트 인라인 값(빌드타임). 단일 스택(local)이라 NEXT_PUBLIC_AUTH_PROVIDER는 항상 'local'.
ARG NEXT_PUBLIC_AUTH_PROVIDER

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

# SQLite 영속 데이터 디렉터리 (DB_PROVIDER=sqlite): nextjs(uid 1001)가 app.db를 쓸 수 있도록
# 디렉터리 생성 + 소유권 부여. SQLITE_PATH 기본=/data/app.db.
# ⚠️ Dockerfile `VOLUME` 지시는 쓰지 않는다 — Railway 빌더가 거부한다("VOLUME not supported,
#    use Railway Volumes"). 영속성은 Railway 서비스에 Volume을 /data로 마운트해 확보한다.
RUN apk add --no-cache \
    ca-certificates \
    chromium \
    freetype \
    harfbuzz \
    libstdc++ \
    nss \
    su-exec \
    ttf-freefont && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p /data && chown nextjs:nodejs /data

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# SQLite 마이그레이션 폴더(+ meta/_journal.json) — 런타임 bootstrapSqlite가
# runSqliteMigrations('./drizzle/sqlite')로 읽는다. standalone은 이 비추적 자산을
# 자동 포함하지 않으므로 명시적으로 복사한다(미포함 시 sqlite 모드 부팅 크래시).
COPY --from=builder --chown=nextjs:nodejs /app/drizzle/sqlite ./drizzle/sqlite

# Entrypoint: root로 시작해 마운트된 Railway Volume(/data, 기본 root 소유)을 nextjs로 chown한 뒤
# su-exec로 비root(nextjs)에게 권한을 넘겨 앱을 실행한다. (USER nextjs로 고정하면 마운트 볼륨에
# 못 써서 sqlite 부팅이 크래시한다 — 컷오버 사고 원인.) 인라인 printf로 생성해 CRLF 문제를 피한다.
RUN printf '#!/bin/sh\nset -e\nchown -R nextjs:nodejs /data 2>/dev/null || true\nexec su-exec nextjs:nodejs node server.js\n' > /docker-entrypoint.sh \
    && chmod +x /docker-entrypoint.sh

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["/docker-entrypoint.sh"]
