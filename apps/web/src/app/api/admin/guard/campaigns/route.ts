import { adminApiRoute } from "~/server/admin-api";
import {
  campaignsQuery,
  listActiveCampaigns,
} from "~/server/service/guard-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/guard/campaigns?limit=<1-50>&cursor=<id>
 * Campaigns sending or about to, waiting for review, or stopped by the Guard,
 * oldest first, with content and `nextCursor` for the next page.
 */
export const GET = adminApiRoute(async ({ req }) => {
  const url = new URL(req.url);
  return listActiveCampaigns(
    campaignsQuery.parse(Object.fromEntries(url.searchParams)),
  );
});
