import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import { errorHandler, notFoundHandler, parseTutorialNumber } from '../lib/http.js';
import { badRequest, notFound } from '../lib/errors.js';
import {
  countTutorials,
  getTutorial,
  listTutorialTitles,
  listTutorials,
} from '../repositories/tutorials.js';
import type { Tutorial } from '../types.js';

const app = new Hono();
app.onError(errorHandler);
app.notFound(notFoundHandler);

/** Resolves :id or rejects, so each route below stays a one-liner. */
async function requireTutorial(rawId: string | undefined): Promise<Tutorial> {
  const number = parseTutorialNumber(rawId);
  if (number === null) {
    throw badRequest('Tutorial id must be a positive integer');
  }
  const tutorial = await getTutorial(number);
  if (!tutorial) {
    throw notFound(`No tutorial numbered ${number}`);
  }
  return tutorial;
}

/**
 * Unauthenticated health check. Routed here rather than to its own function so
 * uptime monitoring exercises a real Lambda and its DynamoDB client construction.
 */
app.get('/', (c) => c.json({ message: 'API is live' }));

// Static segments are registered before the parameterised ones so that
// /tutorials/count can never be read as /tutorials/:id.
app.get('/tutorials/count', async (c) => c.json({ total: await countTutorials() }));

app.get('/tutorials/titles', async (c) => c.json(await listTutorialTitles()));

app.get('/tutorials', async (c) => c.json(await listTutorials()));

/**
 * The tutorial header. Returns only the descriptive fields: the frontend commits
 * this whole body into its tutorial store, and shipping the synth answer here
 * would hand the solution to anyone reading the network tab.
 */
app.get('/tutorials/:id/text', async (c) => {
  const { number, name, category, difficulty, pointsAvailable, text } = await requireTutorial(
    c.req.param('id'),
  );
  return c.json({ number, name, category, difficulty, pointsAvailable, text });
});

app.get('/tutorials/:id/synth/settings', async (c) => {
  const { synth } = await requireTutorial(c.req.param('id'));
  return c.json({ polyphony: synth.polyphony, type: synth.type });
});

app.get('/tutorials/:id/synth/parameters', async (c) => {
  const { synth } = await requireTutorial(c.req.param('id'));
  return c.json({ parameters: synth.parameters });
});

app.get('/tutorials/:id/synth', async (c) => {
  const { synth } = await requireTutorial(c.req.param('id'));
  return c.json({
    polyphony: synth.polyphony,
    type: synth.type,
    parameters: synth.parameters,
  });
});

/** Wrapped in an `example` key because the frontend reads `response.data.example`. */
app.get('/tutorials/:id/example', async (c) => {
  const { number, example } = await requireTutorial(c.req.param('id'));
  return c.json({ number, example });
});

app.get('/tutorials/:id', async (c) => c.json(await requireTutorial(c.req.param('id'))));

export const handler = handle(app);
export { app };
