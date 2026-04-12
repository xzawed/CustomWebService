# 갤러리 기능 설계 결정 (Phase A-1)

> **결정 날짜:** 2026-03-29  
> **상태:** Phase A-1 완료

---

## 배경

사용자들이 생성한 웹서비스를 다른 사용자와 공유하고 발견할 수 있는 공개 쇼케이스 공간이 필요했다. 프로젝트를 공개(published) 상태로 전환한 사용자의 결과물을 갤러리에 노출하여:

- 신규 사용자에게 플랫폼 결과물의 품질과 다양성을 직접 보여주는 랜딩/온보딩 역할
- 기존 사용자가 타인의 결과물을 포크(fork)하여 자신의 프로젝트로 재사용하는 반복 생성 촉진
- 좋아요(like) 기능으로 인기 프로젝트를 발굴하는 큐레이션 메커니즘 제공

갤러리는 별도 인증 없이 조회 가능하고, 인증 사용자는 좋아요/포크 기능을 추가로 사용할 수 있다.

---

## 핵심 설계 결정

### 1. 인증 없이 조회 가능
갤러리 목록(`GET /api/v1/gallery`)은 인증 없이 접근 가능. 인증 시에는 각 항목에 현재 사용자의 좋아요 여부가 포함된다. 이를 통해 비로그인 사용자도 플랫폼의 결과물을 탐색할 수 있다.

### 2. 포크 기능
`POST /api/v1/gallery/:id/fork`로 다른 사용자의 공개 프로젝트를 자신의 프로젝트로 복사. 생성된 HTML/CSS/JS 코드를 그대로 복제하여 재생성 없이 바로 수정/재배포 가능.

### 3. 공개 여부는 프로젝트 레벨에서 관리
갤러리 전용 테이블이 아닌, `projects.is_public` 플래그로 공개 여부 관리. 갤러리 쿼리는 `is_public = true`인 프로젝트를 필터링.

### 4. Repository 추상화 적용
DB Provider 이중화 아키텍처와 일관되게 `IGalleryRepository` 인터페이스 + `GalleryRepository`(Supabase) / `DrizzleGalleryRepository`(PostgreSQL) 구현체로 분리.

---

## 구현 위치

- API: `src/app/api/v1/gallery/` (목록, 좋아요, 포크)
- Service: `src/services/galleryService.ts`
- Repository: `src/repositories/galleryRepository.ts`
- Interface: `src/repositories/interfaces/IGalleryRepository.ts`
- UI: `src/app/(main)/gallery/`
