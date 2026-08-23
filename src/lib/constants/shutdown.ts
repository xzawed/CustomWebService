/**
 * 서비스 종료 안내 — 종료일과 사용자 노출 문구의 **단일 출처**.
 *
 * 같은 날짜가 공지 배너와 생성 차단 503 응답 두 곳에 나온다. 문자열을 각자 들고 있으면
 * 한쪽만 고쳐져 사용자가 서로 다른 날짜를 보게 된다 — `cdn.ts`와 같은 이유로 여기 모은다.
 */

/** 운영 종료일(이 날까지 운영). 기계 판독용 — 표시에는 `SHUTDOWN_DATE_LABEL`을 쓴다. */
export const SHUTDOWN_DATE = '2026-08-31';

/** 사람이 읽는 종료일 표기. */
export const SHUTDOWN_DATE_LABEL = '2026년 8월 31일';

/** 공지 배너 제목. */
export const SHUTDOWN_BANNER_TITLE = '서비스 종료 안내';

/** 공지 배너 본문. */
export const SHUTDOWN_BANNER_MESSAGE =
  `이 서비스는 ${SHUTDOWN_DATE_LABEL}자로 운영을 종료합니다. ` +
  '종료 후에는 계정·프로젝트·게시된 사이트를 포함한 모든 데이터가 삭제되며 복구할 수 없습니다.';

/**
 * `enable_generation` 킬스위치가 내려갔을 때 생성·재생성 라우트가 돌려주는 문구.
 *
 * 종료 전에는 *"일시 중단"* 이었다. 종료가 확정된 뒤로 그 표현은 **거짓**이다 —
 * 다시 켜지지 않는다.
 */
export const GENERATION_DISABLED_MESSAGE =
  `${SHUTDOWN_DATE_LABEL} 서비스 종료에 따라 AI 생성 기능이 중단되었습니다. 다시 제공되지 않습니다.`;
