#!/usr/bin/env tsx
/**
 * Seeds tutorial content from data/tutorials.json into DynamoDB.
 *
 * Idempotent: every item is written by primary key, so re-running simply
 * overwrites with the file's current contents. This is the mechanism that makes
 * the JSON file - not the database - the source of truth for tutorial content.
 *
 *   TABLE_NAME=relay-synth-prod AWS_REGION=eu-west-2 npm run seed
 *   TABLE_NAME=... npm run seed -- --dry-run
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { BatchWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { tutorialKey } from '../src/lib/keys.js';
import { assertValidTutorials } from '../src/lib/validate-tutorials.js';
import type { Tutorial } from '../src/types.js';

const BATCH_SIZE = 25; // DynamoDB's hard limit for BatchWriteItem.

type RequestItems = NonNullable<BatchWriteCommandInput['RequestItems']>;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function loadTutorials(): Promise<Tutorial[]> {
  const raw = await readFile(resolve(root, 'data/tutorials.json'), 'utf8');
  const parsed = JSON.parse(raw) as { tutorials: Tutorial[] };
  if (!Array.isArray(parsed.tutorials)) {
    throw new Error('data/tutorials.json must contain a "tutorials" array');
  }
  return parsed.tutorials;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const tableName = process.env.TABLE_NAME;

  if (!tableName && !dryRun) {
    throw new Error('TABLE_NAME must be set (or pass --dry-run to validate only)');
  }

  const tutorials = await loadTutorials();

  // Validate before writing: a bad parameter value would produce an unsolvable
  // tutorial that looks completely normal until a player loses points to it.
  assertValidTutorials(tutorials);
  console.log(`Validated ${tutorials.length} tutorials`);

  if (dryRun) {
    console.log('Dry run - nothing written');
    for (const t of tutorials) {
      console.log(
        `  ${String(t.number).padStart(2)}. ${t.name.padEnd(38)} ${t.difficulty.padEnd(7)} ${t.pointsAvailable}pts  [${Object.keys(t.synth.parameters).join(', ')}]`,
      );
    }
    return;
  }

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });

  const requests = tutorials.map((tutorial) => ({
    PutRequest: {
      Item: { ...tutorialKey(tutorial.number), entity: 'Tutorial', ...tutorial },
    },
  }));

  for (const [index, batch] of chunk(requests, BATCH_SIZE).entries()) {
    let unprocessed: RequestItems = { [tableName!]: batch };

    // BatchWriteItem can partially succeed under throttling; retry what it hands back.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await client.send(new BatchWriteCommand({ RequestItems: unprocessed }));
      const remaining = result.UnprocessedItems?.[tableName!];
      if (!remaining || remaining.length === 0) break;

      unprocessed = { [tableName!]: remaining };
      const backoff = 2 ** attempt * 100;
      console.warn(`  ${remaining.length} items unprocessed, retrying in ${backoff}ms`);
      await new Promise((r) => setTimeout(r, backoff));
    }

    console.log(`  Wrote batch ${index + 1} (${batch.length} tutorials)`);
  }

  console.log(`Seeded ${tutorials.length} tutorials into ${tableName}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
