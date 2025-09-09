import { CampaignStatus, type ContactBook } from "@prisma/client";
import { db } from "../db";
import { LimitService } from "./limit-service";
import { UnsendApiError } from "../public-api/api-error";

export async function getContactBooks(teamId: number, search?: string) {
  return db.contactBook.findMany({
    where: {
      teamId,
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    },
    include: {
      _count: {
        select: { contacts: true },
      },
    },
  });
}

export async function createContactBook(teamId: number, name: string) {
  const { isLimitReached, reason } =
    await LimitService.checkContactBookLimit(teamId);

  if (isLimitReached) {
    throw new UnsendApiError({
      code: "FORBIDDEN",
      message: reason ?? "Contact book limit reached",
    });
  }

  const created = await db.contactBook.create({
    data: {
      name,
      teamId,
      properties: {},
    },
  });

  return created;
}

export async function getContactBookDetails(contactBookId: string) {
  const [totalContacts, unsubscribedContacts, campaigns] = await Promise.all([
    db.contact.count({
      where: { contactBookId },
    }),
    db.contact.count({
      where: { contactBookId, subscribed: false },
    }),
    db.campaign.findMany({
      where: {
        contactBookId,
        status: CampaignStatus.SENT,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 2,
    }),
  ]);

  return {
    totalContacts,
    unsubscribedContacts,
    campaigns,
  };
}

export async function updateContactBook(
  contactBookId: string,
  data: {
    name?: string;
    properties?: Record<string, string>;
    emoji?: string;
  }
) {
  return db.contactBook.update({
    where: { id: contactBookId },
    data,
  });
}

export async function deleteContactBook(contactBookId: string) {
  const deleted = await db.contactBook.delete({ where: { id: contactBookId } });

  return deleted;
}
