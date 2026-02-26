import { Role, type Prisma, type Team, type User } from "@prisma/client";
import { db } from "~/server/db";
import { newId } from "~/server/id";

let sequence = 1;

function nextValue() {
  const value = sequence;
  sequence += 1;
  return value;
}

export async function createUser(data?: Prisma.UserCreateInput): Promise<User> {
  const n = nextValue();
  return db.user.create({
    data: {
      publicId: newId("userPublic"),
      email: `user-${n}@example.com`,
      isBetaUser: true,
      isWaitlisted: false,
      ...data,
    },
  });
}

export async function createTeam(data?: Prisma.TeamCreateInput): Promise<Team> {
  const n = nextValue();
  return db.team.create({
    data: {
      publicId: newId("teamPublic"),
      name: `Team ${n}`,
      ...data,
    },
  });
}

export async function attachUserToTeam(
  userId: number,
  teamId: number,
  role: Role = Role.ADMIN,
) {
  return db.teamUser.create({
    data: {
      userId,
      teamId,
      role,
    },
  });
}

export async function createTeamWithUser(role: Role = Role.ADMIN) {
  const user = await createUser();
  const team = await createTeam();
  const teamUser = await attachUserToTeam(user.id, team.id, role);

  return { user, team, teamUser };
}
