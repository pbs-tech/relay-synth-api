import { GetCommand, QueryCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/handlers/tutorials.js';

const ddb = mockClient(DynamoDBDocumentClient);

const storedTutorial = {
  PK: 'TUTORIAL',
  SK: 'TUTORIAL#0009',
  entity: 'Tutorial',
  number: 9,
  name: 'The Low-Pass Filter',
  category: 'Filters',
  difficulty: 'Medium',
  pointsAvailable: 250,
  text: 'A filter removes frequencies...',
  synth: {
    polyphony: 1,
    type: 'Mono Synth',
    parameters: {
      oscillator: { type: 'sawtooth' },
      filter: { type: 'lowpass', frequency: 5000 },
    },
  },
  example: { note: 'C3', duration: '4n', interval: '2n' },
};

beforeEach(() => {
  ddb.reset();
  // The 500 case logs a stack by design; keep it out of the test output.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('GET /tutorials', () => {
  it('returns the full ordered curriculum', async () => {
    ddb.on(QueryCommand).resolves({
      Items: [storedTutorial, { ...storedTutorial, SK: 'TUTORIAL#0010', number: 10 }],
    });

    const res = await app.request('/tutorials');

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body.map((t) => t.number)).toEqual([9, 10]);
    expect(body[0]).not.toHaveProperty('PK');
  });

  it('returns an empty array when the table has not been seeded', async () => {
    ddb.on(QueryCommand).resolves({});

    expect(await (await app.request('/tutorials')).json()).toEqual([]);
  });
});

describe('GET /', () => {
  it('answers the unauthenticated health check', async () => {
    const res = await app.request('/');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'API is live' });
  });

  it('needs no DynamoDB call, so it stays green during a table outage', async () => {
    ddb.on(QueryCommand).rejects(new Error('table unavailable'));
    ddb.on(GetCommand).rejects(new Error('table unavailable'));

    expect((await app.request('/')).status).toBe(200);
  });
});

describe('unmatched routes', () => {
  it('returns a JSON 404', async () => {
    const res = await app.request('/tutorials/9/nonexistent');

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('GET /tutorials/count', () => {
  it('returns the shape the nav drawer reads', async () => {
    ddb.on(QueryCommand).resolves({ Count: 14 });

    const res = await app.request('/tutorials/count');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ total: 14 });
  });

  it('asks DynamoDB to count rather than shipping the bodies', async () => {
    ddb.on(QueryCommand).resolves({ Count: 14 });

    await app.request('/tutorials/count');

    expect(ddb.commandCalls(QueryCommand)[0]!.args[0].input.Select).toBe('COUNT');
  });

  it('is matched ahead of /tutorials/:id', async () => {
    ddb.on(QueryCommand).resolves({ Count: 14 });

    const res = await app.request('/tutorials/count');

    // A GetCommand would mean "count" had been read as a tutorial id.
    expect(ddb.commandCalls(GetCommand)).toHaveLength(0);
    expect(await res.json()).toEqual({ total: 14 });
  });
});

describe('GET /tutorials/titles', () => {
  it('projects only the list-screen fields', async () => {
    ddb.on(QueryCommand).resolves({
      Items: [{ number: 1, name: 'Sine Waves', category: 'Waveforms', difficulty: 'Easy', pointsAvailable: 100 }],
    });

    const res = await app.request('/tutorials/titles');

    expect(await res.json()).toEqual([
      { number: 1, name: 'Sine Waves', category: 'Waveforms', difficulty: 'Easy', pointsAvailable: 100 },
    ]);
    const input = ddb.commandCalls(QueryCommand)[0]!.args[0].input;
    // `number` and `name` are DynamoDB reserved words and must be aliased.
    expect(input.ExpressionAttributeNames).toEqual({ '#number': 'number', '#name': 'name' });
  });
});

describe('GET /tutorials/:id/text', () => {
  it('withholds the synth answer from the tutorial header', async () => {
    ddb.on(GetCommand).resolves({ Item: storedTutorial });

    const res = await app.request('/tutorials/9/text');
    const body = await res.json();

    expect(body).toEqual({
      number: 9,
      name: 'The Low-Pass Filter',
      category: 'Filters',
      difficulty: 'Medium',
      pointsAvailable: 250,
      text: 'A filter removes frequencies...',
    });
    // Shipping the answer here would hand the solution to the network tab.
    expect(body).not.toHaveProperty('synth');
  });
});

describe('GET /tutorials/:id/synth', () => {
  it('returns polyphony, type and parameters', async () => {
    ddb.on(GetCommand).resolves({ Item: storedTutorial });

    const res = await app.request('/tutorials/9/synth');

    expect(await res.json()).toEqual({
      polyphony: 1,
      type: 'Mono Synth',
      parameters: storedTutorial.synth.parameters,
    });
  });

  it('returns only the base settings on /synth/settings', async () => {
    ddb.on(GetCommand).resolves({ Item: storedTutorial });

    const res = await app.request('/tutorials/9/synth/settings');

    expect(await res.json()).toEqual({ polyphony: 1, type: 'Mono Synth' });
  });

  it('returns only the parameters on /synth/parameters', async () => {
    ddb.on(GetCommand).resolves({ Item: storedTutorial });

    const res = await app.request('/tutorials/9/synth/parameters');

    expect(await res.json()).toEqual({ parameters: storedTutorial.synth.parameters });
  });
});

describe('GET /tutorials/:id/example', () => {
  it('nests the example, because the frontend reads response.data.example', async () => {
    ddb.on(GetCommand).resolves({ Item: storedTutorial });

    const res = await app.request('/tutorials/9/example');

    expect(await res.json()).toEqual({
      number: 9,
      example: { note: 'C3', duration: '4n', interval: '2n' },
    });
  });
});

describe('GET /tutorials/:id', () => {
  it('strips single-table bookkeeping from the response', async () => {
    ddb.on(GetCommand).resolves({ Item: storedTutorial });

    const body = (await (await app.request('/tutorials/9')).json()) as Record<string, unknown>;

    expect(body).not.toHaveProperty('PK');
    expect(body).not.toHaveProperty('SK');
    expect(body).not.toHaveProperty('entity');
    expect(body.number).toBe(9);
  });

  it('404s for a tutorial that does not exist', async () => {
    ddb.on(GetCommand).resolves({});

    const res = await app.request('/tutorials/999');

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'NOT_FOUND' });
  });

  it.each(['abc', '0', '-1', '1.5'])('400s for the non-numeric id %s', async (id) => {
    const res = await app.request(`/tutorials/${id}`);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('returns a generic 500 without leaking internals', async () => {
    ddb.on(GetCommand).rejects(new Error('ResourceNotFoundException: table gone'));

    const res = await app.request('/tutorials/9');

    expect(res.status).toBe(500);
    // The old Express handler serialised the raw error into the response body.
    expect(await res.json()).toEqual({
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  });
});
