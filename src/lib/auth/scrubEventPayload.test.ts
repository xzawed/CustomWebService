import { describe, expect, it } from 'vitest';
import { scrubEventPayload } from './scrubEventPayload';

const SUBJECT = {
  userId: 'user-del-1',
  email: 'Delete.Me@Example.com',
  name: 'Alice Example',
};

describe('scrubEventPayload', () => {
  it('denylist 키를 제거한다', () => {
    const out = scrubEventPayload(
      {
        email: 'x@y.com',
        name: 'N',
        passwordHash: 'hash',
        token: 't',
        projectId: 'p1',
        overallScore: 88,
      },
      SUBJECT,
    );
    expect(out).toEqual({ projectId: 'p1', overallScore: 88 });
    expect(out).not.toHaveProperty('email');
    expect(out).not.toHaveProperty('passwordHash');
  });

  // PROJECT_PUBLISHED payload의 slug는 사용자가 직접 지은 서브도메인이라 실명이 들어갈 수 있다.
  // 값 동등 비교로는 'hong-gildong-portfolio' 같은 부분 포함을 못 잡으므로 키 자체를 제거한다.
  it('PROJECT_PUBLISHED의 slug를 제거하고 projectId 감사 신호는 남긴다', () => {
    const out = scrubEventPayload(
      { projectId: 'p1', userId: 'user-del-1', slug: 'alice-example-portfolio' },
      SUBJECT,
    );
    expect(out).not.toHaveProperty('slug');
    expect(out).toEqual({ projectId: 'p1', userId: '[deleted]' });
  });

  it('userId가 삭제 대상이면 [deleted]로 바꾼다', () => {
    const out = scrubEventPayload(
      { userId: 'user-del-1', projectId: 'p1', durationMs: 12 },
      SUBJECT,
    );
    expect(out).toEqual({
      userId: '[deleted]',
      projectId: 'p1',
      durationMs: 12,
    });
  });

  it('다른 userId는 유지한다', () => {
    const out = scrubEventPayload({ userId: 'other', projectId: 'p1' }, SUBJECT);
    expect(out?.userId).toBe('other');
  });

  it('이메일(대소문자 무시)·이름을 값 동등 비교로 [redacted] 처리한다', () => {
    const out = scrubEventPayload(
      {
        note: 'delete.me@example.com',
        who: 'Alice Example',
        nested: { err: 'Delete.Me@Example.com' },
        list: ['Alice Example', 'keep'],
      },
      SUBJECT,
    );
    expect(out).toEqual({
      note: '[redacted]',
      who: '[redacted]',
      nested: { err: '[redacted]' },
      list: ['[redacted]', 'keep'],
    });
  });

  it('빈 name으로는 빈 문자열을 redacted 하지 않는다', () => {
    const out = scrubEventPayload(
      { a: '', b: 'ok', userId: 'user-del-1' },
      { userId: 'user-del-1', email: null, name: '' },
    );
    expect(out).toEqual({ a: '', b: 'ok', userId: '[deleted]' });
  });

  it('짧은 name(1자)은 스크럽하지 않는다', () => {
    const out = scrubEventPayload(
      { x: 'A', y: 'AB' },
      { userId: 'u', email: null, name: 'A' },
    );
    expect(out).toEqual({ x: 'A', y: 'AB' });
  });

  it('null payload는 null', () => {
    expect(scrubEventPayload(null, SUBJECT)).toBeNull();
  });
});
