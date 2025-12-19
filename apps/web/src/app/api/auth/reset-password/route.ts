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

    await db.user.update({
      where: { email: resetToken.email },
      data: {
        passwordHash,
        emailVerified: new Date(), // Verify email on password reset
      },
    });

    // Delete used token
    await db.passwordResetToken.delete({ where: { token } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
