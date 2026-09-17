import {
  ConditionalCheckFailedException,
} from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { config } from '../lib/config.js';
import { getDocumentClient } from '../lib/dynamo.js';
import { LEADERBOARD_PK, userKey } from '../lib/keys.js';
import { toDisplayName, type Identity } from '../lib/identity.js';
import { logger } from '../lib/logger.js';
import type { LeaderboardEntry, UserProfile } from '../types.js';

const LEADERBOARD_INDEX = 'GSI1';
const DEFAULT_LEADERBOARD_LIMIT = 100;

type StoredUser = UserProfile & {
  PK?: string;
  SK?: string;
  entity?: string;
  GSI1PK?: string;
  GSI1SK?: number;
};

function toProfile(item: StoredUser): UserProfile {
  const {
    PK: _pk,
    SK: _sk,
    entity: _entity,
    GSI1PK: _gsi1pk,
    GSI1SK: _gsi1sk,
    ...profile
  } = item;
  return profile as UserProfile;
}

export async function getUser(userId: string): Promise<UserProfile | null> {
  const result = await getDocumentClient().send(
    new GetCommand({ TableName: config.tableName, Key: userKey(userId) }),
  );
  return result.Item ? toProfile(result.Item as StoredUser) : null;
}

/**
 * Auth0 owns account creation, so there is no signup endpoint any more. A profile
 * is instead materialised the first time a valid token turns up for a subject we
 * have not seen. The conditional Put makes concurrent first requests safe: the
 * losers fail the condition and simply read the winner's record.
 */
export async function ensureUser(identity: Identity): Promise<UserProfile> {
  const existing = await getUser(identity.userId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const profile: UserProfile = {
    userId: identity.userId,
    email: identity.email,
    displayName: toDisplayName(identity),
    totalScore: 0,
    tutorialsCompleted: [],
    createdAt: now,
    updatedAt: now,
  };

  try {
    await getDocumentClient().send(
      new PutCommand({
        TableName: config.tableName,
        Item: {
          ...userKey(identity.userId),
          entity: 'User',
          GSI1PK: LEADERBOARD_PK,
          GSI1SK: 0,
          ...profile,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
    logger.info('Created user profile', { userId: identity.userId });
    return profile;
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      // Another concurrent request created it first; theirs is authoritative.
      const winner = await getUser(identity.userId);
      if (winner) return winner;
    }
    throw error;
  }
}

export interface CompleteTutorialResult {
  profile: UserProfile;
  /** False when the tutorial was already completed, so no points were awarded. */
  awarded: boolean;
  pointsAwarded: number;
}

/**
 * Marks a tutorial complete and awards its points in a single conditional update.
 *
 * Two deliberate changes from the old API. First, the point value comes from the
 * tutorial record on the server, not from the request body - previously a client
 * could PATCH itself an arbitrary score. Second, the "already completed?" check
 * and the write happen in one atomic UpdateItem guarded by a condition, instead
 * of a read followed by an unguarded save that could double-award under a double
 * click.
 */
export async function completeTutorial(
  identity: Identity,
  tutorialNumber: number,
  pointsAvailable: number,
): Promise<CompleteTutorialResult> {
  await ensureUser(identity);
  const now = new Date().toISOString();

  try {
    const result = await getDocumentClient().send(
      new UpdateCommand({
        TableName: config.tableName,
        Key: userKey(identity.userId),
        UpdateExpression: [
          'SET totalScore = totalScore + :points',
          'GSI1SK = totalScore + :points',
          'tutorialsCompleted = list_append(tutorialsCompleted, :entry)',
          'updatedAt = :now',
        ].join(', '),
        // Both clauses read the pre-update item, so GSI1SK lands on the new total.
        ConditionExpression: 'attribute_exists(PK) AND NOT contains(tutorialsCompleted, :number)',
        ExpressionAttributeValues: {
          ':points': pointsAvailable,
          ':entry': [tutorialNumber],
          ':number': tutorialNumber,
          ':now': now,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );

    return {
      profile: toProfile(result.Attributes as StoredUser),
      awarded: true,
      pointsAwarded: pointsAvailable,
    };
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      const profile = await getUser(identity.userId);
      if (!profile) throw error;
      logger.info('Tutorial already completed', {
        userId: identity.userId,
        tutorialNumber,
      });
      return { profile, awarded: false, pointsAwarded: 0 };
    }
    throw error;
  }
}

/**
 * One descending Query against GSI1 replaces the old full-collection find().sort().
 * Emails are never returned - only the masked display name set at profile creation.
 */
export async function getLeaderboard(
  limit = DEFAULT_LEADERBOARD_LIMIT,
): Promise<LeaderboardEntry[]> {
  const result = await getDocumentClient().send(
    new QueryCommand({
      TableName: config.tableName,
      IndexName: LEADERBOARD_INDEX,
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': LEADERBOARD_PK },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );

  return (result.Items ?? []).map((item) => {
    const user = item as StoredUser;
    return {
      displayName: user.displayName,
      totalScore: user.totalScore ?? 0,
      tutorialsCompleted: user.tutorialsCompleted ?? [],
    };
  });
}
