import { adminApiRoute } from "~/server/admin-api";
import {
  campaignsQuery,
  listActiveCampaigns,
  markGuardSeen,
} from "~/server/service/guard-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/guard/campaigns?limit=<1-25, default 10>&cursor=<id>
 * Campaigns sending or about to, waiting for review, or stopped by the Guard,
 * oldest first, with content and `nextCursor` for the next page. Calling it
 * also tells useSend the Guard is running, which turns on the new-team hold.
 */
export const GET = adminApiRoute(async ({ req }) => {
  await markGuardSeen();
  const url = new URL(req.url);
  return listActiveCampaigns(
    campaignsQuery.parse(Object.fromEntries(url.searchParams)),
  );
});
