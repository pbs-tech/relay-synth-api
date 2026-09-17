import { QueryCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/handlers/leaderboard.js';

const ddb = mockClient(DynamoDBDocumentClient);

beforeEach(() => ddb.reset());

describe('GET /leaderboard', () => {
  it('nests entries under users, because the frontend reads response.data.users', async () => {
    ddb.on(QueryCommand).resolves({
      Items: [
        { displayName: 'al***@example.com', totalScore: 900, tutorialsCompleted: [1, 2, 3] },
        { displayName: 'synthkid', totalScore: 400, tutorialsCompleted: [1] },
      ],
    });

    const res = await app.request('/leaderboard');

    expect(await res.json()).toEqual({
      users: [
        { displayName: 'al***@example.com', totalScore: 900, tutorialsCompleted: [1, 2, 3] },
        { displayName: 'synthkid', totalScore: 400, tutorialsCompleted: [1] },
      ],
    });
  });

  it('caps an oversized limit rather than letting a caller scan the table', async () => {
    ddb.on(QueryCommand).resolves({ Items: [] });

    await app.request('/leaderboard?limit=100000');

    expect(ddb.commandCalls(QueryCommand)[0]!.args[0].input.Limit).toBe(100);
  });

  it('honours a smaller explicit limit', async () => {
    ddb.on(QueryCommand).resolves({ Items: [] });

    await app.request('/leaderboard?limit=5');

    expect(ddb.commandCalls(QueryCommand)[0]!.args[0].input.Limit).toBe(5);
  });

  it.each(['abc', '0', '-5'])('falls back to the default for limit=%s', async (limit) => {
    ddb.on(QueryCommand).resolves({ Items: [] });

    await app.request(`/leaderboard?limit=${limit}`);

    expect(ddb.commandCalls(QueryCommand)[0]!.args[0].input.Limit).toBe(100);
  });

  it('returns an empty list when nobody has scored yet', async () => {
    ddb.on(QueryCommand).resolves({});

    const res = await app.request('/leaderboard');

    expect(await res.json()).toEqual({ users: [] });
  });
});
