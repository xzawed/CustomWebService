# 무료 API 사전 검증 보고서 (Free API Pre-Validation)

> 카탈로그 시드 데이터 작성 전, 각 API의 실제 동작 여부와 무료 정책을 검증하는 문서

---

## 1. 검증 항목

각 API에 대해 다음 항목을 검증해야 함:

| # | 검증 항목 | 설명 |
|---|-----------|------|
| 1 | **접속 가능** | API 도메인에 접근 가능한지 |
| 2 | **무료 가입** | 신용카드 없이 무료 가입 가능한지 |
| 3 | **API 키 발급** | 즉시 키가 발급되는지, 승인 대기가 있는지 |
| 4 | **실제 호출** | 테스트 호출이 정상 응답을 반환하는지 |
| 5 | **무료 한도** | 공식 문서 기준 무료 한도가 명시되어 있는지 |
| 6 | **영구 무료** | "무료 평가판"이 아닌 영구 무료 플랜인지 |
| 7 | **CORS** | 브라우저에서 직접 호출 가능한지 (CORS 허용) |
| 8 | **래핑 허용** | 다른 서비스에서 래핑하여 제공하는 것이 허용되는지 |
| 9 | **응답 형식** | JSON 응답을 제공하는지 |
| 10 | **문서 품질** | API 문서가 충분히 상세한지 |

---

## 2. API별 검증 시트

### 카테고리: 날씨 (Weather)

#### OpenWeatherMap
| 항목 | 결과 | 비고 |
|------|------|------|
| URL | https://api.openweathermap.org | |
| 접속 가능 | ☐ 확인 | |
| 무료 가입 | ☐ 확인 | 이메일 가입, 카드 불필요 |
| API 키 발급 | ☐ 확인 | 가입 후 즉시 발급 (활성화에 최대 2시간) |
| 테스트 호출 | ☐ 확인 | `GET /data/2.5/weather?q=Seoul&appid=KEY` |
| 무료 한도 | ☐ 확인 | 1,000 호출/일 |
| 영구 무료 | ☐ 확인 | Free 플랜 영구 제공 확인 |
| CORS | ☐ 확인 | 허용됨 |
| 래핑 허용 | ☐ 확인 | CC BY-SA 4.0, 출처 표시 시 허용 |
| JSON 응답 | ☐ 확인 | |
| 문서 품질 | ☐ 확인 | 상세한 편 |
| **최종 판정** | ☐ 합격 / ☐ 불합격 | |

#### Open-Meteo
| 항목 | 결과 | 비고 |
|------|------|------|
| URL | https://api.open-meteo.com | |
| 접속 가능 | ☐ 확인 | |
| 무료 가입 | ☐ 확인 | 가입 불필요 (키 없이 사용) |
| API 키 발급 | ☐ 해당없음 | 키 불필요 |
| 테스트 호출 | ☐ 확인 | `GET /v1/forecast?latitude=37.57&longitude=126.98&current_weather=true` |
| 무료 한도 | ☐ 확인 | 비상업 무제한 |
| 영구 무료 | ☐ 확인 | 오픈소스 기반, 비상업 영구 무료 |
| CORS | ☐ 확인 | 허용됨 |
| 래핑 허용 | ☐ 확인 | CC BY 4.0 (비상업) |
| JSON 응답 | ☐ 확인 | |
| 문서 품질 | ☐ 확인 | |
| **최종 판정** | ☐ 합격 / ☐ 불합격 | |

#### WeatherAPI
| 항목 | 결과 | 비고 |
|------|------|------|
| URL | https://api.weatherapi.com | |
| 접속 가능 | ☐ 확인 | |
| 무료 가입 | ☐ 확인 | |
| API 키 발급 | ☐ 확인 | |
| 테스트 호출 | ☐ 확인 | `GET /v1/current.json?key=KEY&q=Seoul` |
| 무료 한도 | ☐ 확인 | 1,000,000 호출/월 |
| 영구 무료 | ☐ 확인 | |
| CORS | ☐ 확인 | |
| 래핑 허용 | ☐ 확인 | |
| JSON 응답 | ☐ 확인 | |
| 문서 품질 | ☐ 확인 | |
| **최종 판정** | ☐ 합격 / ☐ 불합격 | |

---

### 카테고리: 금융/환율 (Finance)

#### Frankfurter
| 항목 | 결과 | 비고 |
|------|------|------|
| URL | https://api.frankfurter.app | |
| 접속 가능 | ☐ 확인 | |
| 무료 가입 | ☐ 확인 | 가입 불필요 |
| API 키 발급 | ☐ 해당없음 | 키 불필요 |
| 테스트 호출 | ☐ 확인 | `GET /latest?from=USD&to=KRW` |
| 무료 한도 | ☐ 확인 | 무제한 |
| 영구 무료 | ☐ 확인 | 오픈소스 |
| CORS | ☐ 확인 | 허용됨 |
| 래핑 허용 | ☐ 확인 | MIT 라이선스 |
| JSON 응답 | ☐ 확인 | |
| 문서 품질 | ☐ 확인 | |
| **최종 판정** | ☐ 합격 / ☐ 불합격 | |

#### CoinGecko
| 항목 | 결과 | 비고 |
|------|------|------|
| URL | https://api.coingecko.com | |
| 접속 가능 | ☐ 확인 | |
| 무료 가입 | ☐ 확인 | |
| API 키 발급 | ☐ 확인 | Demo API Key 무료 |
| 테스트 호출 | ☐ 확인 | `GET /api/v3/simple/price?ids=bitcoin&vs_currencies=usd` |
| 무료 한도 | ☐ 확인 | 10,000 호출/월 (Demo) |
| 영구 무료 | ☐ 확인 | Demo 플랜 영구 제공 여부 재확인 필요 |
| CORS | ☐ 확인 | |
| 래핑 허용 | ☐ 확인 | "Powered by CoinGecko" 표시 필수 |
| JSON 응답 | ☐ 확인 | |
| 문서 품질 | ☐ 확인 | |
| **최종 판정** | ☐ 합격 / ☐ 불합격 | |

#### ExchangeRate-API
| 항목 | 결과 | 비고 |
|------|------|------|
| URL | https://v6.exchangerate-api.com | |
| 접속 가능 | ☐ 확인 | |
| 무료 가입 | ☐ 확인 | |
| API 키 발급 | ☐ 확인 | |
| 테스트 호출 | ☐ 확인 | `GET /v6/KEY/latest/USD` |
| 무료 한도 | ☐ 확인 | 1,500 요청/월 |
| 영구 무료 | ☐ 확인 | |
| CORS | ☐ 확인 | |
| 래핑 허용 | ☐ 확인 | |
| JSON 응답 | ☐ 확인 | |
| 문서 품질 | ☐ 확인 | |
| **최종 판정** | ☐ 합격 / ☐ 불합격 | |

---

### 카테고리: 데이터 (Data)

#### REST Countries
| 항목 | 결과 | 비고 |
|------|------|------|
| URL | https://restcountries.com | |
| 접속 가능 | ☐ 확인 | |
| 무료 가입 | ☐ 확인 | 가입 불필요 |
| API 키 발급 | ☐ 해당없음 | 키 불필요 |
| 테스트 호출 | ☐ 확인 | `GET /v3.1/name/korea` |
| 무료 한도 | ☐ 확인 | 무제한 |
| 영구 무료 | ☐ 확인 | 오픈소스 |
| CORS | ☐ 확인 | 허용됨 |
| 래핑 허용 | ☐ 확인 | MPL 2.0 |
| JSON 응답 | ☐ 확인 | |
| 문서 품질 | ☐ 확인 | |
| **최종 판정** | ☐ 합격 / ☐ 불합격 | |

---

### 나머지 API 검증 (동일 형식 적용)

아래 API들은 동일한 검증 시트를 적용하여 확인:

| 카테고리 | API | 검증 상태 |
|---------|-----|-----------|
| 뉴스 | GNews | ☐ 미검증 |
| 뉴스 | Spaceflight News | ☐ 미검증 |
| 지도 | OpenStreetMap (Nominatim) | ☐ 미검증 |
| 지도 | ip-api | ☐ 미검증 |
| 번역 | MyMemory | ☐ 미검증 |
| 번역 | DictionaryAPI | ☐ 미검증 |
| 이미지 | Unsplash | ☐ 미검증 |
| 이미지 | Pexels | ☐ 미검증 |
| 이미지 | Lorem Picsum | ☐ 미검증 |
| 데이터 | 공공데이터포털 | ☐ 미검증 |
| 데이터 | Open Library | ☐ 미검증 |
| 유틸 | QR Code (goqr.me) | ☐ 미검증 |
| 유틸 | Open Notify | ☐ 미검증 |
| 엔터 | OMDb | ☐ 미검증 |
| 엔터 | JokeAPI | ☐ 미검증 |
| 엔터 | PokeAPI | ☐ 미검증 |
| 엔터 | Open Trivia DB | ☐ 미검증 |
| 엔터 | Jikan | ☐ 미검증 |
| 소셜 | GitHub API | ☐ 미검증 |
| 소셜 | Hacker News | ☐ 미검증 |

---

## 3. 검증 실행 스크립트

Sprint 2에서 시드 데이터 작성 전, 아래 스크립트로 일괄 검증:

```bash
#!/bin/bash
# scripts/validate-apis.sh
# 각 API의 기본 엔드포인트를 호출하여 응답 상태 확인

echo "=== API 검증 시작 ==="

# 인증 불필요 API
apis_no_auth=(
  "Open-Meteo|https://api.open-meteo.com/v1/forecast?latitude=37.57&longitude=126.98&current_weather=true"
  "Frankfurter|https://api.frankfurter.app/latest?from=USD&to=KRW"
  "REST Countries|https://restcountries.com/v3.1/name/korea"
  "Spaceflight News|https://api.spaceflightnewsapi.net/v4/articles/?limit=1"
  "DictionaryAPI|https://api.dictionaryapi.dev/api/v2/entries/en/hello"
  "Lorem Picsum|https://picsum.photos/v2/list?limit=1"
  "PokeAPI|https://pokeapi.co/api/v2/pokemon/pikachu"
  "JokeAPI|https://v2.jokeapi.dev/joke/Any?amount=1"
  "Open Trivia|https://opentdb.com/api.php?amount=1"
  "Hacker News|https://hacker-news.firebaseio.com/v0/topstories.json?limitToFirst=1"
  "Open Notify|http://api.open-notify.org/iss-now.json"
  "QR Code|https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=test"
  "ip-api|http://ip-api.com/json/"
  "Open Library|https://openlibrary.org/search.json?q=javascript&limit=1"
)

for api_info in "${apis_no_auth[@]}"; do
  IFS='|' read -r name url <<< "$api_info"
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url")
  if [ "$status" -eq 200 ]; then
    echo "✅ $name: HTTP $status"
  else
    echo "❌ $name: HTTP $status"
  fi
done

echo ""
echo "=== 인증 필요 API (수동 확인 필요) ==="
echo "⚠️  OpenWeatherMap: API Key 필요"
echo "⚠️  GNews: API Key 필요"
echo "⚠️  CoinGecko: Demo Key 필요"
echo "⚠️  ExchangeRate-API: API Key 필요"
echo "⚠️  Unsplash: API Key 필요"
echo "⚠️  Pexels: API Key 필요"
echo "⚠️  OMDb: API Key 필요"
echo "⚠️  공공데이터포털: API Key 필요"
echo ""
echo "=== 검증 완료 ==="
```

---

## 4. CORS 검증 방법

브라우저에서 직접 호출 가능한지 확인 (클라이언트 사이드 호출 가능 여부):

```javascript
// 브라우저 콘솔에서 실행
async function testCors(name, url) {
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log(`✅ ${name}: CORS 허용, status ${res.status}`);
  } catch (e) {
    console.log(`❌ ${name}: CORS 차단 - 서버 프록시 필요`);
  }
}

// 테스트 실행
testCors('Frankfurter', 'https://api.frankfurter.app/latest');
testCors('REST Countries', 'https://restcountries.com/v3.1/name/korea');
testCors('PokeAPI', 'https://pokeapi.co/api/v2/pokemon/1');
```

### CORS 차단 시 대응
- **서버 프록시**: Next.js API Route를 통해 서버사이드에서 호출
- 생성 코드에서 CORS 차단 API는 프록시 엔드포인트 사용하도록 생성

---

## 5. 검증 결과 요약 (검증 후 업데이트)

| 카테고리 | 전체 | 합격 | 불합격 | 보류 |
|---------|------|------|--------|------|
| 날씨 | 3 | - | - | - |
| 뉴스 | 2 | - | - | - |
| 금융 | 3 | - | - | - |
| 지도 | 2 | - | - | - |
| 번역 | 2 | - | - | - |
| 이미지 | 3 | - | - | - |
| 데이터 | 3 | - | - | - |
| 유틸 | 2 | - | - | - |
| 엔터 | 5 | - | - | - |
| 소셜 | 2 | - | - | - |
| **합계** | **27** | **-** | **-** | **-** |

### 불합격 API 대체 후보
(검증 후 불합격 API 발생 시 대체 후보를 여기에 기록)
