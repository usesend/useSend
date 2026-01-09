import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  contactBookProcedure,
  createTRPCRouter,
} from "~/server/api/trpc";

// Filter condition schema
const filterConditionSchema = z.object({
  field: z.enum([
    "email",
    "firstName",
    "lastName",
    "subscribed",
    "createdAt",
    "property",
  ]),
  operator: z.enum([
    "equals",
    "not_equals",
    "contains",
    "not_contains",
    "starts_with",
    "ends_with",
    "is_empty",
    "is_not_empty",
    "greater_than",
    "less_than",
    "is_true",
    "is_false",
  ]),
  value: z.union([z.string(), z.boolean(), z.number()]).optional(),
  propertyKey: z.string().optional(), // For property field filters
});

const filtersSchema = z.array(filterConditionSchema);

type FilterCondition = z.infer<typeof filterConditionSchema>;

// Build Prisma where clause from filters
function buildWhereClause(
  contactBookId: string,
  filters: FilterCondition[],
): Prisma.ContactWhereInput {
  const conditions: Prisma.ContactWhereInput[] = [{ contactBookId }];

  for (const filter of filters) {
    const condition = buildCondition(filter);
    if (condition) {
      conditions.push(condition);
    }
  }

  return { AND: conditions };
}

function buildCondition(filter: FilterCondition): Prisma.ContactWhereInput | null {
  const { field, operator, value, propertyKey } = filter;

  // Handle subscribed field (boolean)
  if (field === "subscribed") {
    if (operator === "is_true") {
      return { subscribed: true };
    }
    if (operator === "is_false") {
      return { subscribed: false };
    }
    return null;
  }

  // Handle createdAt field (date)
  if (field === "createdAt") {
    if (!value) return null;
    const dateValue = new Date(String(value));
    if (operator === "greater_than") {
      return { createdAt: { gte: dateValue } };
    }
    if (operator === "less_than") {
      return { createdAt: { lte: dateValue } };
    }
    return null;
  }

  // Handle property field (JSON)
  if (field === "property" && propertyKey) {
    const path = ["properties", propertyKey];
    if (operator === "equals") {
      return { properties: { path, equals: value } };
    }
    if (operator === "not_equals") {
      return { NOT: { properties: { path, equals: value } } };
    }
    if (operator === "contains" && typeof value === "string") {
      return { properties: { path, string_contains: value } };
    }
    return null;
  }

  // Handle string fields (email, firstName, lastName)
  const stringValue = String(value ?? "");

  switch (operator) {
    case "equals":
      return { [field]: stringValue };
    case "not_equals":
      return { NOT: { [field]: stringValue } };
    case "contains":
      return { [field]: { contains: stringValue, mode: "insensitive" } };
    case "not_contains":
      return { NOT: { [field]: { contains: stringValue, mode: "insensitive" } } };
    case "starts_with":
      return { [field]: { startsWith: stringValue, mode: "insensitive" } };
    case "ends_with":
      return { [field]: { endsWith: stringValue, mode: "insensitive" } };
    case "is_empty":
      return { OR: [{ [field]: null }, { [field]: "" }] };
    case "is_not_empty":
      return { AND: [{ [field]: { not: null } }, { NOT: { [field]: "" } }] };
    default:
      return null;
  }
}

export const segmentRouter = createTRPCRouter({
  // List segments for a contact book
  list: contactBookProcedure.query(async ({ ctx: { db }, input }) => {
    const segments = await db.segment.findMany({
      where: { contactBookId: input.contactBookId },
      orderBy: { createdAt: "desc" },
    });

    // Get contact counts for each segment
    const segmentsWithCounts = await Promise.all(
      segments.map(async (segment) => {
        const filters = segment.filters as FilterCondition[];
        const where = buildWhereClause(segment.contactBookId, filters);
        const count = await db.contact.count({ where });
        return { ...segment, contactCount: count };
      }),
    );

    return segmentsWithCounts;
  }),

  // Get a single segment with contact count
  get: contactBookProcedure
    .input(z.object({ segmentId: z.string() }))
    .query(async ({ ctx: { db }, input }) => {
      const segment = await db.segment.findUnique({
        where: { id: input.segmentId },
      });

      if (!segment || segment.contactBookId !== input.contactBookId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Segment not found",
        });
      }

      const filters = segment.filters as FilterCondition[];
      const where = buildWhereClause(segment.contactBookId, filters);
      const contactCount = await db.contact.count({ where });

      return { ...segment, contactCount };
    }),

  // Create a new segment
  create: contactBookProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        filters: filtersSchema,
      }),
    )
    .mutation(async ({ ctx: { db }, input }) => {
      const segment = await db.segment.create({
        data: {
          name: input.name,
          description: input.description,
          contactBookId: input.contactBookId,
          filters: input.filters,
        },
      });

      return segment;
    }),

  // Update a segment
  update: contactBookProcedure
    .input(
      z.object({
        segmentId: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        filters: filtersSchema.optional(),
      }),
    )
    .mutation(async ({ ctx: { db }, input }) => {
      const existing = await db.segment.findUnique({
        where: { id: input.segmentId },
      });

      if (!existing || existing.contactBookId !== input.contactBookId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Segment not found",
        });
      }

      const segment = await db.segment.update({
        where: { id: input.segmentId },
        data: {
          name: input.name,
          description: input.description,
          filters: input.filters,
        },
      });

      return segment;
    }),

  // Delete a segment
  delete: contactBookProcedure
    .input(z.object({ segmentId: z.string() }))
    .mutation(async ({ ctx: { db }, input }) => {
      const existing = await db.segment.findUnique({
        where: { id: input.segmentId },
      });

      if (!existing || existing.contactBookId !== input.contactBookId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Segment not found",
        });
      }

      await db.segment.delete({ where: { id: input.segmentId } });
      return { success: true };
    }),

  // Preview contacts matching filters (without saving)
  preview: contactBookProcedure
    .input(
      z.object({
        filters: filtersSchema,
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx: { db }, input }) => {
      const where = buildWhereClause(input.contactBookId, input.filters);
      const offset = (input.page - 1) * input.limit;

      const [contacts, total] = await Promise.all([
        db.contact.findMany({
          where,
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            subscribed: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          skip: offset,
          take: input.limit,
        }),
        db.contact.count({ where }),
      ]);

      return {
        contacts,
        total,
        page: input.page,
        totalPages: Math.ceil(total / input.limit),
      };
    }),

  // Get contacts in a segment
  getContacts: contactBookProcedure
    .input(
      z.object({
        segmentId: z.string(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(30),
      }),
    )
    .query(async ({ ctx: { db }, input }) => {
      const segment = await db.segment.findUnique({
        where: { id: input.segmentId },
      });

      if (!segment || segment.contactBookId !== input.contactBookId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Segment not found",
        });
      }

      const filters = segment.filters as FilterCondition[];
      const where = buildWhereClause(segment.contactBookId, filters);
      const offset = (input.page - 1) * input.limit;

      const [contacts, total] = await Promise.all([
        db.contact.findMany({
          where,
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            subscribed: true,
            createdAt: true,
            properties: true,
          },
          orderBy: { createdAt: "desc" },
          skip: offset,
          take: input.limit,
        }),
        db.contact.count({ where }),
      ]);

      return {
        contacts,
        total,
        page: input.page,
        totalPages: Math.ceil(total / input.limit),
      };
    }),
});
