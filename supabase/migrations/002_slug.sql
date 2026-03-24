-- Migration: 002_slug
-- 목적: 서브도메인 가상 호스팅을 위한 slug, published_at 컬럼 추가
-- 실행일: 2026-03-25

-- 1단계: 컬럼 추가
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- 2단계: slug 유니크 인덱스 (slug로 빠른 조회 + 중복 방지)
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_slug
  ON projects (slug)
  WHERE slug IS NOT NULL;

-- 3단계: 복합 인덱스 (slug + status 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_projects_slug_status
  ON projects (slug, status)
  WHERE slug IS NOT NULL;

-- 4단계: 기존 deployed 프로젝트에 임시 slug 부여 (선택적)
-- UPDATE projects
--   SET slug = LEFT(REPLACE(id::text, '-', ''), 8)
--   WHERE status = 'deployed' AND slug IS NULL;
