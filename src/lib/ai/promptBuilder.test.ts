import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserPrompt, buildRegenerationPrompt } from './promptBuilder';
import type { ApiCatalogItem } from '@/types/api';

const mockApi: ApiCatalogItem = {
  id: 'api-1',
  name: '날씨 API',
  description: '실시간 날씨 정보',
  baseUrl: 'https://api.weather.com',
  authType: 'none',
  authConfig: {},
  category: 'weather',
  tags: ['weather'],
  rateLimit: '100/hour',
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
  endpoints: [
    {
      method: 'GET',
      path: '/current',
      description: '현재 날씨 조회',
      params: [{ name: 'city', type: 'string', required: true, description: '도시명' }],
      responseExample: { temp: 25, condition: 'sunny' },
    },
  ],
};

describe('buildSystemPrompt', () => {
  it('시스템 프롬프트를 반환한다', () => {
    const prompt = buildSystemPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('보안 규칙(eval 금지)을 포함한다', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('eval');
  });

  it('코드 블록 형식 규칙을 포함한다', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('```html');
    expect(prompt).toContain('```css');
    expect(prompt).toContain('```javascript');
  });
});

describe('buildUserPrompt', () => {
  it('API 이름이 프롬프트에 포함된다', () => {
    const prompt = buildUserPrompt([mockApi], '날씨 대시보드를 만들어주세요');
    expect(prompt).toContain('날씨 API');
  });

  it('Base URL이 프롬프트에 포함된다', () => {
    const prompt = buildUserPrompt([mockApi], '날씨 서비스');
    expect(prompt).toContain('https://api.weather.com');
  });

  it('사용자 설명이 프롬프트에 포함된다', () => {
    const context = '실시간 날씨를 보여주는 서비스를 만들어주세요';
    const prompt = buildUserPrompt([mockApi], context);
    expect(prompt).toContain(context);
  });

  it('API가 여러 개일 때 모두 포함된다', () => {
    const api2: ApiCatalogItem = { ...mockApi, id: 'api-2', name: '환율 API' };
    const prompt = buildUserPrompt([mockApi, api2], '복합 서비스');
    expect(prompt).toContain('날씨 API');
    expect(prompt).toContain('환율 API');
    expect(prompt).toContain('API 1');
    expect(prompt).toContain('API 2');
  });

  it('엔드포인트 경로가 포함된다', () => {
    const prompt = buildUserPrompt([mockApi], '테스트');
    expect(prompt).toContain('/current');
  });
});

describe('buildRegenerationPrompt', () => {
  it('이전 코드와 피드백이 모두 포함된다', () => {
    const prev = { html: '<p>old</p>', css: 'p{}', js: 'var x=1' };
    const prompt = buildRegenerationPrompt(prev, '색상을 파란색으로 바꿔주세요');
    expect(prompt).toContain('<p>old</p>');
    expect(prompt).toContain('색상을 파란색으로 바꿔주세요');
  });
});
