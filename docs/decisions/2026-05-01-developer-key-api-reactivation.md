# 개발자 키 제공 방식 API 재활성화 ADR (2026-05-01)

## 컨텍스트

2026-05-01 즉시 사용 가능 기준 정리([docs/decisions/2026-05-01-api-catalog-immediate-usable-cleanup.md](2026-05-01-api-catalog-immediate-usable-cleanup.md))에서 24개 API를 `is_active=false`로 비활성화했다. 비활성화 사유는 "API 키 등록 필요 — 즉시 사용 불가".

검토 결과, 비활성화된 API 중 다음 조건을 충족하는 항목은 **플랫폼 개발자가 단일 키를 발급·환경변수에 등록**하면 사용자 등록 없이 즉시 사용 가능하다는 결론에 도달했다.

**재활성화 기준 (모두 충족 시):**
1. 개발자가 무료로 키 발급 가능 (신용카드·유료 플랜 불필요)
2. 단일 플랫폼 키로 다수 사용자 공유 가능 (서버사이드 프록시 패턴)
3. ToS에 AI 생성 서비스 / 플랫폼 프록시 사용 금지 조항 없음
4. rate limit이 플랫폼 공유 사용에 현실적으로 충분

**영구 제외 (재활성화 불가):**
- **TMDB**: ToS §2.1 "AI·ML 연결 애플리케이션 금지"
- **RAWG**: "양도 불가 개인 라이선스, 재배포 금지"
- **OpenWeatherMap**: 1,000건/일 — 플랫폼 공유 시 즉시 고갈

---

## 재활성화 결정 (Option B 풀세트)

### 재활성화 API 목록 (8개)

| API | UUID | 카테고리 | 키 유형 | rate limit | 비고 |
|-----|------|---------|---------|-----------|------|
| Open-Meteo | `a3f8d2e1-7c4b-4a9f-b6e5-1d2c3f4e5a6b` | weather | 없음 | 10,000/일 | 키 불필요, CC BY 4.0 |
| 공휴일 정보 | `15b51435-de0d-4c53-854c-dfcf08f4bcac` | lifestyle | `DATA_GO_KR_API_KEY` | 10,000/일 (개발계정) | data.go.kr 자동승인 |
| 기상청 단기예보 | `7cb8f428-e284-4eee-944a-af47274662d2` | weather | `DATA_GO_KR_API_KEY` | 10,000/일 (개발계정) | 3시간 캐싱 권장 |
| 기상청 중기예보 | `00412c2b-6c17-4b23-9a3d-46b7004285e4` | weather | `DATA_GO_KR_API_KEY` | 10,000/일 (개발계정) | 6시간 캐싱 권장 |
| 아파트 실거래가 | `bda9be95-bb3b-4f30-b1da-c304445b7c3c` | realestate | `DATA_GO_KR_API_KEY` | 10,000/일 (개발계정) | 활용신청 1~3일 |
| 카카오 로컬 | `f1ec6f97-2e13-4e9a-9a73-18738f7164b2` | location | `KAKAO_REST_API_KEY` | 100,000/일 | 서버사이드 단일키 공식 지원 |
| 카카오 검색 | `2937a35f-806e-402c-98c3-d0261e1ad2f4` | search | `KAKAO_REST_API_KEY` | 50,000/일 | 카카오 로컬과 동일 키 |
| Unsplash | `2a31bfbe-2ce0-43c0-8a9f-c1ce7bf7235d` | image | `UNSPLASH_ACCESS_KEY` | 50/시간 (Demo) → 1,000/시간 (Production) | Attribution 구현 필수 |

**변경 후 DB 현황:** 활성 31개, 비활성 17개, 총 48개

> **2026-06-21 갱신**: REST Countries(v3.1 deprecated) 폐기로 활성 31 → **30**, 비활성 17 → 18. 카탈로그 헬스체크가 DB 기반 일일 자동화로 전환됨. 상세: [2026-06-21-api-catalog-health-monitoring.md](2026-06-21-api-catalog-health-monitoring.md)

---

## 구현 세부사항

### 환경변수 등록

```bash
# 한국 공공데이터 포털 (공휴일·기상청·아파트 실거래가 공유)
DATA_GO_KR_API_KEY=<data.go.kr 발급 키>

# 카카오 REST API (로컬·검색 공유)
KAKAO_REST_API_KEY=<kakao developers 앱 REST API 키>

# Unsplash (사진 검색)
UNSPLASH_ACCESS_KEY=<unsplash developers Access Key>
```

### 키 발급 절차

**data.go.kr (공휴일·기상청·아파트):**
1. [data.go.kr](https://data.go.kr) 회원가입
2. 각 API 검색 후 "활용신청" (공휴일: 자동승인 / 기상청·아파트: 1~3일)
3. 마이페이지 → 오픈API → 발급받은 인증키 복사
4. `DATA_GO_KR_API_KEY` 환경변수 등록

**카카오 (로컬·검색):**
1. [developers.kakao.com](https://developers.kakao.com) 회원가입
2. 애플리케이션 추가 → REST API 키 복사
3. 플랫폼 등록: 웹 → 서비스 도메인 등록 (Railway URL)
4. `KAKAO_REST_API_KEY` 환경변수 등록

**Unsplash:**
1. [unsplash.com/developers](https://unsplash.com/developers) 앱 등록
2. Access Key 복사
3. `UNSPLASH_ACCESS_KEY` 환경변수 등록
4. Production 심사 신청 (Demo 50건/시간 → Production 1,000건/시간)
5. AI 생성 코드에 사진가 Attribution(이름+링크) 자동 삽입 구현 필요

### Open-Meteo 사용 조건

키 불필요이나 **비상업적 전용(CC BY 4.0)**:
- 플랫폼에 광고·유료 구독 없을 때만 사용 가능
- Attribution 요구 없음 (단, 출처 표기 권장)
- 향후 플랫폼 수익화 시 재검토 필요

---

## 검증 근거

3개 에이전트 병렬 검증(2026-05-01) 결과:

| 항목 | data.go.kr | 카카오 | Unsplash |
|------|-----------|--------|---------|
| ToS 플랫폼 프록시 허용 | 명시적 금지 없음 | devtalk.kakao.com 확인 (서버사이드 단일키 공식 지원) | 공식 문서 "프록시 패턴 권장" 명시 |
| 키 공유 허용 | 명시적 금지 없음 | 서버사이드 호환 | 공식 권장 패턴 |
| AI 생성 서비스 금지 | 없음 | 없음 | 없음 |
| 무료 지속 가능성 | 공공 서비스 | 무기한 무료 | 무기한 무료 (Demo), Production 심사 필요 |

---

## 향후 고려사항

- **기상청 API 캐싱 레이어**: 단기(3시간), 중기(6시간) 갱신 주기에 맞춰 서버사이드 캐싱 구현 권장. 현재 미구현 — rate limit 고갈 방지를 위해 중기 과제로 추적.
- **Unsplash Production 심사**: 심사 통과 전까지 Demo 한도(50건/시간). 심사 신청 및 진행 상태 추적 필요.
- **Unsplash Attribution 구현**: Unsplash API 가이드라인상 사진가 이름+링크 표시 필수. AI 코드 생성 시 Attribution 코드 자동 삽입 구현 필요.
- **data.go.kr 운영계정 전환**: 개발계정 10,000건/일 한도 초과 시 운영계정(100,000건/일) 전환. 현재는 개발계정으로 충분.
- **나머지 비활성 16개**: BYOK(Bring Your Own Key) 기능 구현 시 재활성화 후보. 특히 OpenWeatherMap(1,000건/일)은 사용자별 키 시나리오가 적합.
