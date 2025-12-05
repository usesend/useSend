import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { getTeamFromToken } from "~/server/public-api/auth";
import { db } from "~/server/db";
import { UseSendApiError } from "../../api-error";
import { getContactBook } from "../../api-utils";

const route = createRoute({
  method: "get",
  path: "/v1/contactBooks/{contactBookId}/contacts",
  request: {
    params: z.object({
      contactBookId: z.string().openapi({
        param: {
          name: "contactBookId",
          in: "path",
        },
        example: "cuiwqdj74rygf74",
      }),
    }),
    query: z.object({
      emails: z.string().optional(),
      page: z.number().optional(),
      limit: z.number().optional(),
      ids: z.string().optional(),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(
            z.object({
              id: z.string(),
              firstName: z.string().optional().nullable(),
              lastName: z.string().optional().nullable(),
              email: z.string(),
              subscribed: z.boolean().default(true),
              properties: z.record(z.string()),
              contactBookId: z.string(),
              createdAt: z.string(),
              updatedAt: z.string(),
            })
          ),
        },
      },
      description: "Retrieve multiple contacts",
    },
  },
});

function getContacts(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;

    const cb = await getContactBook(c, team.id);

    const contactIds = c.req.query("ids")?.split(",");
    const emails = c.req.query("emails")?.split(",");
    const page = c.req.query("page") ? Number(c.req.query("page")) : 1;
    const limit = c.req.query("limit") ? Number(c.req.query("limit")) : 5000;

    const contacts = await db.contact.findMany({
      where: {
        id: { in: contactIds },
        email: { in: emails },
        contactBookId: cb.id,
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Ensure properties is a Record<string, string>
    const sanitizedContacts = contacts.map((contact) => ({
      ...contact,
      properties: contact.properties as Record<string, string>,
    }));

    return c.json(sanitizedContacts);
  });
}

export default getContacts;
