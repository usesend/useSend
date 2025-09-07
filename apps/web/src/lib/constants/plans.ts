import { Plan } from "@prisma/client";

export enum LimitReason {
  DOMAIN = "DOMAIN",
  CONTACT_BOOK = "CONTACT_BOOK",
  TEAM_MEMBER = "TEAM_MEMBER",
  EMAIL_BLOCKED = "EMAIL_BLOCKED",
  EMAIL_LIMIT_REACHED = "EMAIL_LIMIT_REACHED",
  EMAIL_FREE_PLAN_LIMIT_REACHED = "EMAIL_FREE_PLAN_LIMIT_REACHED",
}

export const PLAN_LIMITS: Record<
  Plan,
  {
    emailsPerMonth: number;
    emailsPerDay: number;
    domains: number;
    contactBooks: number;
    teamMembers: number;
  }
> = {
  FREE: {
    emailsPerMonth: 3000,
    emailsPerDay: 100,
    domains: 1,
    contactBooks: 1,
    teamMembers: 1,
  },
  BASIC: {
    emailsPerMonth: -1, // unlimited
    emailsPerDay: -1, // unlimited
    domains: -1,
    contactBooks: -1,
    teamMembers: -1,
  },
};
