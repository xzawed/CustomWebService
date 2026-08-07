# Railway 배포 실패 진단 — 조용한 미배포 3종 (2026-08-05·2026-08-06 실측)

> **언제 읽나**: 병합했는데 프로덕션에 반영이 안 될 때, Railway 배포가 `FAILED`/`SKIPPED`일 때,
> **배포 목록·CI 런 목록에 해당 커밋이 아예 없을 때**, env 변수를 추가·수정할 때,
> `railway.toml`·`Dockerfile`·CI 워크플로를 손댈 때, 또는 배포 성공 후 태그를 붙일 때.

이 문서가 **판별표의 진실원**이다. 판별표 아래에 **왜 그런지와 실측 근거**가 이어진다.

## 공통 위험 — 셋 다 "장애"로 보이지 않는다

세 실패 모두 **서비스는 이전 이미지로 멀쩡히 떠 있고 health도 200**이다.
결과는 조용히 *"고쳤는데 안 바뀐다"* 상태다. 배포 목록을 직접 보지 않으면 알 수 없고,
그래서 진짜 장애보다 발견이 늦다. **③은 배포 목록으로도 안 보인다** — 런 목록을 봐야 한다.

---

## 판별표 — `FAILED`를 오해하지 말 것

**병합했으면 배포 status가 `SUCCESS`인지 반드시 확인한다.** 조용한 미배포가 3종 있고, 셋 다
서비스는 멀쩡히 떠 있고 health도 200이라 **배포 목록(③은 런 목록)을 보지 않으면 모른다.**

| 상황 | 해석 |
|------|------|
| 신규 커밋 · `WAITING` 지속 | 정상 — CI 완료 대기 중(실측 ~2.5분 — **관측 시점·대상 미상, 재측정 필요**) |
| env 단독 변경 · `SUCCESS` | 정상 — env가 적용됐다 |
| env 단독 변경 · **`FAILED`** | 메타의 `builder`를 볼 것. **`RAILPACK`이면 `railway.toml` 미적용**(로그는 비어 있다). **env는 적용되지 않았다** → 아래 ① |
| 신규 커밋 · **`SKIPPED`** | **CI 실패로 배포 취소.** `gh run rerun`으로 CI를 green으로 만들어도 **되살아나지 않는다** → 아래 ② |
| 신규 커밋 · **런 자체가 없음** | 웹훅 스로틀링·장애로 워크플로가 **트리거되지 않았다**. `FAILED`도 `SKIPPED`도 아니라 **배포 목록이 아니라 런 목록을 봐야 보인다.** 확인: `gh run list --branch main` 에 해당 커밋 SHA의 런이 있는가 → 아래 ③ |
| 신규 커밋 · `BUILDING`/`DEPLOYING` 중 `FAILED` | 실제 배포 실패 — 로그 즉시 수집 |
| 서비스 health 죽음 | 실제 장애 — 즉시 롤백 검토 |

- **`FAILED`·`SKIPPED` 복구는 동일하다: 커밋을 하나 올려 새 배포를 트리거한다.** env 값은 이미
  저장돼 있어 그 배포에서 함께 적용된다
- **`FAILED`를 보면 로그를 즉시 수집할 것** — 후속 배포로 대체되면 사라진다(2026-07-28 건이
  그래서 원인 미상으로 남았다). 단 ①②는 **로그가 비어 있는 것이 정상**이니 메타를 봐야 한다
- 메타 읽기: `patchId` 있음 = env 변경 재배포 · `imageDigest` 없음 = 이미지 생성 전 실패 ·
  `builder`는 `DOCKERFILE`이어야 정상 (상세: 아래 「메타 읽는 법」)
- 실측 quirk: `railway variable set`은 재배포를 트리거하지만 **`railway variable delete`는
  트리거하지 않는다** (상세: 아래 「기타 실측 quirk」)
- 판별 최초 실증: [#201](https://github.com/xzawed/CustomWebService/issues/201)

---

## ① env 단독 변경(patch) 배포가 `railway.toml`을 무시한다

data.go.kr 키 10개를 Railway env에 넣자 patch 재배포가 `FAILED`로 끝났다.
과거(2026-07-29·2026-06-30)에는 같은 방식이 성공했으므로 **더 이상 신뢰할 수 없다.**

실패 배포와 성공 배포의 메타를 비교하면 원인이 한눈에 드러난다:

| | `configFile` | `builder` | `healthcheckPath` | `propertyFileMapping` | `imageDigest` |
|---|---|---|---|---|---|
| **FAILED** (patch/env) | **없음** | **RAILPACK** | 없음 | **0개** | 없음 |
| SUCCESS (commit) ×5 | `/railway.toml` | `DOCKERFILE` | `/api/v1/health` | 6개 | 있음 |

patch 배포가 `railway.toml`을 **통째로 무시하고** Railway 기본 빌더(RAILPACK) 자동 감지로 떨어져,
Dockerfile·헬스체크 설정을 전부 잃고 **이미지 생성 전에** 죽는다.

> **빌드·배포 로그가 둘 다 비어 있다.** 산출물이 나오기 전이라 남길 게 없기 때문이다.
> 로그가 비었다고 "원인 미상"으로 닫지 말고 **메타의 `configFile`·`builder`를 볼 것.**
> (2026-07-28 건이 정확히 그렇게 원인 미상으로 남았다.)

**복구**: 커밋을 하나 올려 정상 commit 배포를 트리거한다. commit 배포는 `railway.toml`을 제대로
읽고, env 값은 이미 저장돼 있으므로 그 배포에서 함께 적용된다.

배경: [PR #269](https://github.com/xzawed/CustomWebService/pull/269)

---

## ② CI 실패로 `SKIPPED`된 배포는 재실행으로 되살아나지 않는다

카탈로그 수정([PR #271](https://github.com/xzawed/CustomWebService/pull/271))을 병합했는데
프로덕션에 반영되지 않았다. 배포 status가 `SKIPPED`였다.

```
SKIPPED   b43fee0  commit   ← 병합된 수정
SUCCESS   37d5dea  commit   ← 프로덕션이 실제로 돌던 것
```

**원인은 우리 코드가 아니었다.** GitHub Actions 러너가 `Set up job`에서 **45분 멈췄다가 실패**했다
(23:10 → 23:55). 체크아웃도 못 했고 로그도 없다 — 순수 인프라 장애다. 같은 내용이 PR에서는 6/6 통과했다.

Railway의 Wait for CI가 그 실패를 보고 배포를 취소했다. `gh run rerun --failed`로 CI를 green으로
만들었지만 **배포는 `SKIPPED`로 남았다.** 판정이 **일회성**이라 되살아나지 않는다.

> **즉 CI의 일시적 인프라 장애만으로 변경이 조용히 배포되지 않는다.**

**복구**: ①과 동일하다 — 커밋을 하나 올려 새 배포를 트리거한다.

배경: [PR #272](https://github.com/xzawed/CustomWebService/pull/272)

---

## ③ 워크플로가 아예 트리거되지 않는다 (GitHub Actions 웹훅 장애)

2026-08-06 GitHub Actions **major_outage** 중 웹훅이 **15%만 처리**됐다. 그 결과
**main 머지 3건 중 CI 런이 생성된 것은 1건뿐이었다**(2026-08-06 실측).

`FAILED`도 `SKIPPED`도 아니다 — **런이 존재하지 않는다.** ①②는 배포 목록에 흔적이 남지만
이건 남지 않으므로 **배포 목록이 아니라 런 목록을 봐야 보인다.**

```bash
gh run list --branch main    # 해당 커밋 SHA의 런이 있는가
```

**그럼에도 Railway는 배포했다**(2026-08-06 실측 — 자산 last-modified로 확인).
즉 *"CI 런이 없다 = 배포도 없다"가 아니다.* 결과는 ①②의 반대다 — 조용히 **미배포**가 아니라
조용히 **CI가 검증하지 않은 커밋이 프로덕션에 올라간다.**

> Wait for CI가 "기다릴 런이 없을 때" 어떻게 판정하는지(통과시키는지, 타임아웃으로 넘기는지)는
> **미상 — 확인되지 않았다.** 관측된 것은 *"런이 없었는데 배포는 됐다"* 까지다.

**복구**: 재배포 트리거가 목적이 아니다(배포는 이미 됐다). 목적은 **검증 공백을 메우는 것**이다.
`ci.yml`에는 `workflow_dispatch`가 없어 **수동 실행이 불가능**하므로(코드 확인 —
트리거는 `push`·`pull_request`뿐), 커밋을 하나 올려 CI를 태우는 것이 유일한 경로다.

---

## 실패 로그 수집 (후속 배포로 대체되면 사라진다)

```bash
export RAILWAY_TOKEN=$(grep -E '^RAILWAY_(API_)?TOKEN=' .env.local | cut -d= -f2- | tr -d '"\r')
railway deployment list --service dcf7317b-becc-408f-af73-13b5394b89b6 --json  # 실패 id 확보
railway logs -b <deployment-id>   # 빌드 로그
railway logs -d <deployment-id>   # 배포 로그
```

`--service`는 **필수**다. 프로젝트에 서비스가 3개(CustomWebService · SCAManager · ArcanaInsight)
있어서 생략하면 다른 서비스 배포가 섞여 나온다.

## 메타 읽는 법

- `patchId` 있음 → **env/설정 변경으로 트리거된 재배포**. 없으면 커밋 배포
- `imageDigest` 없음 → **이미지 생성 전**(빌드 도달 전/중) 실패
- `fileServiceManifest.build.builder` → `DOCKERFILE`이어야 정상. `RAILPACK`이면 ①번 건

## 기타 실측 quirk

- `railway variable set`은 재배포를 트리거하지만 **`railway variable delete`는 트리거하지 않는다**
  (삭제한 변수는 다음 배포에서야 컨테이너에서 사라진다)
- Wait for CI가 활성이라 **신규 커밋 배포는 CI가 끝날 때까지 `WAITING`**에 머문다
  (실측 ~2.5분 — **관측 시점·측정 대상 미상**. CI 전체 소요인지 배포 대기 구간인지 근거가
  문서 어디에도 없다. 재측정 필요)

## 배포 태그 규칙

- Railway 배포 성공 확인 후: `git tag deploy/YYYY-MM-DD-HHmm && git push origin --tags`
- 배포 롤백이 필요할 때 태그 목록(`git tag -l 'deploy/*'`)으로 이전 커밋 빠르게 식별

태그를 실제로 쓰는 롤백 절차(대시보드 Rollback·`startCommand` 함정 포함)는
[operations.md §4.3](operations.md)에 있다.

## 관련

- [#201](https://github.com/xzawed/CustomWebService/issues/201) — 배포 상태 판별 최초 실증
- [operations.md](operations.md) — 일상 운영·모니터링 (§4 배포 실패 대응 · §4.3 롤백 · §4.4 킬스위치)
