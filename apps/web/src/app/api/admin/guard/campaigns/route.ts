import { adminApiRoute } from "~/server/admin-api";
import { listActiveCampaigns } from "~/server/service/guard-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/guard/campaigns
 * Campaigns sending or about to, and ones waiting for review, with content.
 */
export const GET = adminApiRoute(async () => listActiveCampaigns());
