import { adminApiRoute } from "~/server/admin-api";
import { guardCall, idParam } from "~/server/guard-api";
import {
  applicationVerdictBody,
  recordApplicationVerdict,
} from "~/server/service/guard-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/guard/applications/:id/verdict
 *   { verdict: "approve" | "reject" | "unsure", note }
 * Advice shown on the admin waitlist page. 409 if already decided.
 */
export const POST = adminApiRoute(async ({ body, params }) => {
  const id = idParam(params.id);
  const input = applicationVerdictBody.parse(body);
  return guardCall(() => recordApplicationVerdict(id, input));
});
