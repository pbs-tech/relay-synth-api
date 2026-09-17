import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { maskEmail, toDisplayName } from '../../src/lib/identity.js';
import {
  completeTutorial,
  ensureUser,
  getLeaderboard,
} from '../../src/repositories/users.js';

const ddb = mockClient(DynamoDBDocumentClient);

const identity = {
  userId: 'auth0|abc123456',
  email: 'player@example.com',
  nickname: null,
};

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

function conditionalFailure(): ConditionalCheckFailedException {
  return new ConditionalCheckFailedException({ $metadata: {}, message: 'condition failed' });
}

beforeEach(() => ddb.reset());
afterEach(() => ddb.reset());

describe('maskEmail', () => {
  it('keeps the first two characters and the domain', () => {
    expect(maskEmail('player@example.com')).toBe('pl***@example.com');
  });

  it('does not expose a single-character local part', () => {
    expect(maskEmail('a@example.com')).toBe('a***@example.com');
  });

  it('falls back to a neutral label for a malformed address', () => {
    expect(maskEmail('not-an-email')).toBe('player');
  });
});

describe('toDisplayName', () => {
  it('prefers an Auth0 nickname when one is present', () => {
    expect(toDisplayName({ userId: 'auth0|x', email: 'p@e.com', nickname: 'synthkid' })).toBe(
      'synthkid',
    );
  });

  it('masks the email when there is no nickname', () => {
    expect(toDisplayName({ userId: 'auth0|x', email: 'player@example.com', nickname: null })).toBe(
      'pl***@example.com',
    );
  });

  it('falls back to an opaque handle when the token carries neither', () => {
    expect(toDisplayName({ userId: 'auth0|abc123456', email: null, nickname: null })).toBe(
      'player-123456',
    );
  });
});

describe('ensureUser', () => {
  it('returns the existing profile without writing', async () => {
    ddb.on(GetCommand).resolves({ Item: storedUser });

    const profile = await ensureUser(identity);

    expect(profile.totalScore).toBe(250);
    expect(ddb.commandCalls(PutCommand)).toHaveLength(0);
  });

  it('creates a zeroed profile on first sight of a subject', async () => {
    ddb.on(GetCommand).resolves({});
    ddb.on(PutCommand).resolves({});

    const profile = await ensureUser(identity);

    expect(profile).toMatchObject({
      userId: 'auth0|abc123456',
      totalScore: 0,
      tutorialsCompleted: [],
      displayName: 'pl***@example.com',
    });

    const put = ddb.commandCalls(PutCommand)[0]!.args[0].input;
    // The conditional write is what makes concurrent first requests safe.
    expect(put.ConditionExpression).toBe('attribute_not_exists(PK)');
    expect(put.Item).toMatchObject({ GSI1PK: 'LEADERBOARD', GSI1SK: 0 });
  });

  it('yields to the winner when two requests race to create the profile', async () => {
    ddb.on(GetCommand).resolvesOnce({}).resolves({ Item: storedUser });
    ddb.on(PutCommand).rejects(conditionalFailure());

    const profile = await ensureUser(identity);

    expect(profile.totalScore).toBe(250);
  });

  it('strips single-table bookkeeping from the returned profile', async () => {
    ddb.on(GetCommand).resolves({ Item: storedUser });

    const profile = await ensureUser(identity);

    expect(profile).not.toHaveProperty('PK');
    expect(profile).not.toHaveProperty('SK');
    expect(profile).not.toHaveProperty('GSI1PK');
    expect(profile).not.toHaveProperty('GSI1SK');
    expect(profile).not.toHaveProperty('entity');
  });
});

describe('completeTutorial', () => {
  it('awards the points the server holds, not any supplied by the caller', async () => {
    ddb.on(GetCommand).resolves({ Item: storedUser });
    ddb.on(UpdateCommand).resolves({
      Attributes: { ...storedUser, totalScore: 550, tutorialsCompleted: [1, 2, 3] },
    });

    const result = await completeTutorial(identity, 3, 300);

    expect(result.awarded).toBe(true);
    expect(result.pointsAwarded).toBe(300);
    expect(result.profile.totalScore).toBe(550);

    const update = ddb.commandCalls(UpdateCommand)[0]!.args[0].input;
    expect(update.ExpressionAttributeValues?.[':points']).toBe(300);
  });

  it('guards the write so a tutorial cannot be scored twice', async () => {
    ddb.on(GetCommand).resolves({ Item: storedUser });
    ddb.on(UpdateCommand).resolves({ Attributes: storedUser });

    await completeTutorial(identity, 3, 300);

    const update = ddb.commandCalls(UpdateCommand)[0]!.args[0].input;
    expect(update.ConditionExpression).toBe(
      'attribute_exists(PK) AND NOT contains(tutorialsCompleted, :number)',
    );
  });

  it('keeps the leaderboard sort key in step with the new total', async () => {
    ddb.on(GetCommand).resolves({ Item: storedUser });
    ddb.on(UpdateCommand).resolves({ Attributes: storedUser });

    await completeTutorial(identity, 3, 300);

    const update = ddb.commandCalls(UpdateCommand)[0]!.args[0].input;
    // Both clauses read the pre-update item, so GSI1SK lands on the new total.
    expect(update.UpdateExpression).toContain('totalScore = totalScore + :points');
    expect(update.UpdateExpression).toContain('GSI1SK = totalScore + :points');
  });

  it('reports no award when the tutorial was already completed', async () => {
    ddb.on(GetCommand).resolves({ Item: storedUser });
    ddb.on(UpdateCommand).rejects(conditionalFailure());

    const result = await completeTutorial(identity, 2, 100);

    expect(result.awarded).toBe(false);
    expect(result.pointsAwarded).toBe(0);
    expect(result.profile.totalScore).toBe(250);
  });

  it('propagates unexpected DynamoDB failures rather than reporting success', async () => {
    ddb.on(GetCommand).resolves({ Item: storedUser });
    ddb.on(UpdateCommand).rejects(new Error('ProvisionedThroughputExceeded'));

    await expect(completeTutorial(identity, 3, 300)).rejects.toThrow(
      'ProvisionedThroughputExceeded',
    );
  });
});

describe('getLeaderboard', () => {
  it('queries the index in descending score order', async () => {
    ddb.on(QueryCommand).resolves({ Items: [] });

    await getLeaderboard(10);

    const query = ddb.commandCalls(QueryCommand)[0]!.args[0].input;
    expect(query.IndexName).toBe('GSI1');
    expect(query.ScanIndexForward).toBe(false);
    expect(query.Limit).toBe(10);
  });

  it('never returns raw email addresses', async () => {
    ddb.on(QueryCommand).resolves({ Items: [storedUser] });

    const entries = await getLeaderboard();

    expect(entries).toEqual([
      { displayName: 'pl***@example.com', totalScore: 250, tutorialsCompleted: [1, 2] },
    ]);
    expect(JSON.stringify(entries)).not.toContain('player@example.com');
  });

  it('defaults missing counters so the table still renders', async () => {
    ddb.on(QueryCommand).resolves({ Items: [{ displayName: 'newcomer' }] });

    const entries = await getLeaderboard();

    expect(entries[0]).toEqual({
      displayName: 'newcomer',
      totalScore: 0,
      tutorialsCompleted: [],
    });
  });
});
