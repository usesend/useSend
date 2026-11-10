import { adminApiRoute } from "~/server/admin-api";
import { importBody, importFeedback } from "~/server/service/feedback-admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/feedback/import with `{ "items": [...] }`, at most 500 items.
 * Copies feedback from the old feedback emails. Only feedback from existing
 * accounts is stored; the rest is counted as `unmatched`. Safe to run again.
 */
export const POST = adminApiRoute(
  async ({ body }) => importFeedback(importBody.parse(body)),
  // A full batch of long messages is past the default 1mb
  { maxBodyBytes: 10 * 1024 * 1024 },
);
