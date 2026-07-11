const defaultEnv: Record<string, string> = {
  NODE_ENV: "test",
  NEXTAUTH_URL: "http://localhost:3000",
  NEXTAUTH_SECRET: "test-secret",
  BETTER_AUTH_SECRET: "a-secure-test-secret-that-is-long-enough",
  BETTER_AUTH_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://usesend:password@127.0.0.1:54329/usesend_test",
  REDIS_URL: "redis://127.0.0.1:6380/15",
  AWS_ACCESS_KEY_ID: "test-access-key",
  AWS_SECRET_ACCESS_KEY: "test-secret-key",
  AWS_DEFAULT_REGION: "us-east-1",
  NEXT_PUBLIC_IS_CLOUD: "true",
  API_RATE_LIMIT: "2",
  AUTH_EMAIL_RATE_LIMIT: "5",
};

for (const [key, value] of Object.entries(defaultEnv)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}
