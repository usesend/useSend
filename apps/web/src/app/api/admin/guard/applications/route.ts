import { adminApiRoute } from "~/server/admin-api";
import {
  applicationsQuery,
  listApplications,
} from "~/server/service/guard-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/guard/applications?status=<PENDING|APPROVED|REJECTED>&since=<iso>&limit=<1-200>
 * Waitlist applications, oldest first.
 */
export const GET = adminApiRoute(async ({ req }) => {
  const url = new URL(req.url);
  return listApplications(
    applicationsQuery.parse(Object.fromEntries(url.searchParams)),
  );
});
