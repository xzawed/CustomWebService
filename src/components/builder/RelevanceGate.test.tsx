// @vitest-environment happy-dom
import { vi, describe, it, expect } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import RelevanceGate from './RelevanceGate';
import type { ResolutionOptions } from '@/types/project';

const fullOptions: ResolutionOptions = {
  suggestedContexts: ['날씨 정보를 보여주는 서비스', '실시간 기상 알림 앱'],
  suggestedApis: [
    { category: '날씨', reason: '관련성 높음' },
    { category: '지도', reason: '위치 기반' },
  ],
  creativeMerges: ['날씨 + 일정 추천 서비스'],
};

describe('RelevanceGate', () => {
  it('relevanceScore와 reason을 헤더에 표시한다', () => {
    renderComponent(
      <RelevanceGate
        relevanceScore={42}
        reason="API와 컨텍스트가 다른 도메인입니다"
        resolutionOptions={fullOptions}
        onSelectContext={vi.fn()}
        onSelectApiCategory={vi.fn()}
        onSelectCreativeMerge={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByText(/연관성이 낮습니다 \(42점\)/)).toBeTruthy();
    expect(screen.getByText('API와 컨텍스트가 다른 도메인입니다')).toBeTruthy();
  });

  it('suggestedContexts 클릭 시 onSelectContext 호출', () => {
    const onSelectContext = vi.fn();
    renderComponent(
      <RelevanceGate
        relevanceScore={30}
        reason="r"
        resolutionOptions={fullOptions}
        onSelectContext={onSelectContext}
        onSelectApiCategory={vi.fn()}
        onSelectCreativeMerge={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('실시간 기상 알림 앱'));
    expect(onSelectContext).toHaveBeenCalledWith('실시간 기상 알림 앱');
  });

  it('suggestedApis 클릭 시 onSelectApiCategory가 category 값으로 호출', () => {
    const onSelectApiCategory = vi.fn();
    renderComponent(
      <RelevanceGate
        relevanceScore={30}
        reason="r"
        resolutionOptions={fullOptions}
        onSelectContext={vi.fn()}
        onSelectApiCategory={onSelectApiCategory}
        onSelectCreativeMerge={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('지도'));
    expect(onSelectApiCategory).toHaveBeenCalledWith('지도');
  });

  it('creativeMerges 클릭 시 onSelectCreativeMerge 호출', () => {
    const onSelectCreativeMerge = vi.fn();
    renderComponent(
      <RelevanceGate
        relevanceScore={30}
        reason="r"
        resolutionOptions={fullOptions}
        onSelectContext={vi.fn()}
        onSelectApiCategory={vi.fn()}
        onSelectCreativeMerge={onSelectCreativeMerge}
        onSkip={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('날씨 + 일정 추천 서비스'));
    expect(onSelectCreativeMerge).toHaveBeenCalledWith('날씨 + 일정 추천 서비스');
  });

  it('"그래도 현재 설정으로 생성" 클릭 시 onSkip 호출', () => {
    const onSkip = vi.fn();
    renderComponent(
      <RelevanceGate
        relevanceScore={30}
        reason="r"
        resolutionOptions={fullOptions}
        onSelectContext={vi.fn()}
        onSelectApiCategory={vi.fn()}
        onSelectCreativeMerge={vi.fn()}
        onSkip={onSkip}
      />,
    );
    fireEvent.click(screen.getByText('그래도 현재 설정으로 생성'));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('빈 resolution 카테고리는 해당 섹션을 숨긴다', () => {
    const empty: ResolutionOptions = {
      suggestedContexts: [],
      suggestedApis: [],
      creativeMerges: [],
    };
    renderComponent(
      <RelevanceGate
        relevanceScore={30}
        reason="r"
        resolutionOptions={empty}
        onSelectContext={vi.fn()}
        onSelectApiCategory={vi.fn()}
        onSelectCreativeMerge={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.queryByText(/선택한 API에 어울리는/)).toBeNull();
    expect(screen.queryByText(/서비스 설명에 어울리는 API/)).toBeNull();
    expect(screen.queryByText(/창의적으로 연결/)).toBeNull();
    // skip 버튼은 항상 노출
    expect(screen.getByText('그래도 현재 설정으로 생성')).toBeTruthy();
  });
});
