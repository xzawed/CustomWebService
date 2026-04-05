-- 009_gallery.sql
-- Gallery 기능: 좋아요(likes), 프로젝트 공개 갤러리 지원
-- Generated: 2026-04-05

-- ============================================================
-- 1. projects 테이블에 likes_count 컬럼 추가
-- ============================================================
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- 2. project_likes 테이블
-- ============================================================
CREATE TABLE IF NOT EXISTS project_likes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);

-- ============================================================
-- 3. 인덱스
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_project_likes_project_id
  ON project_likes(project_id);

CREATE INDEX IF NOT EXISTS idx_project_likes_user_id
  ON project_likes(user_id);

CREATE INDEX IF NOT EXISTS idx_projects_likes_count
  ON projects(likes_count DESC);

-- ============================================================
-- 4. RLS
-- ============================================================
ALTER TABLE project_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all likes"
  ON project_likes FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert their own likes"
  ON project_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can delete their own likes"
  ON project_likes FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 5. Helper functions
-- ============================================================
CREATE OR REPLACE FUNCTION increment_project_likes(p_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE projects
  SET likes_count = likes_count + 1
  WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION decrement_project_likes(p_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE projects
  SET likes_count = GREATEST(likes_count - 1, 0)
  WHERE id = p_id;
$$;
