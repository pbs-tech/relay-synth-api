import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { GetCommand, UpdateCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/handlers/users.js';

const ddb = mockClient(DynamoDBDocumentClient);

/** Mirrors the claim shape API Gateway's JWT authorizer attaches to the event. */
function eventFor(claims: Record<string, unknown>) {
  return { event: { requestContext: { authorizer: { jwt: { claims } } } } };
}

const authedEvent = eventFor({
  sub: 'auth0|abc123456',
  'https://relay-synth.tech/email': 'player@example.com',
});

const storedUser = {
  PK: 'USER#auth0|abc123456',
  SK: 'PROFILE',
  entity: 'User',
  GSI1PK: 'LEADERBOARD',
  GSI1SK: 250,
  userId: 'auth0|abc123456',
  email: 'player@example.com',
  displayName: 'pl***@example.com',
  totalScore: 250,
  tutorialsCompleted: [1, 2],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const storedTutorial = {
  number: 3,
  name: 'Sawtooth Waves',
  pointsAvailable: 100,
  synth: { polyphony: 1, type: 'Mono Synth', parameters: { oscillator: { type: 'sawtooth' } } },
  example: { note: 'C3', duration: '4n', interval: '2n' },
};

beforeEach(() => ddb.reset());

describe('GET /user/profile', () => {
  it('returns the profile for the subject in the token', async () => {
    ddb.on(GetCommand).resolves({ Item: storedUser });

    const res = await app.request('/user/profile', {}, authedEvent);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      userId: 'auth0|abc123456',
      totalScore: 250,
      tutorialsCompleted: [1, 2],
    });
  });

  it('reads identity from the token, never from the request body', async () => {
    ddb.on(GetCommand).resolves({ Item: storedUser });

    await app.request('/user/profile', {}, authedEvent);

    // The old API looked up users by req.body.email, so any authenticated
    // caller could read or modify any other account.
    const key = ddb.commandCalls(GetCommand)[0]!.args[0].input.Key;
    expect(key).toEqual({ PK: 'USER#auth0|abc123456', SK: 'PROFILE' });
  });

  it('401s when the authorizer context carries no subject', async () => {
    const res = await app.request('/user/profile', {}, eventFor({}));

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('POST /user/tutorials/:number/complete', () => {
  it('awards the points recorded on the tutorial', async () => {
    ddb.on(GetCommand).callsFake((input) =>
      input.Key.PK === 'TUTORIAL' ? { Item: storedTutorial } : { Item: storedUser },
    );
    ddb.on(UpdateCommand).resolves({
      Attributes: { ...storedUser, totalScore: 350, tutorialsCompleted: [1, 2, 3] },
    });

    const res = await app.request('/user/tutorials/3/complete', { method: 'POST' }, authedEvent);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      awarded: true,
      pointsAwarded: 100,
      totalScore: 350,
      tutorialsCompleted: [1, 2, 3],
      message: 'Tutorial completed',
    });
  });

  it('ignores any score the caller tries to supply in the body', async () => {
    ddb.on(GetCommand).callsFake((input) =>
      input.Key.PK === 'TUTORIAL' ? { Item: storedTutorial } : { Item: storedUser },
    );
    ddb.on(UpdateCommand).resolves({
      Attributes: { ...storedUser, totalScore: 350, tutorialsCompleted: [1, 2, 3] },
    });

    await app.request(
      '/user/tutorials/3/complete',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutorialScore: 999999, email: 'victim@example.com' }),
      },
      authedEvent,
    );

    const update = ddb.commandCalls(UpdateCommand)[0]!.args[0].input;
    expect(update.ExpressionAttributeValues?.[':points']).toBe(100);
    expect(update.Key).toEqual({ PK: 'USER#auth0|abc123456', SK: 'PROFILE' });
  });

  it('reports no award on a repeat completion instead of double-scoring', async () => {
    ddb.on(GetCommand).callsFake((input) =>
      input.Key.PK === 'TUTORIAL' ? { Item: storedTutorial } : { Item: storedUser },
    );
    ddb.on(UpdateCommand).rejects(
      new ConditionalCheckFailedException({ $metadata: {}, message: 'already completed' }),
    );

    const res = await app.request('/user/tutorials/2/complete', { method: 'POST' }, authedEvent);

    expect(await res.json()).toMatchObject({
      awarded: false,
      pointsAwarded: 0,
      totalScore: 250,
      message: 'Tutorial already completed',
    });
  });

  it('404s for a tutorial that does not exist', async () => {
    ddb.on(GetCommand).resolves({});

    const res = await app.request('/user/tutorials/999/complete', { method: 'POST' }, authedEvent);

    expect(res.status).toBe(404);
  });

  it('400s for a non-numeric tutorial number', async () => {
    const res = await app.request('/user/tutorials/abc/complete', { method: 'POST' }, authedEvent);

    expect(res.status).toBe(400);
  });

  it('401s without a subject claim', async () => {
    const res = await app.request(
      '/user/tutorials/3/complete',
      { method: 'POST' },
      eventFor({}),
    );

    expect(res.status).toBe(401);
  });
});
