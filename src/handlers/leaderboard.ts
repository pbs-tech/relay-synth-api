import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import { errorHandler, notFoundHandler } from '../lib/http.js';
import { getLeaderboard } from '../repositories/users.js';

const app = new Hono();
app.onError(errorHandler);
app.notFound(notFoundHandler);

const MAX_LIMIT = 100;

/** Wrapped in a `users` key because the frontend reads `response.data.users`. */
app.get('/leaderboard', async (c) => {
  const requested = Number(c.req.query('limit') ?? MAX_LIMIT);
  const limit =
    Number.isInteger(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : MAX_LIMIT;

  return c.json({ users: await getLeaderboard(limit) });
});

export const handler = handle(app);
export { app };
