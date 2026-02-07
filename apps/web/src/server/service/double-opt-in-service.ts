import { DomainStatus } from "@prisma/client";
import { createHash } from "crypto";
import { EmailRenderer } from "@usesend/email-editor/src/renderer";
import { env } from "~/env";
import {
  DEFAULT_DOUBLE_OPT_IN_CONTENT,
  DEFAULT_DOUBLE_OPT_IN_SUBJECT,
} from "~/lib/constants/double-opt-in";
import { db } from "../db";
import { logger } from "../logger/log";
import { sendEmail } from "./email-service";

const DOUBLE_OPT_IN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

function createDoubleOptInHash(contactId: string, expiresAt: number) {
  return createHash("sha256")
    .update(`${contactId}-${expiresAt}-${env.NEXTAUTH_SECRET}`)
    .digest("hex");
}

function replaceTemplateTokens(
  value: string,
  variables: Record<string, string | undefined>,
) {
  return Object.entries(variables).reduce((acc, [key, replacement]) => {
    if (!replacement) {
      return acc;
    }

    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const tokenRegex = new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, "gi");
    return acc.replace(tokenRegex, replacement);
  }, value);
}

function createDoubleOptInConfirmationUrl(contactId: string) {
  const expiresAt = Date.now() + DOUBLE_OPT_IN_EXPIRY_MS;
  const hash = createDoubleOptInHash(contactId, expiresAt);
  const searchParams = new URLSearchParams({
    contactId,
    expiresAt: String(expiresAt),
    hash,
  });

  return `${env.NEXTAUTH_URL}/subscribe?${searchParams.toString()}`;
}

export async function sendDoubleOptInConfirmationEmail({
  contactId,
  contactBookId,
  teamId,
}: {
  contactId: string;
  contactBookId: string;
  teamId: number;
}) {
  const contact = await db.contact.findUnique({
    where: { id: contactId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      contactBookId: true,
      contactBook: {
        select: {
          id: true,
          name: true,
          doubleOptInEnabled: true,
          doubleOptInSubject: true,
          doubleOptInContent: true,
        },
      },
    },
  });

  if (!contact || contact.contactBookId !== contactBookId) {
    throw new Error("Contact not found for double opt-in email");
  }

  if (!contact.contactBook.doubleOptInEnabled) {
    return;
  }

  const domain = await db.domain.findFirst({
    where: {
      teamId,
      status: DomainStatus.SUCCESS,
    },
    select: {
      name: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (!domain) {
    throw new Error(
      "Double opt-in requires at least one verified domain to send confirmation emails",
    );
  }

  const confirmationUrl = createDoubleOptInConfirmationUrl(contact.id);

  const variableValues: Record<string, string> = {
    email: contact.email,
    firstName: contact.firstName ?? "",
    lastName: contact.lastName ?? "",
    doubleOptInUrl: confirmationUrl,
  };

  const content =
    contact.contactBook.doubleOptInContent ?? DEFAULT_DOUBLE_OPT_IN_CONTENT;

  let html: string;

  try {
    const renderer = new EmailRenderer(JSON.parse(content));
    html = await renderer.render({
      shouldReplaceVariableValues: true,
      variableValues,
      linkValues: {
        "{{doubleOptInUrl}}": confirmationUrl,
        doubleOptInUrl: confirmationUrl,
      },
    });
  } catch (error) {
    logger.error(
      {
        error,
        contactBookId,
      },
      "[DoubleOptInService]: Failed to render custom template, using fallback HTML",
    );

    html = `<p>Please confirm your subscription by clicking <a href="${confirmationUrl}">this link</a>.</p>`;
  }

  const subject = replaceTemplateTokens(
    contact.contactBook.doubleOptInSubject ?? DEFAULT_DOUBLE_OPT_IN_SUBJECT,
    variableValues,
  );

  await sendEmail({
    to: contact.email,
    from: `hello@${domain.name}`,
    subject,
    html: replaceTemplateTokens(html, { doubleOptInUrl: confirmationUrl }),
    teamId,
  });
}

export async function confirmDoubleOptInSubscription({
  contactId,
  expiresAt,
  hash,
}: {
  contactId: string;
  expiresAt: string;
  hash: string;
}) {
  const expiresAtTimestamp = Number(expiresAt);

  if (!Number.isFinite(expiresAtTimestamp)) {
    throw new Error("Invalid confirmation link");
  }

  if (Date.now() > expiresAtTimestamp) {
    throw new Error("Confirmation link has expired");
  }

  const expectedHash = createDoubleOptInHash(contactId, expiresAtTimestamp);
  if (hash !== expectedHash) {
    throw new Error("Invalid confirmation link");
  }

  const existingContact = await db.contact.findUnique({
    where: { id: contactId },
  });

  if (!existingContact) {
    throw new Error("Contact not found");
  }

  if (existingContact.subscribed) {
    return existingContact;
  }

  return db.contact.update({
    where: { id: contactId },
    data: {
      subscribed: true,
      unsubscribeReason: null,
    },
  });
}
