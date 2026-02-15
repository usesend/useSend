import { describe, expect, it } from "vitest";
import { canonicalizePayload } from "~/server/utils/idempotency";

describe("canonicalizePayload", () => {
  it("generates same hash for different key ordering", () => {
    const payloadA = { b: 1, a: { y: 2, x: 1 } };
    const payloadB = { a: { x: 1, y: 2 }, b: 1 };

    const a = canonicalizePayload(payloadA);
    const b = canonicalizePayload(payloadB);

    expect(a.canonical).toBe(b.canonical);
    expect(a.bodyHash).toBe(b.bodyHash);
  });

  it("normalizes dates and undefined values deterministically", () => {
    const payload = {
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
      name: "alpha",
      skip: undefined,
    };

    const result = canonicalizePayload(payload);

    expect(result.canonical).toBe(
      '{"createdAt":"2025-01-01T00:00:00.000Z","name":"alpha"}',
    );
    expect(result.bodyHash).toHaveLength(64);
  });
});
