import { createRoute, z } from "@hono/zod-openapi";
import { ContactBookSchema } from "~/lib/zod/contact-book-schema";
import { PublicAPIApp } from "~/server/public-api/hono";
import { db } from "~/server/db";
import { UnsendApiError } from "../../api-error";

const route = createRoute({
	method: "get",
	path: "/v1/contactBooks/{contactBookId}",
	request: {
		params: z.object({
			contactBookId: z.string().openapi({
				param: {
					name: "contactBookId",
					in: "path",
				},
				example: "clx1234567890",
			}),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: ContactBookSchema,
				},
			},
			description: "Retrieve the contact book",
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

function getContactBook(app: PublicAPIApp) {
	app.openapi(route, async (c) => {
		const team = c.var.team;
		const contactBookId = c.req.valid("param").contactBookId;

		const contactBook = await db.contactBook.findFirst({
			where: {
				id: contactBookId,
				teamId: team.id,
			},
			include: {
				_count: {
					select: { contacts: true },
				},
			},
		});

		if (!contactBook) {
			throw new UnsendApiError({
				code: "NOT_FOUND",
				message: "Contact book not found",
			});
		}

		return c.json({
			...contactBook,
			properties: contactBook.properties as Record<string, string>,
		});
	});
}

export default getContactBook;
