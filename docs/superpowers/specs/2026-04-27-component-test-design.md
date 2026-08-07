<!-- DOC_STATUS: HISTORICAL | completed: 2026-04-27 | superseded_by: docs/guides/testing.md -->
# React 컴포넌트 테스트 도입 — 남은 결정 2건 (2026-04-27)

> 도입 자체는 완료됐고 **현재 시제는 [docs/guides/testing.md](../../guides/testing.md)** 다.
> 대상 컴포넌트 목록·mock 스니펫·파일 트리·예상 수치는 코드와 testing.md에서 더 정확하게
> 읽히므로 2026-08-07에 삭제했다. 아래 둘만 남긴다 — **다른 어디에도 기록이 없다.**

## 1. 왜 vitest `environment`를 전역으로 바꾸지 않았는가

`vitest.config.ts`의 `environment`는 지금도 **`node`**이고, 컴포넌트 테스트는
**파일 첫 줄의 `// @vitest-environment happy-dom` 지시자**로만 DOM을 얻는다.

| 방식 | 기존 테스트 영향 | 채택 |
|------|----------------|------|
| 전역 `environment: 'happy-dom'` | 당시 1,129개 전부 재검증 필요 | ❌ |
| **파일별 지시자** | **없음** — 라우트·lib·서비스·Repository 테스트가 node 환경 그대로 보호됨 | ✅ |
| `vitest.workspace.ts` 분리 | 없음, 설정만 복잡 | ❌ |

**전역 전환을 "정리"로 제안하지 말 것.** 이득은 지시자 한 줄을 없애는 것뿐이고,
비용은 node 환경 전제로 쓰인 전체 스위트의 재검증이다. `*.test.tsx`를 추가할 때는
지시자 누락이 곧 실패이므로 첫 줄을 확인한다.

## 2. 같은 세션에서 조건부 보류된 로드맵 2건

트리거가 충족되기 전에 착수하면 근거 없는 변경이다. (WBS F절·[#216](https://github.com/xzawed/CustomWebService/issues/216)과 별개 항목 — 그쪽에 없다.)

- **RBAC / 팀·조직**: 보류 — **팀 기능 실사용자 요청이 발생할 때** 재검토.
  (조직 도메인 코드는 이미 제거됨 → [ADR](../../decisions/organization-code-removal.md))
- **React/Vite + esbuild 생성 스택**: 보류 — **Alpine.js 한계 사례 월 50건 이상**
  또는 **복잡한 상태 관리가 필요한 비율 10% 초과** 시 재검토.
