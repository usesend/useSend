import { type Contact } from "@prisma/client";
import {
  type ContactPayload,
  type ContactWebhookEventType,
} from "@usesend/lib/src/webhook/webhook-events";
import { db } from "../db";
import { ContactQueueService } from "./contact-queue-service";
import { WebhookService } from "./webhook-service";
import { logger } from "../logger/log";

export type ContactInput = {
  email: string;
  firstName?: string;
  lastName?: string;
  properties?: Record<string, string>;
  subscribed?: boolean;
};

export async function addOrUpdateContact(
  contactBookId: string,
  contact: ContactInput,
  teamId?: number,
) {
  // Check if contact exists to handle subscribed logic
  const existingContact = await db.contact.findUnique({
    where: {
      contactBookId_email: {
        contactBookId,
        email: contact.email,
      },
    },
    select: {
      subscribed: true,
    },
  });

  // Determine subscribed value for update
  // Only allow Yes→No transitions (allow unsubscribe, prevent re-subscribe)
  let subscribedValue: boolean | undefined = contact.subscribed;
  if (existingContact && contact.subscribed !== undefined) {
    // Block No→Yes (prevent re-subscribe via CSV), allow all other transitions
    if (!existingContact.subscribed && contact.subscribed) {
      subscribedValue = undefined; // Block re-subscribe
    }
    // All other cases (Yes→No, Yes→Yes, No→No) are allowed naturally
  }

  const savedContact = await db.contact.upsert({
    where: {
      contactBookId_email: {
        contactBookId,
        email: contact.email,
      },
    },
    create: {
      contactBookId,
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
      properties: contact.properties ?? {},
      subscribed: contact.subscribed ?? true, // Default to subscribed for new contacts
    },
    update: {
      firstName: contact.firstName,
      lastName: contact.lastName,
      properties: contact.properties ?? {},
      ...(subscribedValue !== undefined ? { subscribed: subscribedValue } : {}),
    },
  });

  const eventType: ContactWebhookEventType = existingContact
    ? "contact.updated"
    : "contact.created";

  await emitContactEvent(savedContact, eventType, teamId);

  return savedContact;
}

export async function getContactInContactBook(
  contactId: string,
  contactBookId: string,
) {
  return db.contact.findFirst({
    where: {
      id: contactId,
      contactBookId,
    },
  });
}

export async function updateContactInContactBook(
  contactId: string,
  contactBookId: string,
  contact: Partial<ContactInput>,
  teamId?: number,
) {
  const existingContact = await getContactInContactBook(
    contactId,
    contactBookId,
  );

  if (!existingContact) {
    return null;
  }

  const updatedContact = await db.contact.update({
    where: {
      id: contactId,
    },
    data: contact,
  });

  await emitContactEvent(updatedContact, "contact.updated", teamId);

  return updatedContact;
}

export async function deleteContactInContactBook(
  contactId: string,
  contactBookId: string,
  teamId?: number,
) {
  const existingContact = await getContactInContactBook(
    contactId,
    contactBookId,
  );

  if (!existingContact) {
    return null;
  }

  const deletedContact = await db.contact.delete({
    where: {
      id: contactId,
    },
  });

  await emitContactEvent(deletedContact, "contact.deleted", teamId);

  return deletedContact;
}

export async function bulkAddContacts(
  contactBookId: string,
  contacts: Array<ContactInput>,
  teamId?: number,
) {
  await ContactQueueService.addBulkContactJobs(contactBookId, contacts, teamId);

  return {
    message: `Queued ${contacts.length} contacts for processing`,
    count: contacts.length,
  };
}

export async function unsubscribeContact(contactId: string) {
  await db.contact.update({
    where: {
      id: contactId,
    },
    data: {
      subscribed: false,
    },
  });
}

export async function subscribeContact(contactId: string) {
  await db.contact.update({
    where: {
      id: contactId,
    },
    data: {
      subscribed: true,
    },
  });
}

function buildContactPayload(contact: Contact): ContactPayload {
  return {
    id: contact.id,
    email: contact.email,
    contactBookId: contact.contactBookId,
    subscribed: contact.subscribed,
    properties: (contact.properties ?? {}) as Record<string, unknown>,
    firstName: contact.firstName,
    lastName: contact.lastName,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}

async function emitContactEvent(
  contact: Contact,
  type: ContactWebhookEventType,
  teamId?: number,
) {
  try {
    const resolvedTeamId =
      teamId ??
      (await db.contactBook
        .findUnique({
          where: { id: contact.contactBookId },
          select: { teamId: true },
        })
        .then((contactBook) => contactBook?.teamId));

    if (!resolvedTeamId) {
      logger.warn(
        { contactId: contact.id },
        "[ContactService]: Skipping webhook emission, teamId not found",
      );
      return;
    }

    await WebhookService.emit(
      resolvedTeamId,
      type,
      buildContactPayload(contact),
    );
  } catch (error) {
    logger.error(
      { error, contactId: contact.id, type },
      "[ContactService]: Failed to emit contact webhook event",
    );
  }
}
