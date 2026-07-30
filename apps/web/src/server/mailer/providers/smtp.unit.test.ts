import { describe, expect, it, vi } from "vitest";
import { SmtpMailerTransport } from "~/server/mailer/providers/smtp";

describe("SmtpMailerTransport", () => {
  it("creates transport with host/port/secure/auth and sends", async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    const createTransport = vi.fn(() => ({ sendMail }));

    const transport = new SmtpMailerTransport({
      createTransport,
      host: "smtp.example.com",
      port: 465,
      secure: true,
      user: "u",
      pass: "p",
      fromDefault: "hello@example.com",
    });

    await transport.send({ to: "to@x.com", subject: "s", text: "t", html: "h" });

    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 465,
      secure: true,
      auth: { user: "u", pass: "p" },
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: "hello@example.com", to: "to@x.com" }),
    );
  });

  it("omits auth when no user provided", async () => {
    const createTransport = vi.fn(() => ({
      sendMail: vi.fn().mockResolvedValue({}),
    }));

    const transport = new SmtpMailerTransport({
      createTransport,
      host: "h",
      port: 587,
      secure: false,
      fromDefault: "hello@example.com",
    });

    await transport.send({ to: "to@x.com", subject: "s", text: "t", html: "h" });

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ auth: undefined }),
    );
  });

  it("throws when no from address is available", async () => {
    const transport = new SmtpMailerTransport({
      createTransport: () => ({ sendMail: vi.fn() }),
      host: "h",
      port: 587,
      secure: false,
    });

    await expect(
      transport.send({ to: "to@x.com", subject: "s", text: "t", html: "h" }),
    ).rejects.toThrow("FROM_EMAIL is required for mailer");
  });
});
