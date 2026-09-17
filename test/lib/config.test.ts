import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * config.ts resolves its values at module load, so each case re-imports the
 * module under a different environment. Failing at cold start rather than
 * per-request means a misconfigured deploy shows up immediately in the Lambda's
 * init logs instead of as intermittent 500s.
 */
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

describe('config', () => {
  it('throws at import time when TABLE_NAME is missing', async () => {
    vi.stubEnv('TABLE_NAME', '');

    await expect(import('../../src/lib/config.js')).rejects.toThrow(
      'Missing required environment variable: TABLE_NAME',
    );
  });

  it('reads the table name from the environment', async () => {
    vi.stubEnv('TABLE_NAME', 'relay-synth-prod');

    const { config } = await import('../../src/lib/config.js');

    expect(config.tableName).toBe('relay-synth-prod');
  });

  it('defaults the region when AWS_REGION is unset', async () => {
    vi.stubEnv('TABLE_NAME', 'relay-synth-prod');
    vi.stubEnv('AWS_REGION', '');

    const { config } = await import('../../src/lib/config.js');

    expect(config.region).toBe('eu-west-2');
  });

  it('defaults the claim namespaces to match the Terraform-managed Auth0 Action', async () => {
    vi.stubEnv('TABLE_NAME', 'relay-synth-prod');
    vi.stubEnv('EMAIL_CLAIM', '');
    vi.stubEnv('NICKNAME_CLAIM', '');

    const { config } = await import('../../src/lib/config.js');

    expect(config.claims.email).toBe('https://relay-synth.peebles.lol/email');
    expect(config.claims.nickname).toBe('https://relay-synth.peebles.lol/nickname');
  });

  it('allows the claim namespace to be overridden per environment', async () => {
    vi.stubEnv('TABLE_NAME', 'relay-synth-dev');
    vi.stubEnv('EMAIL_CLAIM', 'https://dev.relay-synth.peebles.lol/email');

    const { config } = await import('../../src/lib/config.js');

    expect(config.claims.email).toBe('https://dev.relay-synth.peebles.lol/email');
  });
});
