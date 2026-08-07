<!-- DOC_STATUS: HISTORICAL | completed: 2026-06-22 | superseded_by: docs/decisions/2026-06-22-catalog-registration-and-seed-resync.md -->
# 자체 호스팅 국가 데이터 API (REST Countries 대체) — 결정 근거

- 날짜: 2026-06-22 · 상태: **완료**(PR #158 배포 · 카탈로그 등록 완료)
- 등록 ADR: [2026-06-22-catalog-registration-and-seed-resync.md](../../decisions/2026-06-22-catalog-registration-and-seed-resync.md)
- 폐기 결정: [2026-06-21-api-catalog-health-monitoring.md](../../decisions/2026-06-21-api-catalog-health-monitoring.md) (REST Countries v3.1 전면 deprecated, 무료 키리스 대체 없음 — v5는 유료)

> **스키마·엔드포인트·응답 필드는 코드가 진실원이다** — `src/lib/countries/types.ts`,
> `src/app/api/v1/countries/`(+`[code]/`), 데이터는 `src/data/countries.json`,
> 재생성은 `scripts/generateCountries.ts`. 2026-08-07에 이 문서의 인터페이스 정의·
> 엔드포인트 표·헤더 목록·테스트 계획을 삭제했다(코드에서 더 정확하게 읽힌다).
> 아래는 **코드를 읽어도 알 수 없는 것**만 남긴 것이다.

## 1. 라이선스 — 지우면 안 되는 의무

소스는 [mledoze/countries](https://github.com/mledoze/countries)이고 라이선스는 **ODbL**이라
**attribution이 필수**다. `src/lib/countries/types.ts` 첫 주석이 이 문서를 가리키는 이유가
그것이다. 데이터를 갈아끼우거나 출처 주석을 정리할 때 귀속 표시를 함께 지우지 말 것.

## 2. 왜 `population`·`flags`·`timezones`가 없는가 (2026-06-22 실측)

mledoze `countries.json` **원본에 그 세 필드가 존재하지 않는다.** 그래서:

- `population` — **제외**. "빠뜨린 것"이 아니다. 추가하려면 다른 데이터셋이 필요하다
- `area`(km²) — population 대신 채택한 규모 지표
- `flagSvg` — 원본에 없어 `https://flagcdn.com/${cca2}.svg`로 **구성**한 값이다(원본 필드 아님)

REST Countries v3.1과 필드가 다른 것은 이 때문이며, 소비처가 `population`을 기대하면
그건 구 API 기준으로 쓴 코드다.

## 3. 응답이 내부 `jsonResponse` 엔벨로프를 쓰지 않는 이유

`GET /api/v1/countries`는 **bare 배열**, `/{code}`는 **bare 객체**를 반환한다. 생성된 사이트가
REST Countries와 동일한 형태로 소비하도록 의도한 것이다 — **"내부 규약과 일관되게" 엔벨로프로
감싸면 기존 생성물이 조용히 깨진다.** 같은 이유로 CORS(`*`)를 열어 **프록시 없이 직접 fetch**
가능하게 했다(다른 카탈로그 API와 다른 점).

쿼리 필터가 있어 `dynamic = 'force-static'`을 쓸 수 없다 → 동적 라우트 + 명시적
`Cache-Control` 조합이다. 준-정적 데이터라 런타임 외부 fetch는 하지 않는다(빌드 번들).

## 4. 롤백

라우트·데이터·스크립트 제거 + 카탈로그 row `is_active=false`. **이미 게시된 사이트는
baked URL을 유지하므로 즉시 깨진다** — 영향이 신규 생성에만 그치지 않는다.
