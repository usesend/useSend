import { createHash } from "crypto";
import type { Contact, ContactBook, Domain, Template } from "@prisma/client";

import { env } from "~/env";
import { db } from "../db";
import { logger } from "../logger/log";
import { resolveFromAddress } from "./domain-service";
import { UnsendApiError } from "../public-api/api-error";
import { sendEmail } from "./email-service";

export const DOUBLE_OPT_IN_PLACEHOLDER = "{{verificationUrl}}";
export const DOUBLE_OPT_IN_ROUTE = "/confirm";

type ContactBookWithSettings = ContactBook & {
  defaultDomainId: number | null;
  doubleOptInEnabled: boolean;
  doubleOptInTemplateId: string | null;
};

type DomainWithDefaultFrom = Domain & { defaultFrom: string | null };

type TemplateWithContent = Template & { content: string | null; html: string | null };

export function createDoubleOptInIdentifier(
  contactId: string,
  contactBookId: string
) {
  return `${contactId}-${contactBookId}`;
}

function createDoubleOptInHash(identifier: string) {
  return createHash("sha256")
    .update(`${identifier}-${env.NEXTAUTH_SECRET}`)
    .digest("hex");
}

export function createDoubleOptInUrl(
  contactId: string,
  contactBookId: string
) {
  const identifier = createDoubleOptInIdentifier(contactId, contactBookId);
  const hash = createDoubleOptInHash(identifier);

  return `${env.NEXTAUTH_URL}${DOUBLE_OPT_IN_ROUTE}?id=${identifier}&hash=${hash}`;
}

export function templateSupportsDoubleOptIn(template: {
  html: string | null;
  content: string | null;
}) {
  if (template.html && template.html.includes(DOUBLE_OPT_IN_PLACEHOLDER)) {
    return true;
  }

  if (!template.content) {
    return false;
  }

  if (template.content.includes(DOUBLE_OPT_IN_PLACEHOLDER)) {
    return true;
  }

  try {
    const parsed = JSON.stringify(JSON.parse(template.content));
    return parsed.includes(DOUBLE_OPT_IN_PLACEHOLDER);
  } catch (error) {
    logger.warn(
      { err: error },
      "Failed to parse template content while checking double opt-in support"
    );
    return false;
  }
}

export function assertTemplateSupportsDoubleOptIn(template: TemplateWithContent) {
  if (!templateSupportsDoubleOptIn(template)) {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message:
        "Selected template must include the {{verificationUrl}} placeholder",
    });
  }
}

export async function sendDoubleOptInEmail(options: {
  contact: Contact;
  contactBook: ContactBookWithSettings;
  template: TemplateWithContent;
  domain: DomainWithDefaultFrom;
}) {
  const { contact, contactBook, template, domain } = options;

  if (!contactBook.doubleOptInEnabled) {
    return;
  }

  if (!contactBook.doubleOptInTemplateId || !contactBook.defaultDomainId) {
    logger.warn(
      {
        contactBookId: contactBook.id,
        contactId: contact.id,
      },
      "Skipped sending double opt-in email because configuration is incomplete"
    );
    return;
  }

  assertTemplateSupportsDoubleOptIn(template);

  const verificationUrl = createDoubleOptInUrl(contact.id, contactBook.id);
  const fromAddress = resolveFromAddress(domain);

  await sendEmail({
    teamId: contactBook.teamId,
    to: contact.email,
    from: fromAddress,
    templateId: template.id,
    variables: {
      verificationUrl,
    },
  });
}

export async function confirmContactFromLink(id: string, hash: string) {
  const expectedHash = createDoubleOptInHash(id);

  if (hash !== expectedHash) {
    throw new Error("Invalid confirmation link");
  }

  const [contactId, contactBookId] = id.split("-");

  if (!contactId || !contactBookId) {
    throw new Error("Invalid confirmation link");
  }

  const contact = await db.contact.findUnique({
    where: { id: contactId },
    include: {
      contactBook: true,
    },
  });

  if (!contact || contact.contactBookId !== contactBookId) {
    throw new Error("Invalid confirmation link");
  }

  if (!contact.contactBook.doubleOptInEnabled) {
    return { contact, confirmed: contact.subscribed };
  }

  if (contact.subscribed) {
    return { contact, confirmed: true };
  }

  const updated = await db.contact.update({
    where: { id: contact.id },
    data: {
      subscribed: true,
      unsubscribeReason: null,
    },
  });

  return { contact: updated, confirmed: true };
}
