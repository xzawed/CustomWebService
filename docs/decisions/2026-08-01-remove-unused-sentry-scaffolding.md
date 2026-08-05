# 미사용 Sentry 스캐폴딩 제거

> **언제 읽나**: Sentry/@sentry/nextjs·withSentryConfig·SENTRY_DSN 재도입을 검토하거나, instrumentation.ts 부팅 훅만 손댈 때 — 스캐폴딩은 동작하지 않았고 SaaS 도입 제외

- 날짜: 2026-08-01
- 상태: 채택
- 관련: WBS C4(b) ([2026-07-31-project-wbs.md](../superpowers/plans/2026-07-31-project-wbs.md)), #220
- **부분 대체**: [2026-07-30-monitoring-sink-slack-only.md](2026-07-30-monitoring-sink-slack-only.md) 의
  **스캐폴딩 보존 문장만** supersede. **Slack-only sink·백업 경보 배선은 그대로 유효**하다.

## 배경

2026-07-30 ADR은 sink를 Slack으로 고정하면서도 Sentry env·config 파일을 코드에 남겼다.
당시 전제는 **“되돌릴 수 있는 결정”** — DSN만 넣으면 나중에 살릴 수 있고, 미설정 시
`enabled: false`라 해가 없다는 것이었다.

그 전제는 **2026-08-01 실측으로 거짓**이 됐다. 스캐폴딩은 동작하는 능력을 보존하지 않으며,
프로덕션 의존성·빌드 래퍼·문서/env 표면만 남긴다.

## 무엇이 바뀌었나 (실측 3가지)

1. **`onRequestError` 미export.** `src/instrumentation.ts`가 Sentry 서버 라우트 예외 캡처에
   필요한 `onRequestError`/`captureRequestError`를 export하지 않는다. Next 15+/Sentry v8+ 및
   Sentry v10 webpack helper 경고 기준에서, ADR이 기대한 “라우트 미처리 예외” 캡처는 **동작하지 않는다**.
2. **Next 16.2.12 `next build` 기본 bundler = Turbopack.**
   (`node_modules/next/dist/build/index.js` 의 `bundler = Bundler.Turbopack`, 본 프로젝트 빌드 스크립트는
   plain `next build`). Sentry v10 자체 메시지: Turbopack에서는 `sentry.client.config.ts`가
   더 이상 동작하지 않으며, 프로젝트에 **`instrumentation-client.ts`도 없다.** → 클라이언트 캡처도 무력.
3. **오너 2026-08-01 상시 결정: Sentry SaaS 도입은 제외**(“나중에”가 아님). C4(a)와 동일.
   “나중에 DSN만 넣으면 된다”는 보존 근거가 사라졌다.

즉 스캐폴딩은 **작동 능력 0**이면서 의존성·`withSentryConfig` 빌드 래퍼·env/문서 표면 비용만 남긴다.

## 결정

1. **`@sentry/nextjs` 및 config 3파일·next 래퍼·instrumentation 참조를 코드에서 제거**한다.
2. **Slack-only sink와 백업 경보 배선은 유지**한다 — 이 ADR은 모니터링 sink 정책을 바꾸지 않는다.
3. **C4(a) Sentry SaaS 제외 결정은 유지**한다. 스캐폴딩 삭제는 그 결정과 모순되지 않는다(오히려 정합).

## 삭제한 것

- `sentry.client.config.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts`
- `package.json` dependency `@sentry/nextjs`
- `next.config.ts`의 `withSentryConfig` import·래퍼 → `export default nextConfig`
- `src/instrumentation.ts`의 Sentry dynamic import 및 edge-only Sentry 블록
- `codecov.yml`의 `sentry.*.config.ts` ignore
- `.env.example` Sentry 블록 및 문서의 “config 보존” 서술

## 유지한 것 (의도적)

| 유지 | 이유 |
|------|------|
| `src/instrumentation.ts` 자체 | SQLite bootstrap · event persister · backup/retention 스케줄러 부팅 훅. 삭제하면 백업이 조용히 죽는다 |
| `nextConfig`의 `output: 'standalone'`, `serverExternalPackages: ['playwright-core', 'better-sqlite3']`, `poweredByHeader: false`, `images.remotePatterns` (4 entries) | 프로덕션 서빙·네이티브 모듈·이미지 설정. **byte-identical 유지** |
| Slack sink (`sendSlackAlert` · `errorRateMonitor` · `scheduleBackups` 경보) | 2026-07-30 결정의 본문 — 이 ADR이 supersede하지 않음 |
| C4(a) “Sentry SaaS ❌ 제외” | 유료 도입 거부는 별개 상시 결정 |

`withSentryConfig`가 합치던 `serverExternalPackages` 기본값(`amqplib`, `express`, `redis`, `pg` 등)은
프로젝트가 사용하지 않는다. 우리 배열의 두 항목만 남기면 된다.

## 비결정

- **Sentry SaaS를 다시 도입하지 않는다** (C4(a) 유지). 이 ADR은 “지금 안 쓰는 껍데기를 지운다”는 결정이다.
- **재도입은 새 제품 결정 + 새 통합**이다. 옛 `sentry.*.config.ts` / 구형 `withSentryConfig` 래퍼를
  `git checkout`으로 되살리는 것만으로는 **충분하지 않다** — `onRequestError` 배선,
  Turbopack 시대의 `instrumentation-client.ts`(또는 당시 권장 진입점), Next 메이저에 맞는
  SDK 버전·빌드 플러그인 재검증이 필요하다. “파일만 복구 = 완료”로 적지 말 것.

## 환경변수 (운영 조치)

코드는 더 이상 `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_ORG` / `SENTRY_PROJECT` /
`SENTRY_AUTH_TOKEN`을 읽지 않는다. Railway에 값이 남아 있으면 **삭제해도 된다**
(문서: [env-vars.md](../reference/env-vars.md) — removed/unused).

## 복원 방법

```bash
git checkout <sha-before-removal> -- \
  sentry.client.config.ts \
  sentry.server.config.ts \
  sentry.edge.config.ts \
  next.config.ts \
  src/instrumentation.ts \
  package.json \
  pnpm-lock.yaml

# 이후: pnpm install, Next/Sentry 현행 문서에 맞춰 onRequestError·client instrumentation
# 재배선, withSentryConfig(또는 후속 빌드 통합) 재검증, env/문서 재동기화.
# 위 파일 복구만으로 “도입 완료”가 아니다 — 비결정 절 참고.
```

스타일 참고: [2026-08-01-remove-external-deploy-stack.md](2026-08-01-remove-external-deploy-stack.md).

## 결과

- 미동작 프로덕션 의존성·빌드 래퍼 제거
- 문서/env 표면이 “이미 배선된 것처럼” 보이는 거짓 신호 제거
- WBS C4(b) 완료; C4(a) 제외·Slack-only sink는 유지
