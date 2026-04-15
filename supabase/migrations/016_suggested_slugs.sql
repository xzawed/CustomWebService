ALTER TABLE projects
  ADD COLUMN suggested_slugs TEXT[] DEFAULT NULL;

COMMENT ON COLUMN projects.suggested_slugs IS
  'AI가 코드 생성 완료 시점에 제안한 slug 후보 3개. 게시 다이얼로그에서 사용자에게 보여줌.';
