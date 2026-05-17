import { DomainStatus } from "@prisma/client";
import { z } from "zod";

export const DomainStatusSchema = z.nativeEnum(DomainStatus);

export const DomainDnsRecordSchema = z.object({
  type: z.enum(["MX", "TXT"]).openapi({
    description: "DNS record type",
    example: "TXT",
  }),
  name: z.string().openapi({
    description:
      "DNS record name (hostname label). For custom MAIL FROM MX and SPF TXT records, this is the first label of the MAIL FROM host: the domain `mailFromLabel` if set, otherwise the SES `region` value.",
  }),
  value: z
    .string()
    .openapi({
      description: "DNS record value",
      example: "v=spf1 include:amazonses.com ~all",
    }),
  ttl: z
    .string()
    .openapi({ description: "DNS record TTL", example: "Auto" }),
  priority: z
    .string()
    .nullish()
    .openapi({ description: "DNS record priority", example: "10" }),
  status: DomainStatusSchema,
  recommended: z
    .boolean()
    .optional()
    .openapi({ description: "Whether the record is recommended" }),
});

export const DomainSchema = z.object({
  id: z.number().openapi({ description: "The ID of the domain", example: 1 }),
  name: z
    .string()
    .openapi({ description: "The name of the domain", example: "example.com" }),
  teamId: z.number().openapi({ description: "The ID of the team", example: 1 }),
  status: DomainStatusSchema,
  region: z.string().default("us-east-1"),
  aggregateStatus: DomainStatusSchema.openapi({
    description:
      "Combined verification: SES identity, DKIM, and MAIL FROM (SPF) must all succeed for SUCCESS.",
  }),
  mailFromLabel: z
    .string()
    .optional()
    .nullish()
    .openapi({
      description:
        "Optional MAIL FROM subdomain label (e.g. bounce). Null means use `region` as the label.",
    }),
  clickTracking: z.boolean().default(false),
  openTracking: z.boolean().default(false),
  publicKey: z.string(),
  dkimStatus: z.string().optional().nullish(),
  spfDetails: z.string().optional().nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
  dmarcAdded: z.boolean().default(false),
  isVerifying: z.boolean().default(false),
  errorMessage: z.string().optional().nullish(),
  subdomain: z.string().optional().nullish(),
  verificationError: z.string().optional().nullish(),
  lastCheckedTime: z.string().optional().nullish(),
  dnsRecords: z.array(DomainDnsRecordSchema),
});
