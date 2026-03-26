# Sprint 8 — 사용자 피드백 & 버전 관리

> 기반 문서: `docs/20_확장성_분석_및_로드맵.md` F8, F9
> 선행 조건: S7 완료
> 예상 기간: 2~3주
> 목표: 생성 품질 개선 루프 구축 + 코드 버전 이력 시각화

---

## 진행 현황

| 태스크 | 목표 | 상태 |
|--------|------|------|
| S8-1 | 피드백 수집 UI + 저장 | ⏳ 대기 |
| S8-2 | 피드백 기반 재생성 | ⏳ 대기 |
| S8-3 | 버전 히스토리 UI | ⏳ 대기 |
| S8-4 | 버전 간 Diff 뷰어 | ⏳ 대기 |

---

## S8-1. 피드백 수집 UI + 저장

### 배경

`generated_codes.metadata` JSONB에 `userFeedback` 필드가 타입 정의에 존재하나 미사용.
`buildRegenerationPrompt(code, feedback)` 함수가 이미 구현되어 있어 피드백 기반 재생성 파이프라인 준비 완료.

### 구현 내용

**1) FeedbackPanel 컴포넌트**

**신규 파일:** `src/components/builder/FeedbackPanel.tsx`

```
┌─ 생성된 서비스가 마음에 드시나요? ──────────────┐
│                                               │
│    [👍 좋아요]     [👎 개선 필요]              │
│                                               │
│  (👎 선택 시 펼침)                             │
│  ┌─────────────────────────────────────────┐  │
│  │ 어떤 부분을 개선하면 좋을까요?             │  │
│  │                                         │  │
│  │ ☐ 디자인/레이아웃이 마음에 안 들어요      │  │
│  │ ☐ API 데이터가 제대로 표시되지 않아요     │  │
│  │ ☐ 원하는 기능이 빠져있어요               │  │
│  │ ☐ 모바일에서 잘 안 보여요                │  │
│  │ ☐ 기타                                  │  │
│  │                                         │  │
│  │ [상세 의견 입력 (선택)]                   │  │
│  │ ┌───────────────────────────────────┐   │  │
│  │ │                                   │   │  │
│  │ └───────────────────────────────────┘   │  │
│  └─────────────────────────────────────────┘  │
│                                               │
│              [피드백 반영하여 재생성]            │
└───────────────────────────────────────────────┘
```

**2) 피드백 저장 API**

**신규 파일:** `src/app/api/v1/projects/[id]/feedback/route.ts`

```
POST /api/v1/projects/:id/feedback
body: {
  rating: 'positive' | 'negative',
  categories: string[],
  comment?: string
}
→ generated_codes.metadata.userFeedback에 저장
```

**3) CodeRepository 확장**

**수정 파일:** `src/repositories/codeRepository.ts`

- `updateFeedback(projectId: string, version: number, feedback: object)` 메서드 추가

### 완료 조건
- [ ] 생성 완료 후 피드백 패널 표시
- [ ] 👍/👎 클릭 시 DB에 저장
- [ ] 👎 시 개선 카테고리 + 상세 의견 수집

---

## S8-2. 피드백 기반 재생성

### 배경

`promptBuilder.ts`에 `buildRegenerationPrompt(code, feedback)` 이미 구현됨.
피드백 데이터를 이 함수에 전달하여 개선된 코드를 재생성.

### 구현 내용

**1) GenerationService 확장**

**수정 파일:** `src/services/generationService.ts`

- `regenerateWithFeedback(projectId, feedback, onProgress)` 메서드 추가
- 기존 코드 + 피드백을 `buildRegenerationPrompt()`에 전달
- 새 버전으로 저장 (version 자동 증가)

**2) 재생성 API 라우트**

**신규 파일:** `src/app/api/v1/projects/[id]/regenerate/route.ts`

```
POST /api/v1/projects/:id/regenerate
body: {
  feedback: string,
  categories: string[]
}
→ SSE 스트림으로 재생성 진행 상황 전달
```

**3) useGeneration 훅 확장**

**수정 파일:** `src/hooks/useGeneration.ts`

- `regenerate(projectId, feedback)` 함수 추가
- 기존 SSE 패턴 재사용

**4) 빌더 UI 연결**

**수정 파일:** `src/app/(main)/builder/page.tsx`

- FeedbackPanel의 "피드백 반영하여 재생성" 버튼 → `regenerate()` 호출
- 재생성 중 GenerationProgress 컴포넌트 재사용

### 완료 조건
- [ ] "피드백 반영하여 재생성" 클릭 시 SSE 스트림으로 재생성
- [ ] 재생성 결과가 새 버전으로 저장 (version +1)
- [ ] 피드백 내용이 프롬프트에 반영됨
- [ ] 일일 생성 횟수 제한에 재생성도 포함

---

## S8-3. 버전 히스토리 UI

### 배경

`generated_codes` 테이블에 `(project_id, version)` UNIQUE 제약 존재.
`projects.current_version`으로 현재 활성 버전 추적.
`POST /api/v1/projects/:id/rollback` 엔드포인트 이미 구현됨.

### 구현 내용

**1) 버전 목록 API**

**신규 파일:** `src/app/api/v1/projects/[id]/versions/route.ts`

```
GET /api/v1/projects/:id/versions
→ [{version, createdAt, aiModel, generationTimeMs, tokenUsage}]
```

**2) VersionHistory 컴포넌트**

**신규 파일:** `src/components/dashboard/VersionHistory.tsx`

```
┌─ 버전 이력 ────────────────────────────────────┐
│                                               │
│  v3 (현재)  ·  2026-03-26 14:30  ·  grok-3    │
│     토큰: 1,234  ·  생성 시간: 8.2초           │
│     [미리보기]  [코드 보기]  [Diff]             │
│                                               │
│  v2          ·  2026-03-26 14:15  ·  grok-3    │
│     토큰: 1,102  ·  생성 시간: 7.5초           │
│     [미리보기]  [코드 보기]  [Diff]  [롤백]     │
│                                               │
│  v1          ·  2026-03-26 14:00  ·  grok-3    │
│     토큰: 987   ·  생성 시간: 6.8초            │
│     [미리보기]  [코드 보기]  [Diff]  [롤백]     │
│                                               │
└───────────────────────────────────────────────┘
```

**3) 대시보드 상세 페이지 연결**

**수정 파일:** `src/app/(main)/dashboard/[id]/page.tsx`

- "버전 이력" 섹션에 VersionHistory 컴포넌트 배치
- "롤백" 클릭 시 확인 모달 → `POST /api/v1/projects/:id/rollback` 호출

### 완료 조건
- [ ] 대시보드 상세에서 버전 이력 표시
- [ ] 각 버전의 메타데이터(AI 모델, 토큰, 시간) 표시
- [ ] "롤백" 클릭 시 해당 버전으로 전환

---

## S8-4. 버전 간 Diff 뷰어

### 구현 내용

**1) CodeDiffViewer 컴포넌트**

**신규 파일:** `src/components/dashboard/CodeDiffViewer.tsx`

- 두 버전의 HTML/CSS/JS를 좌우 분할 또는 인라인 diff로 표시
- 추가된 줄: 녹색 배경, 삭제된 줄: 빨간색 배경
- 탭으로 HTML/CSS/JS 전환
- 외부 라이브러리 없이 LCS(Longest Common Subsequence) 기반 간단한 diff 구현

**2) Diff API**

**신규 파일:** `src/app/api/v1/projects/[id]/diff/route.ts`

```
GET /api/v1/projects/:id/diff?v1=1&v2=3
→ { html: {added: [...], removed: [...]}, css: {...}, js: {...} }
```

**3) VersionHistory 연결**

**수정 파일:** `src/components/dashboard/VersionHistory.tsx`

- "Diff" 버튼 클릭 시 현재 버전과의 차이를 CodeDiffViewer 모달로 표시

### 완료 조건
- [ ] 두 버전 간 코드 차이 시각적 표시
- [ ] HTML/CSS/JS 각각 diff 확인 가능
- [ ] 추가/삭제 줄 색상 구분
- [ ] 버전 이력에서 "Diff" 클릭으로 접근

---

## S8 완료 조건 종합

- [ ] 피드백 수집 → 저장 → 재생성 파이프라인 동작
- [ ] 버전 이력 조회 및 롤백
- [ ] 버전 간 diff 비교
- [ ] 빌드 통과, 기존 기능 회귀 없음
