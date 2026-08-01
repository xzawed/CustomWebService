# ADR: 서비스 종합 건강 감사 및 발견 항목 수정

- 날짜: 2026-06-09
- 상태: 채택
- 관련 브랜치: `fix/audit-findings-batch`
- 선행: 테스트 플래키 후속 작업(plan 삭제됨) · [플래키 타임아웃 ADR](2026-06-09-test-flaky-timeout-contention-fix.md)

## 배경

서비스 전반의 건강 상태를 단위→통합→E2E→빌드→보안까지 실증 검증하고, 핵심 경로 8개 차원을
다중 에이전트로 심층 감사(적대적 검증 포함)했다.

### 실증 검증 결과 (모두 통과)
- 전체 1788 테스트 통과, 커버리지 Lines 88.96% / Stmts 87.75% / Branch 79.83% / Func 82.47%
- `type-check`·`lint`·`build` 통과, `pnpm audit` high/critical 0 (moderate 2: esbuild/postcss 빌드도구)
- E2E는 CI에서 green(로컬은 실 백엔드 env 부재로 미실행), Railway/SonarCloud는 CI 체크로 확인

### 심층 감사 결과
8차원(생성 파이프라인·서빙/CSP·API 인증·레이트리밋·Edge 호환·프록시/비밀·테스트 품질·정확성)에서
**확정 16건 / 적대적 검증으로 기각 12건**. critical 0, 활성 익스플로잇 0. 핵심 보안 통제(인증·IDOR·
SSRF·암호화·CSP)는 견고함이 재확인됨. 발견은 신뢰성·관측성·테스트 강화 항목.

## 결정 — 확정 16건 전부 수정

### 신뢰성/보안 (배포·레이트리밋)
1. **배포 실패 시 레이트리밋 환불**(H, reliability): 배포 실패가 일일 할당량을 영구 소진하던 문제.
   `decrement_daily_deploy` PG 함수(migration 021) + `IRateLimitRepository.decrementDailyDeployLimit`
   추가, deploy 라우트 catch에서 보상 호출(generate의 `pendingDecrement` 패턴과 동일).
2. **배포 에러 메시지 새니타이즈**(M, security): SSE error로 프로바이더 내부 메시지(projectId·repo
   경로)가 노출되던 문제. `AppError`만 메시지 노출, 그 외는 일반 문구로 마스킹(내부 상세는 logger에만).
3. **관리자 레이트리밋 경계**(L): `now > resetAt` → `now >= resetAt` (proxy 로직과 통일).
4. **레이트리밋 우회 로깅**(L): `RATE_LIMIT_BYPASS_USER_IDS` 적용 시 `logger.info` 감사 로그 추가.

### 생성 파이프라인
5. **`not_found` 상태 처리**(H, correctness): `pollGenerationStatus`가 status 엔드포인트의
   `'not_found'`를 'unknown'으로 오처리 → 타입 union에 추가 + 전용 핸들러(프로젝트 미존재 메시지).
6. **Quality Loop QC 리포트 동기화**(M): retry 채택 시 `state.qcReport`를 항상 갱신(null이면 null로) —
   이전 코드 기준 스테일 점수를 새 코드에 잘못 매핑하던 문제 차단.
7. **Stage 3 스킵 시 userPrompt 보존**(M): `userPrompt: ''` 오버라이드 제거 → `stage2Result.userPrompt`
   보존(aiPromptUsed 메타데이터 유실 차단).

### 데이터접근/엣지/프록시
8. **`updateSlug` null 가드**(H→nit): `.single()` 후 data null 시 NotFoundError(findBySlug와 일관).
   .single()의 PGRST116 보장으로 런타임 크래시는 아니나 방어적 일관성 확보.
9. **publish 2차 23505 처리**(L): 재시도마저 unique 위반이면 타임스탬프 폴백으로 한 번 더 시도.
10. **Edge 호환: authjs 정적 import 차단**(M, 잠복): `authjs-auth.ts`가 `authjs-config`(모듈 로드 시
    `getDb()`)를 정적 import → **동적 import**로 전환해 정적 체인 차단(AUTH_PROVIDER=authjs 전용 경로,
    현재 비활성).
11. **프록시 쿼리 키 노출**(H→문서): query-auth API는 키가 업스트림 URL에 포함됨(구조적 한계). 우리 측은
    `targetUrl`을 로깅/노출하지 않음을 확인하고 주석으로 명시 + 헤더 인증 권장.
12. **프록시 캐시 평문 본문**(L→문서): 현재 공개 API(비민감)만 캐시. 민감 데이터 캐시 시 민감도 플래그/
    at-rest 암호화 필요를 주석으로 명시.

### 테스트 보강
13. **카탈로그 통합 테스트**(H, test-gap): `src/__tests__/api/catalog.test.ts` 신규 8건(페이지네이션·
    404·캐시 헤더·graceful 500).
14. **Stage runner 에러 전파 테스트**(M): generateCodeStream reject·parseGeneratedCode throw 전파 검증 4건.
15. **스트리밍 다중 청크 테스트**(M): generate 라우트가 다중 onChunk 누적에도 complete 발행 검증.
16. **CSP 문법·완전성 테스트**(L): `buildSiteCsp` 산출물의 빈 디렉티브·dangling 세미콜론·중복·누락 검증.

### DX 도구 (감사 부수 발견)
- `test:integration`이 `src/app/api`만 가리켜 실제 api 테스트(`src/__tests__/api` 17파일)를 누락하던
  스크립트 오류 정정(1→19파일). `test:unit`은 services/repositories 포함하도록 확장.
- 미설치 `prettier`를 참조하던 `format`/`format:check` 죽은 스크립트 제거(포맷은 ESLint로 통합).

## 기각된 12건 (적대적 검증)
CSP 이중적용(이미 수정됨), iframe sandbox 불일치(COOP/CSP 상위 제어), Alpine.js XSS(DOMPurify+
validateAll 다층방어), AbortSignal(SDK 처리), 프록시 캐시키 POST 충돌(POST는 캐시 미진입), POST body
재소비(resolveApiKey가 request 미수신), BaseRepository null-data(PGRST116 보장), eventPersister 상태
누출(resetModules 적용됨) 등.

## 미적용 (범위 외)
- **#5 CI 타임아웃 위치 추적**: 코드 작업 없는 상시 모니터링.
- **Edge authjs 완전 지원**: Auth.js split-config 리팩터 필요(비활성 provider, 별도 작업).
- **postgres/001 deploy 함수 부재**: 보조 provider의 consolidated 스키마에 migration 017/021 미반영
  (Supabase 운영엔 영향 없음, 별도 정합성 작업).

## 검증
- 신규/수정 테스트 포함 전체 스위트 통과, `type-check`·`lint`·`build` 통과.
- 마이그레이션 021은 Supabase에 적용 필요(미적용 시 decrement는 best-effort로 무시되어 안전).
