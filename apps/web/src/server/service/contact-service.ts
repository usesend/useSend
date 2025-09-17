import { db } from "../db";
import {
  sendDoubleOptInEmail,
  templateSupportsDoubleOptIn,
} from "./double-opt-in-service";
import { UnsendApiError } from "../public-api/api-error";

export type ContactInput = {
  email: string;
  firstName?: string;
  lastName?: string;
  properties?: Record<string, string>;
  subscribed?: boolean;
};

export async function addOrUpdateContact(
  contactBookId: string,
  contact: ContactInput
) {
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

  const existingContact = await db.contact.findUnique({
    where: {
      contactBookId_email: {
        contactBookId,
        email: contact.email,
      },
    },
  });

  const doubleOptInActive =
    contactBook.doubleOptInEnabled &&
    contactBook.doubleOptInTemplateId &&
    contactBook.defaultDomainId;

  if (doubleOptInActive) {
    if (!contactBook.doubleOptInTemplate || !contactBook.defaultDomain) {
      throw new UnsendApiError({
        code: "BAD_REQUEST",
        message: "Double opt-in configuration is incomplete",
      });
    }

    if (!templateSupportsDoubleOptIn(contactBook.doubleOptInTemplate)) {
      throw new UnsendApiError({
        code: "BAD_REQUEST",
        message: "Double opt-in template must include {{verificationUrl}}",
      });
    }
  }

  const requestedSubscribed =
    contact.subscribed === undefined ? true : contact.subscribed;

  const subscribedValue = doubleOptInActive
    ? existingContact?.subscribed ?? false
    : requestedSubscribed;

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
      subscribed: subscribedValue,
      ...(doubleOptInActive ? { unsubscribeReason: null } : {}),
    },
    update: {
      firstName: contact.firstName,
      lastName: contact.lastName,
      properties: contact.properties ?? {},
      subscribed: subscribedValue,
      ...(doubleOptInActive && requestedSubscribed
        ? { unsubscribeReason: null }
        : {}),
    },
  });

  const shouldSendDoubleOptInEmail =
    doubleOptInActive &&
    (!existingContact || (requestedSubscribed && existingContact.subscribed === false));

  if (shouldSendDoubleOptInEmail) {
    await sendDoubleOptInEmail({
      contact: createdContact,
      contactBook: contactBook as typeof contactBook & {
        doubleOptInEnabled: boolean;
      },
      template: contactBook.doubleOptInTemplate!,
      domain: contactBook.defaultDomain as typeof contactBook.defaultDomain & {
        defaultFrom: string | null;
      },
    });
  }

  return createdContact;
}

export async function updateContact(
  contactId: string,
  contact: Partial<ContactInput>
) {
  const existing = await db.contact.findUnique({
    where: { id: contactId },
    include: {
      contactBook: true,
    },
  });

  if (!existing) {
    throw new UnsendApiError({
      code: "NOT_FOUND",
      message: "Contact not found",
    });
  }

  const doubleOptInActive =
    existing.contactBook.doubleOptInEnabled &&
    existing.contactBook.doubleOptInTemplateId &&
    existing.contactBook.defaultDomainId;

  const data: Partial<ContactInput> & { subscribed?: boolean } = {
    ...contact,
  };

  if (doubleOptInActive && contact.subscribed) {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message: "Contact can only subscribe via confirmation link",
    });
  }

  if (doubleOptInActive && contact.subscribed === undefined) {
    delete data.subscribed;
  }

  return db.contact.update({
    where: {
      id: contactId,
    },
    data,
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
  contacts: Array<ContactInput>
) {
  const createdContacts = await Promise.all(
    contacts.map((contact) => addOrUpdateContact(contactBookId, contact))
  );

  return createdContacts;
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
