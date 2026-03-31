import { describe, it, expect } from 'vitest';
import { shouldRetryGeneration, buildQualityImprovementPrompt } from './qualityLoop';
import type { QualityMetrics } from '@/lib/ai/codeValidator';

describe('shouldRetryGeneration', () => {
  it('점수 40 미만이면 true를 반환한다', () => {
    const metrics: QualityMetrics = {
      structuralScore: 30,
      hasSemanticHtml: false,
      hasMockData: false,
      hasInteraction: false,
      hasResponsiveClasses: true,
      hasFooter: false,
      hasImgAlt: false,
      details: ['시맨틱 HTML 부족', '목 데이터 배열이 감지되지 않았습니다'],
    };
    expect(shouldRetryGeneration(metrics)).toBe(true);
  });

  it('점수 40 이상이면 false를 반환한다', () => {
    const metrics: QualityMetrics = {
      structuralScore: 70,
      hasSemanticHtml: true,
      hasMockData: true,
      hasInteraction: true,
      hasResponsiveClasses: true,
      hasFooter: true,
      hasImgAlt: true,
      details: [],
    };
    expect(shouldRetryGeneration(metrics)).toBe(false);
  });

  it('정확히 40이면 false를 반환한다', () => {
    const metrics: QualityMetrics = {
      structuralScore: 40,
      hasSemanticHtml: true,
      hasMockData: true,
      hasInteraction: false,
      hasResponsiveClasses: true,
      hasFooter: false,
      hasImgAlt: true,
      details: [],
    };
    expect(shouldRetryGeneration(metrics)).toBe(false);
  });
});

describe('buildQualityImprovementPrompt', () => {
  it('details 목록을 개선 지시에 포함한다', () => {
    const metrics: QualityMetrics = {
      structuralScore: 30,
      hasSemanticHtml: false,
      hasMockData: false,
      hasInteraction: true,
      hasResponsiveClasses: true,
      hasFooter: false,
      hasImgAlt: false,
      details: ['시맨틱 HTML 부족', '<footer> 태그가 없습니다'],
    };
    const prompt = buildQualityImprovementPrompt(
      { html: '<div>test</div>', css: '', js: '' },
      metrics
    );
    expect(prompt).toContain('시맨틱 HTML 부족');
    expect(prompt).toContain('<footer>');
    expect(prompt).toContain('이전 생성 코드');
    expect(prompt).toContain('30/100');
  });

  it('이전 코드를 코드 블록에 포함한다', () => {
    const prompt = buildQualityImprovementPrompt(
      { html: '<div>hello</div>', css: 'body{}', js: 'var x=1' },
      { structuralScore: 20, hasSemanticHtml: false, hasMockData: false, hasInteraction: false, hasResponsiveClasses: false, hasFooter: false, hasImgAlt: false, details: ['test'] }
    );
    expect(prompt).toContain('<div>hello</div>');
    expect(prompt).toContain('body{}');
    expect(prompt).toContain('var x=1');
  });
});
