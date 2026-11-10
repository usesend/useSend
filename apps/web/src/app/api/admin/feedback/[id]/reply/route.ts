import { AdminApiError, adminApiRoute, json, param } from "~/server/admin-api";
import {
  FeedbackNotFoundError,
  IdempotencyConflictError,
  MailNotSentError,
  ReplyNeedsCheckError,
  replyBody,
  replyToFeedback,
} from "~/server/service/feedback-admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/feedback/{id}/reply with `{ "message": "...", "idempotencyKey": "..." }`.
 * Emails the reply to whoever sent the feedback. The same key and message again
 * never sends a second email: 200 with the reply once it's sent, or a retry if
 * it failed. 201 when this request sent it.
 */
export const POST = adminApiRoute(async ({ body, params }) => {
  const input = replyBody.parse(body);
  try {
    const { reply, sent } = await replyToFeedback(
      param(params.id) ?? "",
      input,
    );
    return json(sent ? 201 : 200, {
      id: reply.id,
      deliveryStatus: reply.deliveryStatus,
      sentAt: reply.sentAt?.toISOString() ?? null,
    });
  } catch (error) {
    if (error instanceof FeedbackNotFoundError) {
      throw new AdminApiError(404, "Feedback not found");
    }
    if (error instanceof IdempotencyConflictError) {
      throw new AdminApiError(
        409,
        "This key was used for a different reply; use a new key",
      );
    }
    if (error instanceof ReplyNeedsCheckError) {
      throw new AdminApiError(
        409,
        "This reply may have been sent over a day ago; check before sending it again with a new key",
      );
    }
    if (error instanceof MailNotSentError) {
      throw new AdminApiError(
        502,
        "The reply email was not sent; try again with the same key",
      );
    }
    throw error;
  }
});
