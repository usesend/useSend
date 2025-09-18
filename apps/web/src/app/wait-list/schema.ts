import { z } from "zod";

export const WAITLIST_EMAIL_TYPES = [
  "transactional",
  "marketing",
] as const;

export const waitlistSubmissionSchema = z.object({
  domain: z
    .string({ required_error: "Domain is required" })
    .trim()
    .min(1, "Domain is required")
    .max(255, "Domain must be 255 characters or fewer"),
  emailTypes: z
    .array(z.enum(WAITLIST_EMAIL_TYPES))
    .min(1, "Select at least one email type"),
  description: z
    .string({ required_error: "Provide a short description" })
    .trim()
    .min(10, "Please share a bit more detail")
    .max(2000, "Description must be under 2000 characters"),
});

export type WaitlistSubmissionInput = z.infer<typeof waitlistSubmissionSchema>;
