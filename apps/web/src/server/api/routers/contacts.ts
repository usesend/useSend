import { CampaignStatus, Prisma } from "@prisma/client";
import { z } from "zod";

import {
  contactBookProcedure,
  createTRPCRouter,
  teamProcedure,
} from "~/server/api/trpc";
import * as contactService from "~/server/service/contact-service";
import * as contactBookService from "~/server/service/contact-book-service";

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
      }),
    )
    .mutation(async ({ ctx: { team }, input }) => {
      const { name } = input;
      return contactBookService.createContactBook(team.id, name);
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
      }),
    )
    .query(async ({ ctx: { db }, input }) => {
      const page = input.page || 1;
      const limit = 30;
      const offset = (page - 1) * limit;

      const whereConditions: Prisma.ContactFindManyArgs["where"] = {
        contactBookId: input.contactBookId,
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
    .mutation(async ({ input }) => {
      const { contactId, ...contact } = input;
      return contactService.updateContact(contactId, contact);
    }),

  deleteContact: contactBookProcedure
    .input(z.object({ contactId: z.string() }))
    .mutation(async ({ input }) => {
      return contactService.deleteContact(input.contactId);
    }),

  // Find duplicate emails across contact books for the team
  findDuplicates: teamProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx: { db, team }, input }) => {
      const { page, limit } = input;
      const offset = (page - 1) * limit;

      // Find emails that appear in multiple contact books
      const duplicates = await db.$queryRaw<
        Array<{
          email: string;
          count: bigint;
          contactBookIds: string[];
          contactBookNames: string[];
        }>
      >`
        SELECT
          c.email,
          COUNT(DISTINCT c."contactBookId") as count,
          array_agg(DISTINCT c."contactBookId") as "contactBookIds",
          array_agg(DISTINCT cb.name) as "contactBookNames"
        FROM "Contact" c
        JOIN "ContactBook" cb ON c."contactBookId" = cb.id
        WHERE cb."teamId" = ${team.id}
        GROUP BY c.email
        HAVING COUNT(DISTINCT c."contactBookId") > 1
        ORDER BY count DESC, c.email ASC
        LIMIT ${limit}
        OFFSET ${offset}
      `;

      // Get total count of duplicates
      const totalResult = await db.$queryRaw<Array<{ total: bigint }>>`
        SELECT COUNT(*) as total FROM (
          SELECT c.email
          FROM "Contact" c
          JOIN "ContactBook" cb ON c."contactBookId" = cb.id
          WHERE cb."teamId" = ${team.id}
          GROUP BY c.email
          HAVING COUNT(DISTINCT c."contactBookId") > 1
        ) duplicates
      `;

      const total = Number(totalResult[0]?.total ?? 0);

      return {
        duplicates: duplicates.map((d) => ({
          email: d.email,
          count: Number(d.count),
          contactBookIds: d.contactBookIds,
          contactBookNames: d.contactBookNames,
        })),
        pagination: {
          page,
          limit,
          totalCount: total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      };
    }),

  // Get details of a duplicate email across contact books
  getDuplicateDetails: teamProcedure
    .input(z.object({ email: z.string().email() }))
    .query(async ({ ctx: { db, team }, input }) => {
      const contacts = await db.contact.findMany({
        where: {
          email: input.email,
          contactBook: {
            teamId: team.id,
          },
        },
        include: {
          contactBook: {
            select: {
              id: true,
              name: true,
              emoji: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return contacts;
    }),

  // Merge duplicate contacts (keep one, delete others)
  mergeDuplicates: teamProcedure
    .input(
      z.object({
        email: z.string().email(),
        keepContactId: z.string(),
        deleteContactIds: z.array(z.string()).min(1),
      }),
    )
    .mutation(async ({ ctx: { db, team }, input }) => {
      // Verify all contacts belong to the team
      const contacts = await db.contact.findMany({
        where: {
          id: { in: [input.keepContactId, ...input.deleteContactIds] },
          email: input.email,
          contactBook: {
            teamId: team.id,
          },
        },
      });

      if (contacts.length !== input.deleteContactIds.length + 1) {
        throw new Error("Some contacts not found or do not belong to your team");
      }

      // Delete the duplicate contacts
      await db.contact.deleteMany({
        where: {
          id: { in: input.deleteContactIds },
        },
      });

      return { deleted: input.deleteContactIds.length };
    }),

  exportContacts: contactBookProcedure
    .input(
      z.object({
        subscribed: z.boolean().optional(),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx: { db }, input }) => {
      const whereConditions: Prisma.ContactFindManyArgs["where"] = {
        contactBookId: input.contactBookId,
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
});
