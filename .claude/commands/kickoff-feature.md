새 기능 추가를 위한 풀스택 워크플로우를 실행하세요. 이것은 /kickoff의 "기능 추가" 특화 버전입니다.

## 기능 설명
$ARGUMENTS

## 워크플로우 (자동 실행)

### Step 1: 설계 (Plan 에이전트)
Agent 도구로 Plan 타입 에이전트를 실행하여:
- 기능 요구사항 분석
- 필요한 DB 테이블/컬럼 설계
- API 엔드포인트 설계 (HTTP method, path, request/response)
- 필요한 컴포넌트 목록
- 이벤트 설계
- 사용자에게 설계 결과 보고 후 승인 요청

### Step 2: DB 마이그레이션
`supabase/migrations/` 패턴을 따라 마이그레이션 SQL 생성:
- 테이블 생성 + RLS + 인덱스 + 트리거
- `docs/04_데이터베이스_설계.md` 참고

### Step 3: 백엔드 스택 (병렬 가능한 것은 병렬로)
Agent 도구로 병렬 실행:
- **에이전트 A**: 타입 정의 (`src/types/`)
- **에이전트 B**: Repository 클래스 (`src/repositories/`)

순차 실행:
- Service 클래스 (`src/services/`) — Repository 완료 후
- API Route Handler (`src/app/api/v1/`) — Service 완료 후

### Step 4: 이벤트 시스템
- 도메인 이벤트 타입 추가
- Service에 이벤트 emit 연결
- 필요시 이벤트 리스너 추가

### Step 5: 프론트엔드 (백엔드와 병렬 가능)
Agent 도구로 실행:
- React 컴포넌트 생성 (`src/components/`)
- Zustand 스토어 추가/수정 (`src/stores/`)
- 커스텀 훅 생성 (`src/hooks/`)
- 페이지 라우트 추가 (`src/app/`)

### Step 6: 테스트 생성
Agent 도구로 병렬 실행:
- **에이전트 A**: Service 단위 테스트
- **에이전트 B**: API 통합 테스트
- **에이전트 C**: 컴포넌트 테스트 (필요시)

### Step 7: 코드 검증
순서대로 실행:
```bash
pnpm lint
pnpm type-check
pnpm test
pnpm build
```

### Step 8: 서빙 파이프라인 검증 (필수 — 생략 금지)
이 서비스는 다수 사용자가 이용 중입니다. 배포 품질이 곧 서비스 신뢰도입니다.

**cross-cutting concern 검증:**
- `src/middleware.ts`, `src/app/site/[slug]/route.ts`, `src/app/api/v1/preview/[projectId]/route.ts`
  3개 파일의 CSP 헤더를 모두 열어 CDN 허용 목록 일치 여부 확인
- 미들웨어가 `/site/*`, `/api/*` 경로에 이중 CSP를 적용하지 않는지 확인
- `assembleHtml()` 함수가 별도 CSS/JS를 누락 없이 주입하는지 확인

**요청 경로 추적:**
변경된 코드가 영향을 주는 모든 경로를 미들웨어 → route handler → 브라우저까지 추적.
"미리보기는 되는데 게시는 안 된다" 같은 경로별 차이가 없는지 반드시 확인.

모든 검증 통과 시 결과를 ✅/❌ 형태로 요약 보고하세요.
❌이 하나라도 있으면 커밋하지 마세요.
