import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockCreateReceiptRule, mockDeleteReceiptRule, mockIsReceivingRegion } =
  vi.hoisted(() => ({
    mockDb: {
      teamUser: { findFirst: vi.fn() },
      domain: { findUnique: vi.fn(), update: vi.fn() },
      emailForwardingRule: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      inboundEmail: { findMany: vi.fn() },
    },
    mockCreateReceiptRule: vi.fn(),
    mockDeleteReceiptRule: vi.fn(),
    mockIsReceivingRegion: vi.fn(),
  }));

vi.mock("~/server/db", () => ({ db: mockDb }));
vi.mock("~/server/auth", () => ({ getServerAuthSession: vi.fn() }));
vi.mock("~/server/aws/ses-receipt-rules", () => ({
  createReceiptRule: mockCreateReceiptRule,
  deleteReceiptRule: mockDeleteReceiptRule,
  isReceivingRegion: mockIsReceivingRegion,
}));
vi.mock("~/env", () => ({
  env: {
    INBOUND_SES_RULE_SET: "default-rule-set",
    INBOUND_SNS_TOPIC_ARN: "arn:aws:sns:us-east-1:123:topic",
    INBOUND_S3_BUCKET: "inbound-bucket",
  },
}));

import { createCallerFactory } from "~/server/api/trpc";
import { forwardingRouter } from "./forwarding";

const createCaller = createCallerFactory(forwardingRouter);

function getContext(teamId = 10) {
  return {
    db: mockDb,
    headers: new Headers(),
    session: {
      user: { id: 1, email: "user@test.com", isWaitlisted: false, isAdmin: false, isBetaUser: true },
    },
    team: { id: teamId, name: "Acme" },
  } as any;
}

const MOCK_DOMAIN = {
  id: 1,
  name: "example.com",
  teamId: 10,
  region: "us-east-1",
  status: "SUCCESS",
  inboundEnabled: true,
  sesReceiptRuleId: null,
};

describe("forwardingRouter", () => {
  beforeEach(() => {
    Object.values(mockDb).forEach((model) => {
      Object.values(model).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockReset());
    });
    mockCreateReceiptRule.mockReset();
    mockDeleteReceiptRule.mockReset();
    mockIsReceivingRegion.mockReset();

    mockDb.teamUser.findFirst.mockResolvedValue({
      teamId: 10,
      userId: 1,
      role: "ADMIN",
      team: { id: 10, name: "Acme" },
    });
    mockDb.domain.findUnique.mockResolvedValue(MOCK_DOMAIN);
  });

  describe("createRule", () => {
    it("creates a forwarding rule for a verified domain", async () => {
      mockDb.emailForwardingRule.findUnique.mockResolvedValue(null);
      mockDb.emailForwardingRule.create.mockResolvedValue({
        id: "rule_1",
        sourceAddress: "support",
        destinationAddress: "admin@personal.com",
        enabled: true,
      });

      const caller = createCaller(getContext());
      const result = await caller.createRule({
        id: 1,
        sourceAddress: "Support",
        destinationAddress: "admin@personal.com",
      });

      expect(result.sourceAddress).toBe("support");
      expect(mockDb.emailForwardingRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sourceAddress: "support",
            destinationAddress: "admin@personal.com",
            teamId: 10,
            domainId: 1,
          }),
        })
      );
    });

    it("rejects creating a rule on unverified domain", async () => {
      mockDb.domain.findUnique.mockResolvedValue({ ...MOCK_DOMAIN, status: "PENDING" });

      const caller = createCaller(getContext());
      await expect(
        caller.createRule({
          id: 1,
          sourceAddress: "support",
          destinationAddress: "admin@personal.com",
        })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining("verified"),
      });
    });

    it("rejects creating a rule when inbound is disabled", async () => {
      mockDb.domain.findUnique.mockResolvedValue({ ...MOCK_DOMAIN, inboundEnabled: false });

      const caller = createCaller(getContext());
      await expect(
        caller.createRule({
          id: 1,
          sourceAddress: "support",
          destinationAddress: "admin@personal.com",
        })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining("enabled"),
      });
    });

    it("rejects duplicate source address", async () => {
      mockDb.emailForwardingRule.findUnique.mockResolvedValue({
        id: "existing",
        sourceAddress: "support",
      });

      const caller = createCaller(getContext());
      await expect(
        caller.createRule({
          id: 1,
          sourceAddress: "support",
          destinationAddress: "other@personal.com",
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });

  describe("enableInbound", () => {
    it("creates SES receipt rule and enables inbound", async () => {
      mockDb.domain.findUnique.mockResolvedValue({ ...MOCK_DOMAIN, inboundEnabled: false });
      mockIsReceivingRegion.mockReturnValue(true);
      mockCreateReceiptRule.mockResolvedValue("unsend-inbound-example.com");
      mockDb.domain.update.mockResolvedValue({ ...MOCK_DOMAIN, inboundEnabled: true });

      const caller = createCaller(getContext());
      await caller.enableInbound({ id: 1 });

      expect(mockCreateReceiptRule).toHaveBeenCalledWith(
        "example.com",
        "us-east-1",
        "default-rule-set",
        "arn:aws:sns:us-east-1:123:topic",
        "inbound-bucket"
      );
      expect(mockDb.domain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            inboundEnabled: true,
            sesReceiptRuleId: "unsend-inbound-example.com",
          }),
        })
      );
    });

    it("rejects non-receiving region", async () => {
      mockDb.domain.findUnique.mockResolvedValue({
        ...MOCK_DOMAIN,
        region: "ap-southeast-1",
        inboundEnabled: false,
      });
      mockIsReceivingRegion.mockReturnValue(false);

      const caller = createCaller(getContext());
      await expect(caller.enableInbound({ id: 1 })).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining("not available"),
      });
    });

    it("returns domain unchanged if already enabled", async () => {
      mockDb.domain.findUnique.mockResolvedValue(MOCK_DOMAIN);
      mockIsReceivingRegion.mockReturnValue(true);

      const caller = createCaller(getContext());
      const result = await caller.enableInbound({ id: 1 });

      expect(result).toEqual(MOCK_DOMAIN);
      expect(mockCreateReceiptRule).not.toHaveBeenCalled();
    });
  });

  describe("disableInbound", () => {
    it("deletes SES receipt rule and disables inbound", async () => {
      mockDb.domain.findUnique.mockResolvedValue({
        ...MOCK_DOMAIN,
        inboundEnabled: true,
        sesReceiptRuleId: "unsend-inbound-example.com",
      });
      mockDeleteReceiptRule.mockResolvedValue(undefined);
      mockDb.domain.update.mockResolvedValue({ ...MOCK_DOMAIN, inboundEnabled: false });

      const caller = createCaller(getContext());
      await caller.disableInbound({ id: 1 });

      expect(mockDeleteReceiptRule).toHaveBeenCalledWith(
        "example.com",
        "us-east-1",
        "default-rule-set"
      );
      expect(mockDb.domain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            inboundEnabled: false,
            sesReceiptRuleId: null,
          }),
        })
      );
    });
  });

  describe("deleteRule", () => {
    it("deletes a rule owned by the team", async () => {
      mockDb.emailForwardingRule.findFirst.mockResolvedValue({
        id: "rule_1",
        teamId: 10,
      });
      mockDb.emailForwardingRule.delete.mockResolvedValue({});

      const caller = createCaller(getContext());
      const result = await caller.deleteRule({ ruleId: "rule_1" });

      expect(result).toEqual({ success: true });
      expect(mockDb.emailForwardingRule.delete).toHaveBeenCalledWith({
        where: { id: "rule_1" },
      });
    });

    it("rejects deleting a rule from another team", async () => {
      mockDb.emailForwardingRule.findFirst.mockResolvedValue(null);

      const caller = createCaller(getContext());
      await expect(
        caller.deleteRule({ ruleId: "rule_other_team" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
