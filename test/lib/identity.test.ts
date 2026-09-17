import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { getIdentity, maskEmail, toDisplayName } from '../../src/lib/identity.js';

/** Builds the event shape API Gateway's JWT authorizer hands to the Lambda. */
function eventWith(claims: Record<string, unknown> | undefined) {
  return {
    requestContext: claims === undefined ? {} : { authorizer: { jwt: { claims } } },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

describe('getIdentity', () => {
  it('takes the user id from the verified sub claim', () => {
    const identity = getIdentity(
      eventWith({
        sub: 'auth0|abc123456',
        'https://relay-synth.tech/email': 'player@example.com',
        'https://relay-synth.tech/nickname': 'synthkid',
      }),
    );

    expect(identity).toEqual({
      userId: 'auth0|abc123456',
      email: 'player@example.com',
      nickname: 'synthkid',
    });
  });

  it('tolerates a token carrying only the subject', () => {
    // The custom claims come from an Auth0 Action. If it is ever unbound, the
    // API must still authenticate rather than 500.
    const identity = getIdentity(eventWith({ sub: 'auth0|abc123456' }));

    expect(identity).toEqual({ userId: 'auth0|abc123456', email: null, nickname: null });
  });

  it('throws 401 when the authorizer context is absent', () => {
    expect(() => getIdentity(eventWith(undefined))).toThrow('Token is missing a subject claim');
  });

  it('throws 401 when the claims carry no subject', () => {
    expect(() => getIdentity(eventWith({ email: 'player@example.com' }))).toThrow(
      'Token is missing a subject claim',
    );
  });

  it('rejects an empty subject rather than creating a profile keyed on ""', () => {
    expect(() => getIdentity(eventWith({ sub: '' }))).toThrow();
  });

  it('ignores a non-string claim instead of trusting it', () => {
    const identity = getIdentity(
      eventWith({ sub: 'auth0|abc', 'https://relay-synth.tech/email': 12345 }),
    );

    expect(identity.email).toBeNull();
  });

  it('reads no identity from the request body', () => {
    // The old API looked users up by req.body.email. Identity is now derived
    // solely from claims API Gateway has already verified.
    const identity = getIdentity(eventWith({ sub: 'auth0|real-user' }));

    expect(identity.userId).toBe('auth0|real-user');
  });
});

describe('maskEmail', () => {
  it('keeps the first two characters and the domain', () => {
    expect(maskEmail('player@example.com')).toBe('pl***@example.com');
  });

  it('does not expose a single-character local part', () => {
    expect(maskEmail('a@example.com')).toBe('a***@example.com');
  });

  it('masks a two-character local part', () => {
    expect(maskEmail('ab@example.com')).toBe('a***@example.com');
  });

  it('splits on the last @, so a quoted local part cannot unmask the address', () => {
    expect(maskEmail('we"ir@d"@example.com')).toBe('we***@example.com');
  });

  it('falls back to a neutral label for a malformed address', () => {
    expect(maskEmail('not-an-email')).toBe('player');
  });

  it('falls back when the address begins with @', () => {
    expect(maskEmail('@example.com')).toBe('player');
  });
});

describe('toDisplayName', () => {
  it('prefers an Auth0 nickname', () => {
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

  it('never returns a full email address', () => {
    for (const email of ['player@example.com', 'a@b.co', 'first.last+tag@sub.example.com']) {
      expect(toDisplayName({ userId: 'auth0|x', email, nickname: null })).not.toContain(email);
    }
  });
});
