import { AdminApiError, adminApiRoute, json, param } from "~/server/admin-api";
import {
  FeedbackNotFoundError,
  IdempotencyConflictError,
  MailNotSentError,
  MailUncertainError,
  ReplyInProgressError,
  ReplyNotSendingError,
  replyBody,
  replyToFeedback,
} from "~/server/service/feedback-admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/feedback/{id}/reply with `{ "message": "...", "idempotencyKey": "..." }`.
 * Emails the reply to whoever sent the feedback, at most once per key:
 * - 201 sent now; 200 already sent with this key.
 * - 502 certainly not sent: retry with the same key.
 * - 409 being sent, or it may have been sent: check whether it arrived, then
 *   settle it with PATCH /api/admin/feedback/{id}/reply/{replyId}.
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
    if (error instanceof ReplyInProgressError) {
      throw new AdminApiError(
        409,
        "This reply is being sent, or it may have been sent; check whether it arrived before settling it",
      );
    }
    if (error instanceof ReplyNotSendingError) {
      throw new AdminApiError(
        409,
        "This reply was settled by hand while it was sending; that decision stands",
      );
    }
    if (error instanceof MailUncertainError) {
      throw new AdminApiError(
        409,
        "It's unknown whether the reply was sent; check whether it arrived before settling it",
      );
    }
    if (error instanceof MailNotSentError) {
      throw new AdminApiError(
        502,
        "The reply was not sent; try again with the same key",
      );
    }
    throw error;
  }
});
