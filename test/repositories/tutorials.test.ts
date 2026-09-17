import { GetCommand, QueryCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  countTutorials,
  getTutorial,
  listTutorialTitles,
  listTutorials,
} from '../../src/repositories/tutorials.js';

const ddb = mockClient(DynamoDBDocumentClient);

const stored = (number: number, name: string) => ({
  PK: 'TUTORIAL',
  SK: `TUTORIAL#${String(number).padStart(4, '0')}`,
  entity: 'Tutorial',
  number,
  name,
  category: 'Waveforms',
  difficulty: 'Easy',
  pointsAvailable: 100,
  text: 'Teaching copy.',
  synth: { polyphony: 1, type: 'Mono Synth', parameters: { oscillator: { type: 'sine' } } },
  example: { note: 'C4', duration: '8n', interval: '4n' },
});

beforeEach(() => ddb.reset());

describe('listTutorials', () => {
  it('queries the single tutorial partition rather than scanning', async () => {
    ddb.on(QueryCommand).resolves({ Items: [] });

    await listTutorials();

    const input = ddb.commandCalls(QueryCommand)[0]!.args[0].input;
    expect(input.KeyConditionExpression).toBe('PK = :pk');
    expect(input.ExpressionAttributeValues).toEqual({ ':pk': 'TUTORIAL' });
    expect(input.IndexName).toBeUndefined();
  });

  it('returns DynamoDB order without re-sorting, because the sort key is ordered', async () => {
    ddb.on(QueryCommand).resolves({
      Items: [stored(1, 'Sine Waves'), stored(2, 'Square Waves'), stored(10, 'High-Pass')],
    });

    const tutorials = await listTutorials();

    expect(tutorials.map((t) => t.number)).toEqual([1, 2, 10]);
  });

  it('strips single-table bookkeeping from every item', async () => {
    ddb.on(QueryCommand).resolves({ Items: [stored(1, 'Sine Waves')] });

    const [tutorial] = await listTutorials();

    expect(tutorial).not.toHaveProperty('PK');
    expect(tutorial).not.toHaveProperty('SK');
    expect(tutorial).not.toHaveProperty('entity');
    expect(tutorial).toMatchObject({ number: 1, name: 'Sine Waves' });
  });

  it('returns an empty array when the table has not been seeded', async () => {
    ddb.on(QueryCommand).resolves({});

    expect(await listTutorials()).toEqual([]);
  });
});

describe('listTutorialTitles', () => {
  it('projects only the fields the list screen renders', async () => {
    ddb.on(QueryCommand).resolves({ Items: [] });

    await listTutorialTitles();

    const input = ddb.commandCalls(QueryCommand)[0]!.args[0].input;
    expect(input.ProjectionExpression).toBe('#number, #name, category, difficulty, pointsAvailable');
    // `number` and `name` are DynamoDB reserved words; an unaliased projection
    // fails with a ValidationException at runtime.
    expect(input.ExpressionAttributeNames).toEqual({ '#number': 'number', '#name': 'name' });
  });

  it('does not ship the tutorial body or its answer', async () => {
    ddb.on(QueryCommand).resolves({
      Items: [{ number: 1, name: 'Sine Waves', category: 'Waveforms', difficulty: 'Easy', pointsAvailable: 100 }],
    });

    const [title] = await listTutorialTitles();

    expect(title).not.toHaveProperty('text');
    expect(title).not.toHaveProperty('synth');
  });
});

describe('countTutorials', () => {
  it('asks DynamoDB to count rather than transferring the rows', async () => {
    ddb.on(QueryCommand).resolves({ Count: 14 });

    expect(await countTutorials()).toBe(14);
    expect(ddb.commandCalls(QueryCommand)[0]!.args[0].input.Select).toBe('COUNT');
  });

  it('reports zero for an unseeded table instead of undefined', async () => {
    ddb.on(QueryCommand).resolves({});

    // The nav drawer renders "x / y", so undefined would surface as NaN.
    expect(await countTutorials()).toBe(0);
  });
});

describe('getTutorial', () => {
  it('fetches by composite key', async () => {
    ddb.on(GetCommand).resolves({ Item: stored(7, 'Decay and Sustain') });

    const tutorial = await getTutorial(7);

    expect(ddb.commandCalls(GetCommand)[0]!.args[0].input.Key).toEqual({
      PK: 'TUTORIAL',
      SK: 'TUTORIAL#0007',
    });
    expect(tutorial?.name).toBe('Decay and Sustain');
  });

  it('returns null rather than undefined when absent', async () => {
    ddb.on(GetCommand).resolves({});

    expect(await getTutorial(999)).toBeNull();
  });

  it('strips bookkeeping from the returned tutorial', async () => {
    ddb.on(GetCommand).resolves({ Item: stored(1, 'Sine Waves') });

    const tutorial = await getTutorial(1);

    expect(tutorial).not.toHaveProperty('PK');
    expect(tutorial).not.toHaveProperty('entity');
  });

  it('preserves the nested synth parameters the grader compares against', async () => {
    ddb.on(GetCommand).resolves({ Item: stored(1, 'Sine Waves') });

    const tutorial = await getTutorial(1);

    expect(tutorial?.synth.parameters).toEqual({ oscillator: { type: 'sine' } });
  });
});
