export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
    // 이벤트 퍼시스터를 앱 시작 시 한 번 전역 등록한다(idempotent). 이전엔 generate·regenerate·
    // callback 라우트 모듈에서만 등록되어, 그 라우트들이 로드되기 전 projectService·deployService가
    // 발행한 이벤트(PROJECT_CREATED, DEPLOYMENT_* 등)가 영속화되지 않을 수 있었다.
    const { registerEventPersister } = await import('./lib/events/eventPersister');
    registerEventPersister();

    // SQLite 영속성 부팅 부트스트랩: 마이그레이션 적용 + 단일 관리자 시드(둘 다 멱등).
    // DB_PROVIDER=sqlite 에서만 동작 — 기존 Supabase 경로는 무영향(opt-in).
    if (process.env.DB_PROVIDER === 'sqlite') {
      const { getSqliteDb } = await import('./lib/db/sqlite/connection');
      const { bootstrapSqlite } = await import('./lib/db/sqlite/bootstrap');
      bootstrapSqlite(getSqliteDb());
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}
