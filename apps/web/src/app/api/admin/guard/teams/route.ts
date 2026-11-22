import { adminApiRoute } from "~/server/admin-api";
import { listWatchedTeams, watchQuery } from "~/server/service/guard-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/guard/teams?days=<1-60, default 14>&limit=<1-200>&cursor=<teamId>
 * Teams created in the last `days`, with members, domains and sending numbers,
 * paged with `nextCursor`.
 */
export const GET = adminApiRoute(async ({ req }) => {
  const url = new URL(req.url);
  return listWatchedTeams(
    watchQuery.parse(Object.fromEntries(url.searchParams)),
  );
});
