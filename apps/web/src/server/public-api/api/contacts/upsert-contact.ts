import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { addOrUpdateContact } from "~/server/service/contact-service";
import { getContactBook } from "../../api-utils";

const route = createRoute({
  method: "put",
  path: "/v1/contactBooks/{contactBookId}/contacts/{contactId}",
  request: {
    params: z.object({
      contactBookId: z
        .string()
        .min(3)
        .openapi({
          param: {
            name: "contactBookId",
            in: "path",
          },
          example: "cuiwqdj74rygf74",
        }),
    }),
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            email: z.string(),
            firstName: z.string().optional(),
            lastName: z.string().optional(),
            properties: z.record(z.string()).optional(),
            subscribed: z.boolean().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ contactId: z.string() }),
        },
      },
      description: "Contact upserted successfully",
    },
  },
});

function upsertContact(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;

    const contactBook = await getContactBook(c, team.id);

    const contact = await addOrUpdateContact(
      contactBook.id,
      c.req.valid("json"),
      team.id,
    );

    return c.json({ contactId: contact.id });
  });
}

export default upsertContact;
