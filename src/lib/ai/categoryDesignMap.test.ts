import { describe, it, expect } from 'vitest';
import { inferDesignFromCategories } from './categoryDesignMap';

describe('inferDesignFromCategories', () => {
  it('금융 카테고리는 모던 다크를 추천한다', () => {
    const result = inferDesignFromCategories(['finance']);
    expect(result.theme).toBe('modern-dark');
    expect(result.useChart).toBe(true);
  });

  it('음식/여행 카테고리는 따뜻한 톤을 추천한다', () => {
    const result = inferDesignFromCategories(['tourism', 'lifestyle']);
    expect(result.theme).toBe('warm');
  });

  it('날씨 카테고리는 오션 블루를 추천한다', () => {
    const result = inferDesignFromCategories(['weather']);
    expect(result.theme).toBe('ocean-blue');
    expect(result.useChart).toBe(true);
  });

  it('엔터테인먼트 카테고리는 선셋 그래디언트를 추천한다', () => {
    const result = inferDesignFromCategories(['entertainment']);
    expect(result.theme).toBe('sunset-gradient');
  });

  it('빈 배열이면 클린 라이트 기본값을 반환한다', () => {
    const result = inferDesignFromCategories([]);
    expect(result.theme).toBe('clean-light');
  });

  it('복수 카테고리는 첫 번째 매칭 우선', () => {
    const result = inferDesignFromCategories(['finance', 'news']);
    expect(result.theme).toBe('modern-dark');
  });

  it('useMap은 지도 카테고리에서만 true', () => {
    expect(inferDesignFromCategories(['maps']).useMap).toBe(true);
    expect(inferDesignFromCategories(['news']).useMap).toBe(false);
  });
});
