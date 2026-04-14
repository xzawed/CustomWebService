# Test Commander — 테스트 전담 에이전트

테스트 작성, 커버리지 분석, 반복 검증을 전담합니다.
코드 변경 후 또는 독립적으로 테스트 품질을 강화할 때 사용합니다.

## 대상
$ARGUMENTS

## 사용 Skills
- `superpowers:test-driven-development` — TDD 워크플로우
- `/test-for` — 특정 파일/모듈 테스트 생성
- `/validate` — 전체 검증 파이프라인

## 워크플로우

### Phase 1: 현황 파악
```bash
pnpm test 2>&1 | tail -20
```
현재 테스트 상태 확인 (통과/실패/총 수)

### Phase 2: 커버리지 분석
Explore 에이전트 병렬 실행:
- **에이전트 A**: `src/services/` 각 파일에 대응 테스트 존재 여부 확인
- **에이전트 B**: `src/providers/` + `src/repositories/` 테스트 존재 여부 확인
- **에이전트 C**: `src/app/api/` 각 라우트에 대응 테스트 존재 여부 확인
- **에이전트 D**: `src/lib/` 유틸리티 테스트 존재 여부 확인

결과를 테이블로 정리:
```
| 소스 파일 | 테스트 파일 | 상태 |
|-----------|------------|------|
| services/projectService.ts | services/projectService.test.ts | ✅ |
| services/catalogService.ts | — | ❌ 누락 |
```

### Phase 3: 테스트 생성 (병렬)
누락된 테스트를 우선순위별로 생성:

**P0 (필수)**: API 라우트, 서비스 레이어
**P1 (중요)**: 리포지토리, AI Provider
**P2 (권장)**: 유틸리티, 설정

각 테스트에 포함:
- 정상 경로 (happy path)
- 에러 경로 (인증 실패, 유효성 검증 실패, DB 에러)
- 경계값 (빈 입력, 최대값, null)

### Phase 4: 반복 검증 (10회)
전체 테스트를 10회 반복하여 불안정한 테스트(flaky test) 탐지:
```bash
for i in $(seq 1 10); do echo "=== Run $i ===" && pnpm test 2>&1 | tail -5; done
```

불안정 테스트 발견 시:
1. 원인 분석 (타이밍, 공유 상태, 비결정적 mock)
2. 수정 또는 격리
3. 재검증

### Phase 5: 통합 테스트 강화
기존 통합 테스트의 시나리오 커버리지 확인:
- 생성 → 미리보기 → 게시 전체 플로우
- 에러 보상 트랜잭션 (코드 저장 후 상태 업데이트 실패)
- 레이트리밋 원자적 카운터
- SSE 스트리밍 진행률

### Phase 6: 최종 보고
```
## 테스트 현황
- 전체: X개 파일, Y개 테스트
- 신규 추가: Z개 테스트
- 반복 검증: 10/10 안정

## 커버리지 매트릭스
| 레이어 | 파일 수 | 테스트 있음 | 커버리지 |
|--------|---------|------------|----------|
| API Routes | X | Y | Z% |
| Services | X | Y | Z% |
| Repositories | X | Y | Z% |
| Providers | X | Y | Z% |
| Lib/Utils | X | Y | Z% |

## 발견된 문제
[불안정 테스트, 누락된 에러 경로 등]
```

## 테스트 작성 규칙
- Vitest + happy-dom
- `vi.mock()` factory 안에서 top-level 변수 참조 금지
- AiProviderFactory mock 시 `create`와 `createForTask` 모두 포함
- 환경변수 테스트: beforeEach/afterEach로 원본 보존
- 싱글톤 캐시: `(Class as any).field = new Map()` 으로 초기화
