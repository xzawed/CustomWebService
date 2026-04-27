// @vitest-environment happy-dom
import { vi, describe, it, expect } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import GuideQuestions from './GuideQuestions';

describe('GuideQuestions', () => {
  it('처음에 질문 목록이 열려있다', () => {
    renderComponent(<GuideQuestions onInsert={vi.fn()} />);
    expect(screen.getByText('이 서비스의 주요 사용자는 누구인가요?')).toBeTruthy();
  });

  it('토글 버튼 클릭 시 질문 목록이 닫힌다', () => {
    renderComponent(<GuideQuestions onInsert={vi.fn()} />);
    fireEvent.click(screen.getByText('가이드 질문을 참고하세요'));
    expect(screen.queryByText('이 서비스의 주요 사용자는 누구인가요?')).toBeNull();
  });

  it('토글 두 번 클릭 시 다시 열린다', () => {
    renderComponent(<GuideQuestions onInsert={vi.fn()} />);
    const toggle = screen.getByText('가이드 질문을 참고하세요');
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.getByText('이 서비스의 주요 사용자는 누구인가요?')).toBeTruthy();
  });

  it('질문 클릭 시 onInsert가 앞뒤 줄바꿈으로 감싼 텍스트와 함께 호출된다', () => {
    const onInsert = vi.fn();
    renderComponent(<GuideQuestions onInsert={onInsert} />);
    fireEvent.click(screen.getByText('이 서비스의 주요 사용자는 누구인가요?'));
    expect(onInsert).toHaveBeenCalledWith('\n이 서비스의 주요 사용자는 누구인가요?\n');
  });

  it('모든 버튼 수가 토글 1 + 질문 5 = 6개다', () => {
    renderComponent(<GuideQuestions onInsert={vi.fn()} />);
    expect(screen.getAllByRole('button').length).toBe(6);
  });
});
