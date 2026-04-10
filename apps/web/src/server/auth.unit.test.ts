import { describe, expect, it, vi } from "vitest";

const { githubProviderMock } = vi.hoisted(() => ({
  githubProviderMock: vi.fn((options: Record<string, unknown>) => ({
    id: "github",
    type: "oauth",
    options,
  })),
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@auth/prisma-adapter", () => ({
  PrismaAdapter: vi.fn(() => ({})),
}));

vi.mock("next-auth/providers/github", () => ({
  default: githubProviderMock,
}));

vi.mock("next-auth/providers/google", () => ({
  default: vi.fn(),
}));

vi.mock("next-auth/providers/email", () => ({
  default: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {},
}));

vi.mock("~/server/mailer", () => ({
  sendSignUpEmail: vi.fn(),
}));

vi.mock("~/env", () => ({
  env: {
    GITHUB_ID: "github-client-id",
    GITHUB_SECRET: "github-client-secret",
    NEXT_PUBLIC_IS_CLOUD: true,
  },
}));

import "~/server/auth";

describe("authOptions", () => {
  it("configures the GitHub provider with an explicit issuer", () => {
    expect(githubProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "github-client-id",
        clientSecret: "github-client-secret",
        issuer: "https://github.com/login/oauth",
      }),
    );
  });
});
