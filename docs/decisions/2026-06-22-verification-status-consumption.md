# verification_status 신선도 유지 + AI 추천 소비 (B-2)

> **언제 읽나**: suggest-apis 후보 필터, verification_status(broken 제외·verified 우선), catalogRepository.search 가시성, verifyRunner 쓰기 경로를 손댈 때

- 날짜: 2026-06-22
- 상태: 적용 (PR `feat/verification-status-consumption`)
- 선행: [2026-06-21-api-catalog-health-monitoring.md](2026-06-21-api-catalog-health-monitoring.md) 잔여작업 "verification_status 소비(P1)"
- 관련: 잔여작업 감사 B-2

## 배경

헬스체크가 `api_catalog.verification_status`(working/degraded→verified, broken→broken)를 산출하지만
**아무도 소비하지 않는 휴면 컬럼**이었다(검색·AI 추천이 미사용). 또한 일일 cron은 read-only
(`catalog:healthcheck`)라 이 컬럼을 갱신하지 않아 데이터가 stale(마지막 write 2026-05-01, 수동)했다.

## 결정

**신선도 유지 + AI 추천 소비**를 함께 구현한다. 단, 카탈로그 브라우징에서는 broken을 숨기지 않는다.

### 1. 신선도 (verification_status를 cron이 갱신)

- `scheduled.yml` 일일 잡을 `pnpm catalog:healthcheck` → **`catalog:healthcheck:write`** 로 전환.
  `SUPABASE_SERVICE_ROLE_KEY`를 step env에 추가(`secrets.SUPABASE_SERVICE_ROLE_KEY`).
- `scripts/verifyCatalog.ts`: `--write`인데 service key가 없으면 **크래시 대신 read-only로 graceful
  degrade**(분류·게이트는 그대로, DB write만 스킵). 이전엔 `exit(1)`.
- ⚠️ **활성화 조건**: `SUPABASE_SERVICE_ROLE_KEY`가 **GitHub Actions secret에 있어야** 실제 write된다.
  현재 repo secret 목록에 없음 → 추가 전까지 cron은 read-only로 동작(신선도 미갱신). 추가는 키 값이
  필요해 사용자만 가능(`gh secret set SUPABASE_SERVICE_ROLE_KEY`).

### 2. 소비 (AI 추천만, 브라우징 제외)

`POST /api/v1/suggest-apis`:
- `verificationStatus === 'broken'` API를 **후보에서 제외**(`candidateApis`). validId/apiMap도
  candidate 기반이라 AI가 broken ID를 환각 추천해도 이중 차단.
- `verified` API에는 후보 목록에 **`[검증됨]` 배지** + 프롬프트 규칙("관련성 비슷하면 [검증됨] 우선")로
  소프트 우선순위 유도(하드 재정렬 아님 — 관련성이 1순위).
- `verificationStatus` 미설정/null은 보수적으로 후보 유지(fail-open).

### 3. 카탈로그 브라우징(`catalogRepository.search()`)은 변경 없음

broken을 **숨기지 않는다**. '가용 유지' 정책과의 정합성: 일시 장애(예: picsum Cloudflare 522)
API를 사용자가 계속 볼 수 있어야 한다는 결정(비활성화 대신 모니터링)과 일치. 추천 품질만 보호하고
가시성은 유지한다.

## 한계

- **postgres provider(`DrizzleCatalogRepository`)는 `verification_status`를 매핑하지 않음** → 그 경로에선
  필터가 fail-open(broken 미제외). 비활성 경로(DB_PROVIDER=supabase가 운영)라 운영 무영향. postgres
  스키마에 컬럼 추가 시 함께 매핑 필요(audit C-2와 동일 계열).
- service key secret 미설정 동안은 신선도 미갱신 → 소비는 stale 데이터(verified 9/unverified 14,
  broken 0) 기준으로 동작. broken 제외는 실질 no-op, verified 우선만 적용. secret 추가 시 완전 동작.

## 검증

- `suggest-apis.test.ts` +3 케이스: broken 후보 제외 / verified `[검증됨]` 배지 / broken ID 추천 시 결과 필터링. 11/11 통과.
- api 통합 스위트 185/185 통과, `type-check`·`lint` 통과.

## 후속

- [ ] `SUPABASE_SERVICE_ROLE_KEY`를 GitHub Actions secret에 추가 → 신선도 활성화.
- [ ] (선택) postgres provider 스키마에 verification_status 추가 + Drizzle 매핑.
- [ ] (선택) verified 우선을 검색 정렬에도 반영 / SoT 대시보드.
