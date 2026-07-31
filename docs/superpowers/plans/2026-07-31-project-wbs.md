# 잔여작업 WBS (2026-07-31 기준)

> **이 문서의 역할**: GitHub 열린 이슈로는 보이지 않는 잔여작업의 전체 지도.
> 2026-07-31 전수 감사(코드·문서·ADR·계획서)에서 도출했고, 각 항목의 근거는 **실제 파일을 열어 확인**했다.
>
> **중요**: 이 목록은 "지금 다 해야 할 일"이 아니다. **대다수는 데이터 대기 또는 제품 결정 대기**다.
> 백로그가 비어 보이는 이유는 미완성이 없어서가 아니라 **미결정이 많아서**다.

---

## 0. 이번 감사에서 완료한 것 (기록)

| 항목 | 결과 |
|------|------|
| 문서-코드 불일치 21건 | **전건 수정 완료** (HIGH 4 + MEDIUM/LOW 17) |
| 커버리지 집계 설정 | **정합화 완료** — 매칭 0건 glob, 미편입 12경로, stores, codecov↔sonar 비대칭 1건 |
| 클라이언트 상태 테스트 공백 | **스토어 6종 + `usePublish`** 추가 (+39 테스트) |
| 산출물 3종 | [SDD](../../architecture/system-spec.md) · [테스트 지도](../../reference/test-coverage-map.md) · 이 문서 |

---

## A. 제품 결정이 먼저 필요 — 코드는 이미 있다

| ID | 작업 | 크기 | 선행조건 |
|----|------|------|---------|
| **A1** | **외부 배포 기능(Railway/GitHub Pages) 존폐 결정.** 백엔드·프로바이더·테스트가 완비인데 **UI 호출부가 0건**이고 env 3종도 미설정이다. 죽은 코드가 아니라 **결정되지 않은 코드**다 | L | **사용자 판단** (살릴지/제거할지) |
| A2 | `GET /api/v1/deploy/:projectId/status` 미구현 (프로바이더 `getStatus`는 존재) | S | A1 |
| A3 | `rollback`·`deleteProject` 호출부 0건 (구현은 양쪽 프로바이더에 존재) | S | A1 |
| A4 | 계정·프로젝트 삭제 시 **외부 GitHub repo가 고아로 남는다** — 소스에 남은 유일한 실질 TODO | M | A1 + A3 |
| A5 | `RailwayDeployer.projectMap`이 인메모리 → 재시작 시 배포 컨텍스트 소실(미스 시 throw) | M | A1 |
| A6 | **`feature_flags` 7행이 시드만 되고 소비 코드가 0건** — 배선할지 테이블째 제거할지 | S | 결정만 |
| A7 | i18n 다국어 — `ko`만 존재, `enable_multi_language`는 false 선언뿐 | L | 제품 우선순위 |
| A8 | 라이선스·키 정책 (Open-Meteo 상업 사용 CC BY 4.0, NASA `DEMO_KEY`→등록 키, data.go.kr 운영계정) | M | 수익화 여부 |

> **A1이 이번 감사의 가장 큰 단일 발견이다.** 방치하면 유지보수 비용만 계속 든다.

---

## B. 운영 조치 — 사용자 손이 필요 (착수 전 반드시 물어볼 것)

| ID | 작업 | 크기 |
|----|------|------|
| **B1** | **`AUTH_URL=https://xzawed.xyz` Railway 등록.** 현재 미설정이라 `callback-url`이 `0.0.0.0:8080`이다. `AUTH_TRUST_HOST=true`라 로그인은 동작해 영향은 낮지만, **`env-vars.md`에 행 자체가 없어** 문서 추가도 함께 필요 | S |
| **B2** | **`RESEND_API_KEY`·`EMAIL_FROM` 실제 설정 여부 확인.** 미설정이면 인증 메일이 no-op → `assertEmailVerified()`가 generate·regenerate·deploy를 403으로 막아 **신규 사용자가 제품을 아예 못 쓴다.** 확인 후 문서의 상태 컬럼 갱신 | S |
| B3 | 키 의존 API **24개 재활성화** (카탈로그 61행 중 활성 36 / 비활성 25) | M |
| B4 | 프록시 키 prefix **실키 검증**(`needsPrefixFix`) — 코드는 완료, 실키로 확인된 적 없음 | S |
| B5 | Unsplash Production 심사 (Demo는 50건/시간) | S |
| B6 | **`SONAR_TOKEN` 재발급** — `.env.local`의 구형 40자 토큰이 무효(`valid:false`). 공개 프로젝트라 조회는 익명으로 되지만 인증 필요 작업은 막힌다 | S |

> B2는 **제품이 동작하지 않을 수 있는 항목**이라 우선순위가 가장 높다.

---

## C. 인프라·복원력

| ID | 작업 | 크기 | 선행조건 |
|----|------|------|---------|
| **C1** | **WAL 체크포인트 정책 도입.** `wal_autocheckpoint` 설정이 없고 코드 전체에 checkpoint 호출이 0건이라, 프로덕션 `/data/app.db`가 4096B·테이블 0개이고 실데이터가 전부 WAL에 있다 → **파일 단위 DR이 위험**하다. 복구 함정은 런북에 적혀 있으나 **체크포인트 자체가 없는 것이 근본 원인** | S | 없음 |
| C2 | 오프-볼륨 DR — 현재 백업은 **같은 볼륨**의 `.backup` 덤프뿐이라 볼륨 손실 = 백업 동반 손실 | M | S3 등 비용·계정 결정 |
| C3 | `adminAuth`의 `LRUMap` 안티패턴 정리 — [SDD 4.1](../../architecture/system-spec.md)이 금지한 "활성 윈도 evict" 패턴의 유일한 예외 | S | 없음 |
| C4 | `@sentry/nextjs` 의존성 + config 3파일 존치/제거 결정 — Sentry는 의도적 미도입인데 번들·감사 표면만 차지 | S | 결정만 |
| C5 | `DB_PROVIDER` 부팅 가드 — 단일 스택인데 잔존하며 **env를 잃으면 전면 장애인데 문서 근거가 없다** | S | 없음 |
| C6 | 인메모리 런타임 상태 8곳(단일 인스턴스 전제) | L | **멀티 인스턴스 전환 결정** (현 규모에선 무해) |
| C7 | Supabase 시대 1회성 SQL 4개 정리 | S | 없음 |
| C8 | `countries.json` 갱신이 완전 수동 (자동 갱신·신선도 검사 없음) | S | 없음 |
| C9 | `templateRegistry`가 최초 생성에만 적용되고 **재생성 경로에는 미적용** — 의도 여부 확인 선행 | S | 의도 확인 |

---

## D. 문서 부채 (21건은 완료, 아래는 잔여)

| ID | 작업 | 크기 |
|----|------|------|
| D-a | **`docs/guides/operations.md` 전면 재작성.** 최종 갱신이 2026-04-12(SQLite 컷오버 이전)라 Sentry·Supabase Dashboard·Supabase Auth URL·삭제된 `seed.sql`·"활성 23개"·"Supabase DB 500MB"가 그대로다. **`deployment.md`가 이 문서를 참조**하므로 오독 위험이 실재한다 | M |
| D-b | `docs/guides/development.md`·`testing.md`의 Supabase 시그니처 제거 — `createProjectService(supabase)` 같은 코드가 "✅ 올바른 방식" 블록에 남아 있다(실제 팩토리는 무인자) | S |
| D-c | `plans/2026-06-09-test-flakiness-followups.md`의 stale quirk 정정 — `pollGenerationStatus`의 `failed` 처리를 "미수정 보존"으로 기술하나 **코드는 이미 즉시 실패**로 개선됐다 | S |
| D-d | `AUTH_URL`·`DB_PROVIDER` env 문서화 (둘 다 `env-vars.md`에 행이 없다) | S |

---

## E. 테스트·CI (지도의 T1~T8과 1:1)

| ID | 작업 | 크기 |
|----|------|------|
| E1 | ~~커버리지 집계 설정 정합화~~ | **완료(2026-07-31)** |
| E2 | ~~클라이언트 상태·훅 테스트~~ | **완료(2026-07-31)** — 스토어 6 + `usePublish` |
| E3 | builder 생성 핸들러 추출 + 테스트 (T1) | L |
| E4 | 라우트 테스트 (T2: `projects/[id]`, `popular-services`) | S |
| E5 | 약한 테스트 보강 (T4 PublishDialog 실패 분기, T5 템플릿 11종 계약) | M |
| E6 | **E2E 확장 (T3)** — 미리보기↔게시 동등성, Host 헤더 서브도메인, 인증·생성·게시 | L |
| E7 | MSW 보강 — `onUnhandledRequest:'error'`가 미처리 요청 부재를 보증하지 못한다(MSW #946/#943) | S |

> **E6이 가장 값어치가 크다.** [테스트 지도 5절](../../reference/test-coverage-map.md)의
> "단위 테스트로 구조적으로 못 잡는 결함" 4종의 유일한 방어선이다.

---

## F. 관측·데이터 대기 — **착수 금지 또는 조건부**

| ID | 항목 | 상태 |
|----|------|------|
| F1 | [#216](https://github.com/xzawed/CustomWebService/issues/216) 3건 | **트리거 전부 미충족(2026-07-31 재확인). 재확인만 할 것** |
| F2 | site 프록시 한도 20/120 조정 | `trackedProjects: 0`. ADR의 기준표를 따를 것 |
| F3 | site 프록시 한도 경고 Slack 승격 | **webhook 블로커는 해소됨(2026-07-31)**. 남은 블로커는 임계 산정용 트래픽뿐 |
| F4 | site 프록시 Origin/Referer 바인딩 | 헤더 위조 가능·정상 요청 차단 위험으로 보류 |
| F5 | `ERROR_RATE_ALERT_THRESHOLD` 조정 | 실경보 수신 이력 필요 |
| F6 | 다일 장애 재알림(리마인더) | 운영 데이터 후 판단 |
| **F7** | **best-effort 경로 경보 부착** (배포 환불 실패·이벤트 persist 실패) | ✅ **판단 조건 충족됨 — F 그룹 중 유일하게 지금 착수 가능** · S |
| F8 | 복구 경보(`fail→success`) 실증 미검증 | `healthy`가 클로저 로컬이라 재배포를 넘으면 검증 불가. **동일 프로세스 내 실패→성공 유도 설계 필요** · S |
| F9 | 백업 틱 중첩 | 기본 24h에서 비현실적 — 기록만 |
| F10 | Quality Loop 파라미터 3건 | 운영 생성 데이터 축적 대기 |
| F11 | ET/Anthropic API 변경 사전 감지 체계 | 선행조건 없음 · M. Opus 5 상향 때 두 규약이 실측으로만 발견된 전례 |
| F12 | generationTracker 배포 복원력 | 부분 완화됨(상태 라우트가 DB로 완료 판정). 남은 건 진행률 UX · 낮음 |
| F13 | `/site/[slug]` 서버 측 캐싱 | 반복 방문 비율 데이터 대기 |
| F14 | **거대 모듈 분해** — `promptBuilder.ts` 1437줄, `builder/page.tsx` 862, `qcChecks.ts` 682, `generationPipeline.ts` 485 | 선행조건 없음 · L. **E3/E5가 사실상 이 작업의 첫 단계** |
| F15 | 기타(DNS Rebinding IPv6 / 검색 정렬 / 날씨 API 공백 / 로그인 실패 UX / CI 타임아웃 감시 등) | 트리거 미충족 또는 업스트림 대기 |

---

## 권장 착수 순서

지금 바로 할 수 있고 효과가 큰 순.

1. **B2** — 이메일 env 확인. 미설정이면 신규 사용자가 제품을 못 쓰는 상태다 (S)
2. **C1** — WAL 체크포인트. DR 위험을 근본에서 줄인다 (S)
3. **F7** — best-effort 경보. sink가 살아났으니 블로커가 없다 (S)
4. **A1** — 외부 배포 스택 존폐 결정. 미루면 유지보수 비용만 계속 든다 (결정)
5. **D-a** — `operations.md` 재작성. 다음 작업자의 오독을 막는다 (M)
6. **E6 → E3** — E2E 확장 후 builder 추출. 구조적 사각지대를 메운다 (L)

---

## 갱신 규칙

- 항목을 완료하면 **삭제하지 말고 `~~취소선~~` + 완료일**로 남긴다 (왜 안 했는지가 나중에 더 중요하다)
- 새 ADR이 "보류"·"이번 범위 밖"으로 남기는 항목은 **여기에 등록**한다 — 그러지 않으면 잊힌다
- F 그룹은 **트리거 조건을 반드시 함께 적는다.** 조건 없이 적으면 근거 없는 착수로 이어진다
