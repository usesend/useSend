import { db } from "~/server/db";
import { UnsendApiError } from "~/server/public-api/api-error";

type ScopedTeam = {
  id: number;
  apiKey: { domainId: number | null };
};

/**
 * API keys can be restricted to one domain. A restricted key may only touch
 * campaigns that send from that domain; anything else looks like it doesn't
 * exist, the same way the domain routes behave.
 */
export async function assertCampaignInApiKeyScope(
  team: ScopedTeam,
  campaignId: string,
) {
  const domainId = team.apiKey.domainId;
  if (!domainId) {
    return;
  }

  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, teamId: team.id, domainId },
    select: { id: true },
  });

  if (!campaign) {
    throw new UnsendApiError({
      code: "NOT_FOUND",
      message: "Campaign not found",
    });
  }
}

/** Domain-restricted API keys can't create new domains. */
export function assertApiKeyCanCreateDomains(team: ScopedTeam) {
  if (team.apiKey.domainId) {
    throw new UnsendApiError({
      code: "FORBIDDEN",
      message: "API key is restricted to a single domain and cannot create domains",
    });
  }
}
