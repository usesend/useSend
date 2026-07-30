import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockTransport,
  mockGetMailerTransport,
  mockRenderOtp,
  mockRenderInvite,
  mockEnv,
  mockLogger,
} = vi.hoisted(() => ({
  mockTransport: { send: vi.fn() },
  mockGetMailerTransport: vi.fn(() => mockTransport),
  mockRenderOtp: vi.fn(),
  mockRenderInvite: vi.fn(),
  mockEnv: {
    NODE_ENV: "test",
    FOUNDER_EMAIL: "founder@example.com",
    FROM_EMAIL: "hello@example.com",
  } as Record<string, string | undefined>,
  mockLogger: { info: vi.fn(), error: vi.fn() },
}));

vi.mock("~/server/mailer/providers/resolve", () => ({
  getMailerTransport: mockGetMailerTransport,
}));
vi.mock("~/server/email-templates", () => ({
  renderOtpEmail: mockRenderOtp,
  renderTeamInviteEmail: mockRenderInvite,
}));
vi.mock("~/env", () => ({
  env: new Proxy({}, { get: (_t, k) => mockEnv[k as string] }),
}));
vi.mock("~/server/logger/log", () => ({ logger: mockLogger }));

import {
  sendMail,
  sendSignUpEmail,
  sendSubscriptionConfirmationEmail,
} from "~/server/mailer";

describe("mailer", () => {
  beforeEach(() => {
    mockTransport.send.mockReset();
    mockGetMailerTransport.mockClear();
    mockRenderOtp.mockReset();
    mockRenderInvite.mockReset();
  });

  it("sendMail delegates to the resolved transport", async () => {
    await sendMail("to@x.com", "s", "t", "h", "r@x.com", "from@x.com");

    expect(mockTransport.send).toHaveBeenCalledWith({
      to: "to@x.com",
      subject: "s",
      text: "t",
      html: "h",
      replyTo: "r@x.com",
      fromOverride: "from@x.com",
    });
  });

  it("sendSignUpEmail renders OTP and sends via transport", async () => {
    mockRenderOtp.mockResolvedValue("<p>otp</p>");

    await sendSignUpEmail("to@x.com", "ABCDE", "https://app.example.com/verify");

    expect(mockRenderOtp).toHaveBeenCalled();
    expect(mockTransport.send).toHaveBeenCalledTimes(1);
    expect(mockTransport.send.mock.calls[0]?.[0].to).toBe("to@x.com");
  });

  it("sendSubscriptionConfirmationEmail sends with founder fromOverride", async () => {
    await sendSubscriptionConfirmationEmail("sub@x.com");

    expect(mockTransport.send).toHaveBeenCalledTimes(1);
    expect(mockTransport.send.mock.calls[0]?.[0].fromOverride).toBe(
      "founder@example.com",
    );
  });
});
