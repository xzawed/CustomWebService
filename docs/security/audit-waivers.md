# 의존성 감사 면제 목록 (Audit Waivers)

> **언제 읽나**: `pnpm audit` 가 CI를 막거나 `package.json` 의 `ignoreGhsas`·`overrides`(`pnpm` 블록)를 손댈 때

CI는 두 단계로 `pnpm audit`을 실행한다 (`.github/workflows/ci.yml` → `lint-and-typecheck` 잡).

| 단계 | 명령 | 성격 |
|------|------|------|
| 1 | `pnpm audit --prod --audit-level=high` | **하드 게이트** — 런타임에 실제로 배포되는 트리. 면제 대상이 여기 등장하면 즉시 조치한다 |
| 2 | `pnpm audit --audit-level=high` | 전체 트리(dev 포함). 등록된 면제가 있으면 여기에 적용된다 — **현재 0건** |

면제는 `package.json`의 `pnpm.auditConfig.ignoreGhsas`에 GHSA ID로 등록한다.
JSON에는 주석을 달 수 없으므로 **근거는 반드시 이 문서에 기록**한다.

## 면제 기준

세 조건을 **모두** 만족할 때만 등록한다.

1. **상위 패키지 최신 버전에도 픽스가 없다** — 버전 상향으로 해결 가능하면 면제가 아니라 상향한다
2. **프로덕션 번들에 실리지 않는다** — devDependency 전용이며 `pnpm audit --prod`가 클린이다
3. **취약 입력이 공격자 통제 하에 있지 않다** — 자체 설정/소스 등 신뢰 입력만 처리한다

---

## 현재 면제 항목

**없다.** `pnpm.auditConfig.ignoreGhsas`는 빈 배열이며, 무면제로 두 게이트가 모두 통과한다
(2026-08-04 실측 — 전체 트리에 남은 것은 moderate 1건(`GHSA-67mh-4wv8-2f99` esbuild)뿐이고
`--audit-level=high` 아래라 게이트에 걸리지 않는다).

> **면제가 0건이라고 이 문서를 지우지 말 것.** 아래 이력이 "왜 면제했다가 왜 풀었는지"를 담고 있고,
> 같은 어드바이저리가 다시 올라올 때 판단 근거가 된다.

---

## 해소된 면제 (이력)

### ~~GHSA-mh99-v99m-4gvg~~ — brace-expansion DoS (high, CVSS 7.5) → ✅ **해소(2026-08-04)**

**해소 방법**: `pnpm.overrides`에 `"brace-expansion@^1": "^1.1.18"`을 추가해 **상향으로 실제 수정**했다.
등록 당시 없던 v1 계열 패치(`1.1.18`)가 릴리스되어 아래 "해소 조건"이 그대로 발동한 것이다.
문서에 적힌 절차대로 **면제를 제거하고 무면제 통과를 확인**했다(`pnpm audit --audit-level=high` exit 0).
트리에서 `brace-expansion@1.1.16`은 완전히 사라졌고 `1.1.18`·`5.0.9`만 남는다.

> **교훈**: 면제 기준 ①(상위 최신 버전에도 픽스 없음)은 **시간이 지나면 저절로 거짓이 된다.**
> 면제는 등록보다 **해제 트리거를 적어 두는 것**이 중요하다 — 이 건은 트리거가 적혀 있었기에
> 새 어드바이저리(`GHSA-rgw5-rvv9-x895`)를 처리하다가 함께 걷어낼 수 있었다.

<details>
<summary>등록 당시 근거 (2026-07-28)</summary>

- **등록일**: 2026-07-28
- **패키지**: `brace-expansion@1.1.16`
- **경로**: `. > eslint-config-next > eslint-plugin-import@2.32.0 > minimatch@3.1.5 > brace-expansion@1.1.16`
- **내용**: 브레이스 확장 길이가 무제한이라 OOM 프로세스 크래시를 유발할 수 있음

**기준 충족 근거**

1. **픽스 부재** — 어드바이저리의 패치 버전은 `>= 5.0.8` 하나뿐이고 v1 계열에는 패치 릴리스가 없다
   (`brace-expansion` dist-tag `maintenance-v1` = `1.1.16` = 취약 버전). 체인 상위도 전부 최신이다:
   `eslint-plugin-import@2.32.0`(latest)이 `minimatch@^3.1.2`를 요구하고, `minimatch@3.1.5`(v3 최신)가
   `brace-expansion@^1.1.7`을 요구한다. 즉 **상향으로 해소 불가**
2. **프로덕션 미포함** — `eslint-config-next`는 devDependency이며 Next.js standalone 출력에 포함되지 않는다.
   `pnpm audit --prod`는 모든 심각도에서 클린(0건)
3. **신뢰 입력만 처리** — `pnpm lint` 실행 중 `eslint.config.mjs`와 import resolver 설정의 자체 glob 패턴만
   확장한다. 네트워크·사용자 입력이 도달하지 않는다

**해소 조건 (재검토 트리거)**

- `eslint-plugin-import`가 `minimatch@9+`로 올라가거나
- `brace-expansion` v1 계열에 패치 릴리스가 나오면

→ 면제를 제거하고 `pnpm audit --audit-level=high`가 무면제로 통과하는지 확인한다.

**부분 해소 이력** — 동일 어드바이저리의 다른 경로(`. > eslint > minimatch > brace-expansion@5.0.7`)는
`pnpm.overrides`의 `"brace-expansion@^5": "^5.0.8"` 스코프 오버라이드로 **실제 수정**했다.
v5 계열에만 적용되므로 minimatch@3이 요구하는 v1 계열은 건드리지 않는다
(v5의 CJS 빌드는 `module.exports = expand`가 아니라 named export `{ expand }`라서,
전역 오버라이드를 걸면 minimatch@3의 `require('brace-expansion')(...)` 호출이 런타임에 깨진다).

</details>

---

## 현재 유지 중인 스코프 오버라이드 (면제 아님 — 실제 수정)

`brace-expansion`은 **메이저 라인별로 따로** 고정한다. 하나로 합치지 말 것.

| 오버라이드 | 대상 경로 | 이유 |
|---|---|---|
| `"brace-expansion@^1": "^1.1.18"` | `eslint-config-next > eslint-plugin-import > minimatch@3` | v1 계열 패치. 2026-08-04 추가 |
| `"brace-expansion@^5": "^5.0.9"` | `eslint > @eslint/config-array > minimatch@10` | v5 계열 패치. 2026-08-04에 `^5.0.8`에서 상향 |

**전역 오버라이드(`"brace-expansion": "^5"`)를 걸면 안 된다** — v5의 CJS 빌드는 named export
`{ expand }`라서 `minimatch@3`의 `require('brace-expansion')(pattern)` 호출이 **런타임에 깨진다**(실증됨).
메이저 스코프를 붙이는 것이 이 함정을 피하는 유일한 방법이다.

---

## 관련 문서

- [보안 인시던트 대응 절차](incident-response.md)
- [2026-07-28 의존성 보안 일괄 상향 ADR](../decisions/2026-07-28-dependency-security-updates.md)
