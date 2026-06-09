export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
    // 이벤트 퍼시스터를 앱 시작 시 한 번 전역 등록한다(idempotent). 이전엔 generate·regenerate·
    // callback 라우트 모듈에서만 등록되어, 그 라우트들이 로드되기 전 projectService·deployService가
    // 발행한 이벤트(PROJECT_CREATED, DEPLOYMENT_* 등)가 영속화되지 않을 수 있었다.
    const { registerEventPersister } = await import('./lib/events/eventPersister');
    registerEventPersister();
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}
