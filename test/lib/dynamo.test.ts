import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { afterEach, describe, expect, it } from 'vitest';
import { getDocumentClient, setDocumentClient } from '../../src/lib/dynamo.js';

afterEach(() => setDocumentClient(undefined));

describe('getDocumentClient', () => {
  it('reuses one client across calls', () => {
    setDocumentClient(undefined);

    // Constructed once per execution environment so warm invocations skip
    // client construction and keep their HTTP connections alive.
    expect(getDocumentClient()).toBe(getDocumentClient());
  });

  it('rebuilds after the cache is cleared', () => {
    setDocumentClient(undefined);
    const first = getDocumentClient();

    setDocumentClient(undefined);

    expect(getDocumentClient()).not.toBe(first);
  });

  it('returns an injected client so suites never reach AWS', () => {
    const injected = { marker: 'test-double' } as unknown as DynamoDBDocumentClient;

    setDocumentClient(injected);

    expect(getDocumentClient()).toBe(injected);
  });
});
