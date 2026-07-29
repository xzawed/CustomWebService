# 계정 삭제 · 데이터 내보내기 (#221)

- 작성: 2026-07-30
- 상태: 계획 (착수 전)
- 이슈: [#221](https://github.com/xzawed/CustomWebService/issues/221)

> 이 문서는 **다음 작업 세션의 착수점**이다. 구현은 포함하지 않는다.

## 문제

공개 셀프서비스 가입 서비스인데 **사용자가 계정을 삭제할 방법이 없다.**
`src/app/api/v1/auth/` 아래에 `DELETE` 라우트가 없다(signup·verify·resend·forgot·reset·status만).

`SqliteUserRepository.delete()`는 **존재하지만 어디서도 호출되지 않는다.**

## 그냥 호출하면 안 되는 이유 — #214와 같은 종류의 문제

`users.id`를 참조하는 FK가 여럿이고 대부분 `NOT NULL`이다.

| 테이블 | `user_id` | 처리 방침(제안) |
|---|---|---|
| `projects` | NOT NULL | 연쇄 삭제 (`SqliteProjectRepository.delete` 재사용) |
| `user_api_keys` | NOT NULL | 삭제 |
| `auth_tokens` | NOT NULL | 삭제 |
| `user_daily_limits` | NOT NULL | 삭제 |
| `platform_events` | **nullable** | `user_id`만 NULL로 분리 — #214의 결정을 재사용 |

FK는 `ON DELETE NO ACTION`이므로 자식 정리 없이 지우면 **FK 위반 500**이다.
#214에서 이미 겪은 실패다.

## 작업 순서 — 내보내기를 먼저

**삭제 전에 내보낼 수단이 없으면 사용자는 데이터를 잃는다.** 순서를 지킬 것.

### 1. 내보내기 (`GET /api/v1/auth/export`)

프로젝트 메타 + 생성 코드 + `preferences`를 JSON으로. 스트리밍 여부는 프로젝트 수 상한(`MAX_PROJECTS_PER_USER` 20)을 보면 불필요할 가능성이 높다.

### 2. 계정 삭제 (`DELETE /api/v1/auth/account`)

- 자식 정리를 **단일 트랜잭션**으로 — `SqliteProjectRepository.delete`(#214)의 패턴을 그대로 따른다
- 게시된 프로젝트는 삭제 전에 unpublish (서브도메인이 죽은 프로젝트를 가리키면 안 됨)
- 재인증 요구 여부 결정 (비밀번호 재입력)

## 설계 결정이 필요한 지점 — 사용자 판단 필요 ⚠️

1. **`platform_events` payload의 개인정보.** #214에서는 `user_id`만 NULL로 끊고 행은 보존했다.
   그런데 계정 삭제는 성격이 다르다 — payload에 이메일 등이 남아 있으면 "삭제했다"고 말하기 어렵다.
   **감사 로그 보존 vs 삭제 요청 이행**의 트레이드오프. 근거를 ADR에 기록할 것.
2. **게시 사이트**: 연쇄 unpublish/삭제인가, 사용자에게 사전 정리를 요구하는가.
3. **재가입**: `users.email`이 UNIQUE다. 삭제 후 같은 이메일로 재가입이 가능해야 하는가.

## 완료 판정

- [ ] 내보내기 라우트 + 테스트
- [ ] 계정 삭제 라우트 + 단일 트랜잭션 자식 정리 + 테스트
- [ ] `platform_events` 처리 방침 결정 및 ADR 기록
- [ ] 게시 사이트 처리 방침 결정
- [ ] **실환경 검증** — 단위 테스트만으로 종결하지 않는다
- [ ] 삭제 후 재가입 동작 확인
- [ ] 검증용 계정(`xzawed31+p197@gmail.com`) 정리 — 증상이지 원인은 아님

## 참고

- [#214](https://github.com/xzawed/CustomWebService/issues/214) — 같은 종류의 FK 캐스케이드 문제와 해법
- `src/repositories/sqlite/SqliteProjectRepository.ts` — 따라야 할 트랜잭션 패턴
