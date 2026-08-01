> **체크리스트 only.** 스택·서빙 불변조건 진실원은 루트 `CLAUDE.md` + `docs/architecture/system-spec.md` (+ `docs/architecture/subdomain.md`). 배포 전 필수.

생성 웹서비스 **서빙 파이프라인** 전체를 검증한다.

## 왜
과거: 미들웨어 CSP와 route CSP 이중 적용 → 게시만 CDN 차단. 미리보기는 정상.  
또: 서브도메인에서 `/api/v1/proxy` rewrite → 게시 사이트 API 전부 404.

## 체크리스트

### 1. CSP (가장 중요)
다음을 **동시에** 연다:

- `src/middleware.ts`
- `src/app/site/[slug]/route.ts`
- `src/app/api/v1/preview/[projectId]/route.ts`
- `src/lib/constants/cdn.ts`

- [ ] 게시(`SITE_CSP`)와 미리보기(`PREVIEW_CSP`) CDN 집합 동일 (`frame-ancestors`만 다름)
- [ ] 필수 CDN이 `cdn.ts`에 있는지 (tailwind / jsdelivr / cdnjs / bootstrapcdn / unpkg 등 — **목록은 코드가 정본**)
- [ ] 미들웨어 CSP가 `/site/*`·`/api/*`에 이중 적용되지 않는지
- [ ] 경로별 CSP 헤더 개수 ≤ 1

### 2. 요청 흐름 4경로
| 경로 | 확인할 것 |
|------|-----------|
| A 미리보기 `/api/v1/preview/[projectId]` | 미들웨어 앱 CSP 스킵 → handler `PREVIEW_CSP` → `assembleHtml` |
| B 직접 게시 `/site/[slug]` | 미들웨어 앱 CSP 스킵 → handler `SITE_CSP` → `assembleHtml` |
| C 서브도메인 `slug.<ROOT>` | Host 감지 → `/site/{slug}` rewrite (조기 분기) → handler CSP only |
| D 메인 앱 `/builder` 등 | 미들웨어 앱 CSP 적용 |

### 3. 서브도메인 패스스루
- [ ] `SUBDOMAIN_PASSTHROUGH_PREFIXES`에 `'/api/v1/proxy'` 포함
- [ ] 패스스루 경로만 최소 노출 (전 `/api/*` 개방 금지)
- [ ] 참고 E2E: `e2e/serving/subdomain-passthrough.spec.ts`

### 4. assembleHtml
- [ ] `src/lib/ai/codeParser.ts` — 별도 CSS/JS 주입, 조기 return 누락 없음, CSS sanitize가 정상 규칙 훼손 안 함

### 5. 프롬프트 ↔ CSP
- [ ] `promptBuilder.ts` CDN ⊆ `cdn.ts` / site CSP

### 6. 캐시
- [ ] `site/[slug]/route.ts` Cache-Control — 배포 후 체감 지연 상한 파악

### 7. 프록시 인가 (서빙 데이터 경로)
- [ ] 인가 분기는 `resolveProxyContext()` 단일 진입점 — 라우트에 새 분기 만들지 말 것
- [ ] 캐시 키 4번째 인자 `keyIdentity` 필수 (`buildCacheKey`)

## 결과
항목별 ✅/❌. ❌ 하나면 배포 금지. 파일:라인 + 수정 방향 명시.
