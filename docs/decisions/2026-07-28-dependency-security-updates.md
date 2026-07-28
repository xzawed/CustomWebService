# 의존성 보안 일괄 상향 및 감사 게이트 2단계화 (2026-07-28)

## 상태

승인됨 — 구현 완료

## 배경

Dependabot 보안 알림 **20건**(critical 3 · high 8 · medium 9)이 열려 있었고,
동시에 열려 있던 Dependabot PR **4건이 전부 CI 실패** 상태였다.

실패 원인은 전부 동일했다 — `Lint & Type Check` 잡의 `pnpm audit --audit-level=high`
(PR #186에서 도입한 공급망 게이트).

**게이트가 데드락이었다.** 각 Dependabot PR은 자기 패키지 하나만 올리는데, 감사는
트리 전체를 보므로 *다른* 패키지의 취약점이 남아 있는 한 무조건 실패한다.
즉 보안 업데이트 PR 자신이 보안 게이트에 막혀 하나도 머지될 수 없는 상태였다.

| PR | 내용 | 상태 |
|----|------|------|
| #189 | next-auth beta.31 → beta.32 | Lint & Type Check 실패 |
| #190 | minor-and-patch 그룹 13건 | Lint & Type Check 실패 |
| #191 | better-sqlite3 12 → 13 (major) | Lint & Type Check 실패 |
| #192 | next 16.2.10 → 16.2.11 | Lint & Type Check 실패 |

## 결정

### 1. 개별 PR 대신 통합 상향

`pnpm audit`이 트리 전체를 평가하므로, 취약점을 **한 커밋에서 전부 해소**해야 게이트를 통과한다.
#189 · #190 · #192를 하나의 브랜치로 합치고 전이 취약점까지 함께 처리했다.

| 패키지 | 이전 | 이후 | 해소된 알림 |
|--------|------|------|-------------|
| `next` | ^16.2.10 | ^16.2.12 | 7건 (high 3 · medium 4) |
| `next-auth` | 5.0.0-beta.31 | 5.0.0-beta.32 | 8건 (critical 2 · high 1 · medium 1, manifest 2곳) |
| `@auth/core` | 0.41.2 | 0.41.3 | 3건 — next-auth beta.32가 `0.41.3`을 정확히 고정 |
| `sharp` | 0.34.5 | 0.35.3 | 1건 (high, libvips CVE 4건) |

`better-sqlite3` 12 → 13(#191)은 **의도적으로 제외**했다. 보안 알림과 무관한 네이티브 모듈
major 상향이고, 프로덕션 DB 계층이므로 독립 PR에서 별도 검증한다.

### 2. `sharp`는 override로 상향

`next@16.2.12`는 여전히 `sharp: ^0.34.5`를 optionalDependency로 선언한다 — 상위 상향으로는
0.35.0에 도달할 수 없다. `pnpm.overrides`에 `"sharp": "^0.35.3"`을 추가했다.

sharp 0.35.0은 breaking change를 포함하므로 Next.js 이미지 최적화 경로를 직접 검증했다:

- `next/dist/server/image-optimizer.js`에서 제거된 API(`failOnError` · `paletteBitDepth` · `jp2k`)
  사용 없음 확인 (grep 결과 0건)
- sharp 0.35.3이 next 컨텍스트에서 정상 resolve되고 **libvips 8.18.3**(패치 버전) 로드 및
  인코딩 성공 확인
- Alpine(musl) 프리빌트 `@img/sharp-linuxmusl-x64@0.35.3` 존재 및 lockfile 등재 확인 —
  Dockerfile `node:22-alpine` 빌드에 영향 없음

### 3. `@eslint/eslintrc` 제거 (미사용)

`eslint.config.mjs`는 플랫 config를 직접 구성하며 `FlatCompat`을 쓰지 않는다.
`@eslint/eslintrc`는 **선언만 되어 있고 어디서도 import되지 않는 devDependency**였고,
동시에 `minimatch@3 → brace-expansion@1.1.16` 취약 경로를 하나 더 끌어오고 있었다. 제거했다.

### 4. `brace-expansion`은 스코프 오버라이드로 부분 해소

GHSA-mh99-v99m-4gvg(high, CVSS 7.5)는 두 경로로 유입됐다.

| 경로 | 버전 | 처리 |
|------|------|------|
| `eslint > minimatch > brace-expansion` | 5.0.7 | **수정** — 오버라이드 `"brace-expansion@^5": "^5.0.8"` |
| `eslint-config-next > eslint-plugin-import > minimatch@3 > brace-expansion` | 1.1.16 | 면제 (아래) |

**전역 오버라이드를 쓰지 않은 이유**: `brace-expansion@5`의 CJS 빌드는
`module.exports = expand`가 아니라 named export `{ expand, EXPANSION_MAX, ... }`다.
전역으로 v5를 강제하면 `minimatch@3`의 `require('brace-expansion')(pattern)` 호출이
`expand is not a function`으로 런타임에 깨진다 — 실제로 격리 환경에서 재현 확인했다.
따라서 **v5 계열에만 적용되는 스코프 오버라이드**를 사용한다.

### 5. 감사 게이트 2단계화

데드락의 근본 원인은 "픽스가 존재하지 않는 dev 전용 건이 전체 머지를 영구 차단"하는 구조였다.
게이트를 트리별로 분리했다.

```yaml
# 프로덕션 트리 — 하드 게이트, 면제 없음
- run: pnpm audit --prod --audit-level=high

# 전체 트리(dev 포함) — 검토된 면제 적용
- run: pnpm audit --audit-level=high
```

면제는 `package.json`의 `pnpm.auditConfig.ignoreGhsas`에 등록하고, 근거는
[docs/security/audit-waivers.md](../security/audit-waivers.md)에 기록한다
(JSON에 주석을 달 수 없으므로 문서가 유일한 근거 저장소다).

현재 면제 1건: **GHSA-mh99-v99m-4gvg** — 등록 기준 3가지를 모두 충족한다.
상위 체인이 전부 최신인데도 픽스가 없고(`eslint-plugin-import@2.32.0`(latest) →
`minimatch@3.1.5`(v3 latest) → `brace-expansion@1.1.16`(v1 latest, 패치 릴리스 없음)),
프로덕션 번들에 실리지 않으며(`pnpm audit --prod` 전 심각도 0건),
`pnpm lint` 중 자체 glob 패턴만 확장하므로 공격자 입력이 도달하지 않는다.

## 코드베이스 실제 노출도 분석 (next-auth 4건)

버전 상향으로 전부 해소됐지만, **상향 전 시점에 실제로 악용 가능했는지**를 별도로 확인했다.
결론: 4건 모두 현재 구성에서 악용 불가였다.

| 어드바이저리 | 전제 조건 | 본 서비스 |
|---|---|---|
| GHSA-8fpg-xm3f-6cx3 (critical) — 설정 오류 시 존재 검사 fail-open | `!!auth` / `if (req.auth)` 패턴 | **미해당**. 게이트가 전부 속성 검사다 — `middleware.ts:19`는 `if (session?.user)`, `local-auth.ts`는 `if (!session?.user?.id \|\| !session.user.email)`. 오류 객체 `{ message }`에는 `.user`가 없어 정상적으로 **차단** 방향으로 동작 |
| GHSA-7rqj-j65f-68wh (critical) — 이메일 정규화 homoglyph 우회 | email/magic-link provider 사용 | **미해당**. Credentials provider 단독 |
| GHSA-x445-f3h2-j279 (medium) — OAuth state/nonce/PKCE 쿠키 미바인딩 | 다중 OAuth provider + 로그인 중 계정 연결 | **미해당**. P8.2에서 OAuth 제거됨 |
| GHSA-xmf8-cvqr-rfgj (high) — `getToken()` 미처리 예외 | `getToken()` 직접 호출 | **미해당**. 호출부 0건 (`auth()`만 사용) |

## 검증

로컬에서 전 파이프라인을 실행해 통과를 확인했다.

| 항목 | 결과 |
|------|------|
| `pnpm audit --prod`(전 심각도) | 취약점 **0건** (dependencies 407) |
| `pnpm audit --audit-level=high` | exit 0 (면제 1건 적용) |
| `pnpm lint` | 0 errors (warning 2건 — 기존 이슈) |
| `pnpm type-check` | 통과 |
| `pnpm test` | **166 파일 / 2022 테스트 전부 통과** |
| `pnpm build` | 통과 (Next.js 16.2.12) |
| standalone 부팅 + `/api/v1/health` | **200 OK** |
| sharp 런타임 스모크 | 0.35.3 / libvips 8.18.3, 인코딩 성공 |

> type-check는 최초 실행 시 `.next/dev/types/validator.ts`가 이미 삭제된
> `(auth)/callback/route.ts`(P8.2 OAuth 제거분)를 참조해 실패했다. **로컬 stale 아티팩트**이며
> CI는 fresh checkout이라 무관하다. `.next/dev` 삭제 후 통과.

## 결과

- Dependabot 보안 알림 20건 → **0건**
- Dependabot PR #189 · #190 · #192 → 이 PR로 대체(중복 해소)
- PR #191(better-sqlite3 v13) → main의 감사가 클린해지면 rebase 후 정상 통과 가능

## 관련 문서

- [의존성 감사 면제 목록](../security/audit-waivers.md)
- [보안 인시던트 대응 절차](../security/incident-response.md)
- [보안 감사 발견 항목 수정 ADR (2026-05-23)](2026-05-23-security-audit-findings.md)
