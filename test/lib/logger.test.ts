import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../../src/lib/logger.js';

/** Captures the single JSON line a logger call emits. */
function captured(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> | null {
  const call = spy.mock.calls[0];
  return call ? (JSON.parse(call[0] as string) as Record<string, unknown>) : null;
}

let log: ReturnType<typeof vi.spyOn>;
let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('logger', () => {
  it('emits a single parseable JSON line, so CloudWatch can index the fields', () => {
    vi.stubEnv('LOG_LEVEL', 'info');

    logger.info('Created user profile', { userId: 'auth0|abc' });

    expect(log).toHaveBeenCalledTimes(1);
    const line = log.mock.calls[0]![0] as string;
    expect(line).not.toContain('\n');
    expect(captured(log)).toMatchObject({
      level: 'info',
      message: 'Created user profile',
      userId: 'auth0|abc',
    });
  });

  it('timestamps every line in ISO 8601', () => {
    vi.stubEnv('LOG_LEVEL', 'info');

    logger.info('anything');

    expect(captured(log)!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
  });

  it('routes warnings and errors to their own console channels', () => {
    vi.stubEnv('LOG_LEVEL', 'debug');

    logger.warn('Request rejected');
    logger.error('Unhandled error');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });

  it('suppresses messages below the configured level', () => {
    vi.stubEnv('LOG_LEVEL', 'warn');

    logger.debug('noisy');
    logger.info('also noisy');

    expect(log).not.toHaveBeenCalled();
  });

  it('still emits at and above the configured level', () => {
    vi.stubEnv('LOG_LEVEL', 'warn');

    logger.warn('kept');
    logger.error('kept');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('defaults to info when LOG_LEVEL is unset', () => {
    vi.stubEnv('LOG_LEVEL', '');

    logger.debug('dropped');
    logger.info('kept');

    expect(log).toHaveBeenCalledTimes(1);
    expect(captured(log)).toMatchObject({ message: 'kept' });
  });

  it('falls back to info rather than going silent on a bogus LOG_LEVEL', () => {
    vi.stubEnv('LOG_LEVEL', 'verbose');

    logger.info('kept');

    expect(log).toHaveBeenCalledTimes(1);
  });

  it('logs with no context object', () => {
    vi.stubEnv('LOG_LEVEL', 'info');

    expect(() => logger.info('bare')).not.toThrow();
    expect(captured(log)).toMatchObject({ message: 'bare' });
  });
});
