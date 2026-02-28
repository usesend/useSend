import { createRoute, z } from "@hono/zod-openapi";
import { ContactBookSchema } from "~/lib/zod/contact-book-schema";
import { db } from "~/server/db";
import { PublicAPIApp } from "~/server/public-api/hono";
import {
  createContactBook as createContactBookService,
  updateContactBook,
} from "~/server/service/contact-book-service";

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

    const contactBook = await db.$transaction(async (tx) => {
      const created = await createContactBookService(team.id, body.name, tx);

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
    });

    return c.json({
      ...contactBook,
      properties: contactBook.properties as Record<string, string>,
    });
  });
}

export default createContactBook;
