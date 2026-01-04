import { createRoute, z } from "@hono/zod-openapi";
import { ContactBookSchema } from "~/lib/zod/contact-book-schema";
import { PublicAPIApp } from "~/server/public-api/hono";
import { db } from "~/server/db";
import { UnsendApiError } from "../../api-error";
import { updateContactBook as updateContactBookService } from "~/server/service/contact-book-service";

const route = createRoute({
	method: "patch",
	path: "/v1/contact-books/{id}",
	request: {
		params: z.object({
			id: z.string().openapi({
				param: {
					name: "id",
					in: "path",
				},
				example: "clx1234567890",
			}),
		}),
		body: {
			required: true,
			content: {
				"application/json": {
					schema: z.object({
						name: z.string().min(1).optional(),
						emoji: z.string().optional(),
						properties: z.record(z.string()).optional(),
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
			description: "Update the contact book",
		},
		403: {
			content: {
				"application/json": {
					schema: z.object({
						error: z.string(),
					}),
				},
			},
			description:
				"Forbidden - API key doesn't have access to this contact book",
		},
		404: {
			content: {
				"application/json": {
					schema: z.object({
						error: z.string(),
					}),
				},
			},
			description: "Contact book not found",
		},
	},
});

function updateContactBook(app: PublicAPIApp) {
	app.openapi(route, async (c) => {
		const team = c.var.team;
		const contactBookId = c.req.valid("param").id;
		const body = c.req.valid("json");

		const contactBook = await db.contactBook.findFirst({
			where: {
				id: contactBookId,
				teamId: team.id,
			},
		});

		if (!contactBook) {
			throw new UnsendApiError({
				code: "NOT_FOUND",
				message: "Contact book not found",
			});
		}

		const updated = await updateContactBookService(contactBookId, body);

		return c.json({
			...updated,
			properties: updated.properties as Record<string, string>,
		});
	});
}

export default updateContactBook;
