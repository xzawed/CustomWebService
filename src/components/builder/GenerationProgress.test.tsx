// @vitest-environment happy-dom
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderComponent, screen, fireEvent, act } from '@/test/helpers/component';
import GenerationProgress from './GenerationProgress';

const baseProps = {
  status: 'idle' as const,
  progress: 0,
  currentStep: '',
  error: null,
  selectedApiCount: 3,
  onGenerate: vi.fn(),
  onRetry: vi.fn(),
  onNavigateDashboard: vi.fn(),
};

describe('GenerationProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('idle 상태', () => {
    it('"준비 완료!" + selectedApiCount + 생성하기 버튼을 노출한다', () => {
      renderComponent(<GenerationProgress {...baseProps} status="idle" selectedApiCount={5} />);
      expect(screen.getByText('준비 완료!')).toBeTruthy();
      expect(screen.getByText(/선택한 5개의 API/)).toBeTruthy();
      expect(screen.getByText('생성하기')).toBeTruthy();
    });

    it('생성하기 클릭 시 onGenerate가 호출된다', () => {
      const onGenerate = vi.fn();
      renderComponent(<GenerationProgress {...baseProps} status="idle" onGenerate={onGenerate} />);
      fireEvent.click(screen.getByText('생성하기'));
      expect(onGenerate).toHaveBeenCalledTimes(1);
    });
  });

  describe('generating 상태', () => {
    it('phase 라벨과 progress 퍼센트를 표시한다', () => {
      renderComponent(
        <GenerationProgress
          {...baseProps}
          status="generating"
          progress={42}
          currentStep="API 분석 중"
        />,
      );
      expect(screen.getByText('API 분석')).toBeTruthy();
      expect(screen.getByText('42%')).toBeTruthy();
    });

    it('currentStep "디자인 적용 중" → styling phase로 매핑된다', () => {
      renderComponent(
        <GenerationProgress
          {...baseProps}
          status="generating"
          progress={88}
          currentStep="디자인 적용 중"
        />,
      );
      expect(screen.getByText('디자인 적용')).toBeTruthy();
    });

    it('currentStep "검증 중" → validating phase로 매핑된다', () => {
      renderComponent(
        <GenerationProgress
          {...baseProps}
          status="generating"
          progress={92}
          currentStep="보안 검증 중"
        />,
      );
      expect(screen.getByText('보안 검증')).toBeTruthy();
    });

    it('알 수 없는 currentStep은 generating_code로 fallback된다', () => {
      renderComponent(
        <GenerationProgress
          {...baseProps}
          status="generating"
          progress={50}
          currentStep="???"
        />,
      );
      expect(screen.getByText('코드 생성')).toBeTruthy();
    });

    it('1초 경과 후 "1초 경과" 라벨이 표시된다', () => {
      renderComponent(
        <GenerationProgress
          {...baseProps}
          status="generating"
          progress={20}
          currentStep="API 분석"
        />,
      );
      expect(screen.getByText('0초 경과')).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByText('1초 경과')).toBeTruthy();
    });

    it('60초 경과 시 "1분 0초 경과" 형태로 표시된다', () => {
      renderComponent(
        <GenerationProgress
          {...baseProps}
          status="generating"
          progress={20}
          currentStep="API 분석"
        />,
      );
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(screen.getByText('1분 0초 경과')).toBeTruthy();
    });

    it('모든 generation 단계 라벨(분석/생성/디자인/검증)을 노출한다', () => {
      renderComponent(
        <GenerationProgress
          {...baseProps}
          status="generating"
          progress={40}
          currentStep="API 분석 중"
        />,
      );
      expect(screen.getByText('분석')).toBeTruthy();
      expect(screen.getByText('생성')).toBeTruthy();
      expect(screen.getByText('디자인')).toBeTruthy();
      expect(screen.getByText('검증')).toBeTruthy();
    });
  });

  describe('completed 상태', () => {
    it('"생성 완료!" + 대시보드 이동 버튼을 노출한다', () => {
      renderComponent(<GenerationProgress {...baseProps} status="completed" />);
      expect(screen.getByText('생성 완료!')).toBeTruthy();
      expect(screen.getByText('대시보드에서 확인하기')).toBeTruthy();
    });

    it('대시보드 버튼 클릭 시 onNavigateDashboard 호출', () => {
      const onNavigateDashboard = vi.fn();
      renderComponent(
        <GenerationProgress
          {...baseProps}
          status="completed"
          onNavigateDashboard={onNavigateDashboard}
        />,
      );
      fireEvent.click(screen.getByText('대시보드에서 확인하기'));
      expect(onNavigateDashboard).toHaveBeenCalledTimes(1);
    });
  });

  describe('failed 상태', () => {
    it('에러 메시지와 다시 시도 버튼을 노출한다', () => {
      renderComponent(
        <GenerationProgress {...baseProps} status="failed" error="네트워크 오류" />,
      );
      expect(screen.getByText('생성 실패')).toBeTruthy();
      expect(screen.getByText('네트워크 오류')).toBeTruthy();
      expect(screen.getByText('다시 시도')).toBeTruthy();
    });

    it('다시 시도 클릭 시 onRetry 호출', () => {
      const onRetry = vi.fn();
      renderComponent(
        <GenerationProgress
          {...baseProps}
          status="failed"
          error="실패"
          onRetry={onRetry}
        />,
      );
      fireEvent.click(screen.getByText('다시 시도'));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });
});
