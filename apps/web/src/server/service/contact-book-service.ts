import { CampaignStatus } from "@prisma/client";
import { db } from "../db";
import { LimitService } from "./limit-service";
import { UnsendApiError } from "../public-api/api-error";
import {
  DEFAULT_DOUBLE_OPT_IN_CONTENT,
  DEFAULT_DOUBLE_OPT_IN_SUBJECT,
} from "~/lib/constants/double-opt-in";

export async function getContactBooks(teamId: number, search?: string) {
  return db.contactBook.findMany({
    where: {
      teamId,
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    },
    select: {
      id: true,
      name: true,
      teamId: true,
      properties: true,
      emoji: true,
      createdAt: true,
      updatedAt: true,
      doubleOptInEnabled: true,
      doubleOptInSubject: true,
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
      doubleOptInEnabled: true,
      doubleOptInSubject: DEFAULT_DOUBLE_OPT_IN_SUBJECT,
      doubleOptInContent: DEFAULT_DOUBLE_OPT_IN_CONTENT,
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
    doubleOptInEnabled?: boolean;
    doubleOptInSubject?: string;
    doubleOptInContent?: string;
  },
) {
  const updateData = { ...data };

  if (
    data.doubleOptInContent !== undefined &&
    !data.doubleOptInContent.trim()
  ) {
    updateData.doubleOptInContent = DEFAULT_DOUBLE_OPT_IN_CONTENT;
  }

  if (data.doubleOptInEnabled === true) {
    const contactBook = await db.contactBook.findUnique({
      where: { id: contactBookId },
      select: {
        doubleOptInSubject: true,
        doubleOptInContent: true,
      },
    });

    if (!updateData.doubleOptInSubject && !contactBook?.doubleOptInSubject) {
      updateData.doubleOptInSubject = DEFAULT_DOUBLE_OPT_IN_SUBJECT;
    }

    if (!updateData.doubleOptInContent && !contactBook?.doubleOptInContent) {
      updateData.doubleOptInContent = DEFAULT_DOUBLE_OPT_IN_CONTENT;
    }
  }

  return db.contactBook.update({
    where: { id: contactBookId },
    data: updateData,
  });
}

export async function deleteContactBook(contactBookId: string) {
  const deleted = await db.contactBook.delete({ where: { id: contactBookId } });

  return deleted;
}
