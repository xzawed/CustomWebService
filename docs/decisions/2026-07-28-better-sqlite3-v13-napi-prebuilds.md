# better-sqlite3 v13 상향 — N-API 프리빌트 전환 및 빌드 툴체인 제거 (2026-07-28)

> **언제 읽나**: pnpm.onlyBuiltDependencies(빈 배열 유지), better-sqlite3 메이저 상향, Dockerfile 네이티브 빌드 툴체인(g++/make/python3)을 손댈 때 — 키 삭제 시 pnpm 9에서 node-gyp 가 되살아남

## 상태

승인됨 — 구현 완료

## 배경

Dependabot PR #191이 `better-sqlite3` 12.11.1 → 13.0.1(**major**) 상향을 제안했다.
프로덕션 DB 계층의 네이티브 모듈 major 상향이므로
[의존성 보안 일괄 상향](2026-07-28-dependency-security-updates.md)과 분리해 독립 검증했다.

v13.0.0의 핵심 변화는 **N-API 전환**이다.

| | v12.11.1 | v13.0.1 |
|---|---|---|
| 바인딩 | nan/네이티브 ABI + `bindings` | **N-API** (`node-addon-api`) |
| 바이너리 조달 | `install: prebuild-install \|\| node-gyp rebuild` (설치 시 다운로드) | **패키지에 프리빌트 동봉** (`prebuilds/*.node`) |
| 의존성 | `bindings`, `prebuild-install` | `node-addon-api` |
| engines | `20.x \|\| 22.x \|\| ...` | `>=22` |

## 문제 — Dependabot PR 그대로는 불완전했다

`better-sqlite3` v13은 프리빌트를 동봉하면서도 소스 빌드용 `binding.gyp`를 함께 배포한다.
npm/pnpm은 **`binding.gyp`가 있고 `install` 스크립트가 없으면 암묵적으로 `node-gyp rebuild`를 실행**한다.

본 저장소는 `pnpm.onlyBuiltDependencies: ["better-sqlite3"]`로 이 패키지의 빌드 스크립트를
**명시적으로 허용**하고 있었다(v12에서는 `prebuild-install`이 동작하려면 필요했다).
그 결과 v13에서는 동봉된 프리빌트를 두고 암묵적 `node-gyp rebuild`가 실행된다.

업스트림도 이 상황을 인지하고 `binding.gyp`에 단락(short-circuit)을 넣어 두었다.

```gyp
# npm's implicit node-gyp rebuild should do nothing when the package
# contains a prebuild for the host. Explicit build scripts override this.
'prebuild_exists%': '<!(node lib/binding.js)',
```

그러나 **Windows에서는 이 단락에 도달하기 전에 node-gyp의 configure 단계가 Visual Studio를 찾다가
실패**한다. 실제로 `pnpm install`이 다음과 같이 깨졌다.

```
gyp ERR! stack at VisualStudioFinder.findVisualStudio
gyp ERR! not ok
 ELIFECYCLE  Command failed with exit code 1
```

즉 Dependabot PR을 그대로 머지하면 **Windows 개발 환경의 `pnpm install`이 깨지고**,
Linux에서도 불필요한 소스 컴파일이 발생한다.

## 결정

### 1. `pnpm.onlyBuiltDependencies`를 빈 배열로

```json
"onlyBuiltDependencies": []
```

v13은 빌드 스크립트가 필요 없다(프리빌트 동봉). 허용 목록을 비우면 암묵적 `node-gyp rebuild`가
아예 실행되지 않고, `lib/binding.js`의 `getBinding()`이 `prebuilds/<platform>-<arch>.node`를
직접 로드한다. musl 판별도 내장돼 있다.

```js
function isLinuxMusl() {
  return process.platform === 'linux' && !process.report.getReport().header.glibcVersionRuntime;
}
```

> **키를 삭제하지 않고 빈 배열로 남긴 이유**: pnpm 9는 이 키가 없으면 모든 빌드 스크립트를
> 실행한다(pnpm 10은 기본 차단). CI와 Dockerfile이 `pnpm@9`를 쓰므로, 삭제하면 CI/Docker에서만
> 암묵적 `node-gyp rebuild`가 되살아난다. **빈 배열이 두 버전 모두에서 "아무것도 빌드하지 않음"을
> 보장하는 유일한 표기다.**

### 2. Dockerfile 빌드 툴체인 제거

```diff
-# better-sqlite3 네이티브 모듈 빌드 도구 (musl alpine에 프리빌트가 없으면 소스 컴파일).
-RUN apk add --no-cache g++ make python3
```

빌드 허용 목록이 비었으므로 `node-gyp`는 **어떤 경우에도 실행되지 않는다** — 툴체인은 도달 불가능한
죽은 설정이 됐다. 복원 방법을 주석으로 남겼다.

### 3. Next.js standalone 추적 (nft) 확인

v12는 `bindings` 패키지가 런타임에 경로를 탐색해 번들러가 추적하기 어려웠다.
v13은 **플랫폼별 정적 require 진입 모듈**을 함께 배포해 이 문제를 해결한다.

```js
// lib/linuxmusl-x64.js
const Database = require('./database')(() => require('../prebuilds/linuxmusl-x64.node'), false);
```

`.next/standalone` 출력에 `lib/{linux,linuxmusl,darwin,win32}-{x64,arm64}.js`와 호스트 플랫폼
프리빌트가 모두 포함됨을 확인했다. `next.config.ts`의
`serverExternalPackages: ['playwright-core', 'better-sqlite3']` 설정은 그대로 유효하다.

## 검증

### 애플리케이션이 실제로 쓰는 API 스모크

CLAUDE.md에 기록된 핵심 사용 패턴을 직접 확인했다.

| 패턴 | 사용처 | 결과 |
|------|--------|------|
| `pragma('journal_mode = WAL')` · `foreign_keys` | `connection.ts` | OK |
| 동기 트랜잭션 + `UPDATE ... WHERE count < limit RETURNING` | 레이트리밋 원자적 카운터 | OK |
| `db.backup()` 온라인 덤프 | `backup.ts` 주기 백업 | OK (function) |
| SQLite 버전 | — | 3.53.3 |

### Alpine(musl) 프리빌트 — 실제 Docker 빌드로 확인

빌드 툴체인을 **의도적으로 설치하지 않은** `node:22-alpine` + `pnpm@9` 환경에서 검증했다.

```
LOADED NATIVE: /app/node_modules/.pnpm/better-sqlite3@13.0.1/node_modules/
               better-sqlite3/prebuilds/linuxmusl-x64.node
ATOMIC RETURNING: {"c":1}
backup fn: function
SQLITE: 3.53.3
=== ALPINE MUSL PREBUILD OK (no build toolchain installed) ===
```

컴파일러 없이 `pnpm install --frozen-lockfile`이 성공하고 musl 프리빌트가 로드됨을 확인했다.
`onlyBuiltDependencies: []`가 **pnpm 9에서도** 스크립트를 차단한다는 점이 함께 입증됐다.

### 전체 파이프라인

| 항목 | 결과 |
|------|------|
| `pnpm lint` | 0 errors |
| `pnpm type-check` | 통과 |
| `pnpm test` | **166 파일 / 2022 테스트 전부 통과** |
| `pnpm build` | 통과 |
| `pnpm audit --prod` | 취약점 0건 |
| standalone 부팅 → 마이그레이션 → 백업 스케줄러 → `/api/v1/health` | **200 OK** |
| 전체 `docker build` | 통과 |

## 영향 및 롤백

- **DB 파일 포맷 변경 없음** — SQLite 파일은 그대로 호환된다. 데이터 마이그레이션 불필요
- 롤백은 `better-sqlite3`를 `^12.11.1`로 되돌리고 `onlyBuiltDependencies: ["better-sqlite3"]`와
  Dockerfile의 `apk add --no-cache g++ make python3`를 **함께** 복원해야 한다
  (셋은 한 세트다 — 하나만 되돌리면 v12의 `prebuild-install`이 동작하지 않는다)

## 관련 문서

- [의존성 보안 일괄 상향 및 감사 게이트 2단계화 ADR](2026-07-28-dependency-security-updates.md)
- [SQLite 컷오버 ADR (P8.2)](2026-06-23-sqlite-cutover-and-supabase-removal.md)
