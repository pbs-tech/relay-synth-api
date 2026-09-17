import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import type { APIGatewayProxyEventV2WithJWTAuthorizer, Context as LambdaContext } from 'aws-lambda';
import { errorHandler, notFoundHandler, parseTutorialNumber } from '../lib/http.js';
import { badRequest, notFound } from '../lib/errors.js';
import { getIdentity } from '../lib/identity.js';
import { getTutorial } from '../repositories/tutorials.js';
import { completeTutorial, ensureUser } from '../repositories/users.js';

type Bindings = {
  event: APIGatewayProxyEventV2WithJWTAuthorizer;
  lambdaContext: LambdaContext;
};

const app = new Hono<{ Bindings: Bindings }>();
app.onError(errorHandler);
app.notFound(notFoundHandler);

/**
 * Returns the caller's profile, creating it on first sight. Identity comes from
 * the verified JWT rather than a request body, so a caller can only ever read
 * their own profile.
 */
app.get('/user/profile', async (c) => {
  const identity = getIdentity(c.env.event);
  return c.json(await ensureUser(identity));
});

/**
 * Completes a tutorial for the caller.
 *
 * Replaces the old PATCH /user/update/score and PATCH /user/update/tutorials pair.
 * Those took both the target email and the score to add from the request body,
 * so any logged-in user could award themselves any number of points, or edit
 * somebody else's account. Here the server resolves the tutorial, reads its own
 * pointsAvailable, and awards it exactly once.
 */
app.post('/user/tutorials/:number/complete', async (c) => {
  const identity = getIdentity(c.env.event);

  const tutorialNumber = parseTutorialNumber(c.req.param('number'));
  if (tutorialNumber === null) {
    throw badRequest('Tutorial number must be a positive integer');
  }

  const tutorial = await getTutorial(tutorialNumber);
  if (!tutorial) {
    throw notFound(`No tutorial numbered ${tutorialNumber}`);
  }

  const { profile, awarded, pointsAwarded } = await completeTutorial(
    identity,
    tutorialNumber,
    tutorial.pointsAvailable,
  );

  return c.json({
    awarded,
    pointsAwarded,
    totalScore: profile.totalScore,
    tutorialsCompleted: profile.tutorialsCompleted,
    message: awarded ? 'Tutorial completed' : 'Tutorial already completed',
  });
});

export const handler = handle(app);
export { app };
