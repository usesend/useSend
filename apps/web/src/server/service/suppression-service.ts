import { SuppressionReason, SuppressionList } from "@prisma/client";
import { db } from "../db";
import { UnsendApiError } from "~/server/public-api/api-error";
import { logger } from "../logger/log";
import { deleteFromSesSuppressionList } from "../aws/ses";

export type AddSuppressionParams = {
  email: string;
  teamId: number;
  reason: SuppressionReason;
  source?: string;
};

export type GetSuppressionListParams = {
  teamId: number;
  page?: number;
  limit?: number;
  search?: string;
  reason?: SuppressionReason | null;
  sortBy?: "email" | "reason" | "createdAt";
  sortOrder?: "asc" | "desc";
};

export type SuppressionListResult = {
  suppressions: SuppressionList[];
  total: number;
};

export class SuppressionService {
  /**
   * Add email to suppression list
   */
  static async addSuppression(
    params: AddSuppressionParams
  ): Promise<SuppressionList> {
    const { email, teamId, reason, source } = params;

    try {
      const suppression = await db.suppressionList.upsert({
        where: {
          teamId_email: {
            teamId,
            email: email.toLowerCase().trim(),
          },
        },
        create: {
          email: email.toLowerCase().trim(),
          teamId,
          reason,
          source,
        },
        update: {
          reason,
          source,
          updatedAt: new Date(),
        },
      });

      logger.info(
        {
          email,
          teamId,
          reason,
          source,
          suppressionId: suppression.id,
        },
        "Email added to suppression list"
      );

      return suppression;
    } catch (error) {
      logger.error(
        {
          email,
          teamId,
          reason,
          source,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to add email to suppression list"
      );

      throw new UnsendApiError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to add email to suppression list",
      });
    }
  }

  /**
   * Check if email is suppressed for team
   */
  static async isEmailSuppressed(
    email: string,
    teamId: number
  ): Promise<boolean> {
    try {
      const suppression = await db.suppressionList.findUnique({
        where: {
          teamId_email: {
            teamId,
            email: email.toLowerCase().trim(),
          },
        },
      });

      return !!suppression;
    } catch (error) {
      logger.error(
        {
          email,
          teamId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to check email suppression status"
      );

      // In case of error, err on the side of caution and don't suppress
      return false;
    }
  }

  /**
   * Remove email from suppression list (both local DB and AWS SES)
   */
  static async removeSuppression(email: string, teamId: number): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();

    // Get all unique regions from team's domains for AWS SES cleanup
    try {
      const teamDomains = await db.domain.findMany({
        where: { teamId },
        select: { region: true },
      });
      const uniqueRegions = [...new Set(teamDomains.map((d) => d.region))];

      // Attempt to remove from AWS SES in all regions (best effort, don't throw)
      if (uniqueRegions.length > 0) {
        const results = await Promise.allSettled(
          uniqueRegions.map((region) =>
            deleteFromSesSuppressionList(normalizedEmail, region)
          )
        );

        // Check for failures - deleteFromSesSuppressionList returns false on error
        const failures = results.filter(
          (r) =>
            r.status === "rejected" ||
            (r.status === "fulfilled" && r.value === false)
        );
        if (failures.length > 0) {
          logger.warn(
            {
              email: normalizedEmail,
              teamId,
              failedRegions: failures.length,
              totalRegions: uniqueRegions.length,
            },
            "Some AWS SES regions failed during suppression removal"
          );
        }
      }
    } catch (error) {
      // AWS SES cleanup failure should not block local DB deletion
      logger.error(
        {
          email: normalizedEmail,
          teamId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to cleanup AWS SES suppression (continuing with local deletion)"
      );
    }

    // Delete from local database
    try {
      const deleted = await db.suppressionList.delete({
        where: {
          teamId_email: {
            teamId,
            email: normalizedEmail,
          },
        },
      });

      logger.info(
        {
          email: normalizedEmail,
          teamId,
          suppressionId: deleted.id,
        },
        "Email removed from suppression list"
      );
    } catch (error) {
      // If the record doesn't exist, that's fine - it's already not suppressed
      if (
        error instanceof Error &&
        error.message.includes("Record to delete does not exist")
      ) {
        logger.debug(
          {
            email: normalizedEmail,
            teamId,
          },
          "Attempted to remove non-existent suppression - already not suppressed"
        );
        return;
      }

      logger.error(
        {
          email: normalizedEmail,
          teamId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to remove email from suppression list"
      );

      throw new UnsendApiError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to remove email from suppression list",
      });
    }
  }

  /**
   * Get suppression list for team with pagination
   */
  static async getSuppressionList(
    params: GetSuppressionListParams
  ): Promise<SuppressionListResult> {
    const {
      teamId,
      page = 1,
      limit = 20,
      search,
      reason,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = params;

    const offset = (page - 1) * limit;

    const where = {
      teamId,
      ...(search && {
        email: {
          contains: search,
          mode: "insensitive" as const,
        },
      }),
      ...(reason && { reason }),
    };

    try {
      const [suppressions, total] = await Promise.all([
        db.suppressionList.findMany({
          where,
          skip: offset,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
        }),
        db.suppressionList.count({ where }),
      ]);

      return {
        suppressions,
        total,
      };
    } catch (error) {
      logger.error(
        {
          teamId,
          page,
          limit,
          search,
          reason,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to get suppression list"
      );

      throw new UnsendApiError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get suppression list",
      });
    }
  }

  /**
   * Add multiple emails to suppression list
   */
  static async addMultipleSuppressions(
    teamId: number,
    emails: string[],
    reason: SuppressionReason
  ) {
    // Remove duplicates by normalizing emails first, then using Set
    const normalizedEmails = emails.map((email) => email.toLowerCase().trim());
    const uniqueEmails = Array.from(new Set(normalizedEmails));

    try {
      // Process in batches to avoid overwhelming the database
      const batchSize = 1000;
      for (let i = 0; i < uniqueEmails.length; i += batchSize) {
        const batch = uniqueEmails.slice(i, i + batchSize);

        const alreadySuppressed = await db.suppressionList.findMany({
          where: {
            teamId,
            email: { in: batch },
          },
        });

        const emailsToAdd = batch.filter(
          (email) => !alreadySuppressed.some((s) => s.email === email)
        );

        await db.suppressionList.createMany({
          data: emailsToAdd.map((email) => ({
            teamId,
            email,
            reason,
          })),
        });
      }

      logger.info(
        {
          originalCount: emails.length,
          uniqueCount: uniqueEmails.length,
        },
        "Added multiple emails to suppression list"
      );
    } catch (error) {
      logger.error(
        {
          originalCount: emails.length,
          uniqueCount: uniqueEmails.length,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to add multiple emails to suppression list"
      );

      throw new UnsendApiError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to add multiple emails to suppression list",
      });
    }
  }

  /**
   * Get suppression statistics for a team
   */
  static async getSuppressionStats(
    teamId: number
  ): Promise<Record<SuppressionReason, number>> {
    try {
      const stats = await db.suppressionList.groupBy({
        by: ["reason"],
        where: { teamId },
        _count: { _all: true },
      });

      const result: Record<SuppressionReason, number> = {
        HARD_BOUNCE: 0,
        COMPLAINT: 0,
        MANUAL: 0,
      };

      stats.forEach((stat) => {
        result[stat.reason] = stat._count._all;
      });

      return result;
    } catch (error) {
      logger.error(
        {
          teamId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to get suppression stats"
      );

      throw new UnsendApiError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get suppression stats",
      });
    }
  }

  /**
   * Check multiple emails for suppression status
   */
  static async checkMultipleEmails(
    emails: string[],
    teamId: number
  ): Promise<Record<string, boolean>> {
    try {
      const normalizedEmails = emails.map((email) =>
        email.toLowerCase().trim()
      );

      const suppressions = await db.suppressionList.findMany({
        where: {
          teamId,
          email: {
            in: normalizedEmails,
          },
        },
        select: {
          email: true,
        },
      });

      const suppressedEmails = new Set(suppressions.map((s) => s.email));

      const result: Record<string, boolean> = {};
      emails.forEach((email) => {
        result[email] = suppressedEmails.has(email.toLowerCase().trim());
      });

      return result;
    } catch (error) {
      logger.error(
        {
          emailCount: emails.length,
          teamId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to check multiple emails for suppression"
      );

      // In case of error, err on the side of caution and don't suppress any
      const result: Record<string, boolean> = {};
      emails.forEach((email) => {
        result[email] = false;
      });

      return result;
    }
  }
}
