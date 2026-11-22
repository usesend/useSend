import { adminApiRoute } from "~/server/admin-api";
import { guardCall, idParam } from "~/server/guard-api";
import { reviewBody, reviewCampaign } from "~/server/service/guard-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/guard/campaigns/:id/review { decision: "approve" | "stop", reason }
 */
export const POST = adminApiRoute(async ({ body, params }) => {
  const id = idParam(params.id);
  const input = reviewBody.parse(body);
  return guardCall(() => reviewCampaign(id, input));
});
