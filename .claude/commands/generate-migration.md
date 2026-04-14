Supabase PostgreSQL 마이그레이션 파일을 프로젝트 표준에 맞게 생성하세요.

요구사항: $ARGUMENTS

## 생성 규칙

### 1. 마이그레이션 파일 위치
- `supabase/migrations/` 폴더 내 기존 파일 확인
- 파일명 형식: `{타임스탬프}_{설명}.sql` (기존 파일의 타임스탬프 패턴 참고)

### 2. 필수 포함 사항
- **테이블 생성**: 적절한 데이터 타입, NOT NULL 제약, DEFAULT 값
- **RLS 정책**: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + 정책 생성
  - SELECT: 본인 데이터만 조회 (`auth.uid() = user_id`)
  - INSERT: 본인만 생성
  - UPDATE: 본인만 수정
  - DELETE: 본인만 삭제
- **인덱스**: 자주 조회되는 컬럼에 인덱스 추가
- **외래키**: 관련 테이블과의 관계 설정 (CASCADE 정책 포함)
- **타임스탬프**: `created_at`, `updated_at` 컬럼 + 자동 업데이트 트리거

### 3. 네이밍 규칙
- 테이블명: snake_case, 복수형
- 컬럼명: snake_case
- 인덱스명: `idx_{테이블}_{컬럼}`
- RLS 정책명: `{테이블}_{동작}_policy`

### 4. 참고 파일
- `supabase/migrations/` 내 기존 마이그레이션 파일들의 패턴 확인
- `docs/04_데이터베이스_설계.md` 또는 관련 DB 설계 문서 참고
