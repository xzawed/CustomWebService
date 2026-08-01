> **체크리스트 only.** 스택·CSP 불변조건 진실원은 루트 `CLAUDE.md` + `docs/architecture/system-spec.md`. CDN 단일 출처: `src/lib/constants/cdn.ts` (`buildSiteCsp`, `SITE_CSP`, `PREVIEW_CSP`).

CSP(Content-Security-Policy) 일관성을 검증한다.

## 필수 3파일 (+ 공통 빌더)

| 역할 | 경로 |
|------|------|
| 메인 앱 미들웨어 | `src/middleware.ts` |
| 게시 페이지 | `src/app/site/[slug]/route.ts` |
| 미리보기 | `src/app/api/v1/preview/[projectId]/route.ts` |
| 게시/미리보기 CDN 문자열 | `src/lib/constants/cdn.ts` |

## 체크리스트

### 1. 정의 지점 수집
- [ ] 워크스페이스에서 `Content-Security-Policy` / `buildSiteCsp` / `SITE_CSP` / `PREVIEW_CSP` 검색
- [ ] 위 3 경로 + `cdn.ts` 외 숨은 정의가 있으면 기록

### 2. 매트릭스
| 파일 | 적용 경로 | script-src CDN | style-src / font-src | frame-ancestors |
|------|----------|----------------|----------------------|-----------------|
| middleware | apex 메인 앱 | … | … | … |
| site/[slug] | 게시·서브도메인 rewrite 대상 | `SITE_CSP` | … | `'none'` |
| preview/[projectId] | 미리보기 iframe | `PREVIEW_CSP` | … | `'self'` |

### 3. 이중 적용 (HTTP: CSP 2개 = 둘 다 강제)
- [ ] `/site/*` · `/api/*` 에서 미들웨어가 앱 CSP를 덮지 않는지 (기존 `isSitePage` / `isApi` 패턴)
- [ ] 서브도메인 → rewrite 후 route handler CSP만 남는지
- [ ] 합계 헤더 개수 > 1 이면 ❌

### 4. 프롬프트 CDN
- [ ] `src/lib/ai/promptBuilder.ts`의 script/link CDN 도메인이 `cdn.ts` 허용 목록에 있는지

### 5. 서브도메인 패스스루 (CSP와 인접 함정)
- [ ] `src/middleware.ts`의 `SUBDOMAIN_PASSTHROUGH_PREFIXES` (현재 `'/api/v1/proxy'`) — 게시 사이트 상대경로 프록시가 rewrite에 먹히지 않는지  
  (빠지면 데이터 404; 미리보기는 apex라 정상처럼 보여 놓치기 쉬움)

### 6. 자동화 보조
- [ ] `src/lib/constants/cdn.test.ts`, `e2e/serving/csp.spec.ts` 존재 시 실행·참고

불일치 시 파일:라인과 수정안. 전부 일치 시 통과만 보고.
