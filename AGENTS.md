# 에이전트 지침 (CustomWebService)

> **단일 진실 원본은 [CLAUDE.md](./CLAUDE.md)다.** 그 파일을 읽고 따를 것.
> **이 파일을 두 번째 규칙서로 취급하지 말 것.**

## 왜 이 파일이 짧은가 — 다시 늘리지 말 것

2026-08-01까지 이 파일은 CLAUDE.md의 **83% 복사본**이었다. 그런데 갱신은 **7회 대 112회**로
따라가지 못했고, 그 결과 **틀린 사실을 단언하는 문서**가 되어 있었다:

| 이 파일이 말하던 것 | 실제 |
|---|---|
| `Auth: Credentials 단일 관리자 — 셀프호스트 단일 사용자` | **공개 셀프서비스 회원가입 + 다중 사용자** (2026-06-24 전환) |
| `Form: React Hook Form + Zod` | **React 로컬 `useState`** + Zod(서버 검증). RHF 미사용 |
| `AI: claude-opus-4-7 기본` | **`claude-opus-5`** |
| `pnpm catalog:healthcheck` / `pnpm keys:verify` | **스크립트도 대상 파일도 없다** (SQLite 컷오버로 제거) |

동시에 최근 추가된 안전 불변조건(프록시 캐시 키 신원, `cascadeDeleteUser`, DB 생성 락,
생성 상태 터미널 래치 등)은 **하나도 반영되지 않았다.**

**규칙을 모르는 에이전트보다 틀린 규칙을 아는 에이전트가 더 위험하다.**
규칙서를 둘로 두면 반드시 한쪽이 썩는다 — 그래서 포인터로만 남긴다. **내용을 다시 채우지 말 것.**

## 관련 코드를 건드리기 전에 반드시 열 것

| 대상 | 문서 |
|---|---|
| **보안·데이터 불변조건** (인증·프록시·삭제·생성 락·레이트리밋·WAL) | [docs/architecture/system-spec.md](docs/architecture/system-spec.md) |
| 코드 생성·재생성 작업 | [docs/guides/qc-process.md](docs/guides/qc-process.md) · [docs/architecture/ai-pipeline.md](docs/architecture/ai-pipeline.md) |
| 운영·장애 대응·복구 | [docs/guides/operations.md](docs/guides/operations.md) · [docs/guides/sqlite-restore-runbook.md](docs/guides/sqlite-restore-runbook.md) |
| 테스트 현황·공백 | [docs/reference/test-coverage-map.md](docs/reference/test-coverage-map.md) |
| 잔여작업 지도 | [docs/superpowers/plans/2026-07-31-project-wbs.md](docs/superpowers/plans/2026-07-31-project-wbs.md) |

## 스택 요약

Next.js App Router · TypeScript strict · 임베디드 SQLite(better-sqlite3 + drizzle) ·
Auth.js v5 **다중 사용자** · Claude API · pnpm · Railway 단일 인스턴스.

정확한 버전·기본 모델·환경변수는 CLAUDE.md와 [env-vars.md](docs/reference/env-vars.md)를 볼 것.
**여기에 옮겨 적지 말 것** — 그게 이 파일이 썩은 이유다.

## 명령

```bash
pnpm lint          # CI 게이트
pnpm type-check    # CI 게이트
pnpm test
pnpm build
```

전체 목록과 주의사항은 CLAUDE.md에 있다.

## 충돌 시 우선순위

**CLAUDE.md + system-spec.md → 코드·테스트 → 그 외 문서.**
문서끼리 어긋나면 **코드를 정본**으로 삼고, 어긋난 문서를 같은 커밋에서 고칠 것.
