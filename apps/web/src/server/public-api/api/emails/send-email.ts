import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { sendEmail } from "~/server/service/email-service";
import { emailSchema } from "../../schemas/email-schema";
import { IdempotencyService } from "~/server/service/idempotency-service";
import { canonicalizePayload } from "~/server/utils/idempotency";
import { UnsendApiError } from "~/server/public-api/api-error";
import { logger } from "~/server/logger/log";

const route = createRoute({
  method: "post",
  path: "/v1/emails",
  request: {
    headers: z
      .object({
        "Idempotency-Key": z.string().min(1).max(256).optional(),
      })
      .partial()
      .openapi("Idempotency headers"),
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
    if (idemKey !== undefined && (idemKey.length < 1 || idemKey.length > 256)) {
      throw new UnsendApiError({
        code: "BAD_REQUEST",
        message: "Invalid Idempotency-Key length",
      });
    }

    let payloadHash: string | undefined;
    let lockAcquired = false;

    if (idemKey) {
      ({ bodyHash: payloadHash } = canonicalizePayload(clientPayload));

      const existing = await IdempotencyService.getResult(team.id, idemKey);
      if (existing) {
        if (existing.bodyHash === payloadHash) {
          logger.info({ teamId: team.id }, "Idempotency hit for email send");
          return c.json({ emailId: existing.emailIds[0] });
        }

        throw new UnsendApiError({
          code: "NOT_UNIQUE",
          message: "Idempotency-Key already used with a different payload",
        });
      }

      lockAcquired = await IdempotencyService.acquireLock(team.id, idemKey);
      if (!lockAcquired) {
        const again = await IdempotencyService.getResult(team.id, idemKey);
        if (again) {
          if (again.bodyHash === payloadHash) {
            logger.info(
              { teamId: team.id },
              "Idempotency hit after contention for email send"
            );
            return c.json({ emailId: again.emailIds[0] });
          }

          throw new UnsendApiError({
            code: "NOT_UNIQUE",
            message: "Idempotency-Key already used with a different payload",
          });
        }

        throw new UnsendApiError({
          code: "NOT_UNIQUE",
          message:
            "Request with same Idempotency-Key is in progress. Retry later.",
        });
      }
    }

    try {
      const email = await sendEmail({
        ...clientPayload,
        teamId: team.id,
        apiKeyId: team.apiKeyId,
      });

      if (idemKey && payloadHash) {
        await IdempotencyService.setResult(team.id, idemKey, {
          bodyHash: payloadHash,
          emailIds: [email.id],
        });
      }

      return c.json({ emailId: email?.id });
    } finally {
      if (idemKey && lockAcquired) {
        await IdempotencyService.releaseLock(team.id, idemKey);
      }
    }
  });
}

export default send;
