import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { sendEmail } from "~/server/service/email-service";
import { emailSchema } from "../../schemas/email-schema";
import { IdempotencyService } from "~/server/service/idempotency-service";

const route = createRoute({
  method: "post",
  path: "/v1/emails",
  request: {
    headers: z
      .object({
        "Idempotency-Key": z
          .string()
          .min(1)
          .max(256)
          .optional()
          .openapi({
            description: `Pass the optional Idempotency-Key header to make the request safe to retry. The key can be up to 256 characters. The server stores the canonical request body and behaves as follows:

- Same key + same request body → returns the original emailId with 200 OK without re-sending.
- Same key + different request body → returns 409 Conflict with code: NOT_UNIQUE so you can detect the mismatch.
- Same key while another request is still being processed → returns 409 Conflict; retry after a short delay or once the first request completes.

Entries expire after 24 hours. Use a unique key per logical send (for example, an order or signup ID).`,
          }),
      })
      .partial(),
    body: {
      required: true,
      content: {
        "application/json": {
          schema: emailSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ emailId: z.string().optional() }),
        },
      },
      description: "Retrieve the user",
    },
  },
});

function send(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;
    const requestBody = c.req.valid("json");

    let html: string | undefined;
    const rawHtml = requestBody?.html?.toString();
    if (rawHtml && rawHtml !== "true" && rawHtml !== "false") {
      html = rawHtml;
    }

    const clientPayload = {
      ...requestBody,
      text: requestBody.text ?? undefined,
      html,
    };

    const idemKey = c.req.header("Idempotency-Key") ?? undefined;

    const result = await IdempotencyService.withIdempotency<
      typeof clientPayload,
      { emailId?: string }
    >({
      teamId: team.id,
      idemKey,
      payload: clientPayload,
      operation: async () => {
        const email = await sendEmail({
          ...clientPayload,
          teamId: team.id,
          apiKeyId: team.apiKeyId,
        });
        return { emailId: email?.id };
      },
      extractEmailIds: (result) => (result.emailId ? [result.emailId] : []),
      formatCachedResponse: (emailIds) => ({ emailId: emailIds[0] }),
      logContext: "email send",
    });

    return c.json(result);
  });
}

export default send;
