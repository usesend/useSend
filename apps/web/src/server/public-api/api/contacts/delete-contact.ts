import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { deleteContact } from "~/server/service/contact-service";
import { getContactBook } from "../../api-utils";

const route = createRoute({
  method: "delete",
  path: "/v1/contactBooks/{contactBookId}/contacts/{contactId}",
  request: {
    params: z.object({
      contactBookId: z.string().openapi({
        param: {
          name: "contactBookId",
          in: "path",
        },
        example: "cuiwqdj74rygf74",
      }),
      contactId: z.string().openapi({
        param: {
          name: "contactId",
          in: "path",
        },
        example: "cuiwqdj74rygf74",
      }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean() }),
        },
      },
      description: "Contact deleted successfully",
    },
  },
});

function deleteContactHandler(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;

    await getContactBook(c, team.id);
    const contactId = c.req.param("contactId");

    await deleteContact(contactId, team.id);

    return c.json({ success: true });
  });
}

export default deleteContactHandler;
