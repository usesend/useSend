import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { createSecureHash, verifySecureHash } from "~/server/crypto";
import { passwordSchema } from "~/server/password-utils";

export const userRouter = createTRPCRouter({
  /**
   * Check if the current user has a password set
   */
  hasPassword: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      select: { passwordHash: true },
    });
    return { hasPassword: !!user?.passwordHash };
  }),

  /**
   * Get linked OAuth accounts for the current user
   */
  getLinkedAccounts: protectedProcedure.query(async ({ ctx }) => {
    const accounts = await ctx.db.account.findMany({
      where: { userId: ctx.session.user.id },
      select: { provider: true },
    });
    return accounts.map((a) => a.provider);
  }),

  /**
   * Change password for users who already have one
   */
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1, "Current password is required"),
        newPassword: passwordSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      if (!user.passwordHash) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You don't have a password set. Use 'Set Password' instead.",
        });
      }

      const isValid = await verifySecureHash(
        input.currentPassword,
        user.passwordHash
      );
      if (!isValid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Current password is incorrect",
        });
      }

      const newPasswordHash = await createSecureHash(input.newPassword);

      await ctx.db.user.update({
        where: { id: user.id },
        data: { passwordHash: newPasswordHash },
      });

      return { success: true };
    }),

  /**
   * Set password for OAuth-only users
   */
  setPassword: protectedProcedure
    .input(
      z.object({
        newPassword: passwordSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      if (user.passwordHash) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You already have a password. Use 'Change Password' instead.",
        });
      }

      const passwordHash = await createSecureHash(input.newPassword);

      await ctx.db.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });

      return { success: true };
    }),

  /**
   * Get current user profile info
   */
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    return user;
  }),
});
