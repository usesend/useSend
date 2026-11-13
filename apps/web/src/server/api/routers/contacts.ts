import { CampaignStatus, Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  contactBookProcedure,
  createTRPCRouter,
  teamProcedure,
} from "~/server/api/trpc";
import * as contactService from "~/server/service/contact-service";
import * as contactBookService from "~/server/service/contact-book-service";
import * as contactSegmentService from "~/server/service/contact-segment-service";
import { contactSegmentDefinitionSchema } from "~/lib/contact-segments";

export const contactsRouter = createTRPCRouter({
  getContactBooks: teamProcedure
    .input(z.object({ search: z.string().optional() }))
    .query(async ({ ctx: { team }, input }) => {
      return contactBookService.getContactBooks(team.id, input.search);
    }),

  createContactBook: teamProcedure
    .input(
      z.object({
        name: z.string(),
        variables: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx: { team }, input }) => {
      const { name, variables } = input;
      return contactBookService.createContactBook(team.id, name, variables);
    }),

  getContactBookDetails: contactBookProcedure.query(
    async ({ ctx: { contactBook } }) => {
      const { totalContacts, unsubscribedContacts, campaigns } =
        await contactBookService.getContactBookDetails(contactBook.id);

      return {
        ...contactBook,
        totalContacts,
        unsubscribedContacts,
        campaigns,
      };
    },
  ),

  updateContactBook: contactBookProcedure
    .input(
      z.object({
        contactBookId: z.string(),
        name: z.string().optional(),
        properties: z.record(z.string()).optional(),
        emoji: z.string().optional(),
        doubleOptInEnabled: z.boolean().optional(),
        doubleOptInFrom: z.string().nullable().optional(),
        doubleOptInSubject: z.string().optional(),
        doubleOptInContent: z.string().optional(),
        variables: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx: { contactBook }, input }) => {
      const { contactBookId, ...data } = input;
      return contactBookService.updateContactBook(contactBook.id, data);
    }),

  deleteContactBook: contactBookProcedure
    .input(z.object({ contactBookId: z.string() }))
    .mutation(async ({ ctx: { contactBook }, input }) => {
      return contactBookService.deleteContactBook(contactBook.id);
    }),

  contacts: contactBookProcedure
    .input(
      z.object({
        page: z.number().optional(),
        subscribed: z.boolean().optional(),
        search: z.string().optional(),
        segmentId: z.string().optional(),
      }),
    )
    .query(async ({ ctx: { db, contactBook }, input }) => {
      const page = input.page || 1;
      const limit = 30;
      const offset = (page - 1) * limit;
      const segmentWhere = await contactSegmentService.getSegmentWhereInput({
        contactBookId: input.contactBookId,
        segmentId: input.segmentId,
        variables: contactBook.variables,
      });

      const whereConditions: Prisma.ContactFindManyArgs["where"] = {
        contactBookId: input.contactBookId,
        ...(segmentWhere ?? {}),
        ...(input.subscribed !== undefined
          ? { subscribed: input.subscribed }
          : {}),
        ...(input.search
          ? {
              OR: [
                { email: { contains: input.search, mode: "insensitive" } },
                { firstName: { contains: input.search, mode: "insensitive" } },
                { lastName: { contains: input.search, mode: "insensitive" } },
              ],
            }
          : {}),
      };

      const countP = db.contact.count({ where: whereConditions });

      const contactsP = db.contact.findMany({
        where: whereConditions,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          properties: true,
          subscribed: true,
          createdAt: true,
          contactBookId: true,
          unsubscribeReason: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        skip: offset,
        take: limit,
      });

      const [contacts, count] = await Promise.all([contactsP, countP]);

      return { contacts, totalPage: Math.ceil(count / limit) };
    }),

  addContacts: contactBookProcedure
    .input(
      z.object({
        contacts: z
          .array(
            z.object({
              email: z.string(),
              firstName: z.string().optional(),
              lastName: z.string().optional(),
              properties: z.record(z.string()).optional(),
              subscribed: z.boolean().optional(),
            }),
          )
          .max(50000),
      }),
    )
    .mutation(async ({ ctx: { contactBook, team }, input }) => {
      return contactService.bulkAddContacts(
        contactBook.id,
        input.contacts,
        team.id,
      );
    }),

  updateContact: contactBookProcedure
    .input(
      z.object({
        contactId: z.string(),
        email: z.string().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        properties: z.record(z.string()).optional(),
        subscribed: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx: { contactBook, team }, input }) => {
      const { contactId, ...contact } = input;
      const updatedContact = await contactService.updateContactInContactBook(
        contactId,
        contactBook.id,
        contact,
        team.id,
      );

      if (!updatedContact) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact not found",
        });
      }

      return updatedContact;
    }),

  deleteContact: contactBookProcedure
    .input(z.object({ contactId: z.string() }))
    .mutation(async ({ ctx: { contactBook, team }, input }) => {
      const deletedContact = await contactService.deleteContactInContactBook(
        input.contactId,
        contactBook.id,
        team.id,
      );

      if (!deletedContact) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact not found",
        });
      }

      return deletedContact;
    }),

  bulkDeleteContacts: contactBookProcedure
    .input(z.object({ contactIds: z.array(z.string()).min(1).max(1000) }))
    .mutation(async ({ ctx: { contactBook, team }, input }) => {
      const deletedContacts =
        await contactService.bulkDeleteContactsInContactBook(
          input.contactIds,
          contactBook.id,
          team.id,
        );

      return { count: deletedContacts.length };
    }),

  resendDoubleOptInConfirmation: contactBookProcedure
    .input(z.object({ contactId: z.string() }))
    .mutation(async ({ ctx: { contactBook, team }, input }) => {
      try {
        const contact =
          await contactService.resendDoubleOptInConfirmationInContactBook(
            input.contactId,
            contactBook.id,
            team.id,
          );

        if (!contact) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Contact not found",
          });
        }

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        if (
          error instanceof Error &&
          error.message ===
            "Double opt-in confirmation can only be resent to pending contacts"
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }

        throw error;
      }
    }),

  exportContacts: contactBookProcedure
    .input(
      z.object({
        subscribed: z.boolean().optional(),
        search: z.string().optional(),
        segmentId: z.string().optional(),
      }),
    )
    .query(async ({ ctx: { db, contactBook }, input }) => {
      const segmentWhere = await contactSegmentService.getSegmentWhereInput({
        contactBookId: input.contactBookId,
        segmentId: input.segmentId,
        variables: contactBook.variables,
      });

      const whereConditions: Prisma.ContactFindManyArgs["where"] = {
        contactBookId: input.contactBookId,
        ...(segmentWhere ?? {}),
        ...(input.subscribed !== undefined
          ? { subscribed: input.subscribed }
          : {}),
        ...(input.search
          ? {
              OR: [
                { email: { contains: input.search, mode: "insensitive" } },
                { firstName: { contains: input.search, mode: "insensitive" } },
                { lastName: { contains: input.search, mode: "insensitive" } },
              ],
            }
          : {}),
      };

      const contacts = await db.contact.findMany({
        where: whereConditions,
        select: {
          email: true,
          firstName: true,
          lastName: true,
          properties: true,
          subscribed: true,
          unsubscribeReason: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 100000, // Limit to 100k contacts to prevent memory issues
      });

      return contacts;
    }),

  listSegments: contactBookProcedure.query(async ({ ctx: { contactBook } }) => {
    return contactSegmentService.listSegments(contactBook.id);
  }),

  createSegment: contactBookProcedure
    .input(
      z.object({
        name: z.string().trim().min(1),
        definition: contactSegmentDefinitionSchema,
      }),
    )
    .mutation(async ({ ctx: { contactBook }, input }) => {
      return contactSegmentService.createSegment({
        contactBookId: contactBook.id,
        name: input.name,
        definition: input.definition,
      });
    }),

  updateSegment: contactBookProcedure
    .input(
      z.object({
        segmentId: z.string(),
        name: z.string().trim().min(1),
        definition: contactSegmentDefinitionSchema,
      }),
    )
    .mutation(async ({ ctx: { contactBook }, input }) => {
      return contactSegmentService.updateSegment({
        segmentId: input.segmentId,
        contactBookId: contactBook.id,
        name: input.name,
        definition: input.definition,
      });
    }),

  deleteSegment: contactBookProcedure
    .input(z.object({ segmentId: z.string() }))
    .mutation(async ({ ctx: { contactBook }, input }) => {
      return contactSegmentService.deleteSegment(
        input.segmentId,
        contactBook.id,
      );
    }),
});
