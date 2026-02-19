import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { bulkDeleteContactsInContactBook } from "~/server/service/contact-service";
import { getContactBook } from "../../api-utils";

const route = createRoute({
  method: "delete",
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
          schema: z.object({
            contactIds: z.array(z.string()).min(1).max(1000, {
              message:
                "Cannot delete more than 1000 contacts in a single request",
            }),
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
            success: z.boolean(),
            count: z.number(),
          }),
        },
      },
      description: "Bulk delete contacts from a contact book",
    },
  },
});

function bulkDeleteContacts(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;

    const contactBook = await getContactBook(c, team.id);

    const deletedContacts = await bulkDeleteContactsInContactBook(
      c.req.valid("json").contactIds,
      contactBook.id,
      team.id,
    );

    return c.json({ success: true, count: deletedContacts.length });
  });
}

export default bulkDeleteContacts;
