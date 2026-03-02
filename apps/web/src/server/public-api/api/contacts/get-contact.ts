import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { getTeamFromToken } from "~/server/public-api/auth";
import { db } from "~/server/db";
import { UnsendApiError } from "../../api-error";
import { getContactBook } from "../../api-utils";

const route = createRoute({
  method: "get",
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
          schema: z.object({
            id: z.string(),
            firstName: z.string().optional().nullable(),
            lastName: z.string().optional().nullable(),
            email: z.string(),
            subscribed: z.boolean().default(true),
            properties: z.record(z.string()),
            contactBookId: z.string(),
            createdAt: z.string(),
            updatedAt: z.string(),
          }),
        },
      },
      description: "Retrieve the contact",
    },
  },
});

function getContact(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;

    const contactBook = await getContactBook(c, team.id);

    const contactId = c.req.param("contactId");

    const contact = await db.contact.findFirst({
      where: {
        id: contactId,
        contactBookId: contactBook.id,
      },
    });

    if (!contact) {
      throw new UnsendApiError({
        code: "NOT_FOUND",
        message: "Contact not found",
      });
    }

    // Ensure properties is a Record<string, string>
    const sanitizedContact = {
      ...contact,
      properties: contact.properties as Record<string, string>,
    };

    return c.json(sanitizedContact);
  });
}

export default getContact;
