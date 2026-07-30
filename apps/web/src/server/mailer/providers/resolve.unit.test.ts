import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockEnv,
  SesMailerTransport,
  SmtpMailerTransport,
  UseSendMailerTransport,
  LegacySesTransport,
  mockGetSesClient,
  mockCreateTransport,
  MockUseSend,
} = vi.hoisted(() => ({
  mockEnv: {} as Record<string, string | boolean | undefined>,
  SesMailerTransport: vi.fn(),
  SmtpMailerTransport: vi.fn(),
  UseSendMailerTransport: vi.fn(),
  LegacySesTransport: vi.fn(),
  mockGetSesClient: vi.fn(),
  mockCreateTransport: vi.fn(),
  MockUseSend: vi.fn(),
}));

vi.mock("~/env", () => ({
  env: new Proxy({}, { get: (_t, k) => mockEnv[k as string] }),
}));
vi.mock("~/server/aws/ses", () => ({ getSesClient: mockGetSesClient }));
vi.mock("nodemailer", () => ({ default: { createTransport: mockCreateTransport } }));
vi.mock("usesend-js", () => ({ UseSend: MockUseSend }));
vi.mock("~/server/mailer/providers/ses", () => ({ SesMailerTransport }));
vi.mock("~/server/mailer/providers/smtp", () => ({ SmtpMailerTransport }));
vi.mock("~/server/mailer/providers/usesend", () => ({
  UseSendMailerTransport,
}));
vi.mock("~/server/mailer/providers/legacy-ses", () => ({ LegacySesTransport }));

import { resolveMailerTransport } from "~/server/mailer/providers/resolve";

beforeEach(() => {
  SesMailerTransport.mockClear();
  SmtpMailerTransport.mockClear();
  UseSendMailerTransport.mockClear();
  LegacySesTransport.mockClear();
  MockUseSend.mockClear();
  for (const k of Object.keys(mockEnv)) delete mockEnv[k];
  mockEnv.AWS_DEFAULT_REGION = "us-east-1";
  mockEnv.FROM_EMAIL = "hello@example.com";
});

describe("resolveMailerTransport", () => {
  it("returns SesMailerTransport for provider=ses", () => {
    resolveMailerTransport("ses", true);
    expect(SesMailerTransport).toHaveBeenCalledTimes(1);
  });

  it("returns SmtpMailerTransport for provider=smtp with creds and secure port", () => {
    mockEnv.MAILER_SMTP_HOST = "smtp.example.com";
    mockEnv.MAILER_SMTP_USER = "u";
    mockEnv.MAILER_SMTP_PASS = "p";
    mockEnv.MAILER_SMTP_PORT = "465";

    resolveMailerTransport("smtp", true);

    expect(SmtpMailerTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.example.com",
        port: 465,
        secure: true,
        user: "u",
        pass: "p",
      }),
    );
  });

  it("defaults smtp port to 587 and secure false when not 465", () => {
    mockEnv.MAILER_SMTP_HOST = "h";
    mockEnv.MAILER_SMTP_USER = "u";
    mockEnv.MAILER_SMTP_PASS = "p";

    resolveMailerTransport("smtp", true);

    expect(SmtpMailerTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 587, secure: false }),
    );
  });

  it("throws for provider=smtp missing creds", () => {
    expect(() => resolveMailerTransport("smtp", true)).toThrow(/MAILER_SMTP_HOST/);
  });

  it("returns UseSendMailerTransport for provider=usesend with key", () => {
    mockEnv.UNSEND_API_KEY = "key";

    resolveMailerTransport("usesend", true);

    expect(MockUseSend).toHaveBeenCalledWith("key");
    expect(UseSendMailerTransport).toHaveBeenCalledTimes(1);
  });

  it("throws for provider=usesend missing key", () => {
    expect(() => resolveMailerTransport("usesend", true)).toThrow(/USESEND_API_KEY/);
  });

  it("returns LegacySesTransport when unset and self-hosted", () => {
    resolveMailerTransport(undefined, false);
    expect(LegacySesTransport).toHaveBeenCalledTimes(1);
  });

  it("returns UseSendMailerTransport when unset and cloud with key", () => {
    mockEnv.UNSEND_API_KEY = "key";
    resolveMailerTransport(undefined, true);
    expect(UseSendMailerTransport).toHaveBeenCalledTimes(1);
  });

  it("throws when unset, cloud, and no useSend key", () => {
    expect(() => resolveMailerTransport(undefined, true)).toThrow(/USESEND_API_KEY/);
  });
});
