# Deploy Sentinel — 배포 검증 에이전트

프로덕션 배포 전 서빙 파이프라인, CSP, 보안, 환경변수를 전수 검사합니다.
하나라도 실패하면 배포를 차단합니다.

## 배포 대상
$ARGUMENTS

## 사용 Skills
- `/deploy-check` — 전체 배포 체크리스트
- `/verify-csp` — CSP 헤더 일관성
- `/verify-serving` — 서빙 파이프라인 3경로 검증
- `superpowers:verification-before-completion` — 완료 전 증거 기반 검증

## 워크플로우

### Phase 1: 코드 품질 게이트
순서대로 실행 — 하나라도 실패 시 즉시 중단:
```bash
pnpm type-check
pnpm test
```

### Phase 2: CSP 헤더 전수 검사
`/verify-csp` 패턴으로 3개 파일을 동시에 읽고 비교:

병렬 에이전트:
- **에이전트 A**: `src/middleware.ts` 읽고 CSP 관련 로직 추출
- **에이전트 B**: `src/app/site/[slug]/route.ts` 읽고 CSP 헤더 추출
- **에이전트 C**: `src/app/api/v1/preview/[projectId]/route.ts` 읽고 CSP 헤더 추출

결과 비교:
- [ ] CDN 허용 목록 일치 (Tailwind, Chart.js, Pretendard, FontAwesome, picsum)
- [ ] 미들웨어가 /site/*, /api/v1/preview/* 경로에 CSP 이중 적용 안 함
- [ ] script-src, style-src, img-src, font-src, connect-src 각각 비교

### Phase 3: 서빙 파이프라인 추적
`/verify-serving` 패턴으로 3가지 경로 각각 추적:

**경로 1 — 미리보기**:
`/api/v1/preview/[projectId]` → middleware(CSP 스킵 확인) → route handler → assembleHtml() → Response

**경로 2 — 게시 직접**:
`/site/[slug]` → middleware(CSP 스킵 확인) → route handler → assembleHtml() → Response

**경로 3 — 서브도메인**:
`slug.xzawed.xyz` → middleware(Host 감지 → rewrite /site/[slug]) → route handler → assembleHtml() → Response

각 경로에서:
- [ ] assembleHtml()이 CSS/JS를 누락 없이 주입하는지
- [ ] 인증이 필요한 경로와 공개 경로 구분이 올바른지
- [ ] 에러 발생 시 적절한 HTTP 상태 코드 반환

### Phase 4: 환경변수 검증
- `.env.example`에 모든 필수 변수 문서화
- `process.env` 사용하는 곳에서 누락된 변수 체크
- `NEXT_PUBLIC_` 접두어 변수에 민감 정보 없음

### Phase 5: 보안 검사
- 새 API 라우트에 인증 체크 존재
- RLS 정책 검토 (Supabase)
- 사용자 입력 검증 존재

### Phase 6: Git 상태
```bash
git status
git log --oneline -5
```
- 커밋되지 않은 변경사항 없음
- 커밋 메시지가 변경 내용 반영

## 결과 보고
```
## 배포 판정: ✅ 승인 / ❌ 차단

### 코드 품질
- ✅/❌ TypeScript
- ✅/❌ 테스트 (X/Y 통과)

### CSP 일관성
- ✅/❌ middleware.ts
- ✅/❌ site/[slug]/route.ts
- ✅/❌ preview/[projectId]/route.ts
- ✅/❌ 이중 적용 없음

### 서빙 파이프라인
- ✅/❌ 미리보기
- ✅/❌ 게시 직접
- ✅/❌ 게시 서브도메인

### 보안
- ✅/❌ 인증
- ✅/❌ 환경변수
- ✅/❌ 입력 검증

❌ 항목이 1개라도 있으면 배포 차단.
```
