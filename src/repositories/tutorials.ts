import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { config } from '../lib/config.js';
import { getDocumentClient } from '../lib/dynamo.js';
import { TUTORIAL_PK, tutorialKey } from '../lib/keys.js';
import type { Tutorial, TutorialTitle } from '../types.js';

/** Attributes the list screen needs. `number`, `name` and `text` are DynamoDB reserved words. */
const TITLE_PROJECTION = '#number, #name, category, difficulty, pointsAvailable';
const TITLE_NAMES = { '#number': 'number', '#name': 'name' };

type StoredTutorial = Tutorial & {
  PK?: string;
  SK?: string;
  entity?: string;
};

/** Drops single-table bookkeeping so responses stay the shape the frontend expects. */
function toTutorial(item: StoredTutorial): Tutorial {
  const { PK: _pk, SK: _sk, entity: _entity, ...tutorial } = item;
  return tutorial as Tutorial;
}

/**
 * Every tutorial lives under one partition key, so this is a single Query that
 * comes back already ordered by the zero-padded sort key - no client-side sort.
 */
export async function listTutorials(): Promise<Tutorial[]> {
  const result = await getDocumentClient().send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': TUTORIAL_PK },
    }),
  );
  return (result.Items ?? []).map((item) => toTutorial(item as StoredTutorial));
}

export async function listTutorialTitles(): Promise<TutorialTitle[]> {
  const result = await getDocumentClient().send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': TUTORIAL_PK },
      ExpressionAttributeNames: TITLE_NAMES,
      ProjectionExpression: TITLE_PROJECTION,
    }),
  );
  return (result.Items ?? []) as TutorialTitle[];
}

/** Uses Select: COUNT so DynamoDB never ships the tutorial bodies over the wire. */
export async function countTutorials(): Promise<number> {
  const result = await getDocumentClient().send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': TUTORIAL_PK },
      Select: 'COUNT',
    }),
  );
  return result.Count ?? 0;
}

export async function getTutorial(number: number): Promise<Tutorial | null> {
  const result = await getDocumentClient().send(
    new GetCommand({
      TableName: config.tableName,
      Key: tutorialKey(number),
    }),
  );
  return result.Item ? toTutorial(result.Item as StoredTutorial) : null;
}
