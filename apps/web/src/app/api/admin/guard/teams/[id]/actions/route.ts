import { adminApiRoute } from "~/server/admin-api";
import { guardCall, teamIdParam } from "~/server/guard-api";
import {
  recordTeamAction,
  teamActionBody,
} from "~/server/service/guard-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/guard/teams/:id/actions { action: "ALERT" | "PAUSE", reason, details? }
 * ALERT only logs; PAUSE stops the team's sending until an admin resumes it.
 */
export const POST = adminApiRoute(async ({ body, params }) => {
  const teamId = teamIdParam(params.id);
  const input = teamActionBody.parse(body);
  return guardCall(() => recordTeamAction(teamId, input));
});
