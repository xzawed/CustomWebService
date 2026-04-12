# Repository 팩토리 패턴 도입 결정

> **결정 날짜:** 2026-03-31  
> **상태:** 완료 (모든 Service/Repository 적용 완료, 287개 테스트 통과)

---

## 배경

AI 코드 생성 파이프라인 품질 개선 작업(2026-03-31) 진행 중, Service와 Repository를 Route Handler에서 직접 `new XxxService(supabase)` 형태로 생성하는 패턴이 테스트 모킹을 어렵게 만들고 있었다. 또한 이후 DB Provider 이중화(Supabase ↔ PostgreSQL 전환) 계획이 수립되면서, Route Handler 코드를 건드리지 않고 내부 구현체만 교체할 수 있는 팩토리 패턴이 필요해졌다.

기존 방식에서는 각 API Route가 `SupabaseClient`를 직접 Service 생성자에 주입해야 했기 때문에:
- 테스트 시 Service 모킹이 까다로웠고
- DB Provider 전환 시 모든 Route Handler 파일을 수정해야 하는 문제가 있었다

---

## 결정 내용

- `new XxxService(supabase)` 직접 생성 → `createXxxService(supabase)` 팩토리 함수로 전환
- 테스트에서 `vi.mock('@/services/factory')` 패턴으로 일관된 모킹 가능
- Provider 전환 시 팩토리 내부만 수정 (Route Handler 코드 변경 불필요)

---

## 현재 팩토리 파일

- `src/services/factory.ts` — 모든 Service 생성 함수
- `src/repositories/factory.ts` — 모든 Repository 생성 함수
- 인터페이스: `src/repositories/interfaces/` — 각 Repository의 계약 정의

---

## 테스트 모킹 패턴

```typescript
vi.mock('@/services/factory', () => ({
  createProjectService: vi.fn(),
  createRateLimitService: vi.fn(),
}));
vi.mock('@/repositories/factory', () => ({
  createCodeRepository: vi.fn(),
}));
```
