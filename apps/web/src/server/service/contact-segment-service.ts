import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import {
  contactSegmentDefinitionSchema,
  normalizeContactSegmentDefinition,
  type ContactSegmentDefinition,
} from "~/lib/contact-segments";
import { db } from "~/server/db";
import { buildContactSegmentWhere } from "./contact-segment-filter";

export async function listSegments(contactBookId: string) {
  const contactBook = await db.contactBook.findUnique({
    where: { id: contactBookId },
    select: {
      variables: true,
      segments: {
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!contactBook) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Contact book not found",
    });
  }

  const segments = await Promise.all(
    contactBook.segments.map(async (segment) => {
      const definition = contactSegmentDefinitionSchema.parse(segment.filters);
      const count = await db.contact.count({
        where: {
          contactBookId,
          ...buildContactSegmentWhere(definition, contactBook.variables),
        },
      });

      return {
        ...segment,
        filters: definition,
        count,
      };
    }),
  );

  return segments;
}

export async function getSegmentForContactBook(
  segmentId: string,
  contactBookId: string,
) {
  const segment = await db.contactSegment.findFirst({
    where: {
      id: segmentId,
      contactBookId,
    },
  });

  if (!segment) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Segment not found",
    });
  }

  return {
    ...segment,
    filters: contactSegmentDefinitionSchema.parse(segment.filters),
  };
}

export async function createSegment({
  contactBookId,
  name,
  definition,
}: {
  contactBookId: string;
  name: string;
  definition: ContactSegmentDefinition;
}) {
  const contactBook = await db.contactBook.findUnique({
    where: { id: contactBookId },
    select: { variables: true },
  });

  if (!contactBook) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Contact book not found",
    });
  }

  const filters = normalizeContactSegmentDefinition(
    definition,
    contactBook.variables,
  );

  return db.contactSegment.create({
    data: {
      contactBookId,
      name: name.trim(),
      filters: filters as Prisma.InputJsonObject,
    },
  });
}

export async function updateSegment({
  segmentId,
  contactBookId,
  name,
  definition,
}: {
  segmentId: string;
  contactBookId: string;
  name: string;
  definition: ContactSegmentDefinition;
}) {
  const contactBook = await db.contactBook.findUnique({
    where: { id: contactBookId },
    select: { variables: true },
  });

  if (!contactBook) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Contact book not found",
    });
  }

  await getSegmentForContactBook(segmentId, contactBookId);

  const filters = normalizeContactSegmentDefinition(
    definition,
    contactBook.variables,
  );

  return db.contactSegment.update({
    where: { id: segmentId },
    data: {
      name: name.trim(),
      filters: filters as Prisma.InputJsonObject,
    },
  });
}

export async function deleteSegment(segmentId: string, contactBookId: string) {
  await getSegmentForContactBook(segmentId, contactBookId);

  return db.contactSegment.delete({
    where: { id: segmentId },
  });
}

export async function getSegmentWhereInput({
  contactBookId,
  segmentId,
  variables,
}: {
  contactBookId: string;
  segmentId?: string;
  variables?: string[];
}) {
  if (!segmentId) {
    return undefined;
  }

  const segment = await getSegmentForContactBook(segmentId, contactBookId);
  const allowedVariables =
    variables ??
    (
      await db.contactBook.findUnique({
        where: { id: contactBookId },
        select: { variables: true },
      })
    )?.variables ??
    [];

  return buildContactSegmentWhere(segment.filters, allowedVariables);
}
