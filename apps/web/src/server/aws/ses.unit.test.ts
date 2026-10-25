import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendRawEmail } from "~/server/aws/ses";

function unfold(raw: string) {
  return raw.replace(/\r\n[ \t]+/g, " ");
}

function mockSesSend() {
  return vi
    .spyOn(SESv2Client.prototype, "send")
    .mockResolvedValue({ MessageId: "ses-message-id" } as never);
}

describe("sendRawEmail", () => {
  let sendSpy: ReturnType<typeof mockSesSend>;

  beforeEach(() => {
    sendSpy = mockSesSend();
  });

  async function buildRawMessage(
    overrides: Partial<Parameters<typeof sendRawEmail>[0]> = {},
  ) {
    const messageId = await sendRawEmail({
      from: "Acme <hello@acme.test>",
      to: ["alice@example.com", "bob@example.com"],
      cc: ["carol@example.com"],
      bcc: ["dave@example.com"],
      replyTo: ["support@acme.test"],
      subject: "Your weekly digest – ünïcödé",
      text: "Hello Alice",
      html: "<p>Hello <strong>Alice</strong></p>",
      region: "us-east-1",
      configurationSetName: "usesend-config",
      sesTenantId: "tenant-1",
      emailId: "email-123",
      unsubUrl: "https://app.usesend.test/unsubscribe?id=abc",
      isBulk: true,
      inReplyToMessageId: "original-id",
      headers: { "X-Campaign": "fall-launch" },
      attachments: [
        {
          filename: "report.txt",
          content: Buffer.from("attachment body").toString("base64"),
        },
      ],
      ...overrides,
    });

    expect(messageId).toBe("ses-message-id");
    expect(sendSpy).toHaveBeenCalledTimes(1);

    const command = sendSpy.mock.calls[0]![0] as unknown as SendEmailCommand;
    expect(command).toBeInstanceOf(SendEmailCommand);

    return {
      input: command.input,
      raw: Buffer.from(command.input.Content!.Raw!.Data!).toString("utf8"),
    };
  }

  it("passes configuration set and tenant to SES", async () => {
    const { input } = await buildRawMessage();

    expect(input.ConfigurationSetName).toBe("usesend-config");
    expect(input.TenantName).toBe("tenant-1");
  });

  it("builds a raw MIME message with the expected headers", async () => {
    const { raw } = await buildRawMessage();
    const [headerBlock] = unfold(raw).split("\r\n\r\n");

    expect(headerBlock).toContain("From: Acme <hello@acme.test>");
    expect(headerBlock).toContain("To: alice@example.com, bob@example.com");
    expect(headerBlock).toContain("Cc: carol@example.com");
    expect(headerBlock).toContain("Bcc: dave@example.com");
    expect(headerBlock).toContain("Reply-To: support@acme.test");
    expect(headerBlock).toMatch(/^Subject: =\?UTF-8\?Q\?.+\?=$/m);
    expect(headerBlock).toContain("MIME-Version: 1.0");
    expect(headerBlock).toMatch(/^Message-ID: <.+@acme\.test>$/m);
    expect(headerBlock).toMatch(/^Date: .+$/m);
    expect(headerBlock).toMatch(/^X-Entity-Ref-ID: .+$/m);
    expect(headerBlock).toContain("X-Usesend-Email-ID: email-123");
    expect(headerBlock).toContain(
      "List-Unsubscribe: <https://app.usesend.test/unsubscribe?id=abc>",
    );
    expect(headerBlock).toContain(
      "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
    );
    expect(headerBlock).toContain("Precedence: bulk");
    expect(headerBlock).toContain(
      "In-Reply-To: <original-id@email.amazonses.com>",
    );
    expect(headerBlock).toContain(
      "References: <original-id@email.amazonses.com>",
    );
    expect(headerBlock).toContain("X-Campaign: fall-launch");
    expect(headerBlock).toMatch(
      /^Content-Type: multipart\/mixed; boundary=".+"$/m,
    );
  });

  it("includes text, html and attachment parts", async () => {
    const { raw } = await buildRawMessage();
    const unfolded = unfold(raw);

    expect(unfolded).toMatch(/Content-Type: multipart\/alternative;/);
    expect(unfolded).toContain("Content-Type: text/plain; charset=utf-8");
    expect(unfolded).toContain("Hello Alice");
    expect(unfolded).toContain("Content-Type: text/html; charset=utf-8");
    expect(unfolded).toContain("<p>Hello <strong>Alice</strong></p>");
    expect(unfolded).toContain("Content-Type: text/plain; name=report.txt");
    expect(unfolded).toContain(
      "Content-Disposition: attachment; filename=report.txt",
    );
    expect(unfolded).toContain("Content-Transfer-Encoding: base64");
    expect(unfolded).toContain(
      Buffer.from("attachment body").toString("base64"),
    );
  });

  it("omits optional headers and the mixed part when unused", async () => {
    const { raw, input } = await buildRawMessage({
      cc: undefined,
      bcc: undefined,
      replyTo: undefined,
      sesTenantId: undefined,
      unsubUrl: undefined,
      isBulk: undefined,
      inReplyToMessageId: undefined,
      headers: undefined,
      attachments: undefined,
    });
    const [headerBlock] = unfold(raw).split("\r\n\r\n");

    expect(input.TenantName).toBeUndefined();
    expect(headerBlock).not.toMatch(/^(Cc|Bcc|Reply-To):/m);
    expect(headerBlock).not.toMatch(/^List-Unsubscribe/m);
    expect(headerBlock).not.toMatch(/^Precedence:/m);
    expect(headerBlock).not.toMatch(/^(In-Reply-To|References):/m);
    expect(headerBlock).toMatch(
      /^Content-Type: multipart\/alternative; boundary=".+"$/m,
    );
  });
});
