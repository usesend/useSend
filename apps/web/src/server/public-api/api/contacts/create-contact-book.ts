import { createRoute, z } from "@hono/zod-openapi";
import { ContactBookSchema } from "~/lib/zod/contact-book-schema";
import { db } from "~/server/db";
import { PublicAPIApp } from "~/server/public-api/hono";
import {
  createContactBookUnlocked,
  updateContactBook,
} from "~/server/service/contact-book-service";
import { withPlanLimitLock } from "~/server/service/plan-limit-lock";

const route = createRoute({
  method: "post",
  path: "/v1/contactBooks",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            name: z.string().min(1),
            emoji: z.string().optional(),
            properties: z.record(z.string()).optional(),
            doubleOptInEnabled: z.boolean().optional(),
            doubleOptInFrom: z.string().nullable().optional(),
            doubleOptInSubject: z.string().optional(),
            doubleOptInContent: z.string().optional(),
            variables: z.array(z.string()).optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ContactBookSchema,
        },
      },
      description: "Create a new contact book",
    },
  },
});

function createContactBook(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;
    const body = c.req.valid("json");

    const hasOptionalFields =
      body.emoji !== undefined ||
      body.properties !== undefined ||
      body.doubleOptInEnabled !== undefined ||
      body.doubleOptInFrom !== undefined ||
      body.doubleOptInSubject !== undefined ||
      body.doubleOptInContent !== undefined;

    // Hold the plan-limit lock until the transaction commits, so a concurrent
    // request can't count contact books before this one is visible.
    const contactBook = await withPlanLimitLock(team.id, "contactBook", () =>
      db.$transaction(async (tx) => {
        const created = await createContactBookUnlocked(
          team.id,
          body.name,
          body.variables,
          tx,
        );

        if (!hasOptionalFields) {
          return created;
        }

        return updateContactBook(
          created.id,
          {
            emoji: body.emoji,
            properties: body.properties,
            doubleOptInEnabled: body.doubleOptInEnabled,
            doubleOptInFrom: body.doubleOptInFrom,
            doubleOptInSubject: body.doubleOptInSubject,
            doubleOptInContent: body.doubleOptInContent,
          },
          tx,
        );
      }),
    );

    return c.json({
      ...contactBook,
      properties: contactBook.properties as Record<string, string>,
      variables: contactBook.variables,
    });
  });
}

export default createContactBook;
