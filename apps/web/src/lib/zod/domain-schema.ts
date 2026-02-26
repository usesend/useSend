import { DomainStatus } from "@prisma/client";
import { z } from "zod";

export const DomainStatusSchema = z.nativeEnum(DomainStatus);

export const DomainDnsRecordSchema = z.object({
  type: z.enum(["MX", "TXT"]).openapi({
    description: "DNS record type",
    example: "TXT",
  }),
  name: z.string().openapi({ description: "DNS record name", example: "mail" }),
  value: z.string().openapi({
    description: "DNS record value",
    example: "v=spf1 include:amazonses.com ~all",
  }),
  ttl: z.string().openapi({ description: "DNS record TTL", example: "Auto" }),
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
  publicId: z.string().nullable().optional().openapi({
    description: "Public domain identifier",
    example: "dom_3NfPq7hK9a2Tj6Rx",
  }),
  name: z
    .string()
    .openapi({ description: "The name of the domain", example: "example.com" }),
  teamId: z.number().openapi({ description: "The ID of the team", example: 1 }),
  status: DomainStatusSchema,
  region: z.string().default("us-east-1"),
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
