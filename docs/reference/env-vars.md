# 환경변수 레퍼런스

> **주의:** 실제 값은 절대 커밋하지 말 것. `.env.local`(로컬) 또는 Railway Variables(프로덕션)에서 관리.
>
> **Railway 설정 상태** 컬럼: ✅ 설정됨 / ❌ 미설정 / ➖ 해당 없음 (선택 변수)

---

## Supabase

| 변수 | 필수 | Railway | 설명 |
|------|------|---------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ✅ | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ✅ | Supabase anon 공개 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ | 서버사이드 전용 서비스 키 |

---

## Provider 전환 (DB/Auth)

| 변수 | 값 | 필수 조건 | Railway | 설명 |
|------|----|----------|---------|------|
| `DB_PROVIDER` | `supabase` (기본) \| `postgres` | 항상 | ➖ | 미설정 시 `supabase` 기본값 |
| `AUTH_PROVIDER` | `supabase` (기본) \| `authjs` | 항상 | ➖ | 미설정 시 `supabase` 기본값 |
| `NEXT_PUBLIC_AUTH_PROVIDER` | `supabase` (기본) \| `authjs` | 항상 | ➖ | 클라이언트 컴포넌트용 빌드 타임 상수 |
| `DATABASE_URL` | PostgreSQL 연결 문자열 | `DB_PROVIDER=postgres` 시 필수 | ❌ | 온프레미스 DB URL |
| `AUTH_SECRET` | 임의 시크릿 | `AUTH_PROVIDER=authjs` 시 필수 | ❌ | NextAuth 세션 서명 키 |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth 자격증명 | `AUTH_PROVIDER=authjs` 시 필수 | ❌ | |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth 자격증명 | `AUTH_PROVIDER=authjs` 시 필수 | ❌ | |

---

## AI

| 변수 | 필수 | Railway | 설명 |
|------|------|---------|------|
| `ANTHROPIC_API_KEY` | ✅ | ✅ | Claude API 키 |
| `AI_MODEL_SUGGESTION` | 선택 | ➖ | 컨텍스트 추천용 모델 (기본: `claude-haiku-4-5`). 허용값: `claude-haiku-4-5` · `claude-sonnet-4-6` · `claude-opus-4-6` · `claude-opus-4-7` |
| `AI_MODEL_GENERATION` | 선택 | ➖ | 코드 생성용 모델 (기본: `claude-opus-4-7`). 허용값 동일. **주의**: 날짜 suffix 포함 ID(예: `claude-haiku-4-5-20251001`)는 Anthropic 404 반환 |
| `ET_COMPLEXITY_THRESHOLD` | 선택 | ➖ | Extended Thinking 활성화 복잡도 임계값 (기본: `35`). 0-100 점수 중 이 값 이상이면 ET 활성화. **빈 문자열 또는 0 이하 값 설정 시 기본값 35로 폴백** |

---

## 개발자 제공 API 키 (플랫폼 공유 키)

플랫폼 개발자가 직접 발급·등록하는 API 키. 사용자는 별도 등록 없이 사용 가능.

| 변수 | 필수 | Railway | 설명 |
|------|------|---------|------|
| `DATA_GO_KR_API_KEY` | 선택 | ❌ | 한국 공공데이터 포털(data.go.kr) API 키. 공휴일 정보·기상청 단기/중기예보·아파트 실거래가 공유 사용. [data.go.kr](https://data.go.kr) 가입 후 각 API 활용신청(공휴일은 자동승인, 나머지 1~3일). 개발계정 10,000건/일. |
| `KAKAO_REST_API_KEY` | 선택 | ❌ | 카카오 REST API 키. 카카오 로컬(지도·장소검색)·카카오 검색 공유 사용. [developers.kakao.com](https://developers.kakao.com) 앱 생성 후 REST API 키 발급. 서버사이드 단일키 패턴 공식 지원. 로컬 100,000건/일, 검색 50,000건/일. |
| `UNSPLASH_ACCESS_KEY` | 선택 | ❌ | Unsplash 사진 API 접근 키. [unsplash.com/developers](https://unsplash.com/developers) 앱 등록 후 발급. **Demo: 50건/시간 → Production 심사 후 1,000건/시간.** Unsplash 공식 단일키 프록시 패턴 권장. **사진가 Attribution(이름+링크) 자동 삽입 구현 필수.** |

> **Open-Meteo** (날씨 API, UUID: `a3f8d2e1-7c4b-4a9f-b6e5-1d2c3f4e5a6b`)는 키 불필요 — 환경변수 등록 없이 즉시 사용 가능. 단, 비상업적 전용(CC BY 4.0): 플랫폼에 광고·구독 없을 때만 사용 가능.

---

## 배포

| 변수 | 필수 | Railway | 설명 |
|------|------|---------|------|
| `NEXT_PUBLIC_ROOT_DOMAIN` | ✅ | ✅ | 서브도메인 루트 도메인 (예: `xzawed.xyz`) |
| `GITHUB_TOKEN` | 배포 시 | ❌ | GitHub API 토큰 (사용자 서비스 자동 배포용) |
| `RAILWAY_TOKEN` | 배포 시 | ❌ | Railway API 토큰 |

---

## 보안

| 변수 | 필수 | Railway | 설명 |
|------|------|---------|------|
| `ENCRYPTION_KEY` | ✅ | ✅ | 사용자 API 키 AES-256-GCM 암호화 키. **정확히 32바이트 권장**; 32바이트 미만 시 시작 오류, 초과 시 경고 로그 후 첫 32바이트만 사용 (`openssl rand -base64 24` → 32바이트 안전 생성) |
| `ADMIN_API_KEY` | ✅ | ✅ | 관리자 API 인증 (`/api/v1/admin/*`) |

---

## 모니터링

| 변수 | 필수 | Railway | 설명 |
|------|------|---------|------|
| `SENTRY_DSN` | 선택 | ❌ | Sentry 에러 수집 DSN (미설정 시 비활성화) |
| `SENTRY_ORG` | 선택 | ❌ | Sentry 조직 슬러그 (소스맵 업로드용) |
| `SENTRY_PROJECT` | 선택 | ❌ | Sentry 프로젝트 슬러그 |
| `SENTRY_AUTH_TOKEN` | 선택 | ❌ | Sentry 소스맵 업로드 토큰 |
| `SLACK_WEBHOOK_URL` | 선택 | ❌ | Slack 알림 Webhook URL. 미설정 시 알림 스킵. `slackAlert()` + `errorRateMonitor`에서 사용 |

---

## 비즈니스 규칙 (선택, 기본값 있음)

| 변수 | 기본값 | Railway | 설명 |
|------|--------|---------|------|
| `MAX_APIS_PER_PROJECT` | `5` | ➖ | 프로젝트당 최대 API 수 |
| `MAX_DAILY_GENERATIONS` | `10` | ➖ | 사용자당 일일 생성 횟수 |
| `MAX_PROJECTS_PER_USER` | `20` | ➖ | 사용자당 최대 프로젝트 수 |
| `MAX_REGENERATIONS` | `5` | ➖ | 프로젝트당 재생성 횟수 |
| `MAX_DEPLOY_PER_DAY` | `5` | ➖ | 사용자당 일일 최대 배포 횟수 |
| `MAX_CODE_VERSIONS` | `10` | ➖ | 프로젝트당 최대 코드 버전 수. 초과 시 오래된 버전 삭제 |
| `CONTEXT_MIN_LENGTH` | `50` | ➖ | 컨텍스트 최소 길이 (자) |
| `CONTEXT_MAX_LENGTH` | `2000` | ➖ | 컨텍스트 최대 길이 (자) |
| `GENERATION_TIMEOUT_MS` | `120000` | ➖ | 생성 타임아웃 (ms) |
| `ANTHROPIC_TIMEOUT_MS` | `270000` | ➖ | Anthropic SDK 호출 타임아웃 (ms). Railway 300초 HTTP 컷 전 안전 종료를 위해 270초로 설정. 운영 환경에서 더 긴 응답을 허용하려면 조정 |

---

## Rate Limit (인메모리, 단일 인스턴스 전제)

| 변수 | 기본값 | Railway | 설명 |
|------|--------|---------|------|
| `RATE_LIMIT_PER_MIN` | `60` | ➖ | proxy + admin 라우트 분당 요청 한도 (사용자/IP 단위) |
| `MAX_CONCURRENT_RATE_LIMIT_USERS` | `1000` | ➖ | rate limit Map의 LRU evict 임계값 (활성 사용자/IP 한도). 초과 시 가장 오래된 항목 자동 evict — Railway 단일 인스턴스 메모리 누적 차단 |
| `RATE_LIMIT_BYPASS_USER_IDS` | `` (빈 문자열) | ➖ | 쉼표 구분 userId 목록. 포함된 계정은 일일 생성 한도(`MAX_DAILY_GENERATIONS`) 검사 스킵. 관리자·개발자 계정 우회용. 코드 위치: `src/services/rateLimitService.ts` `checkAndIncrementDailyLimit()` |

---

## QC

| 변수 | 기본값 | Railway | 설명 |
|------|--------|---------|------|
| `ENABLE_RENDERING_QC` | `false` | ✅ **`true` 운영 중** | Playwright 렌더링 QC 활성화. Alpine 시스템 Chromium 사용 (`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`, PR #94에서 `browserPool.ts`에 executablePath 명시 전달 수정 완료) |
| `QUALITY_LOOP_ITERATION_TIMEOUT_MS` | `120000` | ➖ | 품질 루프 반복당 타임아웃 (ms). 단일 반복에서 AI 응답 없을 시 해당 반복 스킵. **빈 문자열 또는 0 이하 값 설정 시 기본값 120000으로 폴백** |
| `QUALITY_LOOP_MAX_ITERATIONS` | `2` | ✅ **`0` 운영 중** | 품질 루프 최대 반복 횟수. 기본 2회 (최대 3회 상한). **현재 0으로 설정 — 80초 타임아웃 인시던트 대응으로 Quality Loop 재시도 비활성화.** 낮출수록 총 생성 시간 단축 — Railway 300초 타임아웃 초과 방지용 |
| `QUALITY_LOOP_STRICT_ADOPTION` | `true` | ➖ | 채택 가드: `true`(기본)는 한 점수 향상 + 다른 점수 동등 이상일 때만 retry 채택(시소 진동 방지). `false`로 설정 시 기존 OR 로직(한쪽 향상) 복원 — 운영 데이터 비교용 롤백 스위치 |
| `QC_QUALITY_THRESHOLD` | `60` | ➖ | 정적 QC 구조 점수 재시도 트리거 임계값. 이 값 미만이면 Quality Loop 재시도 수행 |
| `QC_MOBILE_THRESHOLD` | `60` | ➖ | 정적 QC 모바일 점수 재시도 트리거 임계값. 이 값 미만이면 Quality Loop 재시도 수행 |
| `QC_FAST_PASS_THRESHOLD` | `60` | ➖ | Fast QC 통과 기준 점수. 이 값 미만이면 Fast QC 실패로 판정 |
| `QC_DEEP_PASS_THRESHOLD` | `70` | ➖ | Deep QC 통과 기준 점수. 이 값 미만이면 Deep QC 실패로 판정 (`QC_DEEP_PASS_THRESHOLD` 환경변수로 조정 가능) |
| `QC_MAX_CONCURRENT_PAGES` | `2` | ➖ | Playwright 동시 실행 페이지 수 상한. 높일수록 처리 속도 향상이지만 메모리 증가 (Railway 유료 플랜 이상 권장). 1 이하 설정 시 기본값 2로 폴백 |
| `QC_FAST_TIMEOUT_MS` | `3000` | ➖ | Fast QC 전체 타임아웃 (ms). 초과 시 Fast QC 결과 없이 진행 |
| `QC_DEEP_TIMEOUT_MS` | `10000` | ➖ | Deep QC 전체 타임아웃 (ms). 비동기 실행이므로 생성 완료를 블로킹하지 않음 |
| `QC_CHECK_TIMEOUT_MS` | `1500` | ➖ | 개별 QC 체크(consoleErrors, horizontalScroll 등) 타임아웃 (ms) |
| `QC_PAGE_DEFAULT_TIMEOUT_MS` | `5000` | ➖ | Playwright 페이지 기본 작업 타임아웃 (ms) |
| `QC_FAST_CONTENT_TIMEOUT_MS` | `3000` | ➖ | Fast QC `page.setContent()` 타임아웃 (ms) |
| `QC_DEEP_CONTENT_TIMEOUT_MS` | `8000` | ➖ | Deep QC `page.setContent()` 타임아웃 (ms). Deep QC는 더 무거운 체크를 수행하므로 더 긴 타임아웃 필요 |

---

## Failover (선택, 기본값 있음)

| 변수 | 기본값 | Railway | 설명 |
|------|--------|---------|------|
| `FAILOVER_ENABLED` | `true` | ➖ | Circuit Breaker 활성화 여부 |
| `FAILOVER_FAILURE_THRESHOLD` | `3` | ➖ | 트립까지 연속 실패 횟수 |
| `FAILOVER_FAILURE_WINDOW_MS` | `30000` | ➖ | 실패 카운트 윈도우 (ms) |
| `FAILOVER_RECOVERY_INTERVAL_MS` | `30000` | ➖ | 복구 프로브 주기 (ms) |
| `FAILOVER_RECOVERY_THRESHOLD` | `2` | ➖ | 복구까지 연속 성공 횟수 |
| `FAILOVER_MIN_DURATION_MS` | `60000` | ➖ | Failover 최소 유지 시간 (ms) |

---

> **Railway 상태 업데이트 방법:** Railway 대시보드 → Variables 탭에서 실제 설정 여부 확인 후 이 파일을 갱신한다.
> Railway 상태가 변경될 때마다 이 표를 최신화하여 디버깅 시 추측을 없앤다.
