# Organization 코드 제거 결정

**날짜**: 2026-04-13

## 배경

Phase A-1 (갤러리) 개발 당시 Organization/멤버십 도메인 코드가 작성되었으나, 실제 기능(조직 생성, 멤버 초대 등)은 구현되지 않았다.

## 제거 범위 (코드만)

- `src/types/organization.ts` — User/UserPreferences 타입은 `src/types/user.ts`로 분리 후 제거
- `src/repositories/organizationRepository.ts`
- `src/repositories/drizzle/DrizzleOrganizationRepository.ts`
- `src/repositories/interfaces/IOrganizationRepository.ts`
- `src/repositories/factory.ts`의 `createOrganizationRepository()` 함수

## 유지 범위 (DB 스키마)

**스키마 변경 없음** — 다음 항목은 운영 DB에 이미 존재하므로 별도 migration 작업 없이 코드만 제거:

- `schema.ts`의 `organizations`, `memberships` 테이블 정의
- `schema.ts`의 `projects.organization_id` 컬럼 (nullable FK)
- `supabase/migrations/` 내 마이그레이션 파일

## 이유

- 모든 팩토리 함수/리포지토리의 프로덕션 호출자 0건
- 스키마 drop은 운영 DB 데이터 손실 위험이 있어 별도 계획 필요
- Organization 기능 재도입 시 스키마는 그대로 사용 가능
