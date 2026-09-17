/** Fails fast at cold start rather than returning confusing 500s per request. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Treats an empty value as unset. `process.env.X ?? fallback` only falls back on
 * undefined, so a variable that resolves to "" - easily produced by a Terraform
 * variable or a blank CI secret - would otherwise override the default with an
 * empty string.
 */
function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

export const config = {
  tableName: required('TABLE_NAME'),
  region: optional('AWS_REGION', 'eu-west-2'),
  logLevel: optional('LOG_LEVEL', 'info'),
  /** Namespaced Auth0 custom claims, injected by the Auth0 login Action. */
  claims: {
    email: optional('EMAIL_CLAIM', 'https://relay-synth.peebles.lol/email'),
    nickname: optional('NICKNAME_CLAIM', 'https://relay-synth.peebles.lol/nickname'),
  },
} as const;
