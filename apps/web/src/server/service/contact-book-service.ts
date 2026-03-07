import { CampaignStatus } from "@prisma/client";
import {
  DEFAULT_DOUBLE_OPT_IN_CONTENT,
  DEFAULT_DOUBLE_OPT_IN_SUBJECT,
  hasDoubleOptInUrlPlaceholder,
} from "~/lib/constants/double-opt-in";
import { db } from "../db";
import { UnsendApiError } from "../public-api/api-error";
import { validateDomainFromEmail } from "./domain-service";
import { LimitService } from "./limit-service";
import {
  normalizeContactBookVariables,
  validateContactBookVariables,
} from "./contact-variable-service";

type ContactBookDbClient = Pick<typeof db, "contactBook">;

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
      variables: true,
      emoji: true,
      createdAt: true,
      updatedAt: true,
      doubleOptInEnabled: true,
      doubleOptInFrom: true,
      doubleOptInSubject: true,
      doubleOptInContent: true,
      _count: {
        select: { contacts: true },
      },
    },
  });
}

export async function createContactBook(
  teamId: number,
  name: string,
  variables?: string[],
  client: ContactBookDbClient = db,
) {
  const { isLimitReached, reason } =
    await LimitService.checkContactBookLimit(teamId);

  if (isLimitReached) {
    throw new UnsendApiError({
      code: "FORBIDDEN",
      message: reason ?? "Contact book limit reached",
    });
  }

  const normalizedVariables = normalizeContactBookVariables(variables);

  try {
    validateContactBookVariables(normalizedVariables);
  } catch (error) {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message: error instanceof Error ? error.message : "Invalid variables",
    });
  }

  const created = await client.contactBook.create({
    data: {
      name,
      teamId,
      properties: {},
      variables: normalizedVariables,
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
    variables?: string[];
    doubleOptInEnabled?: boolean;
    doubleOptInFrom?: string | null;
    doubleOptInSubject?: string;
    doubleOptInContent?: string;
  },
  client: ContactBookDbClient = db,
) {
  const restData = { ...data };
  delete restData.variables;

  const normalizedVariables =
    data.variables === undefined
      ? undefined
      : normalizeContactBookVariables(data.variables);

  if (normalizedVariables !== undefined) {
    try {
      validateContactBookVariables(normalizedVariables);
    } catch (error) {
      throw new UnsendApiError({
        code: "BAD_REQUEST",
        message: error instanceof Error ? error.message : "Invalid variables",
      });
    }
  }

  const updateData: {
    name?: string;
    properties?: Record<string, string>;
    emoji?: string;
    variables?: string[];
    doubleOptInEnabled?: boolean;
    doubleOptInSubject?: string;
    doubleOptInContent?: string;
  } = {
    ...restData,
    ...(normalizedVariables !== undefined
      ? { variables: normalizedVariables }
      : {}),
  };

  if (data.doubleOptInFrom !== undefined) {
    const normalizedFrom = data.doubleOptInFrom?.trim() ?? "";

    if (!normalizedFrom) {
      updateData.doubleOptInFrom = null;
    } else {
      const contactBook = await client.contactBook.findUnique({
        where: { id: contactBookId },
        select: { teamId: true },
      });

      if (!contactBook) {
        throw new UnsendApiError({
          code: "BAD_REQUEST",
          message: "Contact book not found",
        });
      }

      await validateDomainFromEmail(normalizedFrom, contactBook.teamId);
      updateData.doubleOptInFrom = normalizedFrom;
    }
  }

  if (
    data.doubleOptInContent !== undefined &&
    !data.doubleOptInContent.trim()
  ) {
    updateData.doubleOptInContent = DEFAULT_DOUBLE_OPT_IN_CONTENT;
  } else if (
    data.doubleOptInContent !== undefined &&
    !hasDoubleOptInUrlPlaceholder(data.doubleOptInContent)
  ) {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message:
        "Double opt-in email content must include the {{doubleOptInUrl}} placeholder",
    });
  }

  if (
    data.doubleOptInSubject !== undefined &&
    !data.doubleOptInSubject.trim()
  ) {
    updateData.doubleOptInSubject = DEFAULT_DOUBLE_OPT_IN_SUBJECT;
  }

  if (data.doubleOptInEnabled === true) {
    const contactBook = await client.contactBook.findUnique({
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

  return client.contactBook.update({
    where: { id: contactBookId },
    data: updateData,
  });
}

export async function deleteContactBook(contactBookId: string) {
  const deleted = await db.contactBook.delete({ where: { id: contactBookId } });

  return deleted;
}
