# 생성 모델 Opus 4.8 → Opus 5 상향 (2026-07-29)

> **언제 읽나**: AI_MODEL_GENERATION/SUGGESTION, ALLOWED_CLAUDE_MODELS, ClaudeProvider thinking(disabled/adaptive)·output_config.effort, AiProviderFactory 모델 ID를 손댈 때 — Opus 5 에서 thinking 생략=adaptive 기본

## 상태

승인됨 — 구현·배포 완료

## 결정

| 용도 | 이전 | 이후 | 비고 |
|------|------|------|------|
| 코드 생성 (`AI_MODEL_GENERATION`) | `claude-opus-4-8` | **`claude-opus-5`** | 동일 가격($5/$25 per MTok), 1M 컨텍스트 |
| Sonnet 폴백 (`ClaudeProvider` 기본 인자) | `claude-sonnet-4-6` | **`claude-sonnet-5`** | |
| 컨텍스트 추천 (`AI_MODEL_SUGGESTION`) | `claude-haiku-4-5` | **변경 없음** | 4.5가 최신 Haiku — Haiku 5는 존재하지 않는다 |

허용목록(`ALLOWED_CLAUDE_MODELS`)에는 신모델을 **추가**하고 구세대 ID는 남겼다.

## 왜 구세대 ID를 지우지 않았나

허용목록에 없는 `AI_MODEL_*` 값은 `logger.warn` 한 줄만 남기고 **조용히 기본값으로 폴백**한다.
구세대 ID를 지우면 문제 발생 시 Railway env를 되돌리는 **롤백이 무시되고** 신모델이 계속 쓰인다.
"env만 되돌리면 복구된다"가 성립해야 하므로 목록에 남긴다. 테스트가 이 성질을 고정한다.

## 파괴적 변경 2건 — 실측으로 확인하고 대응

모델 ID만 바꾸면 되는 상향이 아니었다. 실제 Anthropic API로 검증한 결과:

### 1. `thinking` 생략은 더 이상 "사고 안 함"이 아니다

`ClaudeProvider`는 ET 비활성 경로에서 `thinking`을 **생략**하고 있었다. Opus 4.8에서는 그것이
"사고 없음"이었지만 **Opus 5는 생략 시 adaptive thinking이 기본으로 켜진다.**

```
opus-5   thinking 생략      → blocks=[thinking,text]   out_tok=482
opus-5   thinking:disabled  → blocks=[text]            out_tok=638
opus-4-8 thinking 생략      → blocks=[text]            out_tok=314
```

방치하면 `max_tokens`(48000)를 **thinking과 생성된 HTML이 나눠 쓴다** — 큰 페이지에서 코드가
잘린다. 파이프라인은 Railway 300초 한도를 290초 예산으로 쪼개 쓰고 있어 지연 증가도 그대로 위험이다.

**대응**: ET 비활성 경로에 `thinking: { type: 'disabled' }`를 **명시**해 기존 동작을 보존한다.

### 2. `disabled` + `effort: xhigh|max`는 400

```
opus-5 thinking:disabled + effort:xhigh
  → HTTP 400 invalid_request_error
    "output_config.effort 'xhigh' is not supported when thinking is disabled on this model"
```

**대응**: thinking을 끌 때는 `output_config`를 **아예 보내지 않는다**. 기본 effort(high)에서만
`disabled`가 허용되므로, 보내지 않으면 금지 조합이 만들어질 수 없다. ET 활성 경로는 기존대로
`adaptive` + `effort: high`라 영향 없다.

## adaptive를 켜지 않고 disabled를 택한 이유

마이그레이션 가이드는 Opus 5에서 thinking을 끄면 `<thinking>` 태그가 응답에 새어 나올 수 있다고
경고하며 낮은 effort의 adaptive를 권한다. 이 프로젝트는 **생성물이 그대로 사용자 사이트가 되므로**
태그 누출은 실제 위험이다. 그래서 추정하지 않고 측정했다 — 실제 코드 생성 프롬프트로 3회 실행:

```
run 1  out_tok=4685  stop=end_turn  태그누출=없음  "```html\n<!DOCTYPE html>..."
run 2  out_tok=5287  stop=end_turn  태그누출=없음  "```html\n<!DOCTYPE html>..."
run 3  out_tok=4971  stop=end_turn  태그누출=없음  "```html\n<!DOCTYPE html>..."
```

누출이 관측되지 않았고, 반대로 adaptive를 전면 도입하면 매 생성마다 thinking 토큰과 지연이 붙어
**290초 파이프라인 예산을 위협**한다. ET는 이미 `evaluateComplexityScore() >= 35`로 **의도적으로
조건부**인데, 전면 도입은 그 설계 결정을 조용히 뒤집는 것이기도 하다.

따라서 **현행 동작 보존**을 택했다. 생성 품질을 위해 adaptive를 넓히는 것은 비용·지연 트레이드오프가
있는 별개의 제품 결정이므로, 이번 상향에 끼워 넣지 않는다.

## 검증

모든 모델 ID를 **실제 API로 스모크 테스트**했다(타입 통과만으로 확신하지 않는다는 원칙).

| 프로브 | 결과 |
|--------|------|
| `claude-opus-5` 기본 / `disabled` / `adaptive`+`effort:high` | 200 |
| `claude-opus-5` `disabled`+`effort:xhigh` | **400** (예상된 제약 확인) |
| `claude-sonnet-5` 기본 / `disabled` | 200 |
| `claude-haiku-4-5` | 200 (`claude-haiku-4-5-20251001`로 해석됨) |
| `claude-opus-4-8` (비교군) | 200 |

| 항목 | 결과 |
|------|------|
| `pnpm test` | **172 파일 / 2168 통과** |
| `pnpm type-check` · `pnpm lint` · `pnpm build` | 통과 |

신규 테스트가 고정하는 것: ET 비활성 시 `thinking: disabled` 명시, 그때 `output_config` 미전송,
신모델이 허용목록에 있음, **구세대 ID가 롤백용으로 남아 있음**.

## 롤백

Railway env만 되돌리면 된다(허용목록에 남겨둔 이유).

```bash
railway variable set AI_MODEL_GENERATION=claude-opus-4-8
```

`thinking: disabled` 명시는 Opus 4.8에서도 유효하므로(4.8의 기본 동작과 동일) 코드 롤백은 불필요하다.

## 관련 문서

- [환경변수](../reference/env-vars.md) — `AI_MODEL_GENERATION` · `AI_MODEL_SUGGESTION`
- `src/providers/ai/AiProviderFactory.ts` — `ALLOWED_CLAUDE_MODELS` · `TASK_DEFAULTS`
- `src/providers/ai/ClaudeProvider.ts` — thinking 분기
