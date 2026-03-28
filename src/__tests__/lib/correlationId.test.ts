import { describe, it, expect } from 'vitest';
import { getCorrelationId, setCorrelationId, CORRELATION_ID_HEADER } from '@/lib/utils/correlationId';

describe('correlationId', () => {
  describe('getCorrelationId', () => {
    it('요청 없이 호출하면 UUID 형식의 새 ID를 생성한다', () => {
      const id = getCorrelationId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('매 호출마다 유니크한 ID를 생성한다', () => {
      const id1 = getCorrelationId();
      const id2 = getCorrelationId();
      expect(id1).not.toBe(id2);
    });

    it('헤더에 correlation ID가 있으면 그 값을 반환한다', () => {
      const headers = new Headers({ [CORRELATION_ID_HEADER]: 'existing-id-123' });
      const request = new Request('https://example.com', { headers });
      const id = getCorrelationId(request);
      expect(id).toBe('existing-id-123');
    });

    it('헤더에 correlation ID가 없으면 새 UUID를 생성한다', () => {
      const request = new Request('https://example.com');
      const id = getCorrelationId(request);
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });

  describe('setCorrelationId', () => {
    it('Headers 객체에 correlation ID 헤더를 설정한다', () => {
      const headers = new Headers();
      setCorrelationId(headers, 'test-correlation-id');
      expect(headers.get(CORRELATION_ID_HEADER)).toBe('test-correlation-id');
    });

    it('기존 헤더 값을 덮어쓴다', () => {
      const headers = new Headers({ [CORRELATION_ID_HEADER]: 'old-id' });
      setCorrelationId(headers, 'new-id');
      expect(headers.get(CORRELATION_ID_HEADER)).toBe('new-id');
    });
  });

  describe('CORRELATION_ID_HEADER', () => {
    it('소문자 헤더 이름을 가진다', () => {
      expect(CORRELATION_ID_HEADER).toBe('x-correlation-id');
    });
  });
});
