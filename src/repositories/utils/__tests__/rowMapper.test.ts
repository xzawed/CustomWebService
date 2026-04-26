import { describe, it, expect } from 'vitest';
import { toDatabaseRow } from '../rowMapper';

describe('toDatabaseRow()', () => {
  it('camelCase 키를 snake_case로 변환', () => {
    const result = toDatabaseRow({ userId: '1', projectName: 'test' });
    expect(result).toHaveProperty('user_id', '1');
    expect(result).toHaveProperty('project_name', 'test');
    expect(result).not.toHaveProperty('userId');
    expect(result).not.toHaveProperty('projectName');
  });

  it('id, createdAt, updatedAt 키는 제외', () => {
    const now = new Date();
    const result = toDatabaseRow({ id: '1', createdAt: now, updatedAt: now, name: 'test' });
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('created_at');
    expect(result).not.toHaveProperty('updated_at');
    expect(result).toHaveProperty('name', 'test');
  });

  it('단일 레벨 camelCase 변환', () => {
    const result = toDatabaseRow({ baseUrl: 'https://example.com', isActive: true });
    expect(result).toHaveProperty('base_url', 'https://example.com');
    expect(result).toHaveProperty('is_active', true);
  });

  it('빈 객체 → 빈 결과', () => {
    expect(toDatabaseRow({})).toEqual({});
  });

  it('null 값 포함 → 키는 포함됨', () => {
    const result = toDatabaseRow({ iconUrl: null });
    expect(result).toHaveProperty('icon_url', null);
  });
});
