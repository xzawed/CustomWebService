-- Admin Stats 쿼리 성능 개선용 인덱스
-- CONCURRENTLY: 인덱스 생성 중 테이블 쓰기 차단 없음 (프로덕션 서비스 영향 0)
-- 주의: CONCURRENTLY는 트랜잭션 블록 내에서 실행 불가 — 단독 실행 필요

-- generated_codes: created_at 단독 범위 쿼리 (findMetadataByDateRange, admin/qc-stats)
-- 기존 idx_generated_codes_project_created는 project_id가 leading이라
-- project_id 없이 created_at 범위만 조회하는 admin stats에서는 효율이 낮음
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_generated_codes_created_at
  ON generated_codes(created_at DESC);

-- 참고: platform_events(type, created_at DESC)는 008_platform_events.sql에
-- 이미 idx_platform_events_type_time으로 존재하므로 추가 불필요.
-- S6/S7/S8(STAGE3_FALLBACK·STAGE_SKIPPED·QUALITY_LOOP_COMPLETED) 쿼리도
-- 모두 해당 기존 인덱스로 처리됨.
