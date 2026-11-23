import { adminApiRoute } from "~/server/admin-api";
import { listNewEmails, newEmailsQuery } from "~/server/service/guard-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/guard/emails?cursor=<nextCursor>&limit=<1-200>
 * New API and SMTP emails across all teams, oldest first. Pass `nextCursor`
 * back to continue; without a cursor it starts 10 minutes ago.
 */
export const GET = adminApiRoute(async ({ req }) => {
  const url = new URL(req.url);
  return listNewEmails(
    newEmailsQuery.parse(Object.fromEntries(url.searchParams)),
  );
});
