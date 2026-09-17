import type { Context } from 'hono';
import { HttpError } from './errors.js';
import { logger } from './logger.js';

/**
 * Registered with app.onError, which is the hook Hono routes thrown errors to.
 *
 * Maps HttpError onto its status and everything else onto a generic 500. The old
 * Express handler serialised the raw error object straight into the response
 * body, leaking stack traces and driver internals to callers.
 */
export function errorHandler(error: Error, c: Context): Response {
  if (error instanceof HttpError) {
    logger.warn('Request rejected', {
      status: error.status,
      code: error.code,
      message: error.message,
      path: c.req.path,
    });
    return c.json({ message: error.message, code: error.code }, error.status as 400);
  }

  logger.error('Unhandled error', {
    message: error.message,
    stack: error.stack,
    path: c.req.path,
  });
  return c.json({ message: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
}

/** Renders a consistent 404 for paths no route matched. */
export function notFoundHandler(c: Context): Response {
  return c.json({ message: `No route for ${c.req.method} ${c.req.path}`, code: 'NOT_FOUND' }, 404);
}

/** Parses a path parameter that must be a positive integer tutorial number. */
export function parseTutorialNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return parsed;
}
