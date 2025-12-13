import { db } from "../db";
import { ContactQueueService } from "./contact-queue-service";

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

  const createdContact = await db.contact.upsert({
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

  return createdContact;
}

export async function updateContact(
  contactId: string,
  contact: Partial<ContactInput>,
) {
  return db.contact.update({
    where: {
      id: contactId,
    },
    data: contact,
  });
}

export async function deleteContact(contactId: string) {
  return db.contact.delete({
    where: {
      id: contactId,
    },
  });
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
