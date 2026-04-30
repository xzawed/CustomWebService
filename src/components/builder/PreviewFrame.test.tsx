// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import PreviewFrame from './PreviewFrame';

function getIframe(container: HTMLElement): HTMLIFrameElement {
  return container.querySelector('iframe')!;
}

describe('PreviewFrame', () => {
  it('iframe src에 projectId와 cacheBust(t) 쿼리가 포함된다', () => {
    const { container } = renderComponent(<PreviewFrame projectId="proj-1" />);
    const iframe = getIframe(container);
    expect(iframe.src).toContain('/api/v1/preview/proj-1');
    expect(iframe.src).toContain('t=0');
  });

  it('version prop이 있으면 src에 version 쿼리를 추가한다', () => {
    const { container } = renderComponent(<PreviewFrame projectId="proj-1" version={3} />);
    expect(getIframe(container).src).toContain('version=3');
  });

  it('version prop이 없으면 src에 version 쿼리가 없다', () => {
    const { container } = renderComponent(<PreviewFrame projectId="proj-1" />);
    expect(getIframe(container).src).not.toContain('version=');
  });

  it('초기 device는 desktop이며 100% 너비로 렌더링된다', () => {
    const { container } = renderComponent(<PreviewFrame projectId="proj-1" />);
    const iframe = getIframe(container);
    expect(iframe.style.width).toBe('100%');
    expect(screen.getByText(/미리보기 — 데스크톱/)).toBeTruthy();
  });

  it('태블릿 버튼 클릭 시 라벨이 "태블릿"으로 변경된다', () => {
    renderComponent(<PreviewFrame projectId="proj-1" />);
    expect(screen.getByText(/미리보기 — 데스크톱/)).toBeTruthy();
    fireEvent.click(screen.getByTitle('태블릿'));
    expect(screen.getByText(/미리보기 — 태블릿/)).toBeTruthy();
  });

  it('모바일 버튼 클릭 시 라벨이 "모바일"으로 변경된다', () => {
    renderComponent(<PreviewFrame projectId="proj-1" />);
    fireEvent.click(screen.getByTitle('모바일'));
    expect(screen.getByText(/미리보기 — 모바일/)).toBeTruthy();
  });

  it('새로고침 클릭 시 iframe src의 t 쿼리가 증가한다', () => {
    const { container } = renderComponent(<PreviewFrame projectId="proj-1" />);
    expect(getIframe(container).src).toContain('t=0');
    fireEvent.click(screen.getByTitle('새로고침'));
    expect(getIframe(container).src).toContain('t=1');
    fireEvent.click(screen.getByTitle('새로고침'));
    expect(getIframe(container).src).toContain('t=2');
  });

  it('iframe sandbox 속성이 제한된 권한으로 설정된다', () => {
    const { container } = renderComponent(<PreviewFrame projectId="proj-1" />);
    const iframe = getIframe(container);
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-forms allow-popups');
  });
});
