import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "../../hono";
import { deleteContactBook as deleteContactBookService } from "~/server/service/contact-book-service";
import { getContactBook } from "../../api-utils";

const route = createRoute({
	method: "delete",
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
		const contactBookId = c.req.valid("param").contactBookId;

		await getContactBook(c, team.id);

		const deletedContactBook = await deleteContactBookService(contactBookId);

		return c.json({
			id: deletedContactBook.id,
			success: true,
			message: "Contact book deleted successfully",
		});
	});
}

export default deleteContactBook;
