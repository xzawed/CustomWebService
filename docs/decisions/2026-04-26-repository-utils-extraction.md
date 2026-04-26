# ADR: Repository 공통 유틸리티 추출

> **날짜:** 2026-04-26
> **상태:** 완료

## 배경

`BaseRepository`, `DrizzleCatalogRepository`, `DrizzleProjectRepository`, `DrizzleCodeRepository`, `DrizzleUserRepository` 등 5개 파일에 동일한 코드가 반복되었다.

- **페이지네이션 계산** (`const offset = (page - 1) * limit`): 5곳 중복
- **Supabase PGRST116 에러 판별** (`error.code === 'PGRST116'`): 4곳 중복
- **camelCase → snake_case 변환 + 예약 필드 제거** (`private toDatabase()` 메서드): 4곳 중복

## 결정

`src/repositories/utils/` 하위에 3개 유틸리티를 추출하고, 각 소비자 파일을 리팩터링.

### 추가된 파일

| 파일 | 함수 | 역할 |
|------|------|------|
| `pagination.ts` | `normalizePagination(options)` | page/limit → offset/limit 정규화 |
| `supabaseErrors.ts` | `isNotFound(error)` | PGRST116 에러 판별 |
| `rowMapper.ts` | `toDatabaseRow(model)` | camelCase → snake_case 변환, id/createdAt/updatedAt 제외 |

모두 `src/repositories/utils/index.ts`에서 re-export.

### 테스트

`src/repositories/utils/__tests__/` 하위 3개 파일, 총 15개 유닛 테스트 추가.

## 결과

- 소비자 파일 5개의 중복 코드 제거
- 페이지네이션·에러 판별·행 매핑 로직의 단일 소유자 확보
- 전체 테스트: 491개 → 506개
