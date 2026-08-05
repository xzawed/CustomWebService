# `DB_PROVIDER` 부팅 게이트 완화 — 미설정을 장애로 취급하지 않는다

> **언제 읽나**: assertSqliteEnv·getSqliteDb, DB_PROVIDER 미설정 처리, 테스트 환경 SQLITE_PATH 강제, 또는 health 의 checks.database 해석을 손댈 때 — health 200 ≠ DB 정상

- 날짜: 2026-08-01
- 상태: 채택
- 관련: WBS C5, [2026-06-23 SQLite 컷오버 ADR](2026-06-23-sqlite-cutover-and-supabase-removal.md)

## 배경

`getSqliteDb()`는 `process.env.DB_PROVIDER !== 'sqlite'`이면 throw했다. 이중 스택
(supabase/postgres/sqlite) 시절의 스위치인데, 2026-06-23 컷오버로 **분기할 대상이 사라진 뒤에도
문자열 검사만 남아** 있었다.

문제는 이게 **단일 스택에서 가장 위험한 단일 지점**이었다는 것이다.

- `getSqliteDb()`는 레포 팩토리 9개 전부와 `instrumentation.ts` 부팅 훅이 호출한다
- 폴백할 다른 provider가 없다 — throw는 곧 **전면 장애**다
- env 문자열 하나를 잃으면 그렇게 된다

게다가 문서가 오히려 **반대로** 적혀 있었다. `env-vars.md`가 "`DB_PROVIDER` 분기는 모두 제거됨"이라
단언했고 `.env.example`엔 언급조차 없었는데, `development.md`는 `cp .env.example .env.local`을
안내했다. **문서를 따라 재구축하면 모든 DB 접근이 크래시했다.** 볼륨 손실 시 복구가 사람 손에
달린 서비스에서 이건 치명적이다.

## 검토한 안

| 안 | 미설정 | 잘못된 값 | 판정 |
|---|---|---|---|
| A. 검사 전면 제거 | sqlite | sqlite (조용히) | 오설정을 삼킨다 |
| **B. 미설정 허용 + 잘못된 값 throw** | sqlite | throw | 채택 (아래 조건부) |
| C. 그대로 두고 문서만 수정 | throw | throw | 지뢰 존치 |

A는 오설정을 조용히 넘긴다. C는 문서를 고쳐도 지뢰가 남는다. B를 택했다.

### 다만 B를 그대로 쓰면 안 됐다 — 적대적 검토가 잡은 것

B의 부작용은 **테스트 안전망 상실**이다. 단위 테스트는 `DB_PROVIDER`를 설정하지 않으므로,
지금까지는 실수로 실제(모킹되지 않은) `getSqliteDb()`를 호출하면 **우연히** 게이트가 막아 줬다.
미설정을 허용하면 그 우연이 사라진다.

"경로가 없어 어차피 실패한다"는 반론은 **틀렸다**. 러너 이미지가 `mkdir -p /data`로
**항상 쓰기 가능한 디렉터리를 만든다**(`Dockerfile`). 즉 컨테이너 안에서는 기본 경로가
조용히 열린다.

→ 그래서 우연한 방어를 **명시적 방어로 승격**했다: 테스트 환경에서 `SQLITE_PATH`가 없으면 throw.

## 결정

`assertSqliteEnv()` (`src/lib/db/sqlite/connection.ts`):

| 조건 | 동작 |
|---|---|
| `DB_PROVIDER` 미설정·빈 문자열 | sqlite로 연결 + **경고 1회**(`logger.warn`) |
| `DB_PROVIDER='sqlite'` | 정상 |
| 그 외 값 | **throw** (값을 메시지에 담는다) |
| `NODE_ENV==='test'` + `SQLITE_PATH` 미설정 | **throw** — 실제 파일 DB 사고 방지 |

경고를 남기는 이유: 미설정으로도 동작하지만 **의도한 상태는 아니다.** 조용히 넘기면
"왜 기본 경로로 떴는지" 알 방법이 없다.

## 수용한 잔여 위험 (숨기지 않는다)

**볼륨 미마운트 + `DB_PROVIDER` 미설정이 겹치면** 빈 임시 DB로 떠서 정상처럼 보인다.
이전에는 이 이중 결함이 throw로 막혔다.

다만 **볼륨만 사라진 경우(env 정상)는 이전에도 막지 못했다** — 이미지가 `/data`를 만들기 때문에
`bootstrapSqlite`가 새 DB에 마이그레이션·시드를 돌리고 뜬다. 즉 이 fail-open은 원래 있었고,
이번 변경은 조합 하나를 추가했을 뿐이다. 단일 결함(env만 상실, 볼륨 정상)이 훨씬 흔하고
그쪽을 고치는 이득이 크다고 판단했다.

> **관련해 별개로 확인된 사실**: 공개 `GET /api/v1/health`는 **DB를 전혀 건드리지 않고**
> `{status:'ok'}`를 반환한다(`health/route.ts`). Railway 헬스체크가 이 경로이므로
> **"배포 성공 + health 200"은 DB가 올바르다는 증거가 아니다.** DB를 실제로 확인하려면
> `?detailed=true` + `ADMIN_API_KEY`로 `checks.database`를 봐야 한다. 이 사실은 이번 변경과
> 무관하게 원래 성립한다.

## 검증 (실측)

| 검증 | 결과 |
|---|---|
| 단위 — 미설정·빈 문자열·잘못된 값·테스트 경로 누락 4분기 | 통과 (`connection.test.ts`) |
| 전체 스위트 (env 둘 다 비운 셸) | **186파일 / 2295테스트 통과** |
| standalone 부팅, `DB_PROVIDER` **미설정** | 기동 + `checks.database: ok` + 경고 로그 확인 |
| 같은 DB로 **재부팅** 시 기존 데이터 보존 | 마커 사용자 1명 → `totalUsers: 1` 유지 |
| standalone, `DB_PROVIDER=postgres` | **서버가 뜨지 않는다** — 아래 상세 |

`pnpm build` 통과는 이 변경의 증거가 되지 못한다(빌드는 DB를 열지 않는다). 그래서
**상세 health로 DB 실접근**까지 확인했다.

### 잘못된 값일 때 무슨 일이 일어나는가 (기전을 정확히)

health 라우트는 DB 예외를 **catch해서 200 + `status:'unhealthy'`**를 반환한다
(`health/route.ts` — 500이 아니다). 하지만 실측하면 **공개 health까지 500**이다.
이유는 라우트가 아니라 부팅이다:

```
Failed to prepare server Error: An error occurred while loading instrumentation hook:
DB_PROVIDER="postgres"는 지원하지 않습니다. ...
```

`instrumentation.ts`의 `register()`가 throw하면 **Next가 서버 준비 자체에 실패**해 모든 요청이
500이 된다. 요청이 라우트에 도달하지 못하므로 catch도 관여하지 않는다.

**이게 원하는 성질이다**: 오설정은 조용히 degraded로 뜨는 게 아니라 **아예 뜨지 않는다** →
Railway 헬스체크(공개 경로)가 잡아내 배포가 실패한다. 볼륨 손실은 이 성질을 갖지 못한다는 점과
대비된다(아래 잔여 위험 절).

### 마커 테스트가 증명하는 범위 (과장하지 않는다)

프로브는 `SQLITE_PATH`를 명시했다. 따라서 이 테스트가 증명하는 것은
**"`DB_PROVIDER` 미설정이 경로 선택이나 기존 DB 재사용을 바꾸지 않는다"**이지,
"기본 경로 `/data/app.db`가 올바르게 잡힌다"가 아니다. 경로는 provider와 무관하게
언제나 `getSqlitePath()`가 정한다.

## 결과

- env 문자열 하나를 잃어도 서비스가 죽지 않는다
- 오설정(`postgres` 등)은 여전히 값과 함께 즉시 드러난다
- 테스트가 실제 파일 DB를 여는 사고는 **우연이 아니라 명시적 가드**로 막힌다
- Railway의 `DB_PROVIDER=sqlite`는 **그대로 둔다** — 코드 기본값과 env 정리를 같은 변경에 묶지 않는다
