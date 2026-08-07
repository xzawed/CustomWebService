# 테스트 커버 현황 지도 (TDD)

> **언제 읽나**: 테스트를 추가한 뒤 `vitest.config.ts` 의 `coverage.include`·`codecov.yml`·`sonar-project.properties` 를 손댈 때. 괄호가 들어간 경로는 glob이 조용히 죽는다

> **이 문서의 역할**: 어디가 검증되고 어디가 비어 있는지의 **지도**다.
> 테스트 작성 방법·전략은 [testing.md](../guides/testing.md)에 있고 여기서는 반복하지 않는다.
>
> ⚠️ **개수·퍼센트를 박지 않는다.** 이전 판의 "186 / 2291"·"레이어별 82/76"·"builder 862줄, 테스트 0"은
> 2026-07-31 관측치였고 **2026-08-07에 셋 다 틀렸다**(builder에는 그 사이 테스트가 생겼다).
> 수치는 **1절의 명령으로 그 자리에서 구한다.**
>
> **갱신 규칙**: 테스트를 추가하거나 `coverage.include`를 바꾸는 PR에서 함께 갱신한다.

---

## 1. 수치는 명령으로 구한다

| 알고 싶은 것 | 구하는 법 |
|------|-----|
| 테스트 파일 / 테스트 수 · 통과 여부 | `pnpm test` |
| Statements / Branches / Functions / Lines % | `pnpm test:coverage` |
| lcov에 **실제로 수록된** 파일 | `grep -c "^SF:" coverage/lcov.info` |
| 커버리지 임계값 | `vitest.config.ts` 의 `coverage.thresholds` (문서에 복제하지 말 것) |
| SonarCloud 전체·신규 커버리지 | SonarCloud 프로젝트 `xzawed_CustomWebService` |

> **두 숫자가 다른 것은 정상이다.** Codecov/Vitest는 `coverage.include` 범위만,
> SonarCloud는 `sonar.sources=src` 전체를 측정한다. 구조적 차이이며 설정 오류가 아니다
> — 안 맞는다고 설정을 "고치지" 말 것.

---

## 2. 레이어별 커버 상태

> **파일 수는 적지 않는다.** 세고 싶으면 아래로 센다. 이 표가 담는 것은 숫자가 아니라
> **어디가 얇은가**다.
>
> ```bash
> find src/lib -name '*.ts' ! -name '*.test.ts' | wc -l   # 레이어별 구현 수(경로만 바꿔 반복)
> find src -name '*.test.ts*' | wc -l                     # 전체 테스트 파일 수
> ```

| 레이어 | 상태 |
|--------|------|
| `src/lib/**` | ✅ 가장 두껍다. fail-closed·원자적 test-and-set·경보 전이가 테스트로 고정됨 |
| `src/services/**` | ✅ 1:1 |
| `src/providers/**` | ✅ 핵심 커버 |
| `src/repositories/**` | 🟡 Sqlite 구현 위주 커버, 유틸 일부 공백 |
| `src/components/**` | 🟡 정상 경로 위주. 실패 분기 공백 있음 |
| `src/app/api/v1/**` | 🟡 라우트 테스트는 `src/__tests__/api`. 아래 3절 참조 |
| `src/stores/**` | ✅ 2026-07-31 신규 (직전까지 0건) |
| `src/hooks/**` | ✅ `useAuth`·`usePublish` 양쪽 커버 |
| `src/app/(main)/**` 페이지 | 🟡 builder·settings/api-keys만 테스트. 나머지 페이지 공백 |
| `src/templates/**` | ✅ 2026-08-04(E5) `templateContract.test.ts` 가 레지스트리 전 항목을 자동 구동 |
| `e2e/` | 🟢 E6: 유령 세션·서빙 동등성·CSP 단일·서브도메인 패스스루 고정 |

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

### 3.4 `src/templates/**` — 해소됨 (2026-08-04, E5)

계약 테스트(T5)를 붙인 뒤 `coverage.include`에 편입했다. **편입 전에 `TemplateRegistry.list()`
한 줄을 고쳤다가 lcov 데이터가 없어 new_coverage 0%로 게이트가 떨어진 적이 있다(PR #263 실측)**
— 3.1의 일반 규칙이 실제로 터진 사례다. 경위는 `vitest.config.ts` 해당 항목 주석에 있다.

---

## 4. 채워야 할 공백 — 위험도 순

> 위험도 기준: **돈·인증·데이터 손실**과 얼마나 가까운가.

| ID | 대상 | 왜 위험한가 | 최소 케이스 |
|----|------|------------|------------|
| **T1** | `src/app/(main)/builder/page.tsx` — **생성 오케스트레이션 구간** | 프로젝트 생성 → 생성 트리거 → SSE 리더 → 폴백 폴링 **오케스트레이션 전체가 이 파일에만** 있다. 폴링 함수 자체(`pollGenerationStatus`)는 테스트되지만 **조합**은 미검증. (2026-08-07 확인: `page.test.tsx`·`page.regen-version.test.tsx`가 생겨 모드 선택·카탈로그·추천 경합은 덮였다. **SSE→폴백 전환은 여전히 공백**) | 핸들러를 훅/순수함수로 추출 후 fetch·SSE·poll 주입형으로: ① SSE 성공 시 폴링 중단 ② SSE error → 폴백 전환 ③ 스트림 중도 종료 시 상태 확정 |
| **T2** | ~~`src/app/api/v1/projects/[id]/route.ts`~~ + `popular-services` | ~~DELETE가 프로젝트 영구 삭제 진입점~~ | ✅ **완료(E4, 2026-08-04)** — `projects-detail.test.ts` + `popular-services.test.ts`(케이스는 파일 참조). **`vitest.config.ts` `coverage.include`에 `popular-services` 편입이 필수**였다 — 3.1이 실제로 걸린 자리다 |
| **T3** | ~~E2E 전반~~ → ✅ **E6 완료** | 단위 테스트가 구조적으로 못 잡는 4종(§5)을 request-level E2E로 고정. `e2e/seed.mjs`가 SQLite 픽스처를 서버 기동 전 시드. CI는 **Build + E2E 양쪽**에 `NEXT_PUBLIC_ROOT_DOMAIN=xzawed.xyz` (빌드타임 인라인). Host는 `127.0.0.1` + `e2e/helpers/httpHost.ts`로 명시 주입(`slug.localhost` 불가) | `e2e/serving/*` 1회 프로젝트(setup storageState 의존). A 패스스루 · B 마커 동등성 · C CSP `headersArray` 1회 · D 유령 세션 401. pages/* 는 기존 device matrix 유지 |
| **T4** | ~~`PublishDialog` 실패 분기~~ | ~~기존 테스트가 전부 정상 경로~~ | ✅ **완료(E5, 2026-08-04)** — 케이스 목록은 `PublishDialog.test.tsx`. **핵심 계약은 "실패 시 다이얼로그가 닫히지 않는다"이고, 뮤테이션(`finally`에 `onClose` 주입)으로 그 단언에 이빨이 있는지 확인했다** |
| **T5** | ~~`src/templates/` 개별 템플릿~~ | ~~레지스트리는 "등록됨"만 검증~~ | ✅ **완료(E5, 2026-08-04)** — `templateContract.test.ts`가 `templateRegistry.list()`로 **자동 구동한다(하드코딩 id 목록 아님 — 템플릿을 추가하면 자동으로 대상이 된다)**. 플레이스홀더 누수 탐지기는 `${undefined}` 주입 뮤테이션으로 검증 |
| **T6** | `PopularServiceSuggestions.tsx` | useEffect가 자동 fetch하는데 MSW 핸들러가 없어, **핸들러부터 추가하지 않으면 테스트 작성 자체가 막힌다**(미처리 요청은 아래 E7 단언이 실패로 올린다) | `handlers.ts`에 엔드포인트 추가 → 로딩 / 빈 목록 / fetch 실패 3케이스 |
| **T7** | ~~`RePromptPanel.tsx`~~ | ~~재생성 진입 UI 전체~~ | ✅ **완료(E9/P4)** — `RePromptPanel.test.tsx` + `runClientRegeneration.test.ts`. **vitest·codecov·sonar exclude를 3곳 모두 제거해야 했다**(한 곳만 지우면 게이트가 어긋난다 — 3.3 참조) |
| **T8** | 테스트 없는 나머지 `src/app/(main)/**` 페이지·`src/components/auth/` | 페이지 테스트로 간접 커버 중이라 우선순위 낮음 | — |

### MSW 관련 주의

새 컴포넌트가 fetch하는 엔드포인트는 `src/test/mocks/handlers.ts`에 **핸들러를 반드시 추가**해야 한다.

> ✅ **E7 완료(2026-08-04).** `src/test/setup.ts`는 이제 `onUnhandledRequest`를 **콜백으로 받아
> 기록하고 `afterEach`에서 단언**한다. 앱이 `.catch()`로 삼킨 요청도 테스트를 실패시키므로
> **전체 통과 = 미처리 요청 부재**가 성립한다.
>
> 이전 caveat(MSW #946/#943 — `'error'` 문자열 설정은 비동기 전파상 테스트를 항상 빨갛게
> 만들지 못함)는 그 단언이 있어야만 해소된다. **`afterEach` 단언을 걷어내면 caveat가 되살아난다.**
> 탐지기 자체는 "삼켜진 미처리 요청" 임시 테스트로 실패를 확인했다.

---

## 5. 구조적 한계 — 단위 테스트로 못 잡는 것 (E2E로 고정)

아래는 단위 테스트를 아무리 늘려도 잡히지 않는다. **E2E(T3/E6)가 유일한 방어선**이다.

| 결함 | 왜 단위 테스트가 못 잡나 | E2E 스펙 |
|------|------------------------|----------|
| `getAuthUser`의 DB 행 확인 제거 (유령 세션) | **라우트 테스트가 `getAuthUser`를 통째로 모킹**한다 | `e2e/serving/ghost-session.spec.ts` — 로그인 후 `cascadeDeleteUser` → 동일 쿠키로 `GET /api/v1/projects` **401** (200+`[]`면 회귀) |
| 미리보기 / 게시(직접) / 게시(서브도메인) 3경로 불일치 | 경로별 차이는 실제 서빙에서만 드러난다 | `e2e/serving/serving-equivalence.spec.ts` — 세 경로 모두 `E2E_FIXTURE_OK` 마커 (바이트 동등 아님) |
| CSP 2중 적용으로 인한 백지 | 헤더 병합은 HTTP 레이어에서 일어난다 | `e2e/serving/csp.spec.ts` — `headersArray()`/`rawHeaders`로 CSP **정확히 1개**, CDN 호스트 포함. site `frame-ancestors 'none'` vs preview `'self'` |
| 서브도메인 rewrite 예외 누락 | 미리보기는 apex라 정상 동작해 드러나지 않는다 (2026-07-28 실측 장애) | `e2e/serving/subdomain-passthrough.spec.ts` — `Host: e2e-fixture.xzawed.xyz` + `/api/v1/proxy` → 프록시 JSON 400. **fail-closed**: 서브도메인 `GET /` 바디에 픽스처 마커 필수 |

---

## 6. 이력

| 일자 | 변경 |
|------|------|
| 2026-08-01 | **E6/T3**: E2E serving 프로젝트 추가(유령 세션·서빙 동등성·CSP·서브도메인 패스스루). CI Build/E2E에 `NEXT_PUBLIC_ROOT_DOMAIN`, seed `e2e/seed.mjs`, `httpHost` Host 주입 |
| 2026-07-31 | 최초 작성. 스토어 6종·`usePublish` 테스트 추가(+39), `(auth)` glob 버그 수정, 테스트가 있던 라우트 12경로·stores 편입, codecov↔sonar 비대칭 1건 해소 |
