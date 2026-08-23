// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { renderComponent, screen } from '@/test/helpers/component';
import { ShutdownBanner } from './ShutdownBanner';

// 상수를 import해 비교하면 "상수 → 컴포넌트 → 다시 상수"라 항상 통과한다.
// 사용자가 실제로 보는 문자열을 리터럴로 고정해야 배너가 문구를 잃었을 때 깨진다.
describe('ShutdownBanner', () => {
  it('종료 안내 제목을 렌더링한다', () => {
    renderComponent(<ShutdownBanner />);
    expect(screen.getByText('서비스 종료 안내')).toBeTruthy();
  });

  it('종료일을 본문에 노출한다', () => {
    renderComponent(<ShutdownBanner />);
    expect(screen.getByText(/2026년 8월 31일/)).toBeTruthy();
  });

  it('데이터가 삭제되고 복구되지 않는다는 사실을 함께 알린다', () => {
    renderComponent(<ShutdownBanner />);
    expect(screen.getByText(/복구할 수 없습니다/)).toBeTruthy();
  });
});
