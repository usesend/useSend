import { describe, expect, it, vi } from "vitest";

vi.mock("better-auth", () => ({
  betterAuth: vi.fn((options) => ({ options, api: {} })),
}));

vi.mock("better-auth/adapters/prisma", () => ({
  prismaAdapter: vi.fn(() => ({ id: "prisma-adapter" })),
}));

vi.mock("better-auth/plugins", () => ({
  customSession: vi.fn(() => ({ id: "custom-session" })),
  emailOTP: vi.fn((options) => ({ id: "email-otp", options })),
}));

vi.mock("~/server/db", () => ({
  db: {},
}));

vi.mock("~/server/mailer", () => ({
  sendSignInOtpEmail: vi.fn(),
}));

vi.mock("~/server/redis", () => ({
  getRedis: vi.fn(),
  redisKey: vi.fn((key: string) => key),
}));

vi.mock("~/env", () => ({
  env: {
    ADMIN_EMAIL: "admin@example.com",
    AUTH_EMAIL_RATE_LIMIT: 5,
    BETTER_AUTH_SECRET: "a-secure-test-secret-that-is-long-enough",
    BETTER_AUTH_URL: "http://localhost:3000",
    FROM_EMAIL: "hello@example.com",
    GITHUB_ID: "github-client-id",
    GITHUB_SECRET: "github-client-secret",
    NEXT_PUBLIC_IS_CLOUD: true,
    NODE_ENV: "test",
  },
}));

import { authConfig, authProviders } from "~/server/auth";

describe("Better Auth configuration", () => {
  it("configures GitHub with the required scopes", () => {
    expect(authConfig.socialProviders.github).toMatchObject({
      clientId: "github-client-id",
      clientSecret: "github-client-secret",
      scope: ["read:user", "user:email"],
    });
    expect(authProviders).toContainEqual({
      id: "github",
      name: "GitHub",
      type: "oauth",
    });
  });

  it("keeps numeric domain user IDs and maps legacy auth columns", () => {
    expect(authConfig.advanced.database.generateId({ model: "user" })).toBe(
      false,
    );
    expect(authConfig.session.fields).toEqual({
      token: "sessionToken",
      expiresAt: "expires",
    });
    expect(authConfig.account.fields).toMatchObject({
      accountId: "providerAccountId",
      providerId: "provider",
    });
  });

  it("enables the security controls used by the POC", () => {
    expect(authConfig.account.encryptOAuthTokens).toBe(true);
    expect(authConfig.rateLimit.enabled).toBe(true);
    expect(authConfig.rateLimit.customStorage).toBeDefined();

    const emailPlugin = authConfig.plugins.find(
      (plugin) => plugin.id === "email-otp",
    ) as unknown as { options: Record<string, unknown> };
    expect(emailPlugin.options).toMatchObject({
      allowedAttempts: 3,
      expiresIn: 300,
      otpLength: 6,
      storeOTP: "hashed",
    });
  });
});
