import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { createSecureHash } from "~/server/crypto";
import { resetPasswordSchema } from "~/server/password-utils";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = resetPasswordSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const { token, password } = result.data;

    const resetToken = await db.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetToken) {
      return NextResponse.json(
        { error: "Invalid or expired reset link" },
        { status: 400 }
      );
    }

    if (resetToken.expires < new Date()) {
      // Clean up expired token
      await db.passwordResetToken.delete({ where: { token } });
      return NextResponse.json(
        { error: "This reset link has expired. Please request a new one." },
        { status: 400 }
      );
    }

    const passwordHash = await createSecureHash(password);

    await db.$transaction(async (tx) => {
      // Verify user exists
      const user = await tx.user.findUnique({
        where: { email: resetToken.email },
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Update password
      await tx.user.update({
        where: { email: resetToken.email },
        data: {
          passwordHash,
          emailVerified: new Date(),
        },
      });

      // Delete used token
      await tx.passwordResetToken.delete({ where: { token } });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reset password error:", error);
    const message =
      error instanceof Error && error.message === "User not found"
        ? "User account not found"
        : "Something went wrong. Please try again.";
    return NextResponse.json(
      { error: message },
      {
        status:
          error instanceof Error && error.message === "User not found"
            ? 400
            : 500,
      }
    );
  }
}
