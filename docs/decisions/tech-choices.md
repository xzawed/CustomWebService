# 핵심 기술 선택 배경

> **최종 업데이트:** 2026-04-12

---

## Next.js App Router

Next.js 16 App Router를 선택한 주요 이유:

- **서버 컴포넌트**: 데이터 페칭을 서버에서 처리하여 클라이언트 번들 최소화. 갤러리 목록, 프로젝트 대시보드 등 초기 로딩 성능 중요 페이지에서 활용.
- **API Routes 통합**: 별도 백엔드 서버 없이 `/api/v1/*` REST 엔드포인트를 동일 저장소에서 관리. 단일 Railway 인스턴스로 프론트엔드 + API를 함께 배포 가능.
- **Middleware**: 서브도메인 라우팅(`slug.xzawed.xyz` → `/site/[slug]` rewrite)과 보안 헤더(CSP, HSTS)를 단일 `middleware.ts`에서 처리.
- **Standalone Output**: Docker/Railway 배포를 위한 Next.js standalone 모드로 이미지 크기 최소화.
- **TypeScript strict mode**: 전체 코드베이스에 걸쳐 타입 안전성 보장. `any` 사용 금지 원칙 적용.

---

## Supabase

- **PostgreSQL + Auth + RLS 통합**: 별도 Auth 서버 없이 Google/GitHub OAuth를 즉시 사용 가능. Row Level Security로 DB 레벨에서 데이터 소유권 검증.
- **무료 티어**: 현재 트래픽 규모에서 무료로 운영 가능. 향후 비용 절감이 필요하면 `DB_PROVIDER=postgres`로 전환 가능한 이중화 아키텍처를 미리 구축.
- **Realtime 지원**: 향후 협업 기능(F14) 구현 시 Supabase Realtime 채널을 활용할 수 있는 기반 확보.
- **확장 경로 확보**: `DB_PROVIDER` 환경변수 하나로 온프레미스 PostgreSQL + Auth.js로 전환 가능 (이중화 아키텍처 구현 완료).

---

## Railway 배포

- **단순한 배포 파이프라인**: Dockerfile 기반으로 GitHub Actions → Railway 자동 배포. 별도 Kubernetes나 복잡한 인프라 설정 불필요.
- **단일 인스턴스**: 현재 규모에서 단일 컨테이너로 충분. Next.js standalone output으로 이미지 최적화.
- **환경변수 관리**: Railway 대시보드에서 환경변수 직접 관리. 시크릿 노출 없이 배포 설정 변경 가능.

---

## Tailwind CSS (shadcn/ui 미사용)

디자인 시스템을 직접 구현하여 번들 크기 최소화 및 커스터마이징 자유도 확보. shadcn/ui는 Radix UI 의존성 등 추가 복잡도를 수반하므로 현재 규모에서는 불필요하다고 판단.

---

## Zustand (상태 관리)

관심사별 분리된 스토어 패턴. 단일 전역 스토어의 리렌더링 문제 방지. persist middleware로 선택적 상태 영속화.

초기에는 모든 빌더 상태가 단일 `builderStore`에 집중된 God Store 문제가 있었다 (확장성 검토에서 HIGH 심각도로 분류). 이를 5개 분리 스토어로 해체:
- `contextStore` — 서비스 설명 및 디자인 선호도
- `apiSelectionStore` — API 선택 상태
- `generationStore` — 생성 결과 및 진행 상태
- 기타 관심사별 스토어

새 기능 추가 시 기존 스토어를 건드리지 않고 새 스토어 파일만 추가하면 된다.
