import { adminApiRoute } from "~/server/admin-api";
import { guardCall, idParam } from "~/server/guard-api";
import { guardReviewCampaign } from "~/server/service/campaign-service";
import { reviewBody } from "~/server/service/guard-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/guard/campaigns/:id/review
 *   { decision: "approve", reason, contentHash } | { decision: "stop", reason }
 * approve must name the contentHash that was reviewed (409 if it changed).
 */
export const POST = adminApiRoute(async ({ body, params }) => {
  const id = idParam(params.id);
  const input = reviewBody.parse(body);
  return guardCall(() => guardReviewCampaign(id, input));
});
