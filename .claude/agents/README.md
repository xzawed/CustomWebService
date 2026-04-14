# 에이전트 목록

## 개발 라이프사이클별 에이전트

```
아이디어 → 설계 → 구현 → 테스트 → 검증 → 배포
  │         │       │       │        │       │
  └─────────┘       │       │        │       │
Feature Architect   │       │        │       │
                    │       │        │       │
              Code Builder  │        │       │
                            │        │       │
                   Test Commander    │       │
                                     │       │
                            Quality Guard    │
                                             │
                                    Deploy Sentinel
```

## 버그 수정

```
버그 보고 → 조사 → 분석 → 수정 → 검증
  │                              │
  └──────────────────────────────┘
              Bug Hunter
```

## 에이전트 상세

| 에이전트 | 파일 | 역할 | 핵심 Skill |
|----------|------|------|------------|
| Feature Architect | `feature-architect.md` | 기능 설계, 구현 계획 | brainstorming, writing-plans |
| Bug Hunter | `bug-hunter.md` | 체계적 디버깅, 버그 수정 | systematic-debugging, TDD |
| Code Builder | `code-builder.md` | TDD 기반 코드 구현 | executing-plans, TDD, kickoff |
| Quality Guard | `quality-guard.md` | 코드 리뷰, 보안, 테스트 | code-review, validate |
| Test Commander | `test-commander.md` | 테스트 작성, 커버리지 강화 | TDD, test-for |
| Deploy Sentinel | `deploy-sentinel.md` | 배포 전 전수 검사 | deploy-check, verify-csp, verify-serving |

## 사용 예시

```bash
# 새 기능 설계
/feature-architect Circuit Breaker 패턴으로 외부 API 장애 대응

# 버그 수정
/bug-hunter 미리보기에서 NOT_FOUND 에러 발생

# 코드 구현
/code-builder docs/superpowers/plans/2026-03-30-circuit-breaker-plan.md 실행

# 테스트 강화
/test-commander src/services/ 전체 테스트 커버리지 확보

# 코드 리뷰
/quality-guard feat/claude-api-transition 브랜치 전체 변경사항

# 배포 검증
/deploy-sentinel Claude API 전환 배포
```
