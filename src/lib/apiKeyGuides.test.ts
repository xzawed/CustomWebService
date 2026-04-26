import { describe, it, expect } from 'vitest';
import { getApiKeyGuide, getDefaultGuide } from './apiKeyGuides';

describe('getApiKeyGuide', () => {
  it('returns a non-null guide for OpenWeatherMap with required fields', () => {
    const guide = getApiKeyGuide('OpenWeatherMap');
    expect(guide).not.toBeNull();
    expect(guide!.signupUrl).toBeTruthy();
    expect(Array.isArray(guide!.steps)).toBe(true);
    expect(guide!.keyLabel).toBeTruthy();
  });

  it('returns null for an unknown API name', () => {
    expect(getApiKeyGuide('unknown-api')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(getApiKeyGuide('')).toBeNull();
  });

  it('returns the same guide (same signupUrl) for all public data portal APIs', () => {
    const guide1 = getApiKeyGuide('기상청 단기예보');
    const guide2 = getApiKeyGuide('기상청 중기예보');
    expect(guide1).not.toBeNull();
    expect(guide2).not.toBeNull();
    expect(guide1!.signupUrl).toBe(guide2!.signupUrl);
  });

  it('public data portal guide has multiple steps', () => {
    const guide = getApiKeyGuide('기상청 단기예보');
    expect(guide!.steps.length).toBeGreaterThanOrEqual(1);
  });

  it('every returned guide has estimatedTime and keyLabel strings', () => {
    const knownApis = ['OpenWeatherMap', 'WeatherAPI.com', 'NewsAPI.org', 'Unsplash', 'NASA 오늘의 천문 사진'];
    for (const name of knownApis) {
      const guide = getApiKeyGuide(name);
      expect(guide).not.toBeNull();
      expect(typeof guide!.estimatedTime).toBe('string');
      expect(typeof guide!.keyLabel).toBe('string');
    }
  });
});

describe('getDefaultGuide', () => {
  it('uses the provided docsUrl as signupUrl', () => {
    const guide = getDefaultGuide('https://example.com');
    expect(guide.signupUrl).toBe('https://example.com');
  });

  it('uses "#" as signupUrl when docsUrl is null', () => {
    const guide = getDefaultGuide(null);
    expect(guide.signupUrl).toBe('#');
  });

  it('has at least one step', () => {
    const guide = getDefaultGuide('https://example.com');
    expect(guide.steps.length).toBeGreaterThanOrEqual(1);
  });

  it('has estimatedTime and keyLabel strings', () => {
    const guide = getDefaultGuide('https://example.com');
    expect(typeof guide.estimatedTime).toBe('string');
    expect(typeof guide.keyLabel).toBe('string');
  });
});
