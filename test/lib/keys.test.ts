import { describe, expect, it } from 'vitest';
import { TUTORIAL_PK, tutorialKey, tutorialSk, userKey } from '../../src/lib/keys.js';

describe('tutorialSk', () => {
  it('zero-pads to four digits', () => {
    expect(tutorialSk(1)).toBe('TUTORIAL#0001');
    expect(tutorialSk(14)).toBe('TUTORIAL#0014');
  });

  it('keeps lexicographic order matching numeric order past 9', () => {
    // DynamoDB sorts sort keys as strings. Without padding, "TUTORIAL#10"
    // would sort before "TUTORIAL#9" and the curriculum would list out of
    // order once it passed nine tutorials.
    const sorted = [1, 2, 9, 10, 11, 100].map(tutorialSk).sort();
    expect(sorted).toEqual([1, 2, 9, 10, 11, 100].map(tutorialSk));
  });

  it('still orders correctly at the four-digit boundary', () => {
    expect(tutorialSk(999) < tutorialSk(1000)).toBe(true);
  });
});

describe('tutorialKey', () => {
  it('puts every tutorial in one partition so the list is a single Query', () => {
    expect(tutorialKey(7)).toEqual({ PK: TUTORIAL_PK, SK: 'TUTORIAL#0007' });
    expect(tutorialKey(1).PK).toBe(tutorialKey(14).PK);
  });
});

describe('userKey', () => {
  it('namespaces the Auth0 subject', () => {
    expect(userKey('auth0|abc123')).toEqual({ PK: 'USER#auth0|abc123', SK: 'PROFILE' });
  });

  it('keeps users in a different partition from tutorials', () => {
    expect(userKey('auth0|abc123').PK).not.toBe(TUTORIAL_PK);
  });
});
