import type { Prisma, WaitlistStatus } from "@prisma/client";
import {
  normalizeWebsite,
  type WaitlistSubmissionInput,
} from "~/app/wait-list/schema";
import { db } from "~/server/db";

export class WaitlistService {
  /**
   * Saves (or replaces) a user's waitlist application so it can be reviewed.
   * Resubmitting puts the application back in review.
   */
  static async saveApplication(
    user: { id: number; email: string },
    input: WaitlistSubmissionInput,
  ) {
    const data = {
      email: user.email,
      website: normalizeWebsite(input.website) ?? input.website,
      domain: input.domain.toLowerCase(),
      emailTypes: input.emailTypes,
      emailVolume: input.emailVolume,
      listSource: input.listSource,
      description: input.description,
      status: "PENDING" as const,
      reviewedAt: null,
    };

    return db.waitlistApplication.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
    });
  }

  /** Records the review outcome. Users who never filled the form have no application. */
  static async setStatus(
    userId: number,
    status: WaitlistStatus,
    client: Prisma.TransactionClient = db,
  ) {
    await client.waitlistApplication.updateMany({
      where: { userId },
      data: {
        status,
        reviewedAt: status === "PENDING" ? null : new Date(),
      },
    });
  }
}
