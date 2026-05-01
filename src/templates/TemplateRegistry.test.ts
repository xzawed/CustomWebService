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

  it('gallery generate — authType이 none이 아닐 때 프록시 URL을 생성한다', () => {
    const authApi = {
      ...sampleApi,
      id: 'img-api-id',
      authType: 'api_key',
      endpoints: [{ path: '/photos', method: 'GET' }],
    } as unknown as ApiCatalogItem;
    const gallery = templateRegistry.get('gallery');
    const output = gallery!.generate({
      apis: [authApi],
      userContext: '사진 갤러리',
      templateId: 'gallery',
    });
    expect(output.js).toContain('/api/v1/proxy?apiId=img-api-id');
    expect(output.js).toContain('proxyPath=');
  });

  it('gallery generate — responseDataPath가 있을 때 경로를 삽입한다', () => {
    const dataPathApi = {
      ...sampleApi,
      endpoints: [{ path: '/search', method: 'GET', responseDataPath: 'photos.results' }],
    } as unknown as ApiCatalogItem;
    const gallery = templateRegistry.get('gallery');
    const output = gallery!.generate({
      apis: [dataPathApi],
      userContext: '검색 갤러리',
      templateId: 'gallery',
    });
    expect(output.js).toContain('photos.results');
  });

  it('gallery matchScore — apis가 빈 배열이면 0을 반환한다', () => {
    const gallery = templateRegistry.get('gallery')!;
    expect(gallery.matchScore([])).toBe(0);
  });

  it('gallery matchScore — gallery 카테고리 API는 높은 점수를 반환한다', () => {
    const galleryApi = { ...sampleApi, category: 'image', name: 'Photo API' } as unknown as ApiCatalogItem;
    const gallery = templateRegistry.get('gallery')!;
    expect(gallery.matchScore([galleryApi])).toBeGreaterThan(0);
  });
});
