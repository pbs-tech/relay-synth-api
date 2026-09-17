/**
 * Single-table key layout.
 *
 *   Tutorials  PK = "TUTORIAL"        SK = "TUTORIAL#0007"
 *   Users      PK = "USER#<auth0 sub>" SK = "PROFILE"
 *
 * Every tutorial shares one partition key so the whole curriculum comes back
 * from a single Query, already ordered by the zero-padded sort key. That is
 * cheaper and more predictable than the Scan a per-tutorial partition would need.
 *
 * Users carry GSI1PK = "LEADERBOARD" with GSI1SK = totalScore (numeric), so the
 * leaderboard is one descending Query rather than a full-table Scan-and-sort.
 */
export const TUTORIAL_PK = 'TUTORIAL';
export const LEADERBOARD_PK = 'LEADERBOARD';
export const USER_SK = 'PROFILE';

/** Zero-padded so lexicographic sort order matches numeric order past 9. */
export function tutorialSk(number: number): string {
  return `TUTORIAL#${String(number).padStart(4, '0')}`;
}

export function tutorialKey(number: number): { PK: string; SK: string } {
  return { PK: TUTORIAL_PK, SK: tutorialSk(number) };
}

export function userKey(userId: string): { PK: string; SK: string } {
  return { PK: `USER#${userId}`, SK: USER_SK };
}
