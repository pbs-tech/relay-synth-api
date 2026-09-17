import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { config } from './config.js';
import { unauthorized } from './errors.js';

export interface Identity {
  /** Auth0 subject claim, e.g. "auth0|65f...". The only trusted user id. */
  userId: string;
  email: string | null;
  nickname: string | null;
}

type ClaimValue = string | number | boolean | string[] | undefined;

function readClaim(claims: Record<string, ClaimValue>, key: string): string | null {
  const value = claims[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Pulls the caller's identity out of the API Gateway JWT authorizer context.
 *
 * API Gateway has already verified the token's signature, issuer, audience and
 * expiry against Auth0's JWKS before the Lambda ever runs, so these claims are
 * trustworthy. This replaces the old handlers' habit of reading req.body.email,
 * which let any authenticated caller modify any other account's score.
 */
export function getIdentity(event: APIGatewayProxyEventV2WithJWTAuthorizer): Identity {
  const claims = event.requestContext?.authorizer?.jwt?.claims as
    | Record<string, ClaimValue>
    | undefined;

  const userId = claims ? readClaim(claims, 'sub') : null;
  if (!userId) {
    throw unauthorized('Token is missing a subject claim');
  }

  return {
    userId,
    email: readClaim(claims!, config.claims.email),
    nickname: readClaim(claims!, config.claims.nickname),
  };
}

/**
 * Leaderboard-safe name. The old API published every player's raw email address
 * to anyone who could reach /leaderboard; this masks the local part instead.
 */
export function toDisplayName(identity: Pick<Identity, 'email' | 'nickname' | 'userId'>): string {
  if (identity.nickname) return identity.nickname;
  if (identity.email) return maskEmail(identity.email);
  return `player-${identity.userId.slice(-6)}`;
}

export function maskEmail(email: string): string {
  const atIndex = email.lastIndexOf('@');
  if (atIndex <= 0) return 'player';
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  if (local.length <= 2) return `${local[0]}***${domain}`;
  return `${local.slice(0, 2)}***${domain}`;
}
