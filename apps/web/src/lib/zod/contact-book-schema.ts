import { z } from "zod";

export const ContactBookSchema = z.object({
  id: z.string().openapi({
    description: "The ID of the contact book",
    example: "clx1234567890",
  }),
  name: z.string().openapi({
    description: "The name of the contact book",
    example: "Newsletter Subscribers",
  }),
  teamId: z.number().openapi({ description: "The ID of the team", example: 1 }),
  properties: z.record(z.string()).openapi({
    description: "Custom properties for the contact book",
    example: { customField1: "value1" },
  }),
  variables: z.array(z.string()).openapi({
    description: "Allowed personalization variables for contacts in this book",
    example: ["registrationCode", "company"],
  }),
  emoji: z.string().openapi({
    description: "The emoji associated with the contact book",
    example: "📙",
  }),
  doubleOptInEnabled: z.boolean().optional().openapi({
    description: "Whether double opt-in is enabled for new contacts",
    example: true,
  }),
  doubleOptInFrom: z.string().nullable().optional().openapi({
    description:
      "From address used for double opt-in emails (must use a verified domain)",
    example: "Newsletter <hello@example.com>",
  }),
  doubleOptInSubject: z.string().nullable().optional().openapi({
    description: "Subject line used for double opt-in confirmation email",
    example: "Please confirm your subscription",
  }),
  doubleOptInContent: z.string().nullable().optional().openapi({
    description:
      "Email editor JSON content used for double opt-in confirmation",
  }),
  createdAt: z.string().openapi({ description: "The creation timestamp" }),
  updatedAt: z.string().openapi({ description: "The last update timestamp" }),
  _count: z
    .object({
      contacts: z
        .number()
        .openapi({ description: "The number of contacts in the contact book" }),
    })
    .optional(),
});
