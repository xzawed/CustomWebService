프로덕션 배포 전 전체 체크리스트를 실행하세요.
이 서비스는 다수 사용자가 이용 중입니다. 배포 품질 기준을 엄격히 적용하세요.

## Phase 1: 자동 검증 (순서대로 실행)

### 1단계: 코드 품질
```bash
pnpm lint
pnpm type-check
pnpm format:check
```

### 2단계: 테스트
```bash
pnpm test
```

### 3단계: 빌드
```bash
pnpm build
```

## Phase 2: 서빙 파이프라인 검증 (가장 중요)

### 4단계: CSP 헤더 일관성 — 3개 파일 반드시 열어서 비교
다음 3개 파일의 Content-Security-Policy를 모두 읽고 CDN 허용 목록이 일치하는지 비교:
- `src/middleware.ts` — `/site/*`와 `/api/*`가 CSP 제외 대상인지 확인
- `src/app/site/[slug]/route.ts` — 게시 페이지 CSP
- `src/app/api/v1/preview/[projectId]/route.ts` — 미리보기 CSP

필수 확인:
- [ ] 게시 CSP와 미리보기 CSP에 동일한 CDN 도메인 허용
- [ ] 미들웨어가 /site/*에 이중 CSP를 적용하지 않음
- [ ] 프롬프트가 사용하는 모든 CDN이 CSP에 허용됨

### 5단계: assembleHtml 함수 무결성
`src/lib/ai/codeParser.ts`의 assembleHtml을 읽고:
- [ ] HTML에 <style>/<script>가 있어도 별도 CSS/JS를 버리지 않는가
- [ ] 조기 반환 로직이 없는가
- [ ] 4가지 접근 경로(미리보기, 직접, 서브도메인, 배포서비스)에서 동일 함수 사용 확인

### 6단계: 요청 경로별 추적
변경된 코드가 영향을 주는 모든 경로를 미들웨어부터 최종 응답까지 추적:
- 미리보기: /api/v1/preview/* → 미들웨어(CSP 스킵) → route handler
- 게시 직접: /site/* → 미들웨어(CSP 스킵) → route handler
- 게시 서브도메인: slug.xzawed.xyz → 미들웨어(rewrite, 조기반환) → route handler

## Phase 3: 보안 및 설정

### 7단계: 환경변수
- `.env.example` — 새 환경변수가 있으면 문서화되었는지
- `process.env` 사용 검색 — 누락 없는지
- `NEXT_PUBLIC_` 변수에 민감 정보 없는지

### 8단계: 보안
- 새 API 라우트에 인증 체크 존재 확인
- Supabase RLS 정책 확인

### 9단계: 마이그레이션
- `supabase/migrations/` 미적용 마이그레이션 확인

### 10단계: Git 상태
- 커밋되지 않은 변경사항 확인
- 커밋 메시지가 변경 내용을 정확히 반영하는지

## 결과 보고
각 항목을 ✅/❌로 보고하세요.
❌ 항목이 하나라도 있으면 배포하지 마세요.
실패 항목은 파일:라인과 구체적 수정 방법을 포함하세요.
