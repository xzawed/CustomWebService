import { describe, it, expect } from 'vitest';
import { templateRegistry } from './TemplateRegistry';
import type { ApiCatalogItem } from '@/types/api';

const EXPECTED_TEMPLATE_IDS = [
  'dashboard',
  'calculator',
  'gallery',
  'info-lookup',
  'map-service',
  'content-feed',
  'comparison',
  'timeline',
  'news-curator',
  'quiz',
  'profile',
] as const;

const sampleApi: ApiCatalogItem = {
  id: 'aaaabbbb-cccc-dddd-eeee-ffffffffffff',
  name: 'Sample API',
  description: 'Sample',
  category: 'general',
  baseUrl: 'https://api.example.com',
  authType: 'none',
  authConfig: {},
  endpoints: [{ path: '/data', method: 'GET' }],
  isActive: true,
} as unknown as ApiCatalogItem;

describe('templateRegistry', () => {
  it.each(EXPECTED_TEMPLATE_IDS)('"%s" 템플릿이 등록되어 있다', (id) => {
    expect(templateRegistry.get(id)).toBeDefined();
  });

  it('미등록 ID는 undefined를 반환한다', () => {
    expect(templateRegistry.get('non-existent-template')).toBeUndefined();
  });

  it('gallery 템플릿이 마소닉/검색바/라이트박스 promptHint를 포함한다', () => {
    const gallery = templateRegistry.get('gallery');
    expect(gallery).toBeDefined();
    const output = gallery!.generate({
      apis: [sampleApi],
      userContext: '이미지 갤러리 서비스',
      templateId: 'gallery',
    });
    expect(output.promptHint).toContain('masonry-gallery');
    expect(output.promptHint).toContain('라이트박스');
    expect(output.html).toContain('masonry');
    expect(output.html).toContain('lightbox');
    expect(output.css).toContain('column-count');
  });
});
