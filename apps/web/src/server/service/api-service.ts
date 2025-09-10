import { ApiPermission } from "@prisma/client";
import { db } from "../db";
import { randomBytes } from "crypto";
import { smallNanoid } from "../nanoid";
import { createSecureHash, verifySecureHash } from "../crypto";
import { logger } from "../logger/log";

export async function addApiKey({
  name,
  permission,
  teamId,
  domainId,
}: {
  name: string;
  permission: ApiPermission;
  teamId: number;
  domainId?: number;
}) {
  try {
    // Validate domain ownership if domainId is provided
    if (domainId !== undefined) {
      const domain = await db.domain.findUnique({
        where: { 
          id: domainId,
          teamId: teamId 
        },
        select: { id: true },
      });
      
      if (!domain) {
        throw new Error("DOMAIN_NOT_FOUND");
      }
    }

    const clientId = smallNanoid(10);
    const token = randomBytes(16).toString("hex");
    const hashedToken = await createSecureHash(token);

    const apiKey = `us_${clientId}_${token}`;

    await db.apiKey.create({
      data: {
        name,
        permission: permission,
        teamId,
        domainId,
        tokenHash: hashedToken,
        partialToken: `${apiKey.slice(0, 6)}...${apiKey.slice(-3)}`,
        clientId,
      },
    });
    return apiKey;
  } catch (error) {
    logger.error({ err: error }, "Error adding API key");
    throw error;
  }
}

export async function getTeamAndApiKey(apiKey: string) {
  const [, clientId, token] = apiKey.split("_") as [string, string, string];

  const apiKeyRow = await db.apiKey.findUnique({
    where: {
      clientId,
    },
    include: {
      domain: {
        select: { id: true, name: true },
      },
    },
  });

  if (!apiKeyRow) {
    return null;
  }

  try {
    const isValid = await verifySecureHash(token, apiKeyRow.tokenHash);
    if (!isValid) {
      return null;
    }

    const team = await db.team.findUnique({
      where: {
        id: apiKeyRow.teamId,
      },
    });

    return { team, apiKey: apiKeyRow };
  } catch (error) {
    logger.error({ err: error }, "Error verifying API key");
    return null;
  }
}

export async function deleteApiKey(id: number) {
  try {
    await db.apiKey.delete({
      where: {
        id,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error deleting API key");
    throw error;
  }
}
