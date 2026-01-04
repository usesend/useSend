import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "../../hono";
import { db } from "~/server/db";
import { UnsendApiError } from "../../api-error";
import { deleteContactBook as deleteContactBookService } from "~/server/service/contact-book-service";

const route = createRoute({
	method: "delete",
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
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						id: z.string(),
						success: z.boolean(),
						message: z.string(),
					}),
				},
			},
			description: "Contact book deleted successfully",
		},
		403: {
			content: {
				"application/json": {
					schema: z.object({
						error: z.string(),
					}),
				},
			},
			description: "Forbidden - API key doesn't have access",
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

function deleteContactBook(app: PublicAPIApp) {
	app.openapi(route, async (c) => {
		const team = c.var.team;
		const contactBookId = c.req.valid("param").id;

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

		const deletedContactBook = await deleteContactBookService(contactBookId);

		return c.json({
			id: deletedContactBook.id,
			success: true,
			message: "Contact book deleted successfully",
		});
	});
}

export default deleteContactBook;
