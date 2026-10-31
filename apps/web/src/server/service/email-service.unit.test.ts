import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDb,
  mockQueueEmail,
  mockQueueBulk,
  mockValidateDomainFromEmail,
  mockCheckMultipleEmails,
} = vi.hoisted(() => ({
  mockDb: {
    template: {
      findUnique: vi.fn(),
    },
    email: {
      create: vi.fn(),
    },
    emailEvent: {
      create: vi.fn(),
    },
  },
  mockQueueEmail: vi.fn(),
  mockQueueBulk: vi.fn(),
  mockValidateDomainFromEmail: vi.fn(),
  mockCheckMultipleEmails: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: mockDb,
}));

vi.mock("~/server/service/email-queue-service", () => ({
  EmailQueueService: {
    queueEmail: mockQueueEmail,
    queueBulk: mockQueueBulk,
  },
}));

vi.mock("~/server/service/domain-service", () => ({
  validateDomainFromEmail: mockValidateDomainFromEmail,
  validateApiKeyDomainAccess: vi.fn(),
}));

vi.mock("~/server/service/suppression-service", () => ({
  SuppressionService: {
    checkMultipleEmails: mockCheckMultipleEmails,
  },
}));

vi.mock("~/server/logger/log", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@usesend/email-editor/src/renderer", () => ({
  EmailRenderer: class {
    constructor(private content: { body: string }) {}

    async render({
      variableValues,
    }: {
      variableValues: Record<string, string>;
    }) {
      return `<p>${this.content.body} ${variableValues.name}</p>`;
    }
  },
}));

import {
  replaceVariables,
  sendBulkEmails,
  sendEmail,
} from "~/server/service/email-service";
import { UnsendApiError } from "~/server/public-api/api-error";

const templates = [
  {
    id: "tpl_team_1",
    teamId: 1,
    subject: "Hello {{name}}",
    content: JSON.stringify({ body: "welcome" }),
  },
  {
    id: "tpl_team_1_other",
    teamId: 1,
    subject: "Bye {{name}}",
    content: JSON.stringify({ body: "goodbye" }),
  },
  {
    id: "tpl_team_2",
    teamId: 2,
    subject: "Team 2 secret subject",
    content: JSON.stringify({ body: "team 2 secret body" }),
  },
];

describe("replaceVariables", () => {
  it("substitutes variables", () => {
    expect(
      replaceVariables("keep {{name}} and {{code}} and {{name}}", {
        name: "Ada",
        code: "1234",
      }),
    ).toBe("keep Ada and 1234 and Ada");
  });

  it("leaves unknown placeholders untouched", () => {
    expect(replaceVariables("Hi {{name}} {{other}}", { name: "Ada" })).toBe(
      "Hi Ada {{other}}",
    );
  });

  it.each([".*", "name|code", "[", "(a+)+"])(
    "treats the key %s literally",
    (key) => {
      expect(
        replaceVariables(`keep {{name}} and {{code}} {{${key}}}`, {
          [key]: "X",
        }),
      ).toBe("keep {{name}} and {{code}} X");
    },
  );

  it("handles pathological keys quickly", () => {
    const subject = `{{${"a".repeat(5000)}!`;
    const start = performance.now();

    expect(replaceVariables(subject, { "(a+)+": "x" })).toBe(subject);
    expect(performance.now() - start).toBeLessThan(100);
  });

  it.each(["$&", "$`", "$'", "$$", "$1"])(
    "inserts the value %s literally",
    (value) => {
      expect(replaceVariables("SECRET-{{name}}-END", { name: value })).toBe(
        `SECRET-${value}-END`,
      );
    },
  );
});

describe("email-service templates", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockDb.template.findUnique.mockImplementation(
      async ({ where }: { where: { id: string; teamId: number } }) =>
        templates.find(
          (template) =>
            template.id === where.id && template.teamId === where.teamId,
        ) ?? null,
    );
    mockDb.email.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: `email_${mockDb.email.create.mock.calls.length}`,
        ...data,
      }),
    );
    mockValidateDomainFromEmail.mockResolvedValue({
      id: 10,
      region: "us-east-1",
    });
    mockCheckMultipleEmails.mockResolvedValue({});
  });

  describe("sendEmail", () => {
    it("renders a template owned by the sending team", async () => {
      await sendEmail({
        to: "user@example.com",
        from: "hello@example.com",
        templateId: "tpl_team_1",
        variables: { name: "Ada" },
        teamId: 1,
      });

      expect(mockDb.template.findUnique).toHaveBeenCalledWith({
        where: { id: "tpl_team_1", teamId: 1 },
      });
      expect(mockDb.email.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          subject: "Hello Ada",
          html: "<p>welcome Ada</p>",
          teamId: 1,
        }),
      });
    });

    it("rejects a template that belongs to another team", async () => {
      const promise = sendEmail({
        to: "user@example.com",
        from: "hello@example.com",
        subject: "Own subject",
        html: "<p>Own body</p>",
        templateId: "tpl_team_2",
        teamId: 1,
      });

      await expect(promise).rejects.toBeInstanceOf(UnsendApiError);
      await expect(promise).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "Template not found",
      });
      expect(mockDb.email.create).not.toHaveBeenCalled();
      expect(mockQueueEmail).not.toHaveBeenCalled();
    });
  });

  describe("sendBulkEmails", () => {
    it("renders each email with its own team template", async () => {
      await sendBulkEmails([
        {
          to: "a@example.com",
          from: "hello@example.com",
          templateId: "tpl_team_1",
          variables: { name: "Ada" },
          teamId: 1,
        },
        {
          to: "b@example.com",
          from: "hello@example.com",
          templateId: "tpl_team_1_other",
          variables: { name: "Bob" },
          teamId: 1,
        },
      ]);

      expect(mockDb.email.create).toHaveBeenNthCalledWith(1, {
        data: expect.objectContaining({
          subject: "Hello Ada",
          html: "<p>welcome Ada</p>",
        }),
      });
      expect(mockDb.email.create).toHaveBeenNthCalledWith(2, {
        data: expect.objectContaining({
          subject: "Bye Bob",
          html: "<p>goodbye Bob</p>",
        }),
      });
    });

    it("rejects the batch before creating emails when a template belongs to another team", async () => {
      mockCheckMultipleEmails.mockResolvedValue({ "b@example.com": true });

      await expect(
        sendBulkEmails([
          {
            to: "a@example.com",
            from: "hello@example.com",
            templateId: "tpl_team_1",
            teamId: 1,
          },
          {
            to: "b@example.com",
            from: "hello@example.com",
            subject: "Own subject",
            html: "<p>Own body</p>",
            templateId: "tpl_team_2",
            teamId: 1,
          },
        ]),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      expect(mockDb.email.create).not.toHaveBeenCalled();
      expect(mockQueueBulk).not.toHaveBeenCalled();
    });
  });
});
