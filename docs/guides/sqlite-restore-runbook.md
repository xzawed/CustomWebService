# SQLite 복구 런북

> **목적**: `/data/app.db`가 손상·오염됐을 때 백업으로 되돌리는 검증된 수순.
> 대상: 논리 손상, 잘못된 마이그레이션, 실수 삭제. **볼륨 자체 손실은 이 런북 범위 밖**(아래 "한계" 참조).
>
> 관련: [#222](https://github.com/xzawed/CustomWebService/issues/222) · 백업 구현 [`src/lib/db/sqlite/backup.ts`](../../src/lib/db/sqlite/backup.ts)
> 컷오버 런북([sqlite-cutover-runbook.md](sqlite-cutover-runbook.md))은 **SQLite로 옮기는** 절차이지 되돌리는 절차가 아니다.

---

## ⛔ 시작 전에 반드시 읽을 것 — 이 서비스의 WAL은 특수하다

**프로덕션 실측(2026-07-30)**:

| 파일 | 크기 | 내용 |
|---|---|---|
| `/data/app.db` | **4096B** | **테이블 0개.** 헤더 1페이지뿐 |
| `/data/app.db-wal` | **1.3MB** | **실데이터 전부** |
| `/data/backups/app-*.db` | 417KB | 12테이블 전부 + 데이터 |

장기 실행 프로세스가 체크포인트를 거의 하지 않아 **데이터가 WAL에 누적**되어 있다.

이 때문에 두 가지 실수가 각각 치명적이다:

| 실수 | 결과 |
|---|---|
| **WAL만 지우고 app.db는 그대로 둔다** | **DB 전체 소실.** app.db에는 테이블조차 없다 |
| **백업본으로 app.db만 덮어쓰고 WAL을 남긴다** | **복구가 조용히 무효화된다.** 남아 있던 WAL이 복구본 위로 재생되어 손상 상태로 되돌아가고, `PRAGMA integrity_check`는 여전히 `ok`라고 답한다 (실측 확인) |

**따라서 app.db 교체와 WAL/SHM 제거는 반드시 한 세트로, 앱이 정지된 상태에서 수행한다.**

---

## 실측으로 확인된 전제 (2026-07-30 리허설)

| 질문 | 실측 결과 |
|---|---|
| `.backup()`이 미체크포인트 WAL 데이터를 담는가 | **담는다.** WAL에만 있던 100행이 백업본에 모두 존재. 백업본은 자기완결 파일 |
| 정상 종료(`close()`) 후 WAL/SHM은 | **자동 체크포인트 후 삭제된다.** 정상 정지했다면 WAL 파일이 없는 것이 정상 |
| 크래시로 남은 WAL + 백업본 조합은 | **WAL이 재생되어 복구가 무효화된다.** `integrity_check`는 `ok` — 성공한 것처럼 보이는 실패 |
| 올바른 절차(WAL/SHM 삭제 + 교체) 후 | 백업 시점 상태 정확히 복원, `integrity_check: ok`, `foreign_key_check` 위반 0 |
| 구버전 백업(0003 이전) + 현재 코드 | **마이그레이션이 자동 적용된다.** `suggestion_count`가 `DEFAULT 0`으로 추가되고 **기존 `generation_count`/`deploy_count` 값은 보존**된다. `integrity_check: ok`, FK 위반 0 |
| 복구본에 `bootstrapSqlite`가 하는 일 | `runSqliteMigrations` → `seedCatalog`(**빈 테이블일 때만**) → `seedFeatureFlags` → `ensureCatalogEntries`(멱등). 데이터가 있는 복구본이면 재시드는 건너뛰고 카탈로그 신규/정정만 반영 |

---

## 사전 준비

```bash
railway link            # 프로젝트 연결 확인
railway ssh "ls -la /data /data/backups"
```

확인할 것:

- `/data/backups/app-YYYYMMDD-HHmmss.db`가 존재하고 **크기가 0이 아닐 것**
- 되돌릴 시점의 백업 파일명을 확정할 것 (파일명이 곧 시간순 정렬)

> 백업은 부팅 시 즉시 1회 + `SQLITE_BACKUP_INTERVAL_MS`(기본 24h) 주기로 생성된다.
> **배포할 때마다 새 백업이 생긴다** — 백업 목록의 시각이 대체로 배포 시각이다.

### 복구 대상 백업을 먼저 검증한다 (손상된 백업으로 되돌리는 사고 방지)

```bash
railway ssh "node -e \"
const D=require('/app/node_modules/.pnpm/better-sqlite3@13.0.1/node_modules/better-sqlite3');
const b=new D('/data/backups/<파일명>', {readonly:true});
console.log('integrity:', b.pragma('integrity_check',{simple:true}));
for (const t of ['users','projects','generated_codes','api_catalog','platform_events'])
  console.log(t, b.prepare('SELECT COUNT(*) c FROM '+t).get().c);
b.close();
\""
```

`integrity: ok`가 아니거나 행 수가 비정상이면 **그 백업은 쓰지 않는다.** 이전 백업으로 내려간다.

> 경로의 `better-sqlite3@13.0.1`은 버전이 올라가면 바뀐다. 다음으로 찾는다:
> `railway ssh "find /app -maxdepth 5 -type d -name better-sqlite3"`

---

## 복구 절차

### 1) 사고 상태 보존 (되돌릴 수 있게)

**아무것도 지우기 전에** 현재 상태를 통째로 옆에 둔다. 복구가 잘못돼도 되돌아올 수 있어야 한다.

```bash
railway ssh "
  TS=\$(date +%Y%m%d-%H%M%S)
  mkdir -p /data/incident-\$TS
  cp -a /data/app.db      /data/incident-\$TS/ 2>/dev/null
  cp -a /data/app.db-wal  /data/incident-\$TS/ 2>/dev/null
  cp -a /data/app.db-shm  /data/incident-\$TS/ 2>/dev/null
  ls -la /data/incident-\$TS
  echo INCIDENT_DIR=/data/incident-\$TS
"
```

`INCIDENT_DIR` 값을 기록해 둔다.

> **`cp`이지 `mv`가 아니다** — 앱이 아직 살아 있는 상태에서 원본을 옮기면 열린 fd와 어긋난다.

### 2) 파일 교체 (앱이 도는 중에 `mv`로 inode 치환)

Railway는 컨테이너 밖에서 "정지 → 작업 → 기동"을 시킬 방법이 없다(`railway ssh`는 도는 컨테이너 안에서만 열린다).
그래서 **inode를 갈아끼우고 재시작으로 확정**한다. 실행 중 프로세스는 unlink된 옛 inode를 계속 붙들고 있으므로
파일이 깨지지 않는다.

```bash
railway ssh "
  BK=/data/backups/<검증한 백업 파일명>
  test -s \$BK || { echo 'ABORT: 백업 파일 없음/빈 파일'; exit 1; }

  # 옛 inode를 밀어내고(unlink) 새 파일을 같은 이름으로 놓는다
  mv /data/app.db      /data/app.db.old      2>/dev/null || true
  mv /data/app.db-wal  /data/app.db-wal.old  2>/dev/null || true
  mv /data/app.db-shm  /data/app.db-shm.old  2>/dev/null || true

  cp \$BK /data/app.db
  chown nextjs:nodejs /data/app.db

  ls -la /data
  echo '--- WAL/SHM이 없어야 정상 ---'
"
```

**여기서 `app.db-wal`·`app.db-shm`이 남아 있으면 절대 재시작하지 말 것.** 남은 WAL이 복구본 위로 재생된다.

### 3) 재시작으로 확정

```bash
railway deployment list --json | head -20     # 현재 배포 id 확인
railway redeploy                              # 또는 대시보드에서 Restart
```

재시작하면 컨테이너가 새 `/data/app.db`를 열고, `instrumentation.register()`가
`bootstrapSqlite`(마이그레이션 → 시드 → ensureCatalog)를 수행한다.

배포 상태 판별은 [CLAUDE.md의 "Railway 배포 상태 판별"](../../CLAUDE.md) 절을 따른다
(신규 커밋이 아니면 `WAITING`이 길게 이어질 수 있다).

### 4) 검증 — 무엇을 보고 "성공"이라 하는가

아래 **넷을 모두** 통과해야 성공이다. 하나라도 어긋나면 6)으로 롤백한다.

```bash
# (a) 헬스체크
curl -s -o /dev/null -w "health %{http_code}\n" https://xzawed.xyz/api/v1/health   # 200

# (b) 무결성 + FK
railway ssh "node -e \"
const D=require('/app/node_modules/.pnpm/better-sqlite3@13.0.1/node_modules/better-sqlite3');
const d=new D('/data/app.db',{readonly:true});
console.log('integrity:', d.pragma('integrity_check',{simple:true}));
console.log('fk_violations:', d.prepare('PRAGMA foreign_key_check').all().length);
d.close();\""

# (c) 행 수가 백업본과 일치하는가 (사전 검증 때 적어 둔 값과 대조)
railway ssh "node -e \"
const D=require('/app/node_modules/.pnpm/better-sqlite3@13.0.1/node_modules/better-sqlite3');
const d=new D('/data/app.db',{readonly:true});
for (const t of ['users','projects','generated_codes','api_catalog','platform_events'])
  console.log(t, d.prepare('SELECT COUNT(*) c FROM '+t).get().c);
d.close();\""

# (d) 실제 로그인 + 대시보드 조회가 되는가 (읽기 경로 end-to-end)
```

| 신호 | 기대값 |
|---|---|
| `/api/v1/health` | **200** |
| `integrity_check` | **ok** |
| `foreign_key_check` | **0행** |
| `api_catalog` | **61행** (시드 기준) — 0이면 빈 DB를 복구한 것이다 |
| `users`/`projects` | 백업 검증 때 적어 둔 수치와 **동일** |
| 로그인 → 대시보드 | 정상 |

> `integrity_check: ok`만으로 성공을 판정하지 말 것 — **잘못된 WAL이 재생된 경우에도 `ok`가 나온다.**
> 행 수 대조가 실제 판정 기준이다.

### 5) 정리 (검증 통과 후에만)

```bash
railway ssh "rm -f /data/app.db.old /data/app.db-wal.old /data/app.db-shm.old"
```

`/data/incident-*`는 **원인 분석이 끝날 때까지 남긴다.**

### 6) 롤백 (복구가 잘못됐을 때)

```bash
railway ssh "
  INC=/data/incident-<타임스탬프>
  mv /data/app.db     /data/app.db.failed-restore 2>/dev/null || true
  rm -f /data/app.db-wal /data/app.db-shm
  cp -a \$INC/app.db     /data/app.db
  cp -a \$INC/app.db-wal /data/app.db-wal 2>/dev/null || true
  cp -a \$INC/app.db-shm /data/app.db-shm 2>/dev/null || true
  chown nextjs:nodejs /data/app.db /data/app.db-wal /data/app.db-shm 2>/dev/null || true
  ls -la /data
"
railway redeploy
```

**app.db와 WAL/SHM은 반드시 같은 시점 세트로 되돌린다.** 섞으면 위의 "조용한 무효화"가 재현된다.

---

## 자주 하는 오해

| 오해 | 사실 |
|---|---|
| "WAL은 캐시니까 지워도 된다" | **이 서비스에서는 데이터 본체다.** app.db 단독으로는 테이블조차 없다 |
| "`integrity_check`가 ok면 복구 성공" | 남의 WAL이 재생된 상태에서도 `ok`가 나온다. **행 수를 대조할 것** |
| "오래된 백업은 스키마가 안 맞아 못 쓴다" | 부팅 시 마이그레이션이 자동 적용된다(실측). 기존 카운터 값도 보존된다 |
| "백업이 있으니 볼륨이 날아가도 된다" | 백업은 **같은 볼륨**(`/data/backups`)에 있다. 볼륨 손실 = 백업 동반 손실 |
| "복구하면 카탈로그가 초기화된다" | `seedCatalog`는 **빈 테이블일 때만** 동작한다. 데이터가 있으면 건너뛴다 |

---

## 한계 (의도적으로 다루지 않는 것)

- **볼륨 자체 손실은 이 런북으로 복구할 수 없다.** `/data/backups`가 `/data`와 같은 볼륨이라 함께 사라진다.
  오프-볼륨 DR(Railway 볼륨 스냅샷, Litestream→S3 등)은 별도 과제다.
- **자동 복구 API를 만들지 않았다.** 복구는 판단이 필요한 작업이고, 자동화하면 잘못된 시점으로
  되돌리는 사고가 더 쉬워진다.
- **다중 인스턴스 전제 없음.** 단일 인스턴스 + 단일 볼륨을 가정한다.

---

## 리허설 기록

| 일자 | 환경 | 결과 |
|---|---|---|
| 2026-07-30 | 로컬 (better-sqlite3 13.0.1, Node 24) | 위 "실측으로 확인된 전제" 6항목 전부 확인. 크래시 WAL 재생으로 복구가 무효화되는 것과 구버전 백업 마이그레이션 자동 적용을 포함 |
| 2026-07-30 | 프로덕션 (읽기 전용 조사) | `/data` 파일 구성·백업 7개 존재·백업본 무결성 `ok`·app.db 단독 테이블 0개 확인 |
| — | 프로덕션 (쓰기 리허설) | **미수행.** 다운타임이 발생하므로 시간대 합의 후 진행 — 아래 체크리스트 |

> **문서만 쓰고 끝내지 않는다는 것이 이 이슈의 요지다.** 프로덕션 쓰기 리허설을 마치면
> 실제 소요 시간·걸린 지점을 이 표와 본문에 반영할 것.

---

## 프로덕션 쓰기 리허설 실행 체크리스트 (#222 잔여)

> 사용자가 **프로덕션까지 리허설**을 승인했다. 남은 것은 **시간대 합의**뿐이다.
> 다음 세션은 이 체크리스트만 따르면 되고, 절차 자체는 위 "복구 절차"를 그대로 쓴다.

### 착수 전 사용자 확인 필요 ⚠️

| 항목 | 내용 |
|---|---|
| **시간대** | 재시작 다운타임 ~30–60초. 한국 사용자 기준 저트래픽 시간대를 정할 것 |
| **데이터 롤백 범위** | 복구 시점 = 사용할 백업의 시각. **그 이후 쓰기는 되돌아간다.** 백업은 배포마다 + 24h 주기로 생성되므로, 최근 배포 직후라면 손실 폭이 거의 없다 |
| **인플라이트 쓰기** | `mv`와 재시작 사이의 쓰기는 unlink된 옛 inode로 흘러가 유실된다 |

### 손실을 최소화하는 순서

1. **리허설 직전에 배포를 한 번 트리거**한다(예: 무해한 재배포).
   부팅 시 `scheduleBackups`가 즉시 백업을 뜨므로 **가장 최신 시점의 백업**이 생긴다.
2. 그 백업 파일명을 복구 대상으로 쓴다 → 롤백되는 데이터가 사실상 없다.

### 실행

1. [ ] 사전 준비 — `railway ssh "ls -la /data /data/backups"`로 대상 백업 확정
2. [ ] **복구 대상 백업 검증** (`integrity_check` + 행 수 기록) — 이 수치가 4단계 판정 기준이 된다
3. [ ] 1) 사고 상태 보존 → `INCIDENT_DIR` 기록
4. [ ] 2) 파일 교체 — **WAL/SHM이 남아 있으면 재시작 금지**
5. [ ] 3) `railway redeploy`
6. [ ] 4) 검증 4항목 (health 200 / `integrity ok` / FK 0 / **행 수 대조** / 로그인 end-to-end)
7. [ ] 5) 정리 (`.old` 삭제, `/data/incident-*`는 보존)
8. [ ] 실제 소요 시간·걸린 지점을 위 "리허설 기록" 표와 본문에 반영
9. [ ] [#222](https://github.com/xzawed/CustomWebService/issues/222) 종료

### 중단 조건

아래 중 하나라도 나오면 **즉시 6) 롤백**으로 간다.

- 2단계에서 대상 백업의 `integrity_check`가 `ok`가 아니거나 행 수가 비정상
- 3단계 후 `app.db-wal`/`app.db-shm`이 남아 있음
- 4단계에서 `api_catalog`가 0행(= 빈 DB를 복구함) 또는 행 수가 백업본과 불일치
- `/api/v1/health`가 200이 아님
