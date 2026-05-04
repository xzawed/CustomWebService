import { describe, it, expect, vi, afterEach } from 'vitest';
import { logger } from './logger';

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('info 레벨 메시지를 console.log로 출력한다', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('test message');
    expect(spy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('test message');
  });

  it('warn 레벨 메시지를 console.warn으로 출력한다', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('warn message');
    expect(spy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe('warn');
  });

  it('error 레벨 메시지를 console.error로 출력한다', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('error message');
    expect(spy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe('error');
  });

  it('context에 Error 객체가 있으면 직렬화된다', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = new Error('some error');
    logger.info('with error context', { error: err });
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.context.error.message).toBe('some error');
    expect(parsed.context.error.name).toBe('Error');
  });

  it('withCorrelationId — info 메시지에 correlationId가 포함된다', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const correlated = logger.withCorrelationId('req-123');
    correlated.info('correlated info');
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.correlationId).toBe('req-123');
    expect(parsed.level).toBe('info');
  });

  it('withCorrelationId — warn 메시지에 correlationId가 포함된다', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const correlated = logger.withCorrelationId('req-456');
    correlated.warn('correlated warn');
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.correlationId).toBe('req-456');
    expect(parsed.level).toBe('warn');
  });

  it('withCorrelationId — error 메시지에 correlationId가 포함된다', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const correlated = logger.withCorrelationId('req-789');
    correlated.error('correlated error');
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.correlationId).toBe('req-789');
    expect(parsed.level).toBe('error');
  });

  it('withCorrelationId — debug 메시지는 LOG_LEVEL=info(기본)에서 출력되지 않는다', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const correlated = logger.withCorrelationId('req-000');
    correlated.debug('silent debug');
    expect(spy).not.toHaveBeenCalled();
  });
});
