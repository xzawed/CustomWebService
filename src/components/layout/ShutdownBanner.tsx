import type React from 'react';
import { SHUTDOWN_BANNER_MESSAGE, SHUTDOWN_BANNER_TITLE } from '@/lib/constants/shutdown';

/**
 * 전역 서비스 종료 공지 배너.
 *
 * **루트 레이아웃에서 렌더하는 이유**: 랜딩 페이지(`src/app/page.tsx`)가 `(main)` 라우트 그룹
 * **밖**에 있어 `(main)/layout.tsx`에 넣으면 첫 화면에서 공지가 보이지 않는다.
 *
 * **닫기 버튼을 두지 않는 이유**: 한 번 닫히면 공지의 목적이 사라지고, 남은 운영 기간이
 * 짧아 localStorage 상태를 만들 만한 가치가 없다.
 *
 * 문구·날짜는 `@/lib/constants/shutdown` 단일 출처에서만 가져온다.
 */
export function ShutdownBanner(): React.ReactElement {
  return (
    <div
      className="w-full border-b px-4 py-2.5 text-center text-sm leading-relaxed"
      style={{
        background: 'var(--warning)',
        color: 'var(--text-inverse)',
        borderColor: 'var(--border)',
      }}
    >
      <strong className="font-semibold">{SHUTDOWN_BANNER_TITLE}</strong>
      <span className="mx-2 opacity-60" aria-hidden="true">
        ·
      </span>
      <span>{SHUTDOWN_BANNER_MESSAGE}</span>
    </div>
  );
}
