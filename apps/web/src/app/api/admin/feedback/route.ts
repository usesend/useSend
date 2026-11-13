import { adminApiRoute } from "~/server/admin-api";
import {
  listFeedback,
  listFeedbackQuery,
} from "~/server/service/feedback-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/feedback?status=<OPEN|REPLIED|CLOSED>&since=<iso>&limit=<1-200>&cursor=<id>
 * Feedback newest first, with `nextCursor` for the next page.
 */
export const GET = adminApiRoute(async ({ req }) => {
  const url = new URL(req.url);
  const query = listFeedbackQuery.parse(Object.fromEntries(url.searchParams));
  return listFeedback(query);
});
