import { z } from "zod";

export const WAITLIST_EMAIL_TYPES = ["transactional", "marketing"] as const;

/** Adds https:// when missing; returns null if it isn't a usable http(s) URL. */
export function normalizeWebsite(value: string): string | null {
  const trimmed = value.trim();
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export const waitlistSubmissionSchema = z.object({
  domain: z
    .string({ required_error: "Domain is required" })
    .trim()
    .min(1, "Domain is required")
    .max(255, "Domain must be 255 characters or fewer")
    .regex(
      /^(?!:\/\/)([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/,
      "Please enter a valid domain (e.g. example.com)",
    ),
  website: z
    .string({ required_error: "Website is required" })
    .trim()
    .min(1, "Website is required")
    .max(500, "Website must be 500 characters or fewer")
    .refine(
      (value) => normalizeWebsite(value) !== null,
      "Please enter a valid website (e.g. https://acme.com)",
    ),
  emailTypes: z
    .array(z.enum(WAITLIST_EMAIL_TYPES))
    .min(1, "Select at least one email type"),
  emailVolume: z
    .string({ required_error: "Share your expected volume" })
    .trim()
    .min(1, "Tell us how many emails you expect to send")
    .max(500, "Keep the volume details under 500 characters"),
  listSource: z
    .string({ required_error: "Tell us how people join your list" })
    .trim()
    .min(10, "Please share a bit more detail")
    .max(1000, "Keep this under 1000 characters"),
  description: z
    .string({ required_error: "Provide a short description" })
    .trim()
    .min(10, "Please share a bit more detail")
    .max(2000, "Description must be under 2000 characters"),
});

export type WaitlistSubmissionInput = z.infer<typeof waitlistSubmissionSchema>;
