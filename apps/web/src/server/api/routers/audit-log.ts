import { AuditAction, AuditResourceType } from "@prisma/client";
import { z } from "zod";
import {
  createTRPCRouter,
  teamProcedure,
  teamAdminProcedure,
} from "~/server/api/trpc";
import { db } from "~/server/db";

// Helper function to create audit logs (can be called from other routers/services)
export async function createAuditLog(params: {
  teamId: number;
  userId?: number | null;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId?: string;
  resourceName?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}) {
  return db.auditLog.create({
    data: {
      teamId: params.teamId,
      userId: params.userId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      resourceName: params.resourceName,
      details: params.details,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    },
  });
}

export const auditLogRouter = createTRPCRouter({
  // List audit logs with filters
  list: teamAdminProcedure
    .input(
      z.object({
        page: z.number().default(1),
        action: z.nativeEnum(AuditAction).optional(),
        resourceType: z.nativeEnum(AuditResourceType).optional(),
        userId: z.number().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx: { db, team }, input }) => {
      const limit = 50;
      const offset = (input.page - 1) * limit;

      const where: {
        teamId: number;
        action?: AuditAction;
        resourceType?: AuditResourceType;
        userId?: number;
        createdAt?: { gte?: Date; lte?: Date };
        OR?: Array<{ resourceName?: { contains: string; mode: "insensitive" } }>;
      } = {
        teamId: team.id,
      };

      if (input.action) {
        where.action = input.action;
      }

      if (input.resourceType) {
        where.resourceType = input.resourceType;
      }

      if (input.userId) {
        where.userId = input.userId;
      }

      if (input.startDate || input.endDate) {
        where.createdAt = {};
        if (input.startDate) {
          where.createdAt.gte = input.startDate;
        }
        if (input.endDate) {
          where.createdAt.lte = input.endDate;
        }
      }

      if (input.search) {
        where.OR = [
          { resourceName: { contains: input.search, mode: "insensitive" } },
        ];
      }

      const [logs, total] = await Promise.all([
        db.auditLog.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip: offset,
          take: limit,
        }),
        db.auditLog.count({ where }),
      ]);

      return {
        logs,
        totalPages: Math.ceil(total / limit),
        total,
      };
    }),

  // Get activity summary (counts by action type)
  getSummary: teamAdminProcedure
    .input(
      z.object({
        days: z.number().min(1).max(90).default(30),
      })
    )
    .query(async ({ ctx: { db, team }, input }) => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - input.days);

      // Get counts by action
      const actionCounts = await db.auditLog.groupBy({
        by: ["action"],
        where: {
          teamId: team.id,
          createdAt: { gte: startDate },
        },
        _count: { action: true },
      });

      // Get counts by resource type
      const resourceCounts = await db.auditLog.groupBy({
        by: ["resourceType"],
        where: {
          teamId: team.id,
          createdAt: { gte: startDate },
        },
        _count: { resourceType: true },
      });

      // Get most active users
      const userCounts = await db.auditLog.groupBy({
        by: ["userId"],
        where: {
          teamId: team.id,
          createdAt: { gte: startDate },
          userId: { not: null },
        },
        _count: { userId: true },
        orderBy: { _count: { userId: "desc" } },
        take: 5,
      });

      // Get user details for the active users
      const userIds = userCounts
        .map((u) => u.userId)
        .filter((id): id is number => id !== null);

      const users = await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      });

      const activeUsers = userCounts.map((u) => ({
        user: users.find((user) => user.id === u.userId),
        count: u._count.userId,
      }));

      // Get daily activity for the period
      const dailyActivity = await db.$queryRaw<
        Array<{ date: string; count: bigint }>
      >`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM "AuditLog"
        WHERE team_id = ${team.id}
          AND created_at >= ${startDate}
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `;

      return {
        byAction: actionCounts.map((a) => ({
          action: a.action,
          count: a._count.action,
        })),
        byResource: resourceCounts.map((r) => ({
          resourceType: r.resourceType,
          count: r._count.resourceType,
        })),
        activeUsers,
        dailyActivity: dailyActivity.map((d) => ({
          date: d.date,
          count: Number(d.count),
        })),
      };
    }),

  // Get recent activity for dashboard
  getRecent: teamProcedure
    .input(z.object({ limit: z.number().min(5).max(50).default(10) }))
    .query(async ({ ctx: { db, team }, input }) => {
      const logs = await db.auditLog.findMany({
        where: { teamId: team.id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });

      return logs;
    }),

  // Export audit logs (for compliance)
  export: teamAdminProcedure
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
        format: z.enum(["json", "csv"]).default("json"),
      })
    )
    .mutation(async ({ ctx: { db, team }, input }) => {
      const logs = await db.auditLog.findMany({
        where: {
          teamId: team.id,
          createdAt: {
            gte: input.startDate,
            lte: input.endDate,
          },
        },
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      if (input.format === "csv") {
        const headers = [
          "Timestamp",
          "User",
          "Action",
          "Resource Type",
          "Resource Name",
          "Details",
        ];
        const rows = logs.map((log) => [
          log.createdAt.toISOString(),
          log.user?.email || "System",
          log.action,
          log.resourceType,
          log.resourceName || "",
          JSON.stringify(log.details || {}),
        ]);

        const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
        return { data: csv, format: "csv" as const };
      }

      return { data: JSON.stringify(logs, null, 2), format: "json" as const };
    }),
});
