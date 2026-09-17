import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { HttpError, badRequest, notFound, unauthorized } from '../../src/lib/errors.js';
import { errorHandler, notFoundHandler, parseTutorialNumber } from '../../src/lib/http.js';

describe('parseTutorialNumber', () => {
  it.each([
    ['1', 1],
    ['14', 14],
    ['999', 999],
  ])('accepts the positive integer %s', (input, expected) => {
    expect(parseTutorialNumber(input)).toBe(expected);
  });

  it.each([
    ['0', 'zero - tutorials are numbered from 1'],
    ['-1', 'negative'],
    ['1.5', 'fractional'],
    ['abc', 'non-numeric'],
    ['', 'empty'],
    ['1e3', 'exponent notation - would alias tutorial 1000'],
    ['01', 'leading zero'],
    [' 1 ', 'padded with whitespace'],
    ['Infinity', 'infinite'],
    ['NaN', 'not a number'],
  ])('rejects %s (%s)', (input) => {
    expect(parseTutorialNumber(input)).toBeNull();
  });

  it('rejects an absent parameter', () => {
    expect(parseTutorialNumber(undefined)).toBeNull();
  });

  it('rejects a bare sign', () => {
    expect(parseTutorialNumber('+')).toBeNull();
    expect(parseTutorialNumber('-')).toBeNull();
  });

  it('keeps one canonical URL per tutorial', () => {
    // Each of these parses to 1 under Number(), so without the canonical-form
    // check four different URLs would serve the same tutorial.
    expect(parseTutorialNumber('1')).toBe(1);
    for (const alias of ['01', '1.0', ' 1', '+1']) {
      expect(parseTutorialNumber(alias), alias).toBeNull();
    }
  });
});

describe('notFoundHandler', () => {
  it('returns JSON rather than Hono default text for an unmatched route', async () => {
    const app = new Hono();
    app.notFound(notFoundHandler);

    const res = await app.request('/no-such-route');

    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({
      message: 'No route for GET /no-such-route',
      code: 'NOT_FOUND',
    });
  });

  it('names the method, so a wrong-verb call is distinguishable from a wrong path', async () => {
    const app = new Hono();
    app.notFound(notFoundHandler);
    app.get('/user/profile', (c) => c.json({}));

    const res = await app.request('/user/profile', { method: 'POST' });

    expect(await res.json()).toMatchObject({ message: 'No route for POST /user/profile' });
  });
});

describe('errorHandler', () => {
  const appThrowing = (error: Error) => {
    const app = new Hono();
    app.onError(errorHandler);
    app.get('/boom', () => {
      throw error;
    });
    return app;
  };

  it.each([
    [badRequest('Tutorial id must be a positive integer'), 400, 'BAD_REQUEST'],
    [unauthorized('Token is missing a subject claim'), 401, 'UNAUTHORIZED'],
    [notFound('No tutorial numbered 99'), 404, 'NOT_FOUND'],
  ])('maps an HttpError onto its own status', async (error, status, code) => {
    const res = await appThrowing(error).request('/boom');

    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ message: error.message, code });
  });

  it('hides the detail of an unexpected error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const leaky = new Error('ResourceNotFoundException: table relay-synth-prod not found');

    const res = await appThrowing(leaky).request('/boom');

    expect(res.status).toBe(500);
    const body = await res.text();
    // The old Express handler serialised the raw error object into the body.
    expect(body).not.toContain('relay-synth-prod');
    expect(JSON.parse(body)).toEqual({
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
    vi.restoreAllMocks();
  });

  it('still logs the detail it withholds from the caller', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await appThrowing(new Error('table relay-synth-prod not found')).request('/boom');

    const logged = JSON.parse(error.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(logged).toMatchObject({ level: 'error', path: '/boom' });
    expect(logged.message).toContain('relay-synth-prod');
    expect(logged.stack).toBeTruthy();
    vi.restoreAllMocks();
  });

  it('carries a custom status through', async () => {
    const res = await appThrowing(new HttpError(409, 'Already completed', 'CONFLICT')).request(
      '/boom',
    );

    expect(res.status).toBe(409);
  });
});
