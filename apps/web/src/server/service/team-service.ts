import { TRPCError } from "@trpc/server";
import { env } from "~/env";
import { db } from "~/server/db";
import { sendTeamInviteEmail } from "~/server/mailer";
import { logger } from "~/server/logger/log";
import type { Team, TeamInvite } from "@prisma/client";
import { UnsendApiError } from "../public-api/api-error";
import { getRedis } from "~/server/redis";
import { PLAN_LIMITS } from "~/lib/constants/plans";

// Cache stores exactly Prisma Team shape (no counts)

const TEAM_CACHE_TTL_SECONDS = 120; // 2 minutes

export class TeamService {
  private static cacheKey(teamId: number) {
    return `team:${teamId}`;
  }

  static async refreshTeamCache(teamId: number): Promise<Team | null> {
    const team = await db.team.findUnique({ where: { id: teamId } });

    if (!team) return null;

    const redis = getRedis();
    await redis.setex(
      TeamService.cacheKey(teamId),
      TEAM_CACHE_TTL_SECONDS,
      JSON.stringify(team)
    );
    return team;
  }

  static async invalidateTeamCache(teamId: number) {
    const redis = getRedis();
    await redis.del(TeamService.cacheKey(teamId));
  }

  static async getTeamCached(teamId: number): Promise<Team> {
    const redis = getRedis();
    const raw = await redis.get(TeamService.cacheKey(teamId));
    if (raw) {
      return JSON.parse(raw) as Team;
    }
    const fresh = await TeamService.refreshTeamCache(teamId);
    if (!fresh) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
    }
    return fresh;
  }

  static async createTeam(
    userId: number,
    name: string
  ): Promise<Team | undefined> {
    const teams = await db.team.findMany({
      where: {
        teamUsers: {
          some: {
            userId: userId,
          },
        },
      },
    });

    if (teams.length > 0) {
      logger.info({ userId }, "User already has a team");
      return;
    }

    if (!env.NEXT_PUBLIC_IS_CLOUD) {
      const _team = await db.team.findFirst();
      if (_team) {
        throw new TRPCError({
          message: "Can't have multiple teams in self hosted version",
          code: "UNAUTHORIZED",
        });
      }
    }

    const created = await db.team.create({
      data: {
        name,
        teamUsers: {
          create: {
            userId,
            role: "ADMIN",
          },
        },
      },
    });
    // Warm cache for the new team
    await TeamService.refreshTeamCache(created.id);
    return created;
  }

  static async getUserTeams(userId: number) {
    return db.team.findMany({
      where: {
        teamUsers: {
          some: {
            userId: userId,
          },
        },
      },
      include: {
        teamUsers: {
          where: {
            userId: userId,
          },
        },
      },
    });
  }

  static async getTeamUsers(teamId: number) {
    return db.teamUser.findMany({
      where: {
        teamId,
      },
      include: {
        user: true,
      },
    });
  }

  static async getTeamInvites(teamId: number) {
    return db.teamInvite.findMany({
      where: {
        teamId,
      },
    });
  }

  static async createTeamInvite(
    teamId: number,
    email: string,
    role: "MEMBER" | "ADMIN",
    teamName: string,
    sendEmail: boolean = true
  ): Promise<TeamInvite> {
    if (!email) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Email is required",
      });
    }

    const cachedTeam = await TeamService.getTeamCached(teamId);
    const memberLimit = PLAN_LIMITS[cachedTeam.plan].teamMembers;
    const currentMembers = await db.teamUser.count({ where: { teamId } });
    const isExceeded = memberLimit !== -1 && currentMembers >= memberLimit;
    if (isExceeded) {
      throw new UnsendApiError({
        code: "FORBIDDEN",
        message: "Team invite limit reached",
      });
    }

    const user = await db.user.findUnique({
      where: {
        email,
      },
      include: {
        teamUsers: true,
      },
    });

    if (user && user.teamUsers.length > 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "User already part of a team",
      });
    }

    const teamInvite = await db.teamInvite.create({
      data: {
        teamId,
        email,
        role,
      },
    });

    const teamUrl = `${env.NEXTAUTH_URL}/join-team?inviteId=${teamInvite.id}`;

    if (sendEmail) {
      await sendTeamInviteEmail(email, teamUrl, teamName);
    }

    return teamInvite;
  }

  static async updateTeamUserRole(
    teamId: number,
    userId: string,
    role: "MEMBER" | "ADMIN"
  ) {
    const teamUser = await db.teamUser.findFirst({
      where: {
        teamId,
        userId: Number(userId),
      },
    });

    if (!teamUser) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Team member not found",
      });
    }

    // Check if this is the last admin
    const adminCount = await db.teamUser.count({
      where: {
        teamId,
        role: "ADMIN",
      },
    });

    if (adminCount === 1 && teamUser.role === "ADMIN") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Need at least one admin",
      });
    }

    const updated = await db.teamUser.update({
      where: {
        teamId_userId: {
          teamId,
          userId: Number(userId),
        },
      },
      data: {
        role,
      },
    });
    // Role updates might influence permissions; refresh cache to be safe
    await TeamService.invalidateTeamCache(teamId);
    return updated;
  }

  static async deleteTeamUser(
    teamId: number,
    userId: string,
    requestorRole: string,
    requestorId: number
  ) {
    const teamUser = await db.teamUser.findFirst({
      where: {
        teamId,
        userId: Number(userId),
      },
    });

    if (!teamUser) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Team member not found",
      });
    }

    if (requestorRole !== "ADMIN" && requestorId !== Number(userId)) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "You are not authorized to delete this team member",
      });
    }

    // Check if this is the last admin
    const adminCount = await db.teamUser.count({
      where: {
        teamId,
        role: "ADMIN",
      },
    });

    if (adminCount === 1 && teamUser.role === "ADMIN") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Need at least one admin",
      });
    }

    const deleted = await db.teamUser.delete({
      where: {
        teamId_userId: {
          teamId,
          userId: Number(userId),
        },
      },
    });
    await TeamService.invalidateTeamCache(teamId);
    return deleted;
  }

  static async resendTeamInvite(inviteId: string, teamName: string) {
    const invite = await db.teamInvite.findUnique({
      where: {
        id: inviteId,
      },
    });

    if (!invite) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Invite not found",
      });
    }

    const teamUrl = `${env.NEXTAUTH_URL}/join-team?inviteId=${invite.id}`;

    await sendTeamInviteEmail(invite.email, teamUrl, teamName);

    return { success: true };
  }

  static async deleteTeamInvite(teamId: number, inviteId: string) {
    const invite = await db.teamInvite.findFirst({
      where: {
        teamId,
        id: {
          equals: inviteId,
        },
      },
    });

    if (!invite) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Invite not found",
      });
    }

    return db.teamInvite.delete({
      where: {
        teamId_email: {
          teamId,
          email: invite.email,
        },
      },
    });
  }
}
