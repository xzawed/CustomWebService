# 게시 사이트 프록시 복구 및 인가 모델 정비 (2026-07-28)

## 상태

승인됨 — 구현 완료

## 배경

전체 검수(Claude 독립 검증 + Grok 독립 감사 + 상호 반박 라운드)로 13건을 확정했고,
그중 **제품 핵심 기능이 동작하지 않는 CRITICAL 2건과 인가 결함 HIGH 2건**을 이 ADR의
범위로 삼았다. MEDIUM 7건은 검증된 목록으로 남겨 다음 라운드에서 처리한다.

| ID | 심각도 | 내용 |
|----|--------|------|
| C-1 | critical | 게시 서브도메인에서 `/api/*`가 404 — 미들웨어가 전 경로를 `/site/{slug}`로 rewrite |
| C-2 | critical | 프록시가 세션을 요구 — 익명 방문자는 401 |
| H-1 | high | 프록시 `projectId`에 소유권 검사 없음 — 타인의 개인 API 키 사용 가능 |
| H-2 | high | 일회성 토큰이 원자적으로 소비되지 않음 — 재설정 링크 재사용 가능 |

### C-1 프로덕션 실측

```
GET https://xzawed.xyz/api/v1/proxy?…            → 401   (라우트 도달, 인증 요구)
GET https://testprobe.xzawed.xyz/api/v1/proxy?…  → 404   (rewrite되어 라우트 미매칭)
```

생성 프롬프트는 CORS 때문에 직접 외부 URL 호출을 금지하고 상대경로 프록시만 허용한다.
따라서 **API를 사용하는 게시 사이트는 전부 데이터 로딩에 실패**했다.

### 왜 지금까지 드러나지 않았는가

미리보기는 apex 도메인에서 서빙되어 정상 동작했고, 게시된 사이트가 아직 없었다.
"미리보기에서 되니까 게시도 되겠지"라는 가정이 검증되지 않은 채로 남아 있었다.

## 결정

### 1. 미들웨어 — 프록시 경로만 rewrite 예외

`SUBDOMAIN_PASSTHROUGH_PREFIXES = ['/api/v1/proxy']`. 패스스루는 rewrite를 건너뛰고
일반 응답 경로로 흘러가 보안 헤더가 적용되고 `isApi` 판정으로 CSP는 건너뛴다(이중 적용 방지).

`/api/*` 전체를 열지 않은 이유: 세션 쿠키가 `__Host-` 프리픽스라 호스트 전용이므로
생성 사이트가 방문자 세션을 탈취할 수는 없지만(실측 확인), 불필요한 엔드포인트를
서브도메인에 노출할 이유가 없다.

### 2. `resolveProxyContext()` — 인가 판단 단일 진입점

인증·인가 판단이 `validateRequest`와 `resolveApiKey` 두 곳에 흩어져 있었고, 개인 키
해석부가 소유권을 확인하지 않아 H-1이 발생했다. 판단을 한 모듈로 모은다.

| # | 조건 | 결과 |
|---|------|------|
| 1 | Host가 `{slug}.{ROOT_DOMAIN}` + `isValidSlug` | slug로 프로젝트 조회 → published면 **site**, 아니면 404 |
| 2 | apex + 유효 세션(`typeof user.id === 'string'`) | **app** 모드 |
| 3 | apex + 세션 없음 + published `projectId` | **site** 모드 |
| 4 | 그 외 | 401 |

3번은 apex의 `/site/{slug}` 직접 서빙 경로 때문에 필요하다. 빼면 "서브도메인에선 되고
직접 게시 URL에선 안 되는" 경로별 분기가 생긴다.

**Host 우선 원칙** — Host로 프로젝트가 확정되면 클라이언트가 보낸 `projectId`는 무시한다.
사용자 입력이 인가 근거가 되지 않게 한다.

### 3. 인가 규칙

| 모드 | 프로젝트 출처 | apiId 검사 | 키 출처 | 레이트리밋 |
|------|---------------|-----------|---------|-----------|
| site | Host slug(우선) 또는 published `projectId` | `apiId ∈ project_apis` 강제 | 플랫폼 키 또는 **그 프로젝트 오너** 키 | IP + projectId |
| app | 클라이언트 `projectId` + **`assertOwner`** | 동일 강제 | 플랫폼 키 또는 **호출자 본인** 키 | userId (기존) |

소유권은 프록시 전용 비교식을 만들지 않고 기존 `assertOwner`를 재사용한다 — 규약이
갈라지면 H-1이 재발한다.

**인가 조회 실패는 fail-closed.** 폴백해서 진행하면 소유권을 확인하지 못한 채 키를 쓰게
된다(H-1의 실패 양상). 통제되지 않은 500 대신 명시적 404로 막는다.

### 4. 익명 사이트 레이트리밋

게시 사이트는 오너의 개인 키로 업스트림을 호출하므로 이 리미터가 타인 키 소진을 막는
유일한 경계다. 별도 버킷으로 분리했다.

기존 프록시 리미터의 **LRUMap eviction 패턴을 의도적으로 피했다** — 용량 초과 시 활성
윈도의 카운터가 통째로 사라져 다음 요청이 count:1로 시작, 한도를 우회할 수 있다(M-6).
신규 리미터는 만료 버킷만 정리하고, 자리가 없으면 살아 있는 카운터를 버리는 대신
차단한다(우회보다 과차단이 안전).

### 5. M-4 가드레일 — 개인 키 응답은 캐시하지 않는다

`buildCacheKey`는 `apiId:proxyPath:params`뿐이라 키 신원이 들어가지 않는다. 지금까지는
캐시 대상이 공개 키리스 API뿐이라 잠복 상태였지만, **익명 호출자가 오너의 개인 키로
업스트림을 호출**하게 되면서 같은 캐시 항목이 테넌트를 넘나들 위험이 실재화됐다.

이번 변경이 만드는 위험이므로 여기서 닫는다 — 캐시 키에 소유자를 넣는 대신 개인 키
경로는 캐시를 건너뛴다(가장 단순하고 안전). 캐시 판정이 `usedPersonalKey`에 의존하므로
키 해석을 캐시 조회보다 앞으로 옮겼다.

### 6. 토큰 원자적 소비

조회 → `await` → 소비 2단계였고 `consume`은 `WHERE id`만 검사했다. 단일 문으로 대체한다.

```sql
UPDATE auth_tokens SET consumed_at = ?
 WHERE token_hash = ? AND type = ? AND consumed_at IS NULL AND expires_at > ?
RETURNING user_id
```

2단계로 되돌아갈 여지를 없애기 위해 기존 `findValidByHash`·`consume`은 인터페이스에서
제거했다.

## 명시적 트레이드오프

site 모드는 결과적으로 **published `projectId`를 아는 사람은 누구나 그 오너의 키로
업스트림 호출을 트리거할 수 있다**는 뜻이다. 게시된 사이트 자체가 공개이므로 노출 수준은
동일하지만, **레이트리밋이 유일한 방어선**이 된다. Origin/Referer 바인딩이 없어 봇이
서버에서 직접 호출할 수 있으므로, 실질 상한은 프로젝트 전역 버킷(기본 120/분)이다.

사용자 승인된 정책("허용 + 강한 레이트리밋")이며, Host 바인딩을 우선 적용해 방어 심도를 더했다.
운영 시 프로젝트 전역 버킷 소진을 모니터링 지표로 삼을 것.

| 상수 | 기본값 | 의미 |
|------|--------|------|
| `SITE_PROXY_RATE_LIMIT_PER_MIN` | 20 | IP + projectId |
| `SITE_PROXY_PROJECT_LIMIT_PER_MIN` | 120 | 프로젝트 전역 (실질 상한) |
| `MAX_SITE_RATE_LIMIT_BUCKETS` | 5000 | 동시 추적 버킷 수 |

## 검증

| 항목 | 결과 |
|------|------|
| `pnpm lint` | 0 errors (warning 2건 — 기존) |
| `pnpm type-check` | 통과 |
| `pnpm test` | **168 파일 / 2067 테스트 통과** (기존 2022 + 신규 45) |
| `pnpm build` | 통과 |
| standalone 부팅 + `/api/v1/health` | 200 |

신규 테스트는 `resolveProxyContext` 진리표(Host 변형 × 게시 상태 × 세션 × 소유권),
Host 정규화(대문자·포트·예약 slug), 키 선택 격리(H-1 회귀 방지 — 타인 `projectId`면
개인 키 조회 자체가 일어나지 않음), 레이트리밋 우회 방지(용량 압박 시 활성 카운터 유지),
실 SQLite 토큰 이중 소비 차단을 고정한다.

### 검수 과정에서 교정된 것

- Grok이 보고한 "check→start TOCTOU로 중복 파이프라인"은 해당 구간에 `await`이 없어
  **오탐**으로 판정, 상호 검증에서 철회됐다. 실제 결함은 `generationTracker`의
  LRU/TTL 락 소실(M-5)이었다.
- Grok의 계획 검토가 CI 파손 2건을 잡았다 — `SqliteAuthTokenRepository.test.ts`가
  제거 대상 메서드를 호출하고 있었고, `src/middleware.ts`가 `coverage.include`에 없었다.
- 모드 판정으로 옮기면서 `user.id` 타입 가드를 누락했는데 **기존 테스트가 잡아냈다**.
  `resolveProxyContext`로 이전해 보존했다.

## 배포 후 확인

게시된 사이트가 없어 실환경 확인은 배포 후 테스트 프로젝트를 하나 게시해 수행한다.

```bash
# 1) 서브도메인 프록시 도달 (200 기대, 404면 패스스루 미적용)
curl -s -o /dev/null -w "%{http_code}\n" "https://<slug>.xzawed.xyz/api/v1/proxy?apiId=<연결된 apiId>&proxyPath=/<경로>"
# 2) 연결되지 않은 apiId 차단 (403 기대)
curl -s -o /dev/null -w "%{http_code}\n" "https://<slug>.xzawed.xyz/api/v1/proxy?apiId=<무관한 apiId>&proxyPath=/x"
# 3) 서브도메인의 다른 API 경로는 여전히 닫힘 (404 기대 — site 라우트로 rewrite)
curl -s -o /dev/null -w "%{http_code}\n" "https://<slug>.xzawed.xyz/api/v1/projects"
```

## 범위 밖 (다음 라운드)

M-1 Quality Loop AbortSignal 부재 · M-2 저장되는 stale `validation` · M-3 레이트리밋
fail-open 환불 · M-5 `generationTracker` LRU/TTL 락 소실 · M-6 기존 프록시 리미터
eviction 리셋 · M-7 IPv4-mapped IPv6 SSRF 우회 · M-8 `x-real-ip` 신뢰.

부수 관찰: `__Secure-authjs.callback-url`이 `https://0.0.0.0:8080`으로 설정되어 있다
(`AUTH_URL` 미설정 추정) — 로그인 리다이렉트 영향 확인 필요.

## 관련 문서

- [설계 spec](../superpowers/specs/2026-07-28-published-site-proxy-authz-design.md)
- [구현 계획 (WBS)](../superpowers/plans/2026-07-28-published-site-proxy-authz.md)
- [의존성 감사 면제 목록](../security/audit-waivers.md)
