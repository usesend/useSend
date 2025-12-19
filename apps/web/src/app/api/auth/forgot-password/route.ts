import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { db } from "~/server/db";
import { sendPasswordResetEmail } from "~/server/mailer";

const schema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);

    if (!result.success) {
      // Always return success to prevent email enumeration
      return NextResponse.json({ success: true });
    }

    const normalizedEmail = result.data.email.toLowerCase().trim();

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Only send reset email if user exists AND has a password
    if (user && user.passwordHash) {
      // Delete any existing tokens for this email
      await db.passwordResetToken.deleteMany({
        where: { email: normalizedEmail },
      });

      // Create new token (expires in 1 hour)
      const token = randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000);

      await db.passwordResetToken.create({
        data: {
          email: normalizedEmail,
          token,
          expires,
        },
      });

      await sendPasswordResetEmail(normalizedEmail, token);
    }

    // Always return success to prevent email enumeration
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ success: true });
  }
}
