import { CampaignStatus } from "@prisma/client";
import { db } from "../db";
import { LimitService } from "./limit-service";
import { UnsendApiError } from "../public-api/api-error";
import {
  assertTemplateSupportsDoubleOptIn,
  templateSupportsDoubleOptIn,
} from "./double-opt-in-service";
import { getVerifiedDomains } from "./domain-service";

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
    defaultDomainId?: number | null;
    doubleOptInEnabled?: boolean;
    doubleOptInTemplateId?: string | null;
  }
) {
  const contactBook = await db.contactBook.findUnique({
    where: { id: contactBookId },
  });

  if (!contactBook) {
    throw new UnsendApiError({
      code: "NOT_FOUND",
      message: "Contact book not found",
    });
  }

  const nextDoubleOptInEnabled =
    data.doubleOptInEnabled ?? contactBook.doubleOptInEnabled;
  const nextTemplateId =
    data.doubleOptInTemplateId ?? contactBook.doubleOptInTemplateId;
  const nextDomainId = data.defaultDomainId ?? contactBook.defaultDomainId;

  if (nextDoubleOptInEnabled) {
    if (!nextDomainId) {
      throw new UnsendApiError({
        code: "BAD_REQUEST",
        message: "Select a verified domain before enabling double opt-in",
      });
    }

    const domain = await db.domain.findFirst({
      where: {
        id: nextDomainId,
        teamId: contactBook.teamId,
        status: "SUCCESS",
      },
    });

    if (!domain) {
      throw new UnsendApiError({
        code: "BAD_REQUEST",
        message: "Domain must be verified before enabling double opt-in",
      });
    }

    if (!nextTemplateId) {
      throw new UnsendApiError({
        code: "BAD_REQUEST",
        message: "Select a template before enabling double opt-in",
      });
    }

    const template = await db.template.findFirst({
      where: {
        id: nextTemplateId,
        teamId: contactBook.teamId,
      },
    });

    if (!template) {
      throw new UnsendApiError({
        code: "BAD_REQUEST",
        message: "Template not found",
      });
    }

    assertTemplateSupportsDoubleOptIn(template);
  }

  return db.contactBook.update({
    where: { id: contactBookId },
    data,
  });
}

export async function deleteContactBook(contactBookId: string) {
  const deleted = await db.contactBook.delete({ where: { id: contactBookId } });

  return deleted;
}

export async function getContactBookSettings(contactBookId: string) {
  const contactBook = await db.contactBook.findUnique({
    where: { id: contactBookId },
    include: {
      defaultDomain: true,
      doubleOptInTemplate: true,
    },
  });

  if (!contactBook) {
    throw new UnsendApiError({
      code: "NOT_FOUND",
      message: "Contact book not found",
    });
  }

  const [domains, templates] = await Promise.all([
    getVerifiedDomains(contactBook.teamId),
    db.template.findMany({
      where: { teamId: contactBook.teamId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        subject: true,
        html: true,
        content: true,
        createdAt: true,
      },
    }),
  ]);

  const eligibleTemplates = templates.filter((template) =>
    templateSupportsDoubleOptIn(template)
  );

  return {
    contactBook,
    domains,
    templates: eligibleTemplates,
  };
}
