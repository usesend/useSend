import { AdminApiError, adminApiRoute, param } from "~/server/admin-api";
import {
  ReplyNotFoundError,
  ReplyNotSendingError,
  ReplyStillSendingError,
  settleReply,
  settleReplyBody,
} from "~/server/service/feedback-admin";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/feedback/{id}/reply/{replyId} with `{ "deliveryStatus": "SENT" | "FAILED" }`.
 * Settles a reply whose send is unknown. Only after checking whether the email
 * arrived: FAILED lets the same key be sent again. Allowed only for a SENDING
 * reply whose attempt started at least 10 minutes ago.
 */
export const PATCH = adminApiRoute(async ({ body, params }) => {
  const { deliveryStatus } = settleReplyBody.parse(body);
  try {
    const reply = await settleReply(
      param(params.id) ?? "",
      param(params.replyId) ?? "",
      deliveryStatus,
    );
    return {
      id: reply.id,
      deliveryStatus: reply.deliveryStatus,
      sentAt: reply.sentAt?.toISOString() ?? null,
    };
  } catch (error) {
    if (error instanceof ReplyNotFoundError) {
      throw new AdminApiError(404, "Reply not found");
    }
    if (error instanceof ReplyNotSendingError) {
      throw new AdminApiError(
        409,
        "Only a reply that's still sending can be settled",
      );
    }
    if (error instanceof ReplyStillSendingError) {
      throw new AdminApiError(409, "Reply is still sending; try again later");
    }
    throw error;
  }
});
