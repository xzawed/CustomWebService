-- Performance indexes for common query patterns

-- generated_codes: project_id 기반 버전 목록 조회 (findByProject, pruneOldVersions)
CREATE INDEX IF NOT EXISTS idx_generated_codes_project_created
  ON generated_codes(project_id, created_at DESC);

-- projects: user_id 기반 목록 조회 (findByUserId)
CREATE INDEX IF NOT EXISTS idx_projects_user_created
  ON projects(user_id, created_at DESC);

-- projects: deleted 제외한 활성 프로젝트 필터 (status 조건 빈도 높음)
CREATE INDEX IF NOT EXISTS idx_projects_status_active
  ON projects(status)
  WHERE status != 'deleted';
