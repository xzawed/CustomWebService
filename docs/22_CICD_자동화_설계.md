# CI/CD 자동화 설계 (CI/CD Automation Design)

> 코드 커밋부터 프로덕션 배포, 모니터링, 롤백까지 전 과정을 자동화하는 설계 문서
> 모든 도구는 무료 플랜 내에서 운영
>
> **구현 상태** (2026-03-24 기준)
> - ✅ **구현 완료**: CI 파이프라인 (lint → typecheck → test → build → deploy), 단위/통합 테스트 94개, Railway 배포, 스케줄 API 점검
> - 📋 **계획 중**: Husky, E2E(Playwright), Semantic Release, Lighthouse CI, DB 마이그레이션 자동화

---

## 1. CI/CD 파이프라인 전체 흐름

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        CI/CD 자동화 전체 파이프라인                        │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [개발자 로컬]                                                            │
│   │                                                                      │
│   ├── 1. 코드 작성                                                       │
│   ├── 2. pre-commit 훅 실행 (Husky)                                      │
│   │     ├── lint-staged (ESLint + Prettier)                              │
│   │     └── 타입 체크 (tsc --noEmit, 변경 파일만)                          │
│   └── 3. git push → feature/* 브랜치                                     │
│         │                                                                │
│         ▼                                                                │
│  [GitHub Actions - CI Pipeline]                                          │
│   │                                                                      │
│   ├── 4. PR 생성 → develop 브랜치 대상                                    │
│   │     ├── 트리거: pull_request (opened, synchronize)                    │
│   │     ├── ① 린트 검사 (ESLint)                                         │
│   │     ├── ② 타입 검사 (TypeScript)                                     │
│   │     ├── ③ 단위 테스트 (Vitest)                                       │
│   │     ├── ④ 빌드 검증 (next build)                                     │
│   │     ├── ⑤ 번들 사이즈 체크 (size-limit)                              │
│   │     ├── ⑥ 보안 취약점 스캔 (npm audit)                               │
│   │     └── ⑦ PR에 결과 코멘트 자동 작성                                  │
│   │                                                                      │
│   ├── 5. Railway Preview 배포 (자동)                                      │
│   │     ├── PR별 고유 URL 생성 (pr-123.up.railway.app)                       │
│   │     └── PR에 Preview URL 코멘트                                      │
│   │                                                                      │
│   ├── 6. PR 머지 → develop                                               │
│   │     ├── 트리거: push to develop                                      │
│   │     ├── CI 전체 재실행 (위 ①~⑥)                                      │
│   │     ├── ⑧ E2E 테스트 (Playwright, develop만)                         │
│   │     ├── ⑨ Lighthouse CI 성능 체크                                    │
│   │     └── Railway Preview 자동 배포 (develop 환경)                       │
│   │                                                                      │
│   └── 7. develop → main 머지 (릴리스)                                    │
│         ├── 트리거: push to main                                         │
│         ├── CI 전체 재실행                                                │
│         ├── ⑩ Semantic Release (버전 태그 + 릴리스 노트)                   │
│         ├── ⑪ DB 마이그레이션 자동 실행                                    │
│         ├── ⑫ Railway 프로덕션 배포 (자동)                                 │
│         ├── ⑬ 배포 후 Health Check                                       │
│         ├── ⑭ 배포 후 Smoke Test (핵심 API 확인)                          │
│         └── ⑮ 알림 발송 (Discord Webhook)                                │
│                                                                          │
│  [배포 후 자동화]                                                         │
│   ├── Sentry 에러 모니터링 (실시간)                                       │
│   ├── UptimeRobot 가동 확인 (5분 주기)                                    │
│   ├── 스케줄 작업 (GitHub Actions Cron)                                   │
│   │     ├── 무료 API 상태 점검 (매일 06:00)                               │
│   │     ├── DB 용량/한도 체크 (매일 09:00)                                │
│   │     ├── 비활성 프로젝트 정리 (매주 월요일)                              │
│   │     └── 의존성 보안 스캔 (매주 월요일, Dependabot)                      │
│   └── 이상 감지 시 알림 (Discord Webhook)                                 │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 사용 도구 및 무료 한도

| 도구 | 용도 | 무료 한도 | 비용 |
|------|------|-----------|------|
| **GitHub Actions** | CI 파이프라인 | 2,000분/월 | $0 |
| **Railway** | 배포 (Preview + Production) | $5 무료 크레딧/월 | $0 |
| **Husky + lint-staged** | Pre-commit 훅 | 로컬 실행 | $0 |
| **Vitest** | 단위/통합 테스트 | OSS | $0 |
| **Playwright** | E2E 테스트 | OSS | $0 |
| **Lighthouse CI** | 성능/접근성 체크 | GitHub Action 무료 | $0 |
| **size-limit** | 번들 사이즈 추적 | OSS | $0 |
| **semantic-release** | 자동 버전/릴리스 | OSS | $0 |
| **Dependabot** | 의존성 보안 스캔 | GitHub 내장 무료 | $0 |
| **Sentry** | 에러 추적 | 5,000 이벤트/월 | $0 |
| **UptimeRobot** | 가동 모니터링 | 50 모니터 | $0 |
| **Discord Webhook** | 알림 | 무제한 | $0 |

---

## 3. GitHub Actions 워크플로우 상세

### 3.1 CI 파이프라인 (`ci.yml`)

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [develop, main]
  pull_request:
    branches: [develop, main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true          # 같은 브랜치의 이전 실행 취소

env:
  NODE_VERSION: '20'
  PNPM_VERSION: '9'

jobs:
  # ──────────────────────────────────────
  # Job 1: 린트 + 타입 체크 (빠른 피드백)
  # ──────────────────────────────────────
  lint-and-typecheck:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: ESLint
        run: pnpm lint

      - name: TypeScript
        run: pnpm tsc --noEmit

  # ──────────────────────────────────────
  # Job 2: 단위 테스트
  # ──────────────────────────────────────
  unit-test:
    name: Unit Tests
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: lint-and-typecheck
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: Run Tests
        run: pnpm test -- --coverage
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}

      - name: Upload Coverage
        if: github.event_name == 'pull_request'
        uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/

  # ──────────────────────────────────────
  # Job 3: 빌드 검증 + 번들 분석
  # ──────────────────────────────────────
  build:
    name: Build & Bundle Check
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: lint-and-typecheck
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}

      - name: Check Bundle Size
        uses: andresz1/size-limit-action@v1
        if: github.event_name == 'pull_request'
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          script: pnpm size

  # ──────────────────────────────────────
  # Job 4: 보안 스캔
  # ──────────────────────────────────────
  security:
    name: Security Audit
    runs-on: ubuntu-latest
    timeout-minutes: 5
    needs: lint-and-typecheck
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: Audit Dependencies
        run: pnpm audit --audit-level=high
        continue-on-error: true       # high 이상만 실패 처리

      - name: Check for Secrets in Code
        uses: trufflesecurity/trufflehog@main
        with:
          extra_args: --only-verified

  # ──────────────────────────────────────
  # Job 5: E2E 테스트 (develop/main만)
  # ──────────────────────────────────────
  e2e-test:
    name: E2E Tests
    runs-on: ubuntu-latest
    timeout-minutes: 15
    needs: [unit-test, build]
    if: github.ref == 'refs/heads/develop' || github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: Install Playwright Browsers
        run: pnpm exec playwright install --with-deps chromium

      - name: Run E2E Tests
        run: pnpm test:e2e
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
          XAI_API_KEY: ${{ secrets.XAI_API_KEY }}

      - name: Upload E2E Results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/

  # ──────────────────────────────────────
  # Job 6: Lighthouse 성능 체크 (develop/main만)
  # ──────────────────────────────────────
  lighthouse:
    name: Lighthouse CI
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: build
    if: github.ref == 'refs/heads/develop' || github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}

      - name: Run Lighthouse CI
        uses: treosh/lighthouse-ci-action@v12
        with:
          configPath: ./lighthouserc.json
          uploadArtifacts: true
```

### 3.2 릴리스 파이프라인 (`release.yml`)

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    branches: [main]

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  release:
    name: Semantic Release
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0                # 전체 히스토리 (릴리스 노트 생성용)
          persist-credentials: false

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: Semantic Release
        run: pnpm exec semantic-release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  # ──────────────────────────────────────
  # 배포 후 검증
  # ──────────────────────────────────────
  post-deploy-check:
    name: Post-Deploy Verification
    runs-on: ubuntu-latest
    timeout-minutes: 5
    needs: release
    steps:
      - name: Wait for Railway Deploy
        run: sleep 60                    # Railway 빌드 대기

      - name: Health Check
        run: |
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
            "${{ vars.PRODUCTION_URL }}/api/v1/health")
          if [ "$STATUS" != "200" ]; then
            echo "Health check failed: HTTP $STATUS"
            exit 1
          fi
          echo "Health check passed: HTTP $STATUS"

      - name: Smoke Test - API Catalog
        run: |
          RESPONSE=$(curl -s "${{ vars.PRODUCTION_URL }}/api/v1/catalog?limit=1")
          echo "$RESPONSE" | jq -e '.success == true' || exit 1
          echo "Catalog API smoke test passed"

      - name: Smoke Test - Landing Page
        run: |
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
            "${{ vars.PRODUCTION_URL }}")
          if [ "$STATUS" != "200" ]; then
            echo "Landing page check failed: HTTP $STATUS"
            exit 1
          fi
          echo "Landing page check passed"

      - name: Notify Success
        if: success()
        run: |
          curl -H "Content-Type: application/json" \
            -d "{\"content\": \"✅ **프로덕션 배포 성공**\n버전: ${{ github.sha }}\nURL: ${{ vars.PRODUCTION_URL }}\n시간: $(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" \
            "${{ secrets.DISCORD_WEBHOOK_URL }}"

      - name: Notify Failure
        if: failure()
        run: |
          curl -H "Content-Type: application/json" \
            -d "{\"content\": \"🚨 **프로덕션 배포 실패**\n커밋: ${{ github.sha }}\n로그: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}\"}" \
            "${{ secrets.DISCORD_WEBHOOK_URL }}"
```

### 3.3 DB 마이그레이션 자동화 (`migrate.yml`)

```yaml
# .github/workflows/migrate.yml
name: Database Migration

on:
  push:
    branches: [main]
    paths:
      - 'supabase/migrations/**'        # 마이그레이션 파일 변경 시만 실행

jobs:
  migrate:
    name: Run Migrations
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Run Migrations
        run: supabase db push --linked
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
          SUPABASE_PROJECT_ID: ${{ secrets.SUPABASE_PROJECT_ID }}

      - name: Verify Migration
        run: |
          supabase db lint --linked
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_PROJECT_ID: ${{ secrets.SUPABASE_PROJECT_ID }}

      - name: Notify
        if: failure()
        run: |
          curl -H "Content-Type: application/json" \
            -d "{\"content\": \"🚨 **DB 마이그레이션 실패**\n파일: ${{ github.event.head_commit.message }}\n로그: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}\"}" \
            "${{ secrets.DISCORD_WEBHOOK_URL }}"
```

### 3.4 스케줄 작업 (`scheduled.yml`)

```yaml
# .github/workflows/scheduled.yml
name: Scheduled Tasks

on:
  schedule:
    - cron: '0 21 * * *'               # 매일 06:00 KST (21:00 UTC 전날)
    - cron: '0 0 * * *'                # 매일 09:00 KST
    - cron: '0 15 * * 1'               # 매주 월요일 00:00 KST (15:00 UTC 일요일)
  workflow_dispatch:                     # 수동 실행 가능

jobs:
  # ──────────────────────────────────────
  # 매일: 무료 API 상태 점검 (06:00 KST)
  # ──────────────────────────────────────
  api-health-check:
    name: API Health Check
    runs-on: ubuntu-latest
    timeout-minutes: 5
    if: github.event.schedule == '0 21 * * *' || github.event_name == 'workflow_dispatch'
    steps:
      - uses: actions/checkout@v4

      - name: Check Free APIs
        run: |
          FAILED=""

          check_api() {
            local name=$1 url=$2
            STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url")
            if [ "$STATUS" -eq 200 ]; then
              echo "✅ $name: HTTP $STATUS"
            else
              echo "❌ $name: HTTP $STATUS"
              FAILED="$FAILED\n❌ $name: HTTP $STATUS"
            fi
          }

          check_api "Open-Meteo" "https://api.open-meteo.com/v1/forecast?latitude=37.57&longitude=126.98&current_weather=true"
          check_api "Frankfurter" "https://api.frankfurter.app/latest"
          check_api "REST Countries" "https://restcountries.com/v3.1/name/korea"
          check_api "PokeAPI" "https://pokeapi.co/api/v2/pokemon/1"
          check_api "JokeAPI" "https://v2.jokeapi.dev/joke/Any?amount=1"
          check_api "DictionaryAPI" "https://api.dictionaryapi.dev/api/v2/entries/en/hello"
          check_api "Open Library" "https://openlibrary.org/search.json?q=test&limit=1"
          check_api "Hacker News" "https://hacker-news.firebaseio.com/v0/topstories.json?limitToFirst=1"

          if [ -n "$FAILED" ]; then
            curl -H "Content-Type: application/json" \
              -d "{\"content\": \"⚠️ **API 상태 점검 이상 감지**\n$(echo -e $FAILED)\"}" \
              "${{ secrets.DISCORD_WEBHOOK_URL }}"
          fi

  # ──────────────────────────────────────
  # 매일: 서비스 한도 체크 (09:00 KST)
  # ──────────────────────────────────────
  quota-check:
    name: Quota Monitor
    runs-on: ubuntu-latest
    timeout-minutes: 5
    if: github.event.schedule == '0 0 * * *' || github.event_name == 'workflow_dispatch'
    steps:
      - name: Check Health Endpoint
        run: |
          RESPONSE=$(curl -s "${{ vars.PRODUCTION_URL }}/api/v1/health")
          echo "$RESPONSE" | jq .

          # DB 사용률 80% 초과 경고
          DB_USAGE=$(echo "$RESPONSE" | jq -r '.limits.db_usage_mb // 0')
          if [ "$DB_USAGE" -gt 400 ]; then
            curl -H "Content-Type: application/json" \
              -d "{\"content\": \"⚠️ **DB 용량 경고**: ${DB_USAGE}MB / 500MB ($(( DB_USAGE * 100 / 500 ))%)\"}" \
              "${{ secrets.DISCORD_WEBHOOK_URL }}"
          fi

          # 활성 프로젝트 수 80% 초과 경고
          PROJECTS=$(echo "$RESPONSE" | jq -r '.limits.active_projects // 0')
          if [ "$PROJECTS" -gt 160 ]; then
            curl -H "Content-Type: application/json" \
              -d "{\"content\": \"⚠️ **프로젝트 수 경고**: ${PROJECTS} / 200개 ($(( PROJECTS * 100 / 200 ))%)\"}" \
              "${{ secrets.DISCORD_WEBHOOK_URL }}"
          fi

  # ──────────────────────────────────────
  # 매주: 정리 작업 (월요일 00:00 KST)
  # ──────────────────────────────────────
  weekly-cleanup:
    name: Weekly Cleanup
    runs-on: ubuntu-latest
    timeout-minutes: 10
    if: github.event.schedule == '0 15 * * 1' || github.event_name == 'workflow_dispatch'
    steps:
      - name: Cleanup via API
        run: |
          # 비활성 프로젝트 정리 API 호출
          curl -X POST "${{ vars.PRODUCTION_URL }}/api/v1/admin/cleanup" \
            -H "Authorization: Bearer ${{ secrets.ADMIN_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{"cleanupType": "inactive_projects", "daysInactive": 90}'

          # 오래된 생성 코드 정리
          curl -X POST "${{ vars.PRODUCTION_URL }}/api/v1/admin/cleanup" \
            -H "Authorization: Bearer ${{ secrets.ADMIN_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{"cleanupType": "old_generated_codes", "keepVersions": 3}'

      - name: Notify Cleanup Result
        run: |
          curl -H "Content-Type: application/json" \
            -d "{\"content\": \"🧹 **주간 정리 완료**\n시간: $(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" \
            "${{ secrets.DISCORD_WEBHOOK_URL }}"
```

### 3.5 Dependabot 설정

```yaml
# .github/dependabot.yml
version: 2

updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "00:00"
      timezone: "Asia/Seoul"
    open-pull-requests-limit: 5
    labels:
      - "dependencies"
      - "automated"
    groups:
      minor-and-patch:
        update-types:
          - "minor"
          - "patch"
    ignore:
      - dependency-name: "*"
        update-types: ["version-update:semver-major"]  # 메이저는 수동

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    labels:
      - "ci"
      - "automated"
```

---

## 4. 설정 파일 상세

### 4.1 Semantic Release (`.releaserc.json`)

```json
{
  "branches": ["main"],
  "plugins": [
    ["@semantic-release/commit-analyzer", {
      "preset": "conventionalcommits",
      "releaseRules": [
        { "type": "feat", "release": "minor" },
        { "type": "fix", "release": "patch" },
        { "type": "perf", "release": "patch" },
        { "type": "refactor", "release": "patch" },
        { "breaking": true, "release": "major" }
      ]
    }],
    ["@semantic-release/release-notes-generator", {
      "preset": "conventionalcommits",
      "presetConfig": {
        "types": [
          { "type": "feat", "section": "✨ 새 기능" },
          { "type": "fix", "section": "🐛 버그 수정" },
          { "type": "perf", "section": "⚡ 성능 개선" },
          { "type": "refactor", "section": "♻️ 리팩토링" },
          { "type": "docs", "section": "📝 문서" },
          { "type": "chore", "section": "🔧 기타" }
        ]
      }
    }],
    "@semantic-release/github"
  ]
}
```

### 4.2 Lighthouse CI (`lighthouserc.json`)

```json
{
  "ci": {
    "collect": {
      "startServerCommand": "pnpm start",
      "startServerReadyPattern": "ready on",
      "url": [
        "http://localhost:3000",
        "http://localhost:3000/catalog"
      ],
      "numberOfRuns": 3
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.8 }],
        "categories:accessibility": ["warn", { "minScore": 0.9 }],
        "categories:best-practices": ["warn", { "minScore": 0.8 }],
        "categories:seo": ["warn", { "minScore": 0.8 }],
        "first-contentful-paint": ["warn", { "maxNumericValue": 2000 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 3000 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }]
      }
    },
    "upload": {
      "target": "temporary-public-storage"
    }
  }
}
```

### 4.3 번들 사이즈 체크 (`.size-limit.json`)

```json
[
  {
    "path": ".next/static/**/*.js",
    "limit": "300 kB",
    "gzip": true,
    "name": "Total JS Bundle"
  },
  {
    "path": ".next/static/chunks/pages/index*.js",
    "limit": "50 kB",
    "gzip": true,
    "name": "Landing Page"
  },
  {
    "path": ".next/static/chunks/pages/builder*.js",
    "limit": "100 kB",
    "gzip": true,
    "name": "Builder Page"
  }
]
```

### 4.4 Playwright 설정 (`playwright.config.ts`)

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    port: 3000,
    reuseExistingServer: true,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
```

---

## 5. package.json 스크립트 정의

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "lint:fix": "next lint --fix",
    "format": "prettier --write \"src/**/*.{ts,tsx,json,css}\"",
    "format:check": "prettier --check \"src/**/*.{ts,tsx,json,css}\"",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "size": "size-limit",
    "size:why": "size-limit --why",
    "db:migrate": "supabase db push --linked",
    "db:seed": "supabase db seed --linked",
    "db:reset": "supabase db reset --linked",
    "prepare": "husky"
  }
}
```

---

## 6. 환경별 배포 전략

```
                    ┌──────────────┐
                    │   feature/*  │ ← 개발자 작업
                    └──────┬───────┘
                           │ PR 생성
                           ▼
┌──────────────────────────────────────────────────────┐
│  PR Preview 환경                                      │
│  URL: pr-{number}-{repo}.up.railway.app               │
│  트리거: PR 생성/업데이트                               │
│  CI: lint + type + test + build + bundle size         │
│  Railway: 자동 Preview 배포                            │
│  DB: 프로덕션 DB 읽기 전용 (시드 데이터)                 │
│  용도: 코드 리뷰, 시각적 확인                           │
└──────────────────────┬───────────────────────────────┘
                       │ PR 머지
                       ▼
┌──────────────────────────────────────────────────────┐
│  Staging 환경 (develop 브랜치)                         │
│  URL: develop-{repo}.up.railway.app                  │
│  트리거: develop 브랜치 push                           │
│  CI: lint + type + test + build + E2E + Lighthouse    │
│  Railway: 자동 Preview 배포                            │
│  DB: 프로덕션 DB (동일, RLS로 격리)                     │
│  용도: 통합 테스트, QA                                  │
└──────────────────────┬───────────────────────────────┘
                       │ develop → main 머지
                       ▼
┌──────────────────────────────────────────────────────┐
│  Production 환경 (main 브랜치)                         │
│  URL: r4r002eg.up.railway.app     │
│  트리거: main 브랜치 push                              │
│  CI: 전체 + Semantic Release + DB Migration            │
│  Railway: 프로덕션 자동 배포                            │
│  DB: 프로덕션 DB + 마이그레이션 자동 실행                 │
│  검증: Health Check + Smoke Test + 알림                │
│  용도: 실제 사용자 서비스                                │
└──────────────────────────────────────────────────────┘
```

---

## 7. 생성된 사용자 서비스의 CI/CD

사용자가 만든 웹서비스의 배포/관리도 자동화:

```
[사용자: "배포하기" 클릭]
    │
    ▼
[DeployService.deploy()]
    │
    ├── 1. GitHub 저장소 자동 생성
    │     Organization: customwebservice-apps
    │     이름: svc-{projectId 앞 8자}
    │     파일: index.html, styles.css, app.js
    │
    ├── 2. 코드 Push (Initial Commit)
    │
    ├── 3. Railway 프로젝트 연결
    │     ├── Railway API → Import Git Repository
    │     ├── 환경변수 설정 (API 키)
    │     └── 자동 빌드 & 배포 트리거
    │
    ├── 4. 배포 상태 폴링
    │     └── Railway Deployment API → status 확인 (10초 간격)
    │
    ├── 5. 완료 시
    │     ├── DB 업데이트 (deploy_url, status)
    │     ├── 이벤트 발행 (DEPLOYMENT_COMPLETED)
    │     └── 사용자에게 URL 반환
    │
    └── [재배포 시]
          ├── 코드 수정 → GitHub Push (새 커밋)
          ├── Railway 자동 재배포 (GitHub 연동)
          └── 롤백 시 → 이전 버전 코드로 Push → 자동 재배포
```

### 생성 서비스 배포 설정 템플릿

```json
{
  "buildCommand": null,
  "outputDirectory": ".",
  "framework": null,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-XSS-Protection", "value": "1; mode=block" }
      ]
    }
  ]
}
```

---

## 8. 롤백 전략

### 8.1 플랫폼 롤백 (메인 서비스)

```
[이상 감지]
    │
    ├── 자동 감지: Health Check 실패 또는 Sentry 에러 급증
    │
    ├── 방법 1: Railway Instant Rollback (권장)
    │   └── Railway Dashboard → Deployments → 이전 배포 → "Rollback"
    │       (수 초 내 완료, 다운타임 없음)
    │
    ├── 방법 2: Git Revert
    │   ├── git revert HEAD
    │   ├── git push origin main
    │   └── Railway 자동 재배포 (2~3분)
    │
    └── 방법 3: DB 롤백 필요 시
        ├── 마이그레이션 역순 실행 (supabase db reset)
        └── ⚠️ 데이터 손실 가능 → 수동 판단 필요
```

### 8.2 생성된 사용자 서비스 롤백

```
POST /api/v1/projects/{id}/rollback?version=2

[RollbackService]
    ├── 1. generated_codes에서 해당 버전 코드 조회
    ├── 2. GitHub 저장소에 해당 버전 코드 Push (새 커밋)
    ├── 3. Railway 자동 재배포 트리거
    ├── 4. projects.current_version 업데이트
    └── 5. 이벤트 발행 (DEPLOYMENT_ROLLBACK)
```

---

## 9. 알림 체계

### Discord Webhook 알림 포맷

| 이벤트 | 아이콘 | 메시지 예시 |
|--------|--------|-----------|
| 프로덕션 배포 성공 | ✅ | `✅ 프로덕션 배포 성공 v1.3.0 - https://...` |
| 프로덕션 배포 실패 | 🚨 | `🚨 프로덕션 배포 실패 - 로그: https://...` |
| DB 마이그레이션 실패 | 🚨 | `🚨 DB 마이그레이션 실패 - 002_add_orgs.sql` |
| API 상태 이상 | ⚠️ | `⚠️ API 상태 이상 - ❌ OpenWeatherMap: 503` |
| DB 용량 경고 | ⚠️ | `⚠️ DB 용량 경고: 420MB / 500MB (84%)` |
| 주간 정리 완료 | 🧹 | `🧹 주간 정리 완료 - 삭제 프로젝트: 5개` |
| 보안 취약점 발견 | 🔒 | `🔒 보안 취약점 - high 1건 (lodash@4.17.20)` |
| E2E 테스트 실패 | 🧪 | `🧪 E2E 테스트 실패 - 빌더 플로우 / 로그: ...` |

### Discord Webhook 설정
```
1. Discord 서버 → 채널 설정 → 연동 → 웹후크 → 새 웹후크
2. 이름: "CustomWebService CI/CD"
3. URL 복사 → GitHub Secrets에 DISCORD_WEBHOOK_URL로 저장
```

---

## 10. GitHub Secrets 전체 목록

```
Repository → Settings → Secrets and variables → Actions

┌─── Secrets (민감 정보) ────────────────────────────────────────┐
│                                                                │
│  NEXT_PUBLIC_SUPABASE_URL        Supabase 프로젝트 URL          │
│  NEXT_PUBLIC_SUPABASE_ANON_KEY   Supabase anon 키              │
│  SUPABASE_SERVICE_ROLE_KEY       Supabase service role 키       │
│  SUPABASE_ACCESS_TOKEN           Supabase CLI 토큰              │
│  SUPABASE_DB_PASSWORD            Supabase DB 비밀번호           │
│  SUPABASE_PROJECT_ID             Supabase 프로젝트 ID           │
│  XAI_API_KEY                     xAI Grok API 키                │
│  GITHUB_TOKEN                    (자동 제공)                    │
│  RAILWAY_TOKEN                   Railway 배포 토큰              │
│  DISCORD_WEBHOOK_URL             Discord 알림 웹훅 URL           │
│  ADMIN_API_KEY                   관리 API 인증 키                │
│                                                                │
├─── Variables (비민감 설정) ─────────────────────────────────────┤
│                                                                │
│  PRODUCTION_URL                  https://r4r002eg.up.railway.app │
│  GITHUB_ORG                      customwebservice-apps          │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 11. Actions 시간 예산 (2,000분/월)

| 워크플로우 | 트리거 | 빈도 (예상) | 평균 시간 | 월간 소비 |
|-----------|--------|------------|-----------|----------|
| CI (PR) | PR 생성/업데이트 | 40회/월 | 5분 | 200분 |
| CI (develop push) | develop 머지 | 20회/월 | 12분 (E2E 포함) | 240분 |
| Release (main push) | 릴리스 | 4회/월 | 8분 | 32분 |
| DB Migration | 마이그레이션 변경 | 2회/월 | 2분 | 4분 |
| API Health Check | 매일 | 30회/월 | 1분 | 30분 |
| Quota Monitor | 매일 | 30회/월 | 1분 | 30분 |
| Weekly Cleanup | 매주 | 4회/월 | 3분 | 12분 |
| Dependabot PR CI | 자동 PR | 5회/월 | 5분 | 25분 |
| **합계** | | | | **573분** |
| **여유** | | | | **1,427분 (71%)** |

---

## 12. 스프린트별 CI/CD 구현 순서

| Sprint | CI/CD 구현 항목 | 파일 |
|--------|---------------|------|
| **1** | Husky + lint-staged, CI 기본 (lint+type+build), Railway 연동 | `.husky/`, `ci.yml` |
| **2** | Vitest 설정, 단위 테스트 CI 추가 | `vitest.config.ts`, `ci.yml` 수정 |
| **4** | 번들 사이즈 체크 추가 | `.size-limit.json`, `ci.yml` 수정 |
| **5** | 보안 스캔 추가 (npm audit, trufflehog) | `ci.yml` 수정 |
| **7** | DB 마이그레이션 자동화, Dependabot | `migrate.yml`, `dependabot.yml` |
| **8** | E2E 테스트, Lighthouse, Release, 스케줄 작업, 알림 전체 | `release.yml`, `scheduled.yml`, `lighthouserc.json`, `playwright.config.ts` |
