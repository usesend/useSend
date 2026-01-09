import { ReportFrequency } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addDays,
  addWeeks,
  addMonths,
  setHours,
  setMinutes,
  setSeconds,
  setDay,
  setDate,
  startOfDay,
} from "date-fns";

import {
  createTRPCRouter,
  teamProcedure,
  teamAdminProcedure,
} from "~/server/api/trpc";

// Calculate next send date based on frequency
function calculateNextSendAt(
  frequency: ReportFrequency,
  hour: number,
  dayOfWeek?: number | null,
  dayOfMonth?: number | null,
): Date {
  let nextDate = new Date();

  // Set the time
  nextDate = setHours(nextDate, hour);
  nextDate = setMinutes(nextDate, 0);
  nextDate = setSeconds(nextDate, 0);

  switch (frequency) {
    case "DAILY":
      // If the time has passed today, schedule for tomorrow
      if (nextDate <= new Date()) {
        nextDate = addDays(nextDate, 1);
      }
      break;

    case "WEEKLY":
      // Set to the specified day of week
      if (dayOfWeek !== undefined && dayOfWeek !== null) {
        nextDate = setDay(nextDate, dayOfWeek);
        // If that day has passed this week, move to next week
        if (nextDate <= new Date()) {
          nextDate = addWeeks(nextDate, 1);
        }
      }
      break;

    case "MONTHLY":
      // Set to the specified day of month
      if (dayOfMonth !== undefined && dayOfMonth !== null) {
        nextDate = setDate(nextDate, dayOfMonth);
        // If that day has passed this month, move to next month
        if (nextDate <= new Date()) {
          nextDate = addMonths(nextDate, 1);
        }
      }
      break;
  }

  return nextDate;
}

export const scheduledReportRouter = createTRPCRouter({
  // List all scheduled reports for the team
  list: teamProcedure.query(async ({ ctx: { db, team } }) => {
    const reports = await db.scheduledReport.findMany({
      where: { teamId: team.id },
      orderBy: { createdAt: "desc" },
    });
    return reports;
  }),

  // Get a single scheduled report
  get: teamProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx: { db, team }, input }) => {
      const report = await db.scheduledReport.findUnique({
        where: { id: input.id },
      });

      if (!report || report.teamId !== team.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Report not found",
        });
      }

      return report;
    }),

  // Create a new scheduled report
  create: teamAdminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        recipients: z.array(z.string().email()).min(1),
        frequency: z.nativeEnum(ReportFrequency),
        dayOfWeek: z.number().min(0).max(6).optional(),
        dayOfMonth: z.number().min(1).max(31).optional(),
        hour: z.number().min(0).max(23).default(9),
        timezone: z.string().default("UTC"),
      }),
    )
    .mutation(async ({ ctx: { db, team }, input }) => {
      const nextSendAt = calculateNextSendAt(
        input.frequency,
        input.hour,
        input.dayOfWeek,
        input.dayOfMonth,
      );

      const report = await db.scheduledReport.create({
        data: {
          name: input.name,
          teamId: team.id,
          recipients: input.recipients,
          frequency: input.frequency,
          dayOfWeek: input.dayOfWeek,
          dayOfMonth: input.dayOfMonth,
          hour: input.hour,
          timezone: input.timezone,
          nextSendAt,
        },
      });

      return report;
    }),

  // Update a scheduled report
  update: teamAdminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        recipients: z.array(z.string().email()).min(1).optional(),
        frequency: z.nativeEnum(ReportFrequency).optional(),
        dayOfWeek: z.number().min(0).max(6).optional().nullable(),
        dayOfMonth: z.number().min(1).max(31).optional().nullable(),
        hour: z.number().min(0).max(23).optional(),
        timezone: z.string().optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx: { db, team }, input }) => {
      const existing = await db.scheduledReport.findUnique({
        where: { id: input.id },
      });

      if (!existing || existing.teamId !== team.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Report not found",
        });
      }

      // Recalculate next send date if schedule changed
      const frequency = input.frequency ?? existing.frequency;
      const hour = input.hour ?? existing.hour;
      const dayOfWeek =
        input.dayOfWeek !== undefined ? input.dayOfWeek : existing.dayOfWeek;
      const dayOfMonth =
        input.dayOfMonth !== undefined ? input.dayOfMonth : existing.dayOfMonth;

      const nextSendAt =
        input.frequency || input.hour || input.dayOfWeek !== undefined || input.dayOfMonth !== undefined
          ? calculateNextSendAt(frequency, hour, dayOfWeek, dayOfMonth)
          : undefined;

      const report = await db.scheduledReport.update({
        where: { id: input.id },
        data: {
          name: input.name,
          recipients: input.recipients,
          frequency: input.frequency,
          dayOfWeek: input.dayOfWeek,
          dayOfMonth: input.dayOfMonth,
          hour: input.hour,
          timezone: input.timezone,
          enabled: input.enabled,
          nextSendAt,
        },
      });

      return report;
    }),

  // Delete a scheduled report
  delete: teamAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx: { db, team }, input }) => {
      const existing = await db.scheduledReport.findUnique({
        where: { id: input.id },
      });

      if (!existing || existing.teamId !== team.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Report not found",
        });
      }

      await db.scheduledReport.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // Toggle enabled status
  toggle: teamAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx: { db, team }, input }) => {
      const existing = await db.scheduledReport.findUnique({
        where: { id: input.id },
      });

      if (!existing || existing.teamId !== team.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Report not found",
        });
      }

      const report = await db.scheduledReport.update({
        where: { id: input.id },
        data: { enabled: !existing.enabled },
      });

      return report;
    }),
});
