import { describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    signature: null as string | null,
    secret: undefined as string | undefined,
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => {
    const headers = new Headers();
    if (state.signature) {
      headers.set("Stripe-Signature", state.signature);
    }
    return headers;
  }),
}));

vi.mock("~/server/billing/payments", () => ({
  getStripe: vi.fn(() => ({
    webhooks: {
      constructEvent: vi.fn(),
    },
  })),
  syncStripeData: vi.fn(),
}));

vi.mock("~/env", () => ({
  env: {
    get STRIPE_WEBHOOK_SECRET() {
      return state.secret;
    },
  },
}));

vi.mock("~/server/logger/log", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { POST } from "~/app/api/webhook/stripe/route";
import { getStripe, syncStripeData } from "~/server/billing/payments";
import { logger } from "~/server/logger/log";

describe("stripe webhook route", () => {
  it("returns 400 when signature header is missing", async () => {
    state.signature = null;

    const response = await POST(
      new Request("http://localhost", { method: "POST" }),
    );

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("No signature");
  });

  it("returns 400 when webhook secret is not configured", async () => {
    state.signature = "test-signature";

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("No webhook secret");
  });

  it("logs the stripe event identity when the billing sync fails", async () => {
    state.signature = "test-signature";
    state.secret = "whsec_test";

    vi.mocked(getStripe).mockReturnValue({
      webhooks: {
        constructEvent: vi.fn(() => ({
          id: "evt_123",
          type: "invoice.paid",
          data: { object: { customer: "cus_123" } },
        })),
      },
    } as never);
    vi.mocked(syncStripeData).mockRejectedValue(new Error("stripe API error"));

    const response = await POST(
      new Request("http://localhost", { method: "POST", body: "{}" }),
    );

    expect(response.status).toBe(400);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeEventId: "evt_123",
        stripeEventType: "invoice.paid",
        stripeCustomerId: "cus_123",
      }),
      expect.any(String),
    );
  });
});
