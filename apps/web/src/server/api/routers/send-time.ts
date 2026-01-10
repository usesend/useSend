import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createTRPCRouter,
  teamProcedure,
  teamAdminProcedure,
} from "~/server/api/trpc";

// Helper to calculate optimal send time based on engagement patterns
function calculateOptimalTime(
  hourlyScores: Record<string, number>,
  dayOfWeekScores: Record<string, number>
): { bestHour: number; bestDay: number } {
  let bestHour = 9; // Default to 9 AM
  let maxHourScore = 0;

  for (const [hour, score] of Object.entries(hourlyScores)) {
    if (score > maxHourScore) {
      maxHourScore = score;
      bestHour = parseInt(hour);
    }
  }

  let bestDay = 1; // Default to Monday
  let maxDayScore = 0;

  for (const [day, score] of Object.entries(dayOfWeekScores)) {
    if (score > maxDayScore) {
      maxDayScore = score;
      bestDay = parseInt(day);
    }
  }

  return { bestHour, bestDay };
}

// Day names for display
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const sendTimeRouter = createTRPCRouter({
  // Get team send time settings
  getSettings: teamProcedure.query(async ({ ctx: { db, team } }) => {
    const settings = await db.teamSendTimeSettings.findUnique({
      where: { teamId: team.id },
    });

    return (
      settings || {
        enableOptimization: false,
        defaultHourStart: 9,
        defaultHourEnd: 17,
        excludeDays: [],
        defaultTimezone: "UTC",
      }
    );
  }),

  // Update team send time settings
  updateSettings: teamAdminProcedure
    .input(
      z.object({
        enableOptimization: z.boolean().optional(),
        defaultHourStart: z.number().min(0).max(23).optional(),
        defaultHourEnd: z.number().min(0).max(23).optional(),
        excludeDays: z.array(z.number().min(0).max(6)).optional(),
        defaultTimezone: z.string().optional(),
      })
    )
    .mutation(async ({ ctx: { db, team }, input }) => {
      return db.teamSendTimeSettings.upsert({
        where: { teamId: team.id },
        update: input,
        create: {
          teamId: team.id,
          ...input,
        },
      });
    }),

  // Get engagement insights for the team
  getTeamInsights: teamProcedure.query(async ({ ctx: { db, team } }) => {
    // Get aggregate engagement patterns for all contacts
    const patterns = await db.contactEngagementPattern.findMany({
      where: { teamId: team.id },
      select: {
        hourlyScores: true,
        dayOfWeekScores: true,
        totalOpens: true,
        totalClicks: true,
      },
    });

    if (patterns.length === 0) {
      return {
        hasData: false,
        totalContacts: 0,
        averageOpenRate: 0,
        bestHours: [],
        bestDays: [],
        hourlyDistribution: {},
        dayOfWeekDistribution: {},
      };
    }

    // Aggregate hourly scores
    const hourlyTotals: Record<string, number> = {};
    const dayTotals: Record<string, number> = {};

    for (let h = 0; h < 24; h++) hourlyTotals[h] = 0;
    for (let d = 0; d < 7; d++) dayTotals[d] = 0;

    for (const pattern of patterns) {
      const hourly = pattern.hourlyScores as Record<string, number>;
      const daily = pattern.dayOfWeekScores as Record<string, number>;

      for (const [hour, score] of Object.entries(hourly)) {
        hourlyTotals[hour] = (hourlyTotals[hour] || 0) + score;
      }

      for (const [day, score] of Object.entries(daily)) {
        dayTotals[day] = (dayTotals[day] || 0) + score;
      }
    }

    // Find best hours (top 3)
    const sortedHours = Object.entries(hourlyTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([hour]) => parseInt(hour));

    // Find best days (top 3)
    const sortedDays = Object.entries(dayTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([day]) => ({
        day: parseInt(day),
        name: DAY_NAMES[parseInt(day)],
      }));

    // Calculate total opens and clicks
    const totalOpens = patterns.reduce((sum, p) => sum + p.totalOpens, 0);
    const totalClicks = patterns.reduce((sum, p) => sum + p.totalClicks, 0);

    return {
      hasData: true,
      totalContacts: patterns.length,
      totalOpens,
      totalClicks,
      bestHours: sortedHours,
      bestDays: sortedDays,
      hourlyDistribution: hourlyTotals,
      dayOfWeekDistribution: Object.fromEntries(
        Object.entries(dayTotals).map(([d, score]) => [DAY_NAMES[parseInt(d)], score])
      ),
    };
  }),

  // Get optimal send time for specific contacts
  getOptimalTimeForContacts: teamProcedure
    .input(
      z.object({
        contactIds: z.array(z.string()).optional(),
        contactBookId: z.string().optional(),
      })
    )
    .query(async ({ ctx: { db, team }, input }) => {
      // Get contact IDs if contact book is specified
      let contactIds = input.contactIds;

      if (input.contactBookId && !contactIds) {
        const contacts = await db.contact.findMany({
          where: {
            contactBookId: input.contactBookId,
            contactBook: { teamId: team.id },
          },
          select: { id: true },
          take: 10000,
        });
        contactIds = contacts.map((c) => c.id);
      }

      if (!contactIds || contactIds.length === 0) {
        // Return default recommendations
        return {
          recommendation: {
            hour: 10, // 10 AM default
            day: 2, // Tuesday default
            dayName: "Tuesday",
            confidence: "low",
          },
          basedOnContacts: 0,
        };
      }

      // Get engagement patterns for these contacts
      const patterns = await db.contactEngagementPattern.findMany({
        where: {
          contactId: { in: contactIds },
          teamId: team.id,
        },
      });

      if (patterns.length === 0) {
        return {
          recommendation: {
            hour: 10,
            day: 2,
            dayName: "Tuesday",
            confidence: "low",
          },
          basedOnContacts: 0,
        };
      }

      // Aggregate scores
      const hourlyTotals: Record<string, number> = {};
      const dayTotals: Record<string, number> = {};

      for (let h = 0; h < 24; h++) hourlyTotals[h] = 0;
      for (let d = 0; d < 7; d++) dayTotals[d] = 0;

      for (const pattern of patterns) {
        const hourly = pattern.hourlyScores as Record<string, number>;
        const daily = pattern.dayOfWeekScores as Record<string, number>;

        for (const [hour, score] of Object.entries(hourly)) {
          hourlyTotals[hour] = (hourlyTotals[hour] || 0) + score;
        }

        for (const [day, score] of Object.entries(daily)) {
          dayTotals[day] = (dayTotals[day] || 0) + score;
        }
      }

      const { bestHour, bestDay } = calculateOptimalTime(hourlyTotals, dayTotals);

      // Determine confidence based on data amount
      let confidence: "low" | "medium" | "high" = "low";
      if (patterns.length >= 100) confidence = "high";
      else if (patterns.length >= 20) confidence = "medium";

      return {
        recommendation: {
          hour: bestHour,
          day: bestDay,
          dayName: DAY_NAMES[bestDay],
          confidence,
        },
        basedOnContacts: patterns.length,
        hourlyDistribution: hourlyTotals,
        dayOfWeekDistribution: dayTotals,
      };
    }),

  // Record an engagement event (called by webhook handler)
  recordEngagement: teamProcedure
    .input(
      z.object({
        emailId: z.string(),
        contactId: z.string(),
        eventType: z.enum(["open", "click"]),
        eventAt: z.date().optional(),
      })
    )
    .mutation(async ({ ctx: { db, team }, input }) => {
      const eventTime = input.eventAt || new Date();
      const eventHour = eventTime.getUTCHours();
      const eventDay = eventTime.getUTCDay();

      // Record the event
      await db.emailEngagementEvent.create({
        data: {
          emailId: input.emailId,
          contactId: input.contactId,
          teamId: team.id,
          eventType: input.eventType,
          eventHour,
          eventDay,
          eventAt: eventTime,
        },
      });

      // Update or create engagement pattern for this contact
      const existingPattern = await db.contactEngagementPattern.findUnique({
        where: { contactId: input.contactId },
      });

      if (existingPattern) {
        const hourlyScores = existingPattern.hourlyScores as Record<string, number>;
        const dayOfWeekScores = existingPattern.dayOfWeekScores as Record<string, number>;

        // Increment scores for this hour and day
        hourlyScores[eventHour] = (hourlyScores[eventHour] || 0) + 10;
        dayOfWeekScores[eventDay] = (dayOfWeekScores[eventDay] || 0) + 10;

        // Recalculate best times
        const { bestHour, bestDay } = calculateOptimalTime(hourlyScores, dayOfWeekScores);

        await db.contactEngagementPattern.update({
          where: { contactId: input.contactId },
          data: {
            hourlyScores,
            dayOfWeekScores,
            bestHourUtc: bestHour,
            bestDayOfWeek: bestDay,
            totalOpens:
              input.eventType === "open"
                ? { increment: 1 }
                : existingPattern.totalOpens,
            totalClicks:
              input.eventType === "click"
                ? { increment: 1 }
                : existingPattern.totalClicks,
            lastCalculatedAt: new Date(),
          },
        });
      } else {
        // Create new pattern
        const hourlyScores: Record<string, number> = {};
        const dayOfWeekScores: Record<string, number> = {};

        for (let h = 0; h < 24; h++) hourlyScores[h] = 0;
        for (let d = 0; d < 7; d++) dayOfWeekScores[d] = 0;

        hourlyScores[eventHour] = 10;
        dayOfWeekScores[eventDay] = 10;

        await db.contactEngagementPattern.create({
          data: {
            contactId: input.contactId,
            teamId: team.id,
            hourlyScores,
            dayOfWeekScores,
            bestHourUtc: eventHour,
            bestDayOfWeek: eventDay,
            totalOpens: input.eventType === "open" ? 1 : 0,
            totalClicks: input.eventType === "click" ? 1 : 0,
            totalEmails: 1,
          },
        });
      }

      return { success: true };
    }),

  // Calculate optimized send time for a campaign
  calculateCampaignSendTime: teamProcedure
    .input(
      z.object({
        contactBookId: z.string(),
        preferredDate: z.date().optional(),
      })
    )
    .query(async ({ ctx: { db, team }, input }) => {
      // Get all contacts in the contact book
      const contacts = await db.contact.findMany({
        where: {
          contactBookId: input.contactBookId,
          contactBook: { teamId: team.id },
        },
        select: { id: true },
      });

      const contactIds = contacts.map((c) => c.id);

      // Get engagement patterns
      const patterns = await db.contactEngagementPattern.findMany({
        where: {
          contactId: { in: contactIds },
          teamId: team.id,
        },
      });

      // Get team settings
      const settings = await db.teamSendTimeSettings.findUnique({
        where: { teamId: team.id },
      });

      const excludeDays = (settings?.excludeDays as number[]) || [];
      const defaultHourStart = settings?.defaultHourStart ?? 9;
      const defaultHourEnd = settings?.defaultHourEnd ?? 17;

      if (patterns.length === 0) {
        // Use defaults
        const baseDate = input.preferredDate || new Date();
        const hour = Math.floor((defaultHourStart + defaultHourEnd) / 2);

        return {
          suggestedTime: new Date(
            baseDate.getFullYear(),
            baseDate.getMonth(),
            baseDate.getDate(),
            hour,
            0,
            0
          ),
          confidence: "low" as const,
          reason: "Using default send time (no engagement data available)",
        };
      }

      // Aggregate patterns
      const hourlyTotals: Record<string, number> = {};
      const dayTotals: Record<string, number> = {};

      for (let h = 0; h < 24; h++) hourlyTotals[h] = 0;
      for (let d = 0; d < 7; d++) dayTotals[d] = 0;

      for (const pattern of patterns) {
        const hourly = pattern.hourlyScores as Record<string, number>;
        const daily = pattern.dayOfWeekScores as Record<string, number>;

        for (const [hour, score] of Object.entries(hourly)) {
          hourlyTotals[hour] = (hourlyTotals[hour] || 0) + score;
        }

        for (const [day, score] of Object.entries(daily)) {
          if (!excludeDays.includes(parseInt(day))) {
            dayTotals[day] = (dayTotals[day] || 0) + score;
          }
        }
      }

      const { bestHour, bestDay } = calculateOptimalTime(hourlyTotals, dayTotals);

      // Calculate the next occurrence of the best day
      const baseDate = input.preferredDate || new Date();
      const currentDay = baseDate.getDay();
      let daysToAdd = bestDay - currentDay;
      if (daysToAdd <= 0) daysToAdd += 7;

      const suggestedDate = new Date(baseDate);
      suggestedDate.setDate(suggestedDate.getDate() + daysToAdd);
      suggestedDate.setHours(bestHour, 0, 0, 0);

      let confidence: "low" | "medium" | "high" = "low";
      if (patterns.length >= 100) confidence = "high";
      else if (patterns.length >= 20) confidence = "medium";

      return {
        suggestedTime: suggestedDate,
        bestHour,
        bestDay,
        bestDayName: DAY_NAMES[bestDay],
        confidence,
        reason: `Based on engagement patterns of ${patterns.length} contacts`,
        hourlyDistribution: hourlyTotals,
      };
    }),
});
