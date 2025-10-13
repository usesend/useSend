import { z } from "@hono/zod-openapi";

const stringOrStringArray = z.union([
  z.string().min(1),
  z.array(z.string().min(1)),
]);

export const campaignCreateSchema = z
  .object({
    name: z.string().min(1),
    from: z.string().min(1),
    subject: z.string().min(1),
    previewText: z.string().optional(),
    contactBookId: z.string().min(1),
    content: z.string().min(1).optional(),
    html: z.string().min(1).optional(),
    replyTo: stringOrStringArray.optional(),
    cc: stringOrStringArray.optional(),
    bcc: stringOrStringArray.optional(),
    sendNow: z.boolean().optional(),
    scheduledAt: z
      .string()
      .datetime()
      .optional()
      .describe("Timestamp in ISO 8601 format"),
    batchSize: z.number().int().min(1).max(100_000).optional(),
  })
  .refine(
    (data) => !!data.content || !!data.html,
    "Either content or html must be provided."
  );

export const campaignScheduleSchema = z.object({
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  batchSize: z.number().int().min(1).max(100_000).optional(),
});

export type CampaignCreateInput = z.infer<typeof campaignCreateSchema>;
export type CampaignScheduleInput = z.infer<typeof campaignScheduleSchema>;

export const campaignResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  from: z.string(),
  subject: z.string(),
  previewText: z.string().nullable(),
  contactBookId: z.string().nullable(),
  html: z.string().nullable(),
  content: z.string().nullable(),
  status: z.string(),
  scheduledAt: z.string().datetime().nullable(),
  batchSize: z.number().int(),
  batchWindowMinutes: z.number().int(),
  total: z.number().int(),
  sent: z.number().int(),
  delivered: z.number().int(),
  opened: z.number().int(),
  clicked: z.number().int(),
  unsubscribed: z.number().int(),
  bounced: z.number().int(),
  hardBounced: z.number().int(),
  complained: z.number().int(),
  replyTo: z.array(z.string()),
  cc: z.array(z.string()),
  bcc: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CampaignResponse = z.infer<typeof campaignResponseSchema>;
