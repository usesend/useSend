import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "~/server/db";
import { createContactBook } from "~/server/service/contact-book-service";
import { createTeam } from "~/test/factories/core";
import {
  closeIntegrationConnections,
  integrationEnabled,
  resetDatabase,
  resetRedis,
} from "~/test/integration/helpers";

const describeIntegration = integrationEnabled ? describe : describe.skip;

describeIntegration("contact-book-service integration", () => {
  beforeEach(async () => {
    await resetDatabase();
    await resetRedis();
  });

  afterAll(async () => {
    await closeIntegrationConnections();
  });

  it("does not exceed the plan limit under concurrent creates", async () => {
    const team = await createTeam({ name: "Free Team" });

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        createContactBook(team.id, `Book ${i}`),
      ),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(9);
    for (const result of rejected) {
      expect(result.reason).toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(
      db.contactBook.count({ where: { teamId: team.id } }),
    ).resolves.toBe(1);
  });
});
