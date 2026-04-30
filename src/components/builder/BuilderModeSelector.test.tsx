// @vitest-environment happy-dom
import { vi, describe, it, expect } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import BuilderModeSelector from './BuilderModeSelector';

describe('BuilderModeSelector', () => {
  it('두 가지 시작 방식(API 직접 선택 / 아이디어로 시작)을 노출한다', () => {
    renderComponent(<BuilderModeSelector onSelect={vi.fn()} />);
    expect(screen.getByText('API를 직접 선택')).toBeTruthy();
    expect(screen.getByText('아이디어로 시작')).toBeTruthy();
  });

  it('헤더 문구를 렌더링한다', () => {
    renderComponent(<BuilderModeSelector onSelect={vi.fn()} />);
    expect(screen.getByText('새 서비스 만들기')).toBeTruthy();
    expect(screen.getByText('어떤 방식으로 시작하시겠어요?')).toBeTruthy();
  });

  it('"API를 직접 선택" 카드 클릭 시 onSelect("api-first") 호출', () => {
    const onSelect = vi.fn();
    renderComponent(<BuilderModeSelector onSelect={onSelect} />);
    fireEvent.click(screen.getByText('API를 직접 선택').closest('button')!);
    expect(onSelect).toHaveBeenCalledWith('api-first');
  });

  it('"아이디어로 시작" 카드 클릭 시 onSelect("context-first") 호출', () => {
    const onSelect = vi.fn();
    renderComponent(<BuilderModeSelector onSelect={onSelect} />);
    fireEvent.click(screen.getByText('아이디어로 시작').closest('button')!);
    expect(onSelect).toHaveBeenCalledWith('context-first');
  });

  it('각 카드의 진행 단계 라벨을 표시한다', () => {
    renderComponent(<BuilderModeSelector onSelect={vi.fn()} />);
    expect(screen.getAllByText('생성').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('API 매칭')).toBeTruthy();
    // "서비스 설명"은 두 카드 모두에 등장
    expect(screen.getAllByText('서비스 설명').length).toBeGreaterThanOrEqual(2);
  });
});
