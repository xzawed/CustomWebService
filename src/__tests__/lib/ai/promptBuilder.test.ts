import { describe, it, expect } from 'vitest';
import {
  buildStage1SystemPrompt,
  buildStage2SystemPrompt,
  buildStage1UserPrompt,
  buildStage1RegenerationUserPrompt,
  buildStage2UserPrompt,
  buildStage2RegenerationUserPrompt,
} from '@/lib/ai/promptBuilder';
import type { ApiCatalogItem } from '@/types/api';

const mockApi: ApiCatalogItem = {
  id: 'api-1',
  name: '뉴스 API',
  description: '뉴스 피드 API',
  category: '뉴스',
  baseUrl: 'https://api.example.com',
  authType: 'none',
  authConfig: {},
  tags: [],
  rateLimit: null,
  isActive: true,
  iconUrl: null,
  docsUrl: null,
  apiVersion: null,
  deprecatedAt: null,
  successorId: null,
  corsSupported: true,
  requiresProxy: false,
  creditRequired: null,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  endpoints: [],
};

describe('buildStage1SystemPrompt', () => {
  it('목 데이터 및 레이아웃 규칙을 포함한다', () => {
    const prompt = buildStage1SystemPrompt();
    expect(prompt).toContain('grid grid-cols-1');
    expect(prompt).toContain('목 데이터');
  });

  it('디자인 시스템 색상 정의를 포함하지 않는다', () => {
    const prompt = buildStage1SystemPrompt();
    // '모던 다크'는 서비스 유형 추론 테이블에서 테마 추천으로 사용 가능
    // 하지만 실제 디자인 시스템 CSS 정의(섹션 헤더, 색상 클래스)는 Stage 2에만 있어야 함
    expect(prompt).not.toContain('bg-gray-950 text-gray-100');
    expect(prompt).not.toContain('### 1. 모던 다크');
  });

  it('@keyframes 애니메이션 지시를 포함하지 않는다', () => {
    const prompt = buildStage1SystemPrompt();
    expect(prompt).not.toContain('@keyframes fadeInUp');
  });

  it('토스트 알림 지시를 포함하지 않는다', () => {
    const prompt = buildStage1SystemPrompt();
    expect(prompt).not.toContain('showToast');
  });

  it('templateHint를 전달하면 프롬프트에 포함된다', () => {
    const prompt = buildStage1SystemPrompt('대시보드 레이아웃');
    expect(prompt).toContain('대시보드 레이아웃');
  });
});

describe('buildStage2SystemPrompt', () => {
  it('디자인 시스템 테마를 포함한다', () => {
    const prompt = buildStage2SystemPrompt();
    expect(prompt).toContain('모던 다크');
    expect(prompt).toContain('클린 라이트');
  });

  it('@keyframes 애니메이션 필수 지시를 포함한다', () => {
    const prompt = buildStage2SystemPrompt();
    expect(prompt).toContain('@keyframes fadeInUp');
  });

  it('showToast 필수 지시를 포함한다', () => {
    const prompt = buildStage2SystemPrompt();
    expect(prompt).toContain('showToast');
  });

  it('기능 변경 금지 규칙을 포함한다', () => {
    const prompt = buildStage2SystemPrompt();
    expect(prompt).toContain('기능과 목 데이터는');
  });

  it('스켈레톤 UI 패턴을 포함한다', () => {
    const prompt = buildStage2SystemPrompt();
    expect(prompt).toContain('animate-pulse');
  });
});

describe('buildStage2UserPrompt', () => {
  it('stage1 HTML·CSS·JS를 포함한다', () => {
    const stage1Code = { html: '<div>구조</div>', css: 'body { margin: 0; }', js: 'const x = 1;' };
    const prompt = buildStage2UserPrompt(stage1Code);
    expect(prompt).toContain('<div>구조</div>');
    expect(prompt).toContain('body { margin: 0; }');
    expect(prompt).toContain('const x = 1;');
  });
});

describe('buildStage2RegenerationUserPrompt', () => {
  it('stage1 코드와 피드백을 포함한다', () => {
    const stage1Code = { html: '<div>수정됨</div>', css: '', js: '' };
    const prompt = buildStage2RegenerationUserPrompt(stage1Code, '파란색 테마로 변경');
    expect(prompt).toContain('<div>수정됨</div>');
    expect(prompt).toContain('파란색 테마로 변경');
  });
});

describe('buildStage1UserPrompt', () => {
  it('API 목록과 context를 포함한다', () => {
    const prompt = buildStage1UserPrompt([mockApi], '뉴스 서비스');
    expect(prompt).toContain('뉴스 API');
    expect(prompt).toContain('뉴스 서비스');
  });
});

describe('buildStage1RegenerationUserPrompt', () => {
  it('이전 코드와 피드백을 포함한다', () => {
    const previousCode = { html: '<div>이전</div>', css: '', js: '' };
    const prompt = buildStage1RegenerationUserPrompt(previousCode, '레이아웃 변경', [mockApi]);
    expect(prompt).toContain('<div>이전</div>');
    expect(prompt).toContain('레이아웃 변경');
  });
});
