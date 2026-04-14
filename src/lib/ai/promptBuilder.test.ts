import { describe, it, expect, beforeEach } from 'vitest';
import { buildStage1SystemPrompt, buildStage1UserPrompt, buildStage1RegenerationUserPrompt, clearPromptCache } from './promptBuilder';
import type { ApiCatalogItem } from '@/types/api';

beforeEach(() => {
  clearPromptCache();
});

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

describe('buildStage1SystemPrompt', () => {
  it('시스템 프롬프트를 반환한다', () => {
    const prompt = buildStage1SystemPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('보안 규칙(eval 금지)을 포함한다', () => {
    const prompt = buildStage1SystemPrompt();
    expect(prompt).toContain('eval');
  });

  it('코드 패턴 예시를 포함한다', () => {
    const prompt = buildStage1SystemPrompt();
    expect(prompt).toContain('```html');
    expect(prompt).toContain('```javascript');
  });

  it('모바일 퍼스트 반응형 규칙을 포함한다', () => {
    const prompt = buildStage1SystemPrompt();
    expect(prompt).toContain('모바일 퍼스트');
    expect(prompt).toContain('터치 UI');
    expect(prompt).toContain('44px');
  });
});

describe('buildStage1UserPrompt', () => {
  it('API 이름이 프롬프트에 포함된다', () => {
    const prompt = buildStage1UserPrompt([mockApi], '날씨 대시보드를 만들어주세요');
    expect(prompt).toContain('날씨 API');
  });

  it('Base URL이 프롬프트에 포함된다', () => {
    const prompt = buildStage1UserPrompt([mockApi], '날씨 서비스');
    expect(prompt).toContain('https://api.weather.com');
  });

  it('사용자 설명이 프롬프트에 포함된다', () => {
    const context = '실시간 날씨를 보여주는 서비스를 만들어주세요';
    const prompt = buildStage1UserPrompt([mockApi], context);
    expect(prompt).toContain(context);
  });

  it('API가 여러 개일 때 모두 포함된다', () => {
    const api2: ApiCatalogItem = { ...mockApi, id: 'api-2', name: '환율 API' };
    const prompt = buildStage1UserPrompt([mockApi, api2], '복합 서비스');
    expect(prompt).toContain('날씨 API');
    expect(prompt).toContain('환율 API');
    expect(prompt).toContain('API 1');
    expect(prompt).toContain('API 2');
  });

  it('엔드포인트 경로가 포함된다', () => {
    const prompt = buildStage1UserPrompt([mockApi], '테스트');
    expect(prompt).toContain('/current');
  });

  it('콘텐츠 범위 제한을 포함한다', () => {
    const prompt = buildStage1UserPrompt([mockApi], '날씨 서비스');
    expect(prompt).toContain('콘텐츠 범위');
    expect(prompt).toContain('날씨 API');
  });

  it('허용 섹션 목록을 포함한다', () => {
    const prompt = buildStage1UserPrompt([mockApi], '날씨 대시보드');
    expect(prompt).toContain('허용되는 UI 섹션');
  });
});

describe('buildStage1RegenerationUserPrompt', () => {
  it('이전 코드와 피드백이 모두 포함된다', () => {
    const prev = { html: '<p>old</p>', css: 'p{}', js: 'var x=1' };
    const prompt = buildStage1RegenerationUserPrompt(prev, '색상을 파란색으로 바꿔주세요');
    expect(prompt).toContain('<p>old</p>');
    expect(prompt).toContain('색상을 파란색으로 바꿔주세요');
  });
});

describe('buildStage1SystemPrompt — no mock data mandate', () => {
  it('does NOT instruct "목 데이터로 즉시 렌더링"', () => {
    const prompt = buildStage1SystemPrompt();
    expect(prompt).not.toContain('목 데이터로 즉시 렌더링');
    expect(prompt).not.toContain('목 데이터로 채워진');
  });

  it('DOES instruct real API call as top priority', () => {
    const prompt = buildStage1SystemPrompt();
    expect(prompt).toContain('실제 API 호출');
  });

  it('DOES include placeholder blocklist', () => {
    const prompt = buildStage1SystemPrompt();
    expect(prompt).toContain('홍길동');
    expect(prompt).toContain('test@example.com');
    expect(prompt).toContain('준비 중');
  });

  it('checklist does NOT ask for mock data count', () => {
    const prompt = buildStage1SystemPrompt();
    expect(prompt).not.toContain('목 데이터가 최소 15개');
  });
});

describe('buildStage1UserPrompt — exampleCall injection', () => {
  const exampleCallApi: ApiCatalogItem = {
    id: 'test-api-1',
    name: '날씨 API',
    description: '현재 날씨',
    category: 'weather',
    baseUrl: 'https://api.weather.com',
    authType: 'api_key',
    authConfig: {},
    rateLimit: null,
    isActive: true,
    iconUrl: null,
    docsUrl: null,
    tags: [],
    apiVersion: null,
    deprecatedAt: null,
    successorId: null,
    corsSupported: false,
    requiresProxy: true,
    creditRequired: null,
    createdAt: '',
    updatedAt: '',
    endpoints: [{
      path: '/current.json',
      method: 'GET',
      description: '현재 날씨',
      params: [],
      responseExample: { current: { temp_c: 15 } },
      exampleCall: "const res = await fetch('/api/v1/proxy?apiId=test-api-1&proxyPath=/current.json&q=Seoul');\nconst data = await res.json();",
      responseDataPath: 'current',
    }],
  };

  it('injects exampleCall into the user prompt when available', () => {
    const prompt = buildStage1UserPrompt([exampleCallApi], '날씨 서비스', 'proj-1');
    expect(prompt).toContain("fetch('/api/v1/proxy?apiId=test-api-1");
    expect(prompt).toContain('responseDataPath: current');
  });
});

import { buildStage2FunctionSystemPrompt, buildStage2FunctionUserPrompt } from './promptBuilder';

describe('buildStage2FunctionSystemPrompt', () => {
  it('instructs JS-only fixes', () => {
    const prompt = buildStage2FunctionSystemPrompt();
    expect(prompt).toMatch(/JavaScript.*수정|JS.*버그/i);
    expect(prompt).toMatch(/CSS.*변경.*금지|디자인.*변경.*금지/i);
  });

  it('includes placeholder removal instruction', () => {
    const prompt = buildStage2FunctionSystemPrompt();
    expect(prompt).toContain('홍길동');
    expect(prompt).toContain('준비 중');
  });
});

describe('buildStage2FunctionUserPrompt', () => {
  it('embeds QC issues in the prompt', () => {
    const code = { html: '<html>', css: '', js: 'console.log("hi")' };
    const staticIssues = ['fetch 호출이 없습니다', 'placeholder 감지: 준비 중'];
    const prompt = buildStage2FunctionUserPrompt(code, staticIssues, null);
    expect(prompt).toContain('fetch 호출이 없습니다');
    expect(prompt).toContain('placeholder 감지: 준비 중');
  });
});
