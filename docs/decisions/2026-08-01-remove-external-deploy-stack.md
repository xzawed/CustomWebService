# 외부 배포 스택 제거 (GitHub/Railway 사용자 서비스 export)

> **언제 읽나**: deploy 라우트/DeployService 재도입, GITHUB_TOKEN·GITHUB_ORG·RAILWAY_TOKEN 사용, 또는 health checks.deploy 부활을 검토할 때 — 제품 배포는 서브도메인 publish 만

- 날짜: 2026-08-01
- 상태: 채택
- 관련: WBS A1–A5 ([2026-07-31-project-wbs.md](../superpowers/plans/2026-07-31-project-wbs.md))

## 배경

제품의 실제 배포 스토리는 **게시(publish) → `slug.xzawed.xyz`** 다.
`middleware.ts`가 Host를 감지해 `/site/[slug]`로 rewrite하고, 생성 HTML/CSS/JS를 서브도메인으로 서빙한다.
`ProjectStatus` 주석도 이미 이 피벗을 기록하고 있다:

- `'deploying'` — 기존 Railway 배포 이력 호환용 (S6에서 제거 예정)
- `'deployed'` — 기존 호환용 (S6에서 `'published'`로 통합 예정)

이와 별개로 **GitHub org 레포 생성 + Railway/GitHub Pages에 생성물을 push** 하는
“외부 배포(export)” 스택이 코드베이스에 남아 있었다.
UI 호출 경로는 0건이었고, WBS A1은 “존폐 결정 대기”로 묶여 있었다.

## 실측 (제거 근거를 올린 사실)

| 사실 | 의미 |
|------|------|
| 프로덕션 `POST /api/v1/deploy` → **401 (not 404)** | 라우트가 라이브·도달 가능. 인증만 되면 실행 경로에 들어간다 |
| `/api/v1/health?detailed=true` 의 `checks.deploy: "ok"` | `GITHUB_TOKEN`+`GITHUB_ORG` 또는 `RAILWAY_TOKEN`이 **프로덕션에 설정됨** (이전 “미설정” 메모는 오해) |
| `githubService.createRepository()` → `POST {GITHUB_API}/orgs/{org}/repos` | 플랫폼 자격 증명으로 **실제 org 레포를 생성**한다 |
| 계정 삭제 시 외부 레포 미정리 TODO (`auth/account`) | 삭제해도 고아 레포가 남는다 |

즉 이 스택은 “죽은 코드”가 아니라 **자격 증명 기반·사이드이펙트 가능·제품이 호출하지 않는 도달 가능 코드**였다.

## 결정

1. **제품 배포 = 서브도메인 게시만.** 외부 GitHub/Railway export는 제품 범위에서 제외한다.
2. **스택 전체를 코드에서 제거**한다 (라우트·서비스·프로바이더·lib·이벤트 타입·한도 메서드·i18n·health 체크).
3. **DB 컬럼·레거시 status·감사 로그 행은 유지**한다 (마이그레이션/DROP 없음).

## 삭제한 것

- `POST /api/v1/deploy` 라우트 및 통합 테스트
- `DeployService` / `createDeployService` / `src/providers/deploy/**` / `src/lib/deploy/**`
- 배포 전용 rate-limit 메서드: `checkAndIncrementDailyDeployLimit` / `decrementDailyDeployLimit`
- 도메인 이벤트 타입: `DEPLOYMENT_STARTED` / `DEPLOYMENT_COMPLETED` / `DEPLOYMENT_FAILED`
- `deploySchema`, `DeployError`, `maxDeployPerDay` / `MAX_DEPLOY_PER_DAY`
- i18n `deploy.*` 및 `error.deploy` (외부 배포 전용)
- health `checks.deploy` (토큰 유무로 degraded 판정하던 블록)
- 계정 삭제의 외부 레포 고아 TODO 및 `externalDeployHints` 로깅
- vitest `coverage.include`의 deploy 라우트 엔트리

## 유지한 것 (의도적)

| 유지 | 이유 |
|------|------|
| DB `projects.deploy_url` / `deploy_platform` / `repo_url` | DROP COLUMN은 비가역·이득 없음. 컬럼은 불활성이 된다 |
| DB `user_daily_limits.deploy_count` | 스키마 보존. 증가/감소 코드 경로만 제거 |
| 과거 `platform_events` 의 DEPLOYMENT_* 행 | 감사 로그 불변 |
| `ProjectStatus` `'deploying'` / `'deployed'` | 레거시 행 호환; 별도 status 정리 때 처리 |
| publish / unpublish / preview / subdomain 전 경로 | **이것이 제품** |
| generate·suggestion 레이트리밋 및 환불 패턴 | 무관·유지 |
| 프록시 env 블록리스트의 `GITHUB_TOKEN`/`RAILWAY_TOKEN` 문자열 | 비밀 유출 방지용 denylist — 스택 제거와 무관하게 유지 |

## 환경변수 (운영 조치)

코드는 더 이상 `GITHUB_TOKEN` / `GITHUB_ORG` / `RAILWAY_TOKEN` / `MAX_DEPLOY_PER_DAY`를 읽지 않는다.
Railway에 값이 남아 있으면 **삭제해도 된다** (문서: [env-vars.md](../reference/env-vars.md) — removed/unused 표기).
프록시 비밀 denylist 문자열만 남아 있다.

## 복원 방법

```bash
git checkout <sha-before-removal> -- \
  src/app/api/v1/deploy \
  src/__tests__/api/deploy.test.ts \
  src/services/deployService.ts \
  src/services/deployService.test.ts \
  src/providers/deploy \
  src/lib/deploy

# 이후 factory / IRateLimitRepository / events / schemas / features /
# health / i18n / errors / vitest coverage / 문서 배선을 동일 커밋에서 복구
```

공장·health·이벤트 타입 배선을 다시 연결해야 하며, 컬럼/status는 이미 스키마에 남아 있다.

## 결과

- 도달 가능한 자격 증명 사이드이펙트 경로 제거
- 제품 서사(서브도메인 게시)와 코드 일치
- WBS A1 결정 완료, A2–A5는 제거로 해소 (구현·고아 레포 TODO·인메모리 projectMap 모두 코드와 함께 소멸)
