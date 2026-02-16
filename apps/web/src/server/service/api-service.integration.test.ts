import { ApiPermission } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addApiKey, getTeamAndApiKey } from "~/server/service/api-service";
import { createTeam } from "~/test/factories/core";
import {
  closeIntegrationConnections,
  integrationEnabled,
  resetDatabase,
  resetRedis,
} from "~/test/integration/helpers";

const describeIntegration = integrationEnabled ? describe : describe.skip;

describeIntegration("api-service integration", () => {
  beforeEach(async () => {
    await resetDatabase();
    await resetRedis();
  });

  afterAll(async () => {
    await closeIntegrationConnections();
  });

  it("creates and verifies API key against postgres", async () => {
    const team = await createTeam({ name: "Integration Team" });

    const apiKey = await addApiKey({
      name: "primary",
      permission: ApiPermission.FULL,
      teamId: team.id,
    });

    expect(apiKey.startsWith("us_")).toBe(true);

    const result = await getTeamAndApiKey(apiKey);

    expect(result?.team?.id).toBe(team.id);
    expect(result?.apiKey.name).toBe("primary");
  });

  it("rejects domain-restricted key when domain does not belong to team", async () => {
    const team = await createTeam({ name: "Team Domain Check" });

    await expect(
      addApiKey({
        name: "restricted",
        permission: ApiPermission.SENDING,
        teamId: team.id,
        domainId: 999999,
      }),
    ).rejects.toThrow("DOMAIN_NOT_FOUND");
  });
});
