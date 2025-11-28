import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { updateContact } from "~/server/service/contact-service";
import { getContactBook } from "../../api-utils";

const route = createRoute({
  method: "patch",
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
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
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
          schema: z.object({ contactId: z.string().optional() }),
        },
      },
      description: "Retrieve the user",
    },
  },
});

function updateContactInfo(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;

    await getContactBook(c, team.id);
    const contactId = c.req.param("contactId");

    const contact = await updateContact(
      contactId,
      c.req.valid("json"),
      team.id,
    );

    return c.json({ contactId: contact.id });
  });
}

export default updateContactInfo;
