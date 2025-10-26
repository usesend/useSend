import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { sendBulkEmails } from "~/server/service/email-service";
import { EmailContent } from "~/types";
import { emailSchema } from "../../schemas/email-schema"; // Corrected import path
import { IdempotencyService } from "~/server/service/idempotency-service";
import { canonicalizePayload } from "~/server/utils/idempotency";
import { UnsendApiError } from "~/server/public-api/api-error";
import { logger } from "~/server/logger/log";

// Define the schema for a single email within the bulk request
// This is similar to the schema in send-email.ts but without the top-level 'required'
// Removed inline emailSchema definition

const route = createRoute({
  method: "post",
  path: "/v1/emails/batch",
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
          // Use the imported schema in an array
          schema: z.array(emailSchema).max(100, {
            message:
              "Cannot send more than 100 emails in a single bulk request",
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          // Return an array of objects with the created email IDs
          schema: z.object({
            data: z.array(z.object({ emailId: z.string() })),
          }),
        },
      },
      description: "List of successfully created email IDs",
    },
    // Add other potential error responses based on sendBulkEmails logic if needed
  },
});

function sendBatch(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;
    const emailPayloads = c.req.valid("json");

    const normalizedPayloads = emailPayloads.map((payload) => ({
      ...payload,
      text: payload.text ?? undefined,
      html:
        payload.html && payload.html !== "true" && payload.html !== "false"
          ? payload.html
          : undefined,
    }));

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
      ({ bodyHash: payloadHash } = canonicalizePayload(normalizedPayloads));

      const existing = await IdempotencyService.getResult(team.id, idemKey);
      if (existing) {
        if (existing.bodyHash === payloadHash) {
          logger.info(
            { teamId: team.id },
            "Idempotency hit for bulk email send"
          );
          const responseData = existing.emailIds.map((id) => ({ emailId: id }));
          return c.json({ data: responseData });
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
              "Idempotency hit after contention for bulk email send"
            );
            const responseData = again.emailIds.map((id) => ({ emailId: id }));
            return c.json({ data: responseData });
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

    // Add teamId and apiKeyId to each email payload
    const emailsToSend: Array<
      EmailContent & { teamId: number; apiKeyId?: number }
    > = normalizedPayloads.map((payload) => ({
      ...payload,
      teamId: team.id,
      apiKeyId: team.apiKeyId,
    }));

    try {
      // Call the service function to send emails in bulk
      const createdEmails = await sendBulkEmails(emailsToSend);

      // Map the result to the response format
      const responseData = createdEmails.map((email) => ({
        emailId: email.id,
      }));

      if (idemKey && payloadHash) {
        await IdempotencyService.setResult(team.id, idemKey, {
          bodyHash: payloadHash,
          emailIds: createdEmails.map((email) => email.id),
        });
      }

      return c.json({ data: responseData });
    } finally {
      if (idemKey && lockAcquired) {
        await IdempotencyService.releaseLock(team.id, idemKey);
      }
    }
  });
}

export default sendBatch;
