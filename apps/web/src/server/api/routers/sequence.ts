import {
  EnrollmentStatus,
  SequenceStatus,
  SequenceStepType,
  SequenceTriggerType,
} from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createTRPCRouter,
  teamProcedure,
  teamAdminProcedure,
} from "~/server/api/trpc";

export const sequenceRouter = createTRPCRouter({
  // List all sequences for the team
  list: teamProcedure
    .input(
      z.object({
        status: z.nativeEnum(SequenceStatus).optional(),
        page: z.number().default(1),
      })
    )
    .query(async ({ ctx: { db, team }, input }) => {
      const limit = 20;
      const offset = (input.page - 1) * limit;

      const where = {
        teamId: team.id,
        ...(input.status ? { status: input.status } : {}),
      };

      const [sequences, total] = await Promise.all([
        db.automationSequence.findMany({
          where,
          include: {
            contactBook: {
              select: {
                id: true,
                name: true,
                emoji: true,
              },
            },
            _count: {
              select: {
                steps: true,
                enrollments: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip: offset,
          take: limit,
        }),
        db.automationSequence.count({ where }),
      ]);

      return {
        sequences,
        totalPages: Math.ceil(total / limit),
        total,
      };
    }),

  // Get a single sequence with all details
  get: teamProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx: { db, team }, input }) => {
      const sequence = await db.automationSequence.findUnique({
        where: { id: input.id },
        include: {
          contactBook: {
            select: {
              id: true,
              name: true,
              emoji: true,
            },
          },
          steps: {
            orderBy: { order: "asc" },
            include: {
              template: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          _count: {
            select: {
              enrollments: {
                where: { status: "ACTIVE" },
              },
            },
          },
        },
      });

      if (!sequence || sequence.teamId !== team.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sequence not found",
        });
      }

      return sequence;
    }),

  // Create a new sequence
  create: teamAdminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        contactBookId: z.string().optional(),
        triggerType: z.nativeEnum(SequenceTriggerType).default("MANUAL"),
        triggerConfig: z.record(z.unknown()).optional(),
        fromEmail: z.string().optional(),
        fromName: z.string().optional(),
        replyTo: z.string().optional(),
        exitOnUnsubscribe: z.boolean().default(true),
        exitOnGoal: z.boolean().default(true),
        allowReentry: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx: { db, team }, input }) => {
      // Validate contact book if provided
      if (input.contactBookId) {
        const contactBook = await db.contactBook.findUnique({
          where: { id: input.contactBookId },
        });
        if (!contactBook || contactBook.teamId !== team.id) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid contact book",
          });
        }
      }

      return db.automationSequence.create({
        data: {
          name: input.name,
          description: input.description,
          teamId: team.id,
          contactBookId: input.contactBookId,
          triggerType: input.triggerType,
          triggerConfig: input.triggerConfig,
          fromEmail: input.fromEmail,
          fromName: input.fromName,
          replyTo: input.replyTo,
          exitOnUnsubscribe: input.exitOnUnsubscribe,
          exitOnGoal: input.exitOnGoal,
          allowReentry: input.allowReentry,
        },
      });
    }),

  // Update a sequence
  update: teamAdminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        contactBookId: z.string().nullable().optional(),
        triggerType: z.nativeEnum(SequenceTriggerType).optional(),
        triggerConfig: z.record(z.unknown()).optional(),
        fromEmail: z.string().optional(),
        fromName: z.string().optional(),
        replyTo: z.string().optional(),
        exitOnUnsubscribe: z.boolean().optional(),
        exitOnGoal: z.boolean().optional(),
        allowReentry: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx: { db, team }, input }) => {
      const sequence = await db.automationSequence.findUnique({
        where: { id: input.id },
      });

      if (!sequence || sequence.teamId !== team.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sequence not found",
        });
      }

      if (sequence.status === "ACTIVE") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot update an active sequence. Pause it first.",
        });
      }

      const { id, ...data } = input;

      return db.automationSequence.update({
        where: { id },
        data,
      });
    }),

  // Update sequence status (activate, pause, archive)
  updateStatus: teamAdminProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.nativeEnum(SequenceStatus),
      })
    )
    .mutation(async ({ ctx: { db, team }, input }) => {
      const sequence = await db.automationSequence.findUnique({
        where: { id: input.id },
        include: { steps: true },
      });

      if (!sequence || sequence.teamId !== team.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sequence not found",
        });
      }

      // Validation before activating
      if (input.status === "ACTIVE") {
        if (sequence.steps.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot activate a sequence without steps",
          });
        }

        const hasEmailStep = sequence.steps.some((s) => s.type === "EMAIL");
        if (!hasEmailStep) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Sequence must have at least one email step",
          });
        }

        if (!sequence.fromEmail) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Sequence must have a from email address",
          });
        }
      }

      return db.automationSequence.update({
        where: { id: input.id },
        data: { status: input.status },
      });
    }),

  // Delete a sequence
  delete: teamAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx: { db, team }, input }) => {
      const sequence = await db.automationSequence.findUnique({
        where: { id: input.id },
      });

      if (!sequence || sequence.teamId !== team.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sequence not found",
        });
      }

      if (sequence.status === "ACTIVE") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete an active sequence. Pause or archive it first.",
        });
      }

      return db.automationSequence.delete({
        where: { id: input.id },
      });
    }),

  // Add a step to a sequence
  addStep: teamAdminProcedure
    .input(
      z.object({
        sequenceId: z.string(),
        type: z.nativeEnum(SequenceStepType),
        name: z.string().optional(),
        // Email fields
        subject: z.string().optional(),
        previewText: z.string().optional(),
        html: z.string().optional(),
        templateId: z.string().optional(),
        // Delay fields
        delayDuration: z.number().optional(),
        delayUnit: z.enum(["minutes", "hours", "days"]).optional(),
        // Condition fields
        conditionType: z.string().optional(),
        conditionValue: z.string().optional(),
        // Goal fields
        goalType: z.string().optional(),
        goalValue: z.string().optional(),
        // Position
        afterStepId: z.string().optional(), // Insert after this step
      })
    )
    .mutation(async ({ ctx: { db, team }, input }) => {
      const sequence = await db.automationSequence.findUnique({
        where: { id: input.sequenceId },
        include: { steps: { orderBy: { order: "asc" } } },
      });

      if (!sequence || sequence.teamId !== team.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sequence not found",
        });
      }

      if (sequence.status === "ACTIVE") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot modify steps in an active sequence",
        });
      }

      // Calculate order
      let order: number;
      if (input.afterStepId) {
        const afterStep = sequence.steps.find((s) => s.id === input.afterStepId);
        if (!afterStep) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Step not found",
          });
        }
        order = afterStep.order + 1;

        // Shift later steps
        await db.sequenceStep.updateMany({
          where: {
            sequenceId: input.sequenceId,
            order: { gte: order },
          },
          data: { order: { increment: 1 } },
        });
      } else {
        order = sequence.steps.length > 0
          ? Math.max(...sequence.steps.map((s) => s.order)) + 1
          : 0;
      }

      const { sequenceId, afterStepId, ...stepData } = input;

      return db.sequenceStep.create({
        data: {
          sequenceId,
          order,
          ...stepData,
        },
      });
    }),

  // Update a step
  updateStep: teamAdminProcedure
    .input(
      z.object({
        stepId: z.string(),
        name: z.string().optional(),
        subject: z.string().optional(),
        previewText: z.string().optional(),
        html: z.string().optional(),
        templateId: z.string().nullable().optional(),
        delayDuration: z.number().optional(),
        delayUnit: z.enum(["minutes", "hours", "days"]).optional(),
        conditionType: z.string().optional(),
        conditionValue: z.string().optional(),
        yesStepId: z.string().nullable().optional(),
        noStepId: z.string().nullable().optional(),
        goalType: z.string().optional(),
        goalValue: z.string().optional(),
      })
    )
    .mutation(async ({ ctx: { db, team }, input }) => {
      const step = await db.sequenceStep.findUnique({
        where: { id: input.stepId },
        include: { sequence: true },
      });

      if (!step || step.sequence.teamId !== team.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Step not found",
        });
      }

      if (step.sequence.status === "ACTIVE") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot modify steps in an active sequence",
        });
      }

      const { stepId, ...data } = input;

      return db.sequenceStep.update({
        where: { id: stepId },
        data,
      });
    }),

  // Delete a step
  deleteStep: teamAdminProcedure
    .input(z.object({ stepId: z.string() }))
    .mutation(async ({ ctx: { db, team }, input }) => {
      const step = await db.sequenceStep.findUnique({
        where: { id: input.stepId },
        include: { sequence: true },
      });

      if (!step || step.sequence.teamId !== team.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Step not found",
        });
      }

      if (step.sequence.status === "ACTIVE") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete steps from an active sequence",
        });
      }

      // Delete the step and reorder remaining steps
      await db.sequenceStep.delete({
        where: { id: input.stepId },
      });

      // Reorder remaining steps
      const remainingSteps = await db.sequenceStep.findMany({
        where: { sequenceId: step.sequenceId },
        orderBy: { order: "asc" },
      });

      await Promise.all(
        remainingSteps.map((s, idx) =>
          db.sequenceStep.update({
            where: { id: s.id },
            data: { order: idx },
          })
        )
      );

      return { success: true };
    }),

  // Reorder steps
  reorderSteps: teamAdminProcedure
    .input(
      z.object({
        sequenceId: z.string(),
        stepIds: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx: { db, team }, input }) => {
      const sequence = await db.automationSequence.findUnique({
        where: { id: input.sequenceId },
      });

      if (!sequence || sequence.teamId !== team.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sequence not found",
        });
      }

      if (sequence.status === "ACTIVE") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot reorder steps in an active sequence",
        });
      }

      await Promise.all(
        input.stepIds.map((stepId, idx) =>
          db.sequenceStep.update({
            where: { id: stepId },
            data: { order: idx },
          })
        )
      );

      return { success: true };
    }),

  // Enroll contacts in a sequence
  enrollContacts: teamAdminProcedure
    .input(
      z.object({
        sequenceId: z.string(),
        contactIds: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx: { db, team }, input }) => {
      const sequence = await db.automationSequence.findUnique({
        where: { id: input.sequenceId },
        include: {
          steps: { orderBy: { order: "asc" }, take: 1 },
        },
      });

      if (!sequence || sequence.teamId !== team.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sequence not found",
        });
      }

      if (sequence.status !== "ACTIVE") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only enroll contacts in an active sequence",
        });
      }

      const firstStep = sequence.steps[0];
      if (!firstStep) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Sequence has no steps",
        });
      }

      // Filter out contacts already enrolled (unless reentry is allowed)
      let contactsToEnroll = input.contactIds;
      if (!sequence.allowReentry) {
        const existingEnrollments = await db.sequenceEnrollment.findMany({
          where: {
            sequenceId: input.sequenceId,
            contactId: { in: input.contactIds },
          },
          select: { contactId: true },
        });
        const enrolledIds = new Set(existingEnrollments.map((e) => e.contactId));
        contactsToEnroll = input.contactIds.filter((id) => !enrolledIds.has(id));
      }

      if (contactsToEnroll.length === 0) {
        return { enrolled: 0 };
      }

      // Create enrollments
      const now = new Date();
      await db.sequenceEnrollment.createMany({
        data: contactsToEnroll.map((contactId) => ({
          sequenceId: input.sequenceId,
          contactId,
          currentStepId: firstStep.id,
          currentStepOrder: 0,
          status: "ACTIVE",
          nextStepAt: now, // Start immediately
        })),
        skipDuplicates: true,
      });

      // Update sequence stats
      await db.automationSequence.update({
        where: { id: input.sequenceId },
        data: { totalEnrolled: { increment: contactsToEnroll.length } },
      });

      return { enrolled: contactsToEnroll.length };
    }),

  // Get enrollments for a sequence
  getEnrollments: teamProcedure
    .input(
      z.object({
        sequenceId: z.string(),
        status: z.nativeEnum(EnrollmentStatus).optional(),
        page: z.number().default(1),
      })
    )
    .query(async ({ ctx: { db, team }, input }) => {
      const sequence = await db.automationSequence.findUnique({
        where: { id: input.sequenceId },
      });

      if (!sequence || sequence.teamId !== team.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sequence not found",
        });
      }

      const limit = 50;
      const offset = (input.page - 1) * limit;

      const where = {
        sequenceId: input.sequenceId,
        ...(input.status ? { status: input.status } : {}),
      };

      const [enrollments, total] = await Promise.all([
        db.sequenceEnrollment.findMany({
          where,
          include: {
            contact: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            currentStep: {
              select: {
                id: true,
                name: true,
                type: true,
                order: true,
              },
            },
          },
          orderBy: { enrolledAt: "desc" },
          skip: offset,
          take: limit,
        }),
        db.sequenceEnrollment.count({ where }),
      ]);

      return {
        enrollments,
        totalPages: Math.ceil(total / limit),
        total,
      };
    }),

  // Exit a contact from a sequence
  exitEnrollment: teamAdminProcedure
    .input(
      z.object({
        enrollmentId: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx: { db, team }, input }) => {
      const enrollment = await db.sequenceEnrollment.findUnique({
        where: { id: input.enrollmentId },
        include: { sequence: true },
      });

      if (!enrollment || enrollment.sequence.teamId !== team.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Enrollment not found",
        });
      }

      await db.sequenceEnrollment.update({
        where: { id: input.enrollmentId },
        data: {
          status: "EXITED",
          exitedAt: new Date(),
          exitReason: input.reason || "manual",
        },
      });

      await db.automationSequence.update({
        where: { id: enrollment.sequenceId },
        data: { totalExited: { increment: 1 } },
      });

      return { success: true };
    }),

  // Get sequence statistics
  getStats: teamProcedure
    .input(z.object({ sequenceId: z.string() }))
    .query(async ({ ctx: { db, team }, input }) => {
      const sequence = await db.automationSequence.findUnique({
        where: { id: input.sequenceId },
        include: {
          steps: {
            select: {
              id: true,
              name: true,
              type: true,
              order: true,
              sent: true,
              delivered: true,
              opened: true,
              clicked: true,
            },
            orderBy: { order: "asc" },
          },
        },
      });

      if (!sequence || sequence.teamId !== team.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sequence not found",
        });
      }

      // Get enrollment counts by status
      const enrollmentCounts = await db.sequenceEnrollment.groupBy({
        by: ["status"],
        where: { sequenceId: input.sequenceId },
        _count: { status: true },
      });

      const statusCounts = Object.fromEntries(
        enrollmentCounts.map((e) => [e.status, e._count.status])
      );

      // Calculate overall metrics
      const emailSteps = sequence.steps.filter((s) => s.type === "EMAIL");
      const totalSent = emailSteps.reduce((sum, s) => sum + s.sent, 0);
      const totalDelivered = emailSteps.reduce((sum, s) => sum + s.delivered, 0);
      const totalOpened = emailSteps.reduce((sum, s) => sum + s.opened, 0);
      const totalClicked = emailSteps.reduce((sum, s) => sum + s.clicked, 0);

      return {
        sequence: {
          totalEnrolled: sequence.totalEnrolled,
          totalCompleted: sequence.totalCompleted,
          totalExited: sequence.totalExited,
        },
        enrollments: {
          active: statusCounts.ACTIVE || 0,
          completed: statusCounts.COMPLETED || 0,
          paused: statusCounts.PAUSED || 0,
          exited: statusCounts.EXITED || 0,
        },
        emails: {
          sent: totalSent,
          delivered: totalDelivered,
          opened: totalOpened,
          clicked: totalClicked,
          openRate: totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0,
          clickRate: totalDelivered > 0 ? (totalClicked / totalDelivered) * 100 : 0,
        },
        steps: sequence.steps,
      };
    }),
});
