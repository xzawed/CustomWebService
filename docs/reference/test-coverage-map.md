# 테스트 커버 현황 지도 (TDD)

> **이 문서의 역할**: 어디가 검증되고 어디가 비어 있는지의 **현황 스냅샷**이다.
> 테스트 작성 방법·전략은 [testing.md](../guides/testing.md)에 있고 여기서는 반복하지 않는다.
>
> **기준일**: 2026-07-31 (`pnpm test` · `pnpm test:coverage` 실측)
> **갱신 규칙**: 테스트를 추가하거나 `coverage.include`를 바꾸는 PR에서 함께 갱신한다.

---

## 1. 현재 수치

| 지표 | 값 | 출처 |
|------|-----|------|
| 테스트 파일 / 테스트 | **185 / 2312** (전부 통과) | `pnpm test` |
| lcov 수록 파일 | **222** | `coverage/lcov.info` |
| Statements / Branches | **92.94% / 83.33%** | `pnpm test:coverage` |
| Functions / Lines | **89.89% / 94.33%** | 〃 |
| 임계값 (`vitest.config.ts`) | branches 40 · functions 30 · lines 45 · statements 43 | 전부 여유 있게 통과 |
| SonarCloud 전체 커버리지 | **86.9%** (신규 코드 92.1%) | `sonar.sources=src` 전체 기준 |

> **두 숫자가 다른 것은 정상이다.** Codecov/Vitest는 `coverage.include` 범위만,
> SonarCloud는 `src` 전체를 측정한다. 구조적 차이이며 설정 오류가 아니다.

---

## 2. 레이어별 커버 상태

| 레이어 | 구현 | 테스트 | 상태 |
|--------|------|--------|------|
| `src/lib/**` | 82 | 76 | ✅ 가장 두껍다. fail-closed·원자적 test-and-set·경보 전이가 테스트로 고정됨 |
| `src/services/**` | 6 | 6 | ✅ 1:1 |
| `src/providers/**` | 8 | 5 | ✅ 핵심 커버 |
| `src/repositories/**` | 29 | 13 | 🟡 Sqlite 구현 위주 커버, 유틸 일부 공백 |
| `src/components/**` | 36 | 30 | 🟡 정상 경로 위주. 실패 분기 공백 있음 |
| `src/app/api/v1/**` | 40 | 32 (`src/__tests__/api`) | 🟡 아래 3절 참조 |
| `src/stores/**` | 6 | **6** | ✅ 2026-07-31 신규 (직전까지 0건) |
| `src/hooks/**` | — | +1 (`usePublish`) | 🟡 나머지 훅 공백 |
| `src/app/(main)/**` 페이지 | 4 | 0 | 🔴 `builder/page.tsx` 862줄 포함 |
| `src/templates/**` | 13 | 1 (레지스트리) | 🔴 개별 템플릿 계약 미검증 |
| `e2e/` | — | 3 spec / 11 테스트 | 🔴 인증·생성·게시·서브도메인 전부 미커버 |

---

## 3. 커버리지 집계 설정 — 반드시 알아야 할 것

### 3.1 `coverage.include`에 없는 파일을 고치면 CI가 빨개진다

lcov에 데이터가 없는 파일의 변경 라인은 SonarCloud `new_coverage`와 `codecov/patch`에서
**0%로 계산된다**(파일이 무시되는 게 아니다). 2026-07-10 실증.

→ 라우트·모듈을 수정하며 테스트를 붙였다면 `vitest.config.ts`의 `coverage.include`에도 **반드시 추가**한다.
→ 단위 테스트 대상이 아닌 파일은 `sonar-project.properties`와 `codecov.yml` **양쪽 다** 등록해야 한다
(한쪽만 하면 다른 쪽이 실패한다).

### 3.2 🔇 괄호가 들어간 경로는 glob이 조용히 죽는다

**2026-07-31 발견**: `'src/app/(auth)/**/page.tsx'`는 **매칭 0건**이었다.
picomatch가 `(auth)`를 extglob 그룹으로 해석해 리터럴 디렉터리명과 맞지 않는다(2.3.2·4.0.5 양쪽 실측).

그 결과 테스트가 있는 5개 페이지 중 login만 다른 패턴 덕에 잡히고 나머지 4개는 lcov에 없었다.
**측정만 누락되고 CI는 녹색이라 드러나지 않는 종류의 결함이다.**

| 패턴 | 결과 |
|------|------|
| `src/app/(auth)/**/page.tsx` | ❌ 매칭 0 |
| `src/app/**/(auth)/**/page.tsx` | ❌ **여전히 매칭 0** (위치 무관, 괄호가 문제) |
| `src/app/[(]auth[)]/**/page.tsx` | ✅ 현재 사용 중 |

→ **Next.js 라우트 그룹 `(name)`을 glob에 쓸 때는 반드시 문자 클래스로 이스케이프하고,
추가 후 `pnpm test:coverage`로 lcov에 실제로 들어왔는지 확인할 것.**

```bash
grep "^SF:" coverage/lcov.info | tr '\\' '/' | grep '패턴'   # lcov는 백슬래시 경로를 쓴다
```

### 3.3 codecov ↔ sonar 비대칭 — 해소됨 (2026-07-31, 실패를 겪고 나서)

처음에는 `sonar.coverage.exclusions`의 `src/app/**/page.tsx`·`src/app/**/layout.tsx`에 대응하는
항목을 `codecov.yml`에 **넣지 않고 보류**했다. 이유는 두 가지였다:
① `src/app/layout.tsx`는 lcov 데이터가 있어 ignore하면 데이터를 버린다
② 괄호 디렉터리 글롭이 codecov에서 어떻게 동작하는지 로컬 검증이 불가능하다(3.2의 전례 때문에 추측을 피했다).

**그리고 곧바로 실패했다.** `src/app/(main)/builder/page.tsx`를 리팩토링한 PR에서
`codecov/patch`가 떨어졌다 — 그 파일은 `coverage.include`에 없어 lcov 데이터가 없으므로
변경 라인이 0%로 계산되고, Sonar는 제외하니 통과한다. 정확히 그 비대칭이다.

두 줄을 추가해 대칭을 맞췄다. **트레이드오프를 알고 넣었다**: `(auth)` 5개 페이지는 테스트가
있고 lcov 데이터도 있는데 함께 걸린다. 그래도 Sonar가 이미 전체 페이지를 제외하고 있어
그쪽 지표에는 애초에 반영되지 않으며, **두 게이트가 어긋나 있는 상태 자체가 더 해롭다.**

> **교훈**: 게이트 설정의 비대칭은 "언젠가 문제가 될 것"이 아니라 **다음 PR에서 터진다.**
> 발견했을 때 미루지 말 것. 페이지를 측정하고 싶어지면 sonar·codecov·vitest **세 곳을 함께** 바꾼다.

### 3.4 `src/templates/**`는 아직 include에 없다

13파일 중 레지스트리만 테스트돼 있어, 편입하면 커버리지 지표가 내려간다.
**개별 템플릿 계약 테스트(T5)를 먼저 붙인 뒤 함께 편입**하는 것이 순서다.
그 전까지는 템플릿 파일 수정 시 patch 0% 위험이 있다는 것을 알고 있을 것.

---

## 4. 채워야 할 공백 — 위험도 순

> 위험도 기준: **돈·인증·데이터 손실**과 얼마나 가까운가.

| ID | 대상 | 왜 위험한가 | 최소 케이스 |
|----|------|------------|------------|
| **T1** | `src/app/(main)/builder/page.tsx` (862줄, 테스트 0) | 프로젝트 생성 → 생성 트리거 → SSE 리더 → 폴백 폴링 **오케스트레이션 전체가 이 파일에만** 있다. 폴링 함수 자체(`pollGenerationStatus`)는 테스트되지만 **조합**은 미검증 | 핸들러를 훅/순수함수로 추출 후 fetch·SSE·poll 주입형으로: ① SSE 성공 시 폴링 중단 ② SSE error → 폴백 전환 ③ 스트림 중도 종료 시 상태 확정 |
| **T2** | `src/app/api/v1/projects/[id]/route.ts` | **DELETE가 프로젝트 영구 삭제 진입점**이고 앱 캐스케이드의 입구다. 서비스는 커버되나 라우트 인증 게이트·에러 매핑은 미검증 | GET·DELETE 각각 미인증 401 / 타인 소유 403 / 소유자 200 |
| **T3** | E2E 전반 (`e2e/` 3 spec / 11 테스트) | 인증·빌더/생성·게시·서브도메인 서빙·프록시가 **전부 0**. [system-spec](../architecture/system-spec.md) 1.2(유령 세션)처럼 **단위 테스트가 구조적으로 못 잡는 결함**의 유일한 방어선 | request 레벨로 `/api/v1/preview/:id`와 `/site/:slug`의 HTML·CSP 동등성 비교. **서브도메인은 Host 헤더 주입으로 검증 가능**(판정은 middleware가 Host로 한다) |
| **T4** | `PublishDialog` 실패 분기 | 기존 7개 테스트가 전부 정상 경로. slug reason 분기(`invalid`/`reserved`/`taken`), AbortError 무시, publish catch, 에러 렌더가 **전부 미실행** | reason별 메시지 + 게시 버튼 disabled 유지, publish reject 시 에러 렌더 |
| **T5** | `src/templates/` 개별 11종 | 레지스트리는 "등록됨"만 검증. 소비처가 try/catch로 삼켜서 **깨져도 예외 없이 품질만 떨어진다** | `it.each`로 11종: `generate()`가 비지 않은 promptHint 반환 + `authType!=='none'`이면 프록시 경로 포함 |
| **T6** | `PopularServiceSuggestions.tsx` (143줄) | useEffect가 자동 fetch하는데 MSW 핸들러가 없고 `onUnhandledRequest:'error'`라 **핸들러부터 추가하지 않으면 테스트 작성 자체가 막힌다** | `handlers.ts`에 엔드포인트 추가 → 로딩 / 빈 목록 / fetch 실패 3케이스 |
| **T7** | `RePromptPanel.tsx` (409줄) | 재생성 진입 UI 전체. 소비자 테스트가 `vi.mock`으로 우회 중 | 재생성 제출 / 로딩 중 중복 제출 차단 / 서버 오류 표시 + vitest exclude에서 제거 |
| **T8** | 나머지 페이지 4종·`src/components/auth/` | 페이지 테스트로 간접 커버 중이라 우선순위 낮음 | — |

### MSW 관련 주의

`src/test/setup.ts`가 `onUnhandledRequest:'error'`다. 새 컴포넌트가 fetch하는 엔드포인트는
`src/test/mocks/handlers.ts`에 **핸들러를 반드시 추가**해야 한다.

> ⚠️ 다만 MSW `'error'`는 비동기 전파상 테스트를 항상 빨갛게 만들지는 않는다(MSW #946/#943).
> **전체 통과가 "미처리 요청 부재"의 충분 증거는 아니다.**

---

## 5. 구조적 한계 — 테스트로 못 잡는 것

아래는 단위 테스트를 아무리 늘려도 잡히지 않는다. **E2E(T3)가 유일한 방어선**이다.

| 결함 | 왜 단위 테스트가 못 잡나 |
|------|------------------------|
| `getAuthUser`의 DB 행 확인 제거 (유령 세션) | **라우트 테스트가 `getAuthUser`를 통째로 모킹**한다 |
| 미리보기 / 게시(직접) / 게시(서브도메인) 3경로 불일치 | 경로별 차이는 실제 서빙에서만 드러난다 |
| CSP 2중 적용으로 인한 백지 | 헤더 병합은 HTTP 레이어에서 일어난다 |
| 서브도메인 rewrite 예외 누락 | 미리보기는 apex라 정상 동작해 드러나지 않는다 (2026-07-28 실측 장애) |

---

## 6. 이력

| 일자 | 변경 |
|------|------|
| 2026-07-31 | 최초 작성. 스토어 6종·`usePublish` 테스트 추가(+39), `(auth)` glob 버그 수정, 테스트가 있던 라우트 12경로·stores 편입, codecov↔sonar 비대칭 1건 해소 |
