/** Fails fast at cold start rather than returning confusing 500s per request. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  tableName: required('TABLE_NAME'),
  region: process.env.AWS_REGION ?? 'eu-west-2',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  /** Namespaced Auth0 custom claims, injected by the Auth0 login Action. */
  claims: {
    email: process.env.EMAIL_CLAIM ?? 'https://relay-synth.tech/email',
    nickname: process.env.NICKNAME_CLAIM ?? 'https://relay-synth.tech/nickname',
  },
} as const;
