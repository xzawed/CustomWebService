CSP(Content-Security-Policy) 헤더의 전체 일관성을 검증하세요.

## 배경
이 프로젝트는 AI가 생성한 HTML을 CDN(Tailwind, Chart.js, Font Awesome 등)으로 렌더링합니다.
CSP 설정 오류 시 게시 페이지가 스타일 없이 렌더링되어 사용자에게 직접 영향을 줍니다.

## 검증 절차

### 1. 모든 CSP 정의 지점 수집
프로젝트 전체에서 `Content-Security-Policy` 문자열을 검색하여 모든 CSP 정의 위치를 찾으세요.

### 2. CSP 매트릭스 작성
각 CSP 정의에 대해 다음 표를 완성하세요:

| 파일:라인 | 적용 경로 | script-src CDN | style-src CDN | font-src CDN |
|----------|----------|----------------|---------------|--------------|
| middleware.ts:? | 메인 앱 | (목록) | (목록) | (목록) |
| site/[slug]/route.ts:? | 게시 페이지 | (목록) | (목록) | (목록) |
| preview/[projectId]/route.ts:? | 미리보기 | (목록) | (목록) | (목록) |

### 3. 불일치 검출
- 게시 페이지와 미리보기의 CDN 허용 목록이 다른 항목이 있는가?
- 미들웨어 CSP가 게시 페이지나 미리보기 경로에도 적용되는가?
- 프롬프트(`src/lib/ai/promptBuilder.ts`)가 사용하는 CDN이 CSP에 누락된 것이 있는가?

### 4. HTTP 헤더 이중 적용 검증
각 요청 경로에서 CSP 헤더가 몇 개 설정되는지 추적:

#### /site/[slug] 경로:
1. 미들웨어 실행 → CSP 설정하는가? (예/아니오)
2. route handler 실행 → CSP 설정하는가? (예/아니오)
3. 합계: CSP 헤더 N개 → N이 1 초과이면 ❌

#### /api/v1/preview/[projectId] 경로:
1. 미들웨어 실행 → CSP 설정하는가? (예/아니오)
2. route handler 실행 → CSP 설정하는가? (예/아니오)
3. 합계: CSP 헤더 N개 → N이 1 초과이면 ❌

#### slug.xzawed.xyz 경로:
1. 미들웨어 실행 → CSP 설정하는가? (예/아니오)
2. route handler 실행 → CSP 설정하는가? (예/아니오)
3. 합계: CSP 헤더 N개 → N이 1 초과이면 ❌

### 5. 프롬프트 CDN 추출
`src/lib/ai/promptBuilder.ts`에서 `<script src=`, `<link href=` 패턴을 추출하여
각 CDN 도메인이 게시 페이지 CSP의 적절한 directive에 포함되는지 확인.

## 결과
불일치나 이중 적용이 발견되면 구체적 파일:라인과 수정 방법을 제시하세요.
모든 항목이 일치하면 ✅ CSP 일관성 검증 통과로 보고하세요.
