# Node 22 전면 상향 — supabase-js 2.108 eager WebSocket 가드 대응 (#154 근본 원인)

- 날짜: 2026-06-22
- 상태: 적용 (PR `fix/node22-supabase-websocket`)
- 관련 이슈: #154 (카탈로그 헬스체크 "BROKEN 감지" — **오탐**)
- 선행 PR: #151 (`chore(deps)` — `@supabase/supabase-js` `2.107.x → 2.108.2` 포함)

## 배경 / 증상

2026-06-21 일일 카탈로그 헬스체크(`scheduled.yml`)가 처음으로 실패하며 GitHub 이슈 #154
("🚨 카탈로그 API 헬스체크 실패 (BROKEN 감지)")를 자동 생성했다. 그러나 **실제로 BROKEN인
API는 없었다** — 헬스체크 스크립트가 **API를 한 건도 호출하기 전에 크래시**했다.

스케줄 런 히스토리: 6/14~6/20 전부 success → **6/21 첫 실패**. 그 사이 머지된 것은
#150·**#151(deps bump)**·#152이며, #151이 `@supabase/supabase-js`를 **2.108.2**로 올렸다.

## 근본 원인 (CI 스택트레이스로 확증)

`gh run view 27917956818 --log-failed`:

```
Error: Node.js 20 detected without native WebSocket support.
  at getWebSocketConstructor (@supabase/realtime-js/.../websocket-factory.ts:178)
  at RealtimeClient._initializeOptions (RealtimeClient.ts:805)
  at new RealtimeClient (RealtimeClient.ts:284)            ← 생성자(eager)
  at SupabaseClient._initRealtimeClient (SupabaseClient.ts:629)
  at new SupabaseClient (SupabaseClient.ts:366)
  at createClient (@supabase/supabase-js/.../index.ts:65)
  at scripts/verifyCatalog.ts:63                            ← 모듈 최상위 createClient()
```

`@supabase/realtime-js`는 **2.108.x에서 WebSocket 가용성 검사를 생성자(eager)로 이동**했다
(2.107.x에서는 `connect()` 시점의 lazy 검사였다 — 로컬 소스 대조 확인). 가드 로직
(`websocket-factory.ts`):

- Node **< 22**: 네이티브 `WebSocket` 부재 → `throw "Node.js N detected without native WebSocket support."`
- Node **22+**: `typeof globalThis.WebSocket !== 'undefined'` → 네이티브 생성자 반환 (throw 없음)

즉 **2.108.2 + Node 20 조합에서는 `createClient(url, key)` 호출 자체가 throw**한다. realtime을
실제로 쓰지 않아도(헬스체크는 PostgREST `select`만 사용) 생성자에서 즉시 실패한다.

## 이것은 #154보다 큰 잠재 P0였다

`createClient`/`SupabaseClient` 생성자가 throw하므로, **앱의 모든 Supabase 클라이언트 생성 경로가
Node 20에서 위험**했다:

- `src/lib/supabase/server.ts` `createServiceClient()` → `@supabase/supabase-js` `createClient` 직접 호출
- 동 파일 `createClient()` → `@supabase/ssr` `createServerClient` → 내부에서 동일 `createClient` 호출
  (realtime 비활성화 옵션 없음 — `createServerClient.js` 대조 확인). **미들웨어 인증 경로 포함.**

프로덕션 `Dockerfile`은 3개 스테이지 전부 `node:20-alpine`였다. 따라서 **`main`을 Railway에
배포하는 순간 전 페이지가 클라이언트 생성 시점에 500**이 될 수 있었다.

조사 시점 프로덕션은 정상(200)이었다 — 마지막 배포 태그가 `deploy/2026-05-23-0000`(#151 이전)으로,
**프로덕션이 아직 2.108.2 빌드를 받지 않은 상태**였기 때문이다. 즉 활성 장애가 아니라 **다음 배포가
트리거하는 잠재 landmine**이었다.

## 결정

`@supabase/realtime-js`가 공식 권장하는 경로("Option 1: Use Node.js 22+")대로 **프로젝트 전반을
Node 22로 상향**한다. (대안인 `ws` 폴리필 + 호출부 transport 주입은 의존성 추가 + 호출부 분산으로
누락 위험이 커 기각.) Node 22는 현 Active LTS이며 Next.js 16·Playwright와 호환된다.

## 변경 사항

| 파일 | 변경 |
|------|------|
| `Dockerfile` | `node:20-alpine` → `node:22-alpine` (deps·builder·runner 3개 스테이지) |
| `.github/workflows/ci.yml` | `node-version: 20 → 22` (lint/test/build/e2e 4곳) |
| `.github/workflows/scheduled.yml` | `node-version: 20 → 22` |
| `.github/workflows/claude-automation.yml` | `node-version: 20 → 22` |
| `package.json` | `engines.node: ">=22"` 추가 (요구사항 명시 → 회귀 방지) |
| `.github/workflows/scheduled.yml` | 이슈 생성 가드 재작성 (아래) |

`qc-monitor.yml`은 curl/jq만 사용(Node 미설정)이라 변경 없음.

### 헬스체크 이슈 가드 재작성 (오탐 증폭기 제거)

기존 워크플로는 헬스체크 스텝이 **어떤 이유로든** 실패하면(크래시 포함) 항상
"🚨 BROKEN 감지" 이슈를 생성했다. `verification-report.json`이 없으면 `jq`가 폴백 텍스트
"(상세 파싱 실패)"를 내고도 BROKEN 이슈를 만들었다 — #154가 정확히 이 경로다.

가드를 **실제 BROKEN vs 도구 실패**로 분기하도록 변경:

- `verification-report.json` 존재 **AND** `.broken > 0` → "🚨 ... (BROKEN 감지)" (기존 동작)
- 리포트 부재/파싱 불가 → "⚠️ 카탈로그 헬스체크 실행 실패 (도구 오류)" — **개별 API의 BROKEN
  신호가 아니라 도구·환경 문제**임을 명시하고 런 로그 진단을 안내. 카탈로그 데이터 임의 변경 금지.

`verifyCatalog.ts`는 리포트를 broken 판정(exit 1)보다 **먼저** 기록하므로, "리포트 존재 + broken>0"은
곧 실제 BROKEN을 의미한다(스크립트 크래시는 리포트 부재로 나타난다).

## 검증

- **node 22 네이티브 WebSocket**: `node -e "typeof WebSocket"` → `function` (factory의 native 경로 충족).
- **실제 재현 (결정적)**: 로컬 Node v22.18.0 + 락파일 동기화(supabase-js 2.108.2 / realtime-js 2.108.2)에서
  CI를 크래시시킨 `createClient(url, key)`와 앱의 `createServerClient(...)`를 그대로 생성 →
  **둘 다 throw 없이 성공**(`realtime present: true`). Node 20 크래시 ↔ Node 22 정상 대조 확정.
- **이슈 가드 로직**: report+broken>0 / report+broken=0 / 리포트 부재 / 깨진 JSON 4개 시나리오를
  stub `gh`로 시뮬레이션 → 부재·broken0·malformed는 "도구 오류", broken>0만 "BROKEN 감지"로 라우팅.
- **YAML 유효성**: `scheduled.yml` `yaml.safe_load` 통과. node 20 잔존 핀 0건 확인.

## 후속

- **#154**: 머지 + Railway 재배포로 다음 스케줄 런이 정상 산출(broken 0)됨을 확인한 뒤 닫는다.
  카탈로그 데이터(`is_active`/`deprecated_at`)는 손대지 않는다(실제 장애 아님).
- 배포 성공 후 `deploy/YYYY-MM-DD-HHmm` 태그(배포 태그 규칙). 프로덕션 헬스 200 확인.
- 향후 supabase-js/realtime-js 메이저·마이너 bump 시 Node 런타임 요구사항 변동 여부 확인
  (dependabot deps PR 리뷰 체크포인트).
