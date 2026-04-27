// @vitest-environment happy-dom
import { vi, describe, it, expect } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import { ApiKeyGuideModal } from './ApiKeyGuideModal';
import type { ApiKeyGuide } from '@/lib/apiKeyGuides';

const guide: ApiKeyGuide = {
  signupUrl: 'https://example.com/signup',
  estimatedTime: '약 5분',
  steps: [
    { title: '1단계: 회원가입', description: '공식 사이트에서 가입합니다.' },
    { title: '2단계: API 키 발급', description: '대시보드에서 키를 생성합니다.' },
  ],
  keyLabel: 'API Key',
  keyFormat: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  groupNote: undefined,
  tips: ['무료 플랜으로 시작하세요'],
};

describe('ApiKeyGuideModal', () => {
  it('API 이름이 제목에 표시된다', () => {
    renderComponent(<ApiKeyGuideModal apiName="날씨 API" guide={guide} onClose={vi.fn()} />);
    expect(screen.getByText('날씨 API 키 발급 방법')).toBeTruthy();
  });

  it('estimatedTime이 표시된다', () => {
    renderComponent(<ApiKeyGuideModal apiName="날씨 API" guide={guide} onClose={vi.fn()} />);
    expect(screen.getByText('약 5분')).toBeTruthy();
  });

  it('단계 제목이 렌더링된다', () => {
    renderComponent(<ApiKeyGuideModal apiName="날씨 API" guide={guide} onClose={vi.fn()} />);
    expect(screen.getByText('1단계: 회원가입')).toBeTruthy();
    expect(screen.getByText('2단계: API 키 발급')).toBeTruthy();
  });

  it('팁 내용이 렌더링된다', () => {
    renderComponent(<ApiKeyGuideModal apiName="날씨 API" guide={guide} onClose={vi.fn()} />);
    expect(screen.getByText('무료 플랜으로 시작하세요')).toBeTruthy();
  });

  it('groupNote가 있을 때 표시된다', () => {
    const guideWithNote = { ...guide, groupNote: '공통 안내 사항입니다.' };
    renderComponent(<ApiKeyGuideModal apiName="날씨 API" guide={guideWithNote} onClose={vi.fn()} />);
    expect(screen.getByText('공통 안내 사항입니다.')).toBeTruthy();
  });

  it('ESC 키로 onClose가 호출된다', () => {
    const onClose = vi.fn();
    renderComponent(<ApiKeyGuideModal apiName="날씨 API" guide={guide} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backdrop 버튼(aria-label="닫기") 클릭으로 onClose가 호출된다', () => {
    const onClose = vi.fn();
    renderComponent(<ApiKeyGuideModal apiName="날씨 API" guide={guide} onClose={onClose} />);
    // backdrop: <button type="button" className="absolute inset-0" aria-label="닫기" />
    const backdrop = screen.getAllByRole('button', { name: '닫기' })[0];
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
