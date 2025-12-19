import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { createSecureHash } from "~/server/crypto";
import { signupSchema } from "~/server/password-utils";
import { env } from "~/env";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = signupSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const { email, password, name } = result.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Check if user exists
    const existingUser = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists. Please sign in." },
        { status: 400 }
      );
    }

    // Create new user with password
    const passwordHash = await createSecureHash(password);

    // Check for pending team invites
    const pendingInvites = await db.teamInvite.findMany({
      where: { email: normalizedEmail },
    });

    // Determine beta/waitlist status based on environment and invites
    const isBetaUser =
      !env.NEXT_PUBLIC_IS_CLOUD ||
      env.NODE_ENV === "development" ||
      pendingInvites.length > 0;
    const isWaitlisted =
      env.NEXT_PUBLIC_IS_CLOUD &&
      env.NODE_ENV !== "development" &&
      pendingInvites.length === 0;

    await db.user.create({
      data: {
        email: normalizedEmail,
        name: name ?? null,
        passwordHash,
        isBetaUser,
        isWaitlisted,
        emailVerified: new Date(), // Mark as verified since they're signing up directly
      },
    });

    return NextResponse.json({
      success: true,
      message: "Account created successfully. You can now sign in.",
    });
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
