# API 카탈로그 즉시 사용 가능 기준 정리 ADR (2026-05-01)

> **언제 읽나**: api_catalog is_active 기준을 바꾸거나, '즉시 사용 가능·지속 무료' 정책으로 카탈로그 API를 삭제·비활성화할 때

## 컨텍스트

API 카탈로그 전수 검증(2026-05-01) 완료 후, 플랫폼 사용 목적에 부합하는 API만 활성 유지하기로 결정.

**정리 기준:**
1. **즉시 사용 가능** — 사용자가 계정 생성·이메일 인증·API 키 신청 등 어떤 사전 작업 없이 바로 호출 가능
2. **지속 가능한 무료** — 6개월 타임아웃, 신용카드 요구, 향후 유료화 위험 없음
3. **서비스 안정** — rate limit 불안정·공유 IP 고갈·비상업적 IP 차단 등 생성된 서비스를 불안정하게 만드는 위험 없음

**배경**: AI가 생성한 서비스에서 API 키 미설정 또는 rate limit 초과 오류가 발생하면 사용자 서비스가 즉시 실패. 플랫폼 신뢰도 직결 문제.

---

## 조치 결과

### 완전 삭제 (DELETE) — 15개

**기존 비활성 4개 (복구 불가):**

| API | 사유 |
|-----|------|
| NewsAPI.org | 서버사이드 호출 시 약관 위반 (426 응답) |
| LibreTranslate | 2024년부터 공개 인스턴스 무료 키 발급 중단 |
| Cat Facts | 403 Forbidden 지속 반환 |
| 네이버 지도 | 2025-03-24 신규 가입 차단 |

**신규 삭제 11개 (활성 → 삭제):**

| API | 사유 |
|-----|------|
| SpaceX API | 메인테이너 공식 종료 선언, `/v4/launches/latest` 2022-10 데이터 고정 |
| BigDataCloud | 무료 엔드포인트는 사용자 현재 위치 전용, 임의 좌표 → 402 차단. AI 생성 시나리오 구조 부적합 |
| ipapi.co | 직접 접속 ECONNREFUSED — 서비스 자체 불안정 |
| ODsay 대중교통 길찾기 | 6개월 무료 후 유료 Standard 플랜 전환 필수 — **지속 가능한 무료 기준 위반** |
| CoinGecko | 키 없이 5~30 req/min 가변 (트래픽에 따라 급감) — 생성된 서비스 응답 불안정 |
| Open-Meteo | **비상업적 전용** — 사용자 생성 서비스 상업화 시 IP 차단 위험. 플랫폼이 상업성 통제 불가 |
| Free Dictionary API | creator 본인이 AWS 비용 압박 공개 언급. 중단 위험 현실적 |
| Bored API | 원 서비스 종료 후 App Brewery 교육용 클론. 프로덕션 안정성 보장 없음 |
| Agify.io | 키 없이 100건/일 — 프록시 서버 공유 IP 기준으로 다수 사용자 동시 사용 시 즉시 고갈 |
| Genderize.io | 동일 사유 (Demografix ApS 동일 정책 전환) |
| Nationalize.io | 동일 사유 |

---

### 비활성화 (is_active = false) — 24개

API 키 등록 필요 → 즉시 사용 불가 기준 미달. 나중에 "사용자 제공 키" 기능 추가 시 재활성화 가능하도록 데이터 보존.

**한국 공공 (data.go.kr, 17개):**
기상청 단기예보, 기상청 중기예보, 에어코리아 대기오염정보, 공휴일 정보, 국립중앙도서관, 서울 열린데이터광장, NEIS 학교급식, 국토부 아파트 전월세, 아파트 실거래가, 한국관광공사 TourAPI, TAGO 전국 대중교통, 서울시 버스 도착정보, 서울시 지하철, HIRA 병원정보, 식약처 식품영양성분, 한국은행 ECOS, KOPIS 공연예술

**한국 플랫폼 (2개):**
카카오 로컬, 카카오 검색

**글로벌 api_key (5개):**
TMDB, RAWG, Unsplash, OpenWeatherMap, WeatherAPI.com

---

### 특별 처리 (유지 + 수정)

| API | 조치 | 상세 |
|-----|------|------|
| **The Cat API** | auth_type `api_key → none` | 키 없이 `/v1/images/search` 즉시 호출 가능 실측 확인 (응답 헤더 `authenticated: false`). rate_limit `10/분`으로 갱신. |
| **NASA 오늘의 천문 사진** | 유지 | `DEMO_KEY`가 공개 키로 등록 없이 즉시 사용 가능. auth_config의 `default_key` 자동 삽입. 50건/일 제한은 데모·PoC에 충분. |
| **ZenQuotes** | cors_supported/requires_proxy 수정 | CORS 헤더 비활성화 실측 확인 → `cors_supported=false`, `requires_proxy=true`로 수정. 프록시 경유로 정상 동작. |

---

## 최종 현황

- **활성 API: 23개** (즉시 사용 가능 + 지속 가능한 무료 기준 충족)
- **비활성 API: 24개** (키 등록 필요, 데이터 보존)
- **총 DB 레코드: 47개** (이전 62개 → 15개 삭제)

**활성 23개 목록:**

| 카테고리 | API |
|---------|-----|
| data | JSONPlaceholder, Random User, REST Countries, Wikipedia, Open Library |
| entertainment | JokeAPI, Open Trivia DB, PokéAPI |
| fun | TheMealDB, icanhazdadjoke |
| image | Dog API, Lorem Picsum, The Cat API, NASA 오늘의 천문 사진 |
| news | Hacker News API, Spaceflight News API |
| finance | ExchangeRate-API, Frankfurter |
| utility | QR Code Generator, Sunrise-Sunset, The Color API, wheretheiss.at |
| fun | ZenQuotes |

---

## 골든셋 변경

TMDB·RAWG → 비활성화로 제거. The Cat API(auth_type 재분류)·NASA DEMO_KEY 신규 추가.
상세: [docs/archive/reference/golden-api-set.md](../archive/reference/golden-api-set.md)

---

## 향후 고려사항

- **한국 공공 API 재활성화**: 사용자가 자신의 API 키를 프로젝트에 등록하는 "Bring Your Own Key" 기능 구현 시, 비활성화된 24개 API를 즉시 재활성화할 수 있도록 데이터 보존.
- **SpaceX API 대체**: 실시간 우주 정보가 필요하면 Spaceflight News API가 대안.
- **날씨 API 공백**: 즉시 사용 가능한 날씨 API가 현재 없음. Open-Meteo 비상업적 제한 해결 또는 다른 제로-키 날씨 API 발굴 필요.
