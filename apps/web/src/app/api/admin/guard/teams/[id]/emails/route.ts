import { adminApiRoute } from "~/server/admin-api";
import { teamIdParam } from "~/server/guard-api";
import { emailsQuery, sampleTeamEmails } from "~/server/service/guard-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/guard/teams/:id/emails?limit=<1-50>&since=<iso>
 * The team's latest emails; recipients reduced to their domains.
 */
export const GET = adminApiRoute(async ({ req, params }) => {
  const teamId = teamIdParam(params.id);
  const url = new URL(req.url);
  return sampleTeamEmails(
    teamId,
    emailsQuery.parse(Object.fromEntries(url.searchParams)),
  );
});
