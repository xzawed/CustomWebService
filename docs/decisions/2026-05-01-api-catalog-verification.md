# API 카탈로그 전수 검증 ADR (2026-05-01)

## 컨텍스트

62개 전체 API에 대해 4개 에이전트 병렬 검증을 수행했다. 검증 항목:
- 서비스 운영 상태 (DNS, HTTP 응답)
- 무료 여부 및 신규 키 발급 가능성
- base_url HTTPS 지원 여부
- rate_limit 실제값과 DB 등록값 일치 여부
- 2024~2025년 정책 변경 사항

---

## 조치 결과

### 비활성화 (is_active = false)

| API | 사유 |
|-----|------|
| **NewsAPI.org** | 무료 Developer 플랜은 localhost 전용. 서버사이드(Railway 프록시) 호출 시 약관 위반(426). 프로덕션 플랜 $449/월~ |
| **LibreTranslate** | 공개 인스턴스 무료 API 키 발급 중단(2024~). Pro 플랜 $29/월~ 필요 |
| **Cat Facts** | 403 Forbidden 지속 반환. 서비스 불안정 |
| **네이버 지도 (Geocoding)** | 2025-03-24부터 신규 이용 신청 차단 (gov-ncloud.com 공지 499번). 기존 계정 유지만 가능 |

### 데이터 오류 수정

| API | 변경 내용 |
|-----|-----------|
| **카카오 검색** | `cors_supported: false → true`, `requires_proxy: true → false` (실측: `Access-Control-Allow-Origin: *` 확인) |
| **국립중앙도서관** | `base_url` `/NL/search/openApi` → `/NL/search/openApi/search.do` (기존 경로 404 반환) |

### HTTP → HTTPS 전환 (7개)

`apis.data.go.kr`는 공식 문서가 HTTP 표기이지만 실서버는 HTTPS TLS 연결 수락 확인됨.

| API | 변경 전 → 후 |
|-----|------------|
| 기상청 단기예보 | `http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0` → `https://` |
| 기상청 중기예보 | `http://apis.data.go.kr/1360000/MidFcstInfoService` → `https://` |
| 에어코리아 대기오염 | `http://apis.data.go.kr/B552584/ArpltnInforInqireSvc` → `https://` |
| 공휴일 정보 | `http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService` → `https://` |
| TAGO 전국 대중교통 | `http://apis.data.go.kr/1613000` → `https://` |
| 아파트 실거래가 | `http://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev` → `https://` |
| 한국관광공사 TourAPI | `http://apis.data.go.kr/B551011/KorService1` → `https://` |

> HTTP 전용 유지 (서버 자체가 HTTPS 미지원): 서울 열린데이터광장(8088포트), 서울시 버스 도착정보, 서울시 지하철.
> 세 API 모두 `requires_proxy=true`라 서버사이드 호출이 기본 — Mixed Content 문제 없음.

### Rate Limit 수정

| API | 이전 | 수정 후 |
|-----|------|---------|
| WeatherAPI.com | `"500"` | `"100000/월"` |
| Bored API | `"300"` | `"7/분(100req/15분)"` |
| Open Trivia DB | `"50"` | `"12/분(5초 간격)"` |
| The Cat API | `"100"` | `"10000/월"` |
| RAWG | `null` | `"20000/월"` |
| TMDB | `"40"` | `null` (2019년 rate limit 폐지) |
| Agify.io | `"100"` | `"1000/일"` |
| Genderize.io | `"100"` | `"1000/일"` |
| Nationalize.io | `"100"` | `"1000/일"` |
| 에어코리아 | `"300"` | `"500/일"` ← 타 공공API의 1/20 |

### Description / Note 업데이트

| API | 내용 |
|-----|------|
| ODsay | "6개월 무료, 이후 유료 Standard 플랜 전환 필수" 경고 추가 |
| 에어코리아 | 개발계정 500건/일 낮은 한도 경고 추가 |
| TheMealDB | 무료 키(v1/1) 기능 제한(100건, v2 미지원) 명시 |
| 한국은행 ECOS | 키 발급 경로가 data.go.kr이 아닌 ecos.bok.or.kr 자체 가입임 명시 |
| CoinGecko | Demo 키 권고 정책 변경 안내 |
| 아파트 실거래가 | "Dev"는 개발용이 아닌 "상세 자료" 버전 정식명임 명시 |
| TAGO | base_url /1613000은 기관코드 prefix. 실사용 시 서비스 경로 추가 필요 명시 |
| 서울시 3개 | HTTP 전용 서버 확인, requires_proxy=true로 프록시 경유 정상 동작 명시 |

---

## 신규 추가 API (이번 세션, Step 2)

골든셋에 검증 완료 상태로 추가:

| API | 카테고리 | 인증 | 비고 |
|-----|---------|------|------|
| TMDB | entertainment | api_key | 신용카드 불필요, 한국어 지원 |
| TheMealDB | fun | none | 테스트 키 "1" 무료, v2는 유료 |
| The Color API | utility | none | 사실상 무제한 무료 |
| RAWG | entertainment | api_key | 월 20,000건, 비상업 무료 |
| NEIS 학교급식 | public | api_key | open.neis.go.kr |
| 카카오 검색 | search | api_key | CORS 지원, 프록시 불필요 |
| 식약처 식품영양성분 | health | api_key | data.go.kr |
| HIRA 병원정보 | health | api_key | data.go.kr |
| 국토부 아파트 전월세 | public | api_key | data.go.kr |
| KOPIS 공연예술 | entertainment | api_key | XML 전용 응답 |
| ZenQuotes | fun | none | Quotable 대체 |

---

## 교체된 API (이번 세션, Step 1)

| 기존 | 교체/수정 | 사유 |
|------|----------|------|
| CoinDesk BPI | 삭제 | DNS 실패 |
| Numbers API | 삭제 | HTTPS 미지원, project_count=0 |
| Quotable | 삭제 → ZenQuotes로 대체 | mirror 서비스 종료 |
| IP-API | ipapi.co로 교체 | HTTP→HTTPS, 동일 기능 |
| Open Notify | wheretheiss.at으로 교체 | 서비스 종료 |
| Frankfurter | base_url: `api.frankfurter.app` → `api.frankfurter.dev/v1` | 도메인 이전 |
| LibreTranslate | auth_type: `none` → `api_key` | 실제 키 필수로 정정 |

---

## 중복 검토 결론

| 쌍 | 결론 |
|----|------|
| 카카오 로컬 vs 카카오 검색 | 기능 완전히 다름 (지도 vs 웹/이미지/뉴스). 모두 유지 |
| ExchangeRate-API vs Frankfurter | 구조·사용 패턴 다름. 모두 유지 |
| 기상청 단기 vs 중기 | 예보 기간·좌표 체계 다름. 모두 유지 |
| 아파트 실거래가 vs 전월세 | 매매 vs 임대차 — 상호보완. 모두 유지 |
| 네이버 지도 vs 카카오 로컬 | 네이버 신규 가입 차단 → 비활성화. 카카오 로컬 단독 유지 |

---

## 최종 현황

- 활성 API: **58개**
- 비활성 API: **4개** (NewsAPI.org, LibreTranslate, Cat Facts, 네이버 지도)
- 오늘 verified_at 갱신: **29개**
- HTTP 전용 유지(변경 불가): 서울시 3개 (서버 HTTPS 미지원)
