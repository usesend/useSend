import { AdminApiError, adminApiRoute, param } from "~/server/admin-api";
import {
  FeedbackNotFoundError,
  setFeedbackStatus,
  statusBody,
} from "~/server/service/feedback-admin";

export const dynamic = "force-dynamic";

/** PATCH /api/admin/feedback/{id} with `{ "status": "OPEN" | "REPLIED" | "CLOSED" }`. */
export const PATCH = adminApiRoute(async ({ body, params }) => {
  const { status } = statusBody.parse(body);
  try {
    return await setFeedbackStatus(param(params.id) ?? "", status);
  } catch (error) {
    if (error instanceof FeedbackNotFoundError) {
      throw new AdminApiError(404, "Feedback not found");
    }
    throw error;
  }
});
