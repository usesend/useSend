import { describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    signature: null as string | null,
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
    STRIPE_WEBHOOK_SECRET: undefined,
  },
}));

import { POST } from "~/app/api/webhook/stripe/route";

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
});
