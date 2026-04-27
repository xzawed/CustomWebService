// src/components/builder/StepIndicator.test.tsx
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { renderComponent, screen } from '@/test/helpers/component';
import StepIndicator from './StepIndicator';

const steps = [
  { label: '서비스 설명' },
  { label: 'API 선택' },
  { label: '코드 생성' },
];

describe('StepIndicator', () => {
  it('모든 단계 라벨을 렌더링한다', () => {
    renderComponent(<StepIndicator currentStep={1} steps={steps} />);
    expect(screen.getByText('서비스 설명')).toBeTruthy();
    expect(screen.getByText('API 선택')).toBeTruthy();
    expect(screen.getByText('코드 생성')).toBeTruthy();
  });

  it('활성 단계(currentStep=2)의 숫자 "2"가 DOM에 존재한다', () => {
    renderComponent(<StepIndicator currentStep={2} steps={steps} />);
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('완료된 단계에는 숫자가 없다 (체크마크로 대체)', () => {
    renderComponent(<StepIndicator currentStep={2} steps={steps} />);
    // step num=1 → isCompleted = (2 > 1) = true → Check 아이콘, "1" 텍스트 없음
    expect(screen.queryByText('1')).toBeNull();
  });

  it('currentStep=1일 때 단계 1이 활성화된다', () => {
    renderComponent(<StepIndicator currentStep={1} steps={steps} />);
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('빈 steps 배열에서 크래시 없이 렌더링된다', () => {
    expect(() => renderComponent(<StepIndicator currentStep={1} steps={[]} />)).not.toThrow();
  });
});
