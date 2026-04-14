생성된 웹서비스의 전체 서빙 파이프라인을 검증하세요. 이 검증은 배포 전 반드시 실행해야 합니다.

## 왜 이 검증이 필요한가
과거 사고: 미들웨어 CSP와 route handler CSP가 이중 적용되어 게시 페이지의 CDN이 차단됨.
미리보기는 정상이었지만 게시 페이지만 깨진 상태로 다수 사용자에게 노출됨.

## 검증 절차

### 1. CSP 헤더 일관성 검증 (가장 중요)
다음 3개 파일의 CSP를 모두 읽고 비교하세요:

- `src/middleware.ts` — 미들웨어 CSP (메인 앱용)
- `src/app/site/[slug]/route.ts` — 게시 페이지 CSP
- `src/app/api/v1/preview/[projectId]/route.ts` — 미리보기 CSP

검증 항목:
- [ ] 게시 페이지와 미리보기의 CSP에 동일한 CDN 도메인이 허용되는가?
  필수 CDN: cdn.tailwindcss.com, cdn.jsdelivr.net, cdnjs.cloudflare.com, stackpath.bootstrapcdn.com, unpkg.com
- [ ] 미들웨어 CSP가 `/site/*` 경로에 적용되지 않는가? (isSitePage 체크 존재?)
- [ ] 미들웨어 CSP가 `/api/*` 경로에 적용되지 않는가? (isApi 체크 존재?)
- [ ] CSP 헤더가 2중으로 적용되는 경로가 없는가?

### 2. 요청 흐름 추적 (각 경로별)
4가지 접근 경로의 전체 흐름을 코드로 추적하세요:

#### 경로 A: 미리보기 (/api/v1/preview/[projectId])
- 미들웨어: isApi=true → CSP 건너뜀 확인
- route handler: 자체 CSP 설정 확인
- assembleHtml 호출: CSS/JS 정상 주입 확인

#### 경로 B: 게시 페이지 직접 접근 (/site/[slug])
- 미들웨어: isSitePage=true → CSP 건너뜀 확인
- route handler: 자체 CSP 설정 확인
- assembleHtml 호출: CSS/JS 정상 주입 확인

#### 경로 C: 서브도메인 접근 (slug.xzawed.xyz)
- 미들웨어: 서브도메인 감지 → rewrite → 조기 반환 확인
- CSP 미설정 확인 (route handler만 설정)
- assembleHtml 호출: CSS/JS 정상 주입 확인

#### 경로 D: 메인 앱 (/builder, /dashboard 등)
- 미들웨어: CSP 정상 적용 확인
- 앱 보안 유지 확인

### 3. assembleHtml 함수 검증
`src/lib/ai/codeParser.ts`의 assembleHtml 함수를 읽고:
- [ ] HTML에 이미 <style>/<script>가 있어도 별도 CSS/JS를 추가 주입하는가?
- [ ] 조기 반환(early return) 로직이 CSS/JS를 누락시키지 않는가?
- [ ] CSS sanitization이 정상 CSS를 훼손하지 않는가?

### 4. 프롬프트와 생성 코드 호환성 검증
`src/lib/ai/promptBuilder.ts`의 시스템 프롬프트가 요구하는 CDN들이
CSP에서 모두 허용되는지 확인:
- promptBuilder가 사용하는 CDN 목록 추출
- site/[slug] CSP에서 해당 CDN이 script-src, style-src, font-src에 포함되는지 확인

### 5. 캐시 영향 확인
- `site/[slug]/route.ts`의 Cache-Control 헤더 확인
- 수정 배포 후 캐시 만료까지 최대 대기 시간 계산
- 필요시 캐시 무효화 방법 안내

## 결과 보고
각 항목을 ✅/❌로 보고하고, ❌ 항목은 구체적인 파일:라인과 수정 방법을 제시하세요.
단 하나라도 ❌이면 배포하지 마세요.
