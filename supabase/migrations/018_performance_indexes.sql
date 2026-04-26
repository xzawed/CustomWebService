-- Performance indexes for common query patterns
-- CONCURRENTLY: 인덱스 생성 중 테이블 쓰기 차단 없음 (프로덕션 서비스 영향 0)
-- 주의: CONCURRENTLY는 트랜잭션 블록 내에서 실행 불가 — 단독 실행 필요

-- generated_codes: project_id 기반 버전 목록 조회 (findByProject, pruneOldVersions)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_generated_codes_project_created
  ON generated_codes(project_id, created_at DESC);

-- projects: user_id 기반 목록 조회 (findByUserId)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_user_created
  ON projects(user_id, created_at DESC);

-- projects: deleted 제외한 활성 프로젝트 필터 (status 조건 빈도 높음)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_status_active
  ON projects(status)
  WHERE status != 'deleted';
