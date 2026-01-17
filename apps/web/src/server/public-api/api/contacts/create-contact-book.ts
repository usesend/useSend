import { createRoute, z } from "@hono/zod-openapi";
import { ContactBookSchema } from "~/lib/zod/contact-book-schema";
import { PublicAPIApp } from "~/server/public-api/hono";
import {
	createContactBook as createContactBookService,
	updateContactBook,
} from "~/server/service/contact-book-service";

const route = createRoute({
	method: "post",
	path: "/v1/contactBooks",
	request: {
		body: {
			required: true,
			content: {
				"application/json": {
					schema: z.object({
						name: z.string().min(1),
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
			description: "Create a new contact book",
		},
	},
});

function createContactBook(app: PublicAPIApp) {
	app.openapi(route, async (c) => {
		const team = c.var.team;
		const body = c.req.valid("json");

		const contactBook = await createContactBookService(team.id, body.name);

		// Update emoji and properties if provided
		if (body.emoji || body.properties) {
			const updated = await updateContactBook(contactBook.id, {
				emoji: body.emoji,
				properties: body.properties,
			});

			return c.json({
				...updated,
				properties: updated.properties as Record<string, string>,
			});
		}

		return c.json({
			...contactBook,
			properties: contactBook.properties as Record<string, string>,
		});
	});
}

export default createContactBook;
