import { z } from "zod";

export const ContactBookSchema = z.object({
  id: z
    .string()
    .openapi({ description: "The ID of the contact book", example: "clx1234567890" }),
  name: z
    .string()
    .openapi({ description: "The name of the contact book", example: "Newsletter Subscribers" }),
  teamId: z.number().openapi({ description: "The ID of the team", example: 1 }),
  properties: z.record(z.string()).openapi({
    description: "Custom properties for the contact book",
    example: { customField1: "value1" },
  }),
  emoji: z
    .string()
    .openapi({ description: "The emoji associated with the contact book", example: "📙" }),
  createdAt: z.string().openapi({ description: "The creation timestamp" }),
  updatedAt: z.string().openapi({ description: "The last update timestamp" }),
  _count: z.object({
    contacts: z.number().openapi({ description: "The number of contacts in the contact book" }),
  }).optional(),
});
