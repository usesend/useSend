import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { bulkAddContacts } from "~/server/service/contact-service";
import { getContactBook } from "../../api-utils";

const contactSchema = z.object({
  email: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  properties: z.record(z.string()).optional(),
  subscribed: z.boolean().optional(),
});

const route = createRoute({
  method: "post",
  path: "/v1/contactBooks/{contactBookId}/contacts/bulk",
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
          schema: z.array(contactSchema).max(1000, {
            message:
              "Cannot add more than 1000 contacts in a single bulk request",
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            message: z.string(),
            count: z.number(),
          }),
        },
      },
      description: "Bulk add contacts to a contact book",
    },
  },
});

function bulkAddContactsHandle(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;

    const contactBook = await getContactBook(c, team.id);

    const result = await bulkAddContacts(
      contactBook.id,
      c.req.valid("json"),
      team.id,
    );

    return c.json(result);
  });
}

export default bulkAddContactsHandle;
