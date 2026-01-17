import { createRoute, z } from "@hono/zod-openapi";
import { ContactBookSchema } from "~/lib/zod/contact-book-schema";
import { PublicAPIApp } from "~/server/public-api/hono";
import { updateContactBook as updateContactBookService } from "~/server/service/contact-book-service";
import { getContactBook } from "../../api-utils";

const route = createRoute({
	method: "patch",
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
		const contactBookId = c.req.valid("param").contactBookId;
		const body = c.req.valid("json");

		await getContactBook(c, team.id);

		const updated = await updateContactBookService(contactBookId, body);

		return c.json({
			...updated,
			properties: updated.properties as Record<string, string>,
		});
	});
}

export default updateContactBook;
