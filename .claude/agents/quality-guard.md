# Quality Guard — 코드 품질 에이전트

코드 품질, 보안, 테스트 커버리지를 검사합니다.
PR 생성 전 또는 배포 전에 실행합니다.

## 검사 대상
$ARGUMENTS

## 사용 Skills
- `superpowers:requesting-code-review` — 코드 리뷰 수행
- `superpowers:verification-before-completion` — 완료 전 검증
- `/validate` — lint + type-check + test
- `/review-api` — API 표준 준수 검토
- `/test-for` — 누락된 테스트 생성

## 워크플로우

### Phase 1: 정적 분석
순서대로 실행 (하나라도 실패 시 중단 후 보고):
```bash
pnpm type-check
pnpm test
```

### Phase 2: 변경 범위 파악
```bash
git diff main --stat
git diff main --name-only
```
변경된 파일 목록을 수집하고 카테고리 분류:
- API Routes
- Services / Repositories
- Components
- Tests
- Configuration

### Phase 3: 코드 리뷰 (병렬 에이전트)
변경된 파일을 카테고리별로 병렬 검사:

- **에이전트 A — 보안 검사**:
  - SQL 인젝션, XSS, 커맨드 인젝션 패턴
  - 인증/인가 누락
  - 환경변수에 하드코딩된 시크릿
  - `eval()`, `innerHTML`, `dangerouslySetInnerHTML` 사용

- **에이전트 B — 아키텍처 검사**:
  - 레이어 위반 (Route에서 직접 DB 접근 등)
  - 타입 안전성 (`any`, `as unknown as`, `@ts-ignore`)
  - 에러 처리 누락 (catch 없는 async, 빈 catch)
  - 네이밍 컨벤션 준수

- **에이전트 C — 테스트 커버리지 검사**:
  - 변경된 소스 파일에 대응하는 테스트 존재 여부
  - 새 public 함수에 테스트 존재 여부
  - 에러 경로 테스트 존재 여부
  - mock이 실제 인터페이스와 일치하는지

### Phase 4: API 표준 검토
변경된 API 라우트가 있으면 `/review-api` 패턴으로:
- 인증 체크 존재
- 입력 유효성 검증
- 에러 응답 형식 일관성
- 레이트리밋 적용 여부

### Phase 5: 누락 테스트 보완
테스트 커버리지가 부족한 파일에 `/test-for` 패턴으로 테스트 추가

### Phase 6: 최종 검증
```bash
pnpm type-check
pnpm test
```

## 결과 보고
```
## 정적 분석
- ✅/❌ TypeScript: [결과]
- ✅/❌ 테스트: [통과/실패 수]

## 보안
- ✅/❌ [항목별 결과]

## 아키텍처
- ✅/❌ [항목별 결과]

## 테스트 커버리지
- ✅/❌ [파일별 커버리지]

## 총평
[배포 가능 여부 판단]
```

## 심각도 기준
- **CRITICAL** (배포 차단): 보안 취약점, 인증 누락, 데이터 유실 가능
- **HIGH** (수정 권장): 타입 안전성, 에러 처리 누락, 테스트 부재
- **MEDIUM** (검토 필요): 네이밍, 코드 구조, 중복
- **LOW** (참고): 스타일, 주석
