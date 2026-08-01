export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
    // 이벤트 퍼시스터를 앱 시작 시 한 번 전역 등록한다(idempotent). 이전엔 generate·regenerate·
    // callback 라우트 모듈에서만 등록되어, 그 라우트들이 로드되기 전 projectService 등이
    // 발행한 이벤트(PROJECT_CREATED 등)가 영속화되지 않을 수 있었다.
    const { registerEventPersister } = await import('./lib/events/eventPersister');
    registerEventPersister();

    // SQLite 영속성 부팅 부트스트랩: 마이그레이션 적용 + 카탈로그/플래그 시드(모두 멱등).
    // (관리자 시드는 2026-06-24 공개 회원가입 전환으로 제거됨.)
    // 임베디드 SQLite가 유일한 DB 백엔드이므로 무조건 실행한다.
    const { getSqliteDb, getSqliteRawConnection, getSqlitePath } = await import(
      './lib/db/sqlite/connection'
    );
    const { bootstrapSqlite } = await import('./lib/db/sqlite/bootstrap');
    bootstrapSqlite(getSqliteDb());

    const isRealFile = getSqlitePath() !== ':memory:';

    // 주기 SQLite 백업(P6.3): 컨테이너 내 `.backup` 덤프 + 보관 정책. 외부 의존·비용 없음.
    // 단일 인스턴스(Railway 볼륨) 전제. ':memory:'(테스트/특수 환경)에서는 건너뛴다.
    const { getBackupConfig, scheduleBackups } = await import('./lib/db/sqlite/backup');
    const backupConfig = getBackupConfig();
    if (backupConfig.enabled && isRealFile) {
      scheduleBackups(getSqliteRawConnection(), backupConfig);
    }

    // 주기 보존 정책: platform_events·auth_tokens·user_daily_limits는 삭제 경로가 없어
    // 단조 증가했다(generated_codes만 pruneOldVersions로 정리됨). 백업 스케줄러와 동일 전제.
    const { getRetentionConfig, scheduleRetention } = await import('./lib/db/sqlite/retention');
    const retentionConfig = getRetentionConfig();
    if (retentionConfig.enabled && isRealFile) {
      scheduleRetention(getSqliteRawConnection(), retentionConfig);
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}
