import { createRoute, z } from "@hono/zod-openapi";
import { ContactBookSchema } from "~/lib/zod/contact-book-schema";
import { PublicAPIApp } from "~/server/public-api/hono";
import { getContactBooks as getContactBooksService } from "~/server/service/contact-book-service";

const route = createRoute({
	method: "get",
	path: "/v1/contactBooks",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.array(ContactBookSchema),
				},
			},
			description: "Retrieve contact books accessible by the API key",
		},
	},
});

function getContactBooks(app: PublicAPIApp) {
	app.openapi(route, async (c) => {
		const team = c.var.team;

		const contactBooks = await getContactBooksService(team.id);

		// Ensure properties is a Record<string, string>
		const sanitizedContactBooks = contactBooks.map((contactBook) => ({
			...contactBook,
			properties: contactBook.properties as Record<string, string>,
		}));

		return c.json(sanitizedContactBooks);
	});
}

export default getContactBooks;
