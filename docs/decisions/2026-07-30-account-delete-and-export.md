# 계정 삭제 · 데이터 내보내기 (#221)

> **언제 읽나**: cascadeDeleteUser·계정 DELETE, GET /api/v1/auth/export, getAuthUser DB 행 확인(유령 세션 차단), deletedUserId/payload 익명화를 손댈 때

- 날짜: 2026-07-30
- 상태: 채택
- 관련: [#221](https://github.com/xzawed/CustomWebService/issues/221), PR #233
- 선행: [#214 프로젝트 삭제 캐스케이드](https://github.com/xzawed/CustomWebService/issues/214)

## 배경

공개 셀프서비스 가입 서비스인데 **사용자가 계정을 삭제할 방법이 없었다.**
`src/app/api/v1/auth/` 아래에 `DELETE` 라우트가 없었고, `SqliteUserRepository.delete()`는
존재하지만 **어디서도 호출되지 않았다.**

그냥 호출하면 안 되는 이유는 #214와 같다 — `users.id`를 참조하는 FK가 여럿이고
대부분 `NOT NULL`인데 전부 `ON DELETE NO ACTION`이라, 자식 정리 없이 지우면 FK 위반 500이다.

## 착수 전 발견한 선행 결함 — 유령 세션

**계정 삭제를 붙이기 전에 반드시 고쳐야 하는 것이 하나 있었다.**

`getAuthUser`는 Auth.js JWT 세션만 읽고 DB를 전혀 조회하지 않았다. JWT는 무상태라
사용자 행이 사라져도 토큰은 만료까지 살아 있고, 그 사이 이렇게 동작했다:

| 경로 | 삭제된 사용자의 토큰으로 |
|---|---|
| `GET /projects` | **200 + `[]`** — 로그인된 것처럼 보인다 |
| 쓰기 경로 | `projects.user_id` FK 위반으로 **500** |
| `assertEmailVerified` | 미존재를 '미인증'으로 읽어 **403** (401이어야 함) |
| `GET /auth/status` | `verified: false` + 200 — 로그아웃되지 않는다 |

**라우트 테스트가 `getAuthUser`를 통째로 모킹하므로 단위 테스트로는 절대 드러나지 않는다.**
삭제 기능만 넣고 이걸 두면 결함을 함께 출시하는 셈이라 먼저 고쳤다.

### 결정: `getAuthUser`가 DB 행 존재를 확인한다

세션 해석 후 `users` PK 조회 1회. 없으면 `null` → 호출부의 기존
`if (!user) throw new AuthRequiredError()` 경로가 그대로 401을 낸다.

- **JWT 스냅샷이 아니라 DB 현재 값**(email/name/avatarUrl)을 반환한다 — 토큰이 오래 살아도
  이메일 변경 등에 정합하다.
- **DB 오류는 fail-closed(null).** 인증 경계에서 fail-open으로 통과시키는 것보다
  일시 장애로 401이 낫다. 레이트리밋의 fail-open과 **의도적으로 다르다.**
- **middleware(Edge)에는 두지 않았다** — middleware는 `local-auth-edge`만 동적 import하며
  이 경로에 닿지 않는다(임포트 체인 확인 완료).
- 인증 요청마다 인덱스 PK 조회 1회가 추가된다. 임베디드 SQLite 단일 인스턴스에서 비용은
  미미하고, **이 조회가 삭제·탈취 세션을 막는 유일한 지점**이라는 주석을 남겼다 —
  "최적화"로 제거하지 말 것.

부수적으로 `assertEmailVerified`도 미존재 → 401, 미인증 → 403으로 분리했다.

## 결정

### 1. 내보내기를 먼저 배선한다

삭제 전에 내보낼 수단이 없으면 사용자가 데이터를 잃는다.

`GET /api/v1/auth/export` — 인증만 요구하고 **이메일 인증은 요구하지 않는다.**
자기 데이터 열람이고, 나가려는 미인증 사용자도 데이터는 가져갈 수 있어야 한다.
사용자당 1시간 3회.

**포함**: 사용자 프로필, 프로젝트 전체 메타, 프로젝트별 `project_apis`와 **모든**
`generated_codes` 버전, `schemaVersion`·`exportedAt`.

**제외**:

| 항목 | 이유 |
|---|---|
| `passwordHash` | 자명 |
| `user_api_keys`의 키 값 | **암호문도 평문도 넣지 않는다.** 암호문은 사용자에게 쓸모없고, 복호화 평문은 공유·로그된 파일에서 유출 면이 크다. 메타데이터(`apiId`·`isVerified`·`createdAt`)만 |
| `auth_tokens` | 인증·재설정 토큰 재료 |
| `generation_locks` | 휘발 운영 상태 |

**테스트는 객체 shape가 아니라 응답 본문 문자열을 전수 검색한다** — 중첩 행이 필드를
달고 나가는 누출은 shape 검사로 못 잡는다.

### 2. 삭제는 단일 동기 트랜잭션 캐스케이드

> 사용자 결정: **`platform_events`는 참조 끊기 + payload 익명화**, **게시 사이트는 자동 연쇄 삭제**

**`SqliteProjectRepository.delete()`를 루프 호출하지 않는다** — 각 호출이 별도 트랜잭션이라
중간 실패 시 반쯤 지워진 계정이 남는다. better-sqlite3 트랜잭션 안에서는 `await`가 불가하므로
비밀번호 검증·스냅샷은 트랜잭션 **밖에서** 먼저 한다.

순서:

1. `platform_events.project_id → NULL` (해당 프로젝트들, #214와 동일)
2. `platform_events` 이 사용자 행: `user_id → NULL` **+ payload 익명화**
3. `generated_codes`, `project_apis`
4. `generation_locks` — `project_id`와 `user_id` **양쪽** (FK가 없어 500은 안 나지만 고아 금지)
5. `projects`
6. `user_api_keys`, `auth_tokens`, `user_daily_limits`
7. `users` 마지막

`SqliteUserRepository.delete()`는 얇은 단일 행 삭제로 남기고, **단독으로 계정 삭제에
쓰지 말라는 주석**을 달았다.

### 3. payload 익명화 — 하이브리드

순수 denylist는 함정이다(새 이벤트 타입이 이메일을 담으면 조용히 샌다).
순수 allowlist는 감사 가치를 파괴한다(`durationMs`·점수·반복 횟수가 사라지고 목록이 썩는다).

**셋을 겹친다**:

1. **PII 키 denylist** — `email`·`name`·`password*`·`token`·`ip*`·`cookie` 등 + **`slug`**
2. **주체 값 스크럽** — 이메일(대소문자 무시)·이름과 **문자열 동등**이면 `[redacted]`.
   오류 메시지나 denylist가 모르는 미래 필드를 잡는다
3. **신원 스크럽** — `payload.userId === deletedUserId` → `[deleted]`

`projectId`·점수·duration은 유지한다 — 사용자 결정이 명시적으로 보존하려던 감사 신호다.

**`slug`를 denylist에 넣은 이유**: `PROJECT_PUBLISHED` payload가 slug를 담는데,
사용자가 직접 지은 서브도메인이라 실명이 들어갈 수 있다(`hong-gildong-portfolio`).
값 동등 비교로는 부분 포함을 못 잡고, 부분 문자열 스크럽은 무관한 텍스트까지 망친다.
삭제되면 slug 자체가 해제되므로 감사 가치도 낮다 — "언제 무슨 일이 있었는지"는
`projectId` + 이벤트 타입 + 시각으로 충분하다.

빈/1자 `name`으로 모든 짧은 문자열이 `[redacted]`가 되지 않도록 최소 길이 가드를 뒀다.

### 4. `USER_DELETED`는 `deletedUserId`를 쓴다

`SqliteEventRepository.persist()`가 `payload.userId`를 `platform_events.user_id` FK 컬럼에
자동 대입하므로, 삭제 직후 발행되는 이 이벤트가 `userId` 키를 쓰면 **FK 위반으로 조용히
유실**된다(persist는 best-effort라 경고만 남는다). `PROJECT_DELETED`/`deletedProjectId`와
**정확히 같은 함정**이다. 커밋 이후 발행한다.

### 5. 삭제 라우트는 비밀번호 재인증을 요구한다

`DELETE /api/v1/auth/account`, body `{ password }`. 탈취된 세션 쿠키만으로 원클릭 파기가
되지 않게 한다. 틀리면 401이고 **아무것도 지우지 않는다.**

커밋 후 Auth.js 세션 쿠키를 만료시킨다(청크된 `.0`/`.1`/`.2`와 `__Secure-`/`__Host-` 변형 포함).
쿠키 정리를 놓쳐도 위의 `getAuthUser` 강화가 2중 방어로 막는다.

### 6. 게시 사이트는 별도 unpublish 없이 정리된다

`/site/{slug}`는 `findBySlug` → null → 404 `notFoundHtml`로 깔끔하게 떨어진다.
프로젝트 행 삭제만으로 충분하고 별도 unpublish 단계가 필요 없다.
엣지 캐시(`s-maxage=60, stale-while-revalidate=300`) 때문에 최대 ~5분 잔상이 있으나
보안 경계가 아니다.

### 7. 재가입은 가능하다

`users.email`이 UNIQUE지만 하드 삭제 후 이메일이 해제된다. `auth_tokens`도 캐스케이드로
지워지므로 낡은 인증·재설정 상태가 막지 않는다. 새 UUID로 시작하고 이메일 인증도 처음부터다.

## 알려진 한계 (의도적)

- **GitHub 등 외부 deploy 산출물은 정리하지 않는다.** `repo_url`이 남은 프로젝트는 고아가 된다.
  이는 **기존 프로젝트 단건 삭제도 마찬가지**이며 계정 삭제가 새로 만든 문제가 아니다.
  라우트에 `TODO(#221)`와 개수 로깅을 남겼다. best-effort 비동기 정리를 붙이더라도
  **응답을 막거나 삭제를 롤백해서는 안 된다.**
- **UI 미구현.** API만 배선했다. 설정 화면의 내보내기 버튼·삭제 확인 다이얼로그는 후속.
- `user_daily_limits`는 내보내기에서 제외했다(사용자 가치 낮음). 삭제는 한다.
