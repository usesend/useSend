import { emailOTP } from "better-auth/plugins";
import { getTestInstance } from "better-auth/test";
import { beforeAll, describe, expect, it } from "vitest";

const baseUrl = "http://localhost:3000";
const email = "auth-e2e@example.com";
let latestOtp = "";

describe("Better Auth email OTP flow", () => {
  let handleAuthRequest: Awaited<
    ReturnType<typeof getTestInstance>
  >["auth"]["handler"];

  beforeAll(async () => {
    const instance = await getTestInstance(
      {
        baseURL: baseUrl,
        trustedOrigins: [baseUrl],
        advanced: {
          disableCSRFCheck: false,
          disableOriginCheck: false,
        },
        plugins: [
          emailOTP({
            otpLength: 6,
            expiresIn: 300,
            allowedAttempts: 3,
            storeOTP: "hashed",
            async sendVerificationOTP({ otp }) {
              latestOtp = otp;
            },
          }),
        ],
      },
      { disableTestUser: true },
    );
    handleAuthRequest = instance.auth.handler;
  });

  it("creates a session, reads it from its cookie, and revokes it", async () => {
    const sendResponse = await handleAuthRequest(
      jsonRequest("/api/auth/email-otp/send-verification-otp", {
        email,
        type: "sign-in",
      }),
    );
    expect(sendResponse.status).toBe(200);
    expect(latestOtp).toMatch(/^\d{6}$/);

    const signInResponse = await handleAuthRequest(
      jsonRequest("/api/auth/sign-in/email-otp", {
        email,
        otp: latestOtp,
        name: "Auth E2E",
      }),
    );
    expect(signInResponse.status).toBe(200);

    const cookie = signInResponse.headers.get("set-cookie");
    expect(cookie).toContain("better-auth.session_token=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");

    const sessionResponse = await handleAuthRequest(
      new Request(`${baseUrl}/api/auth/get-session`, {
        headers: { cookie: cookie ?? "" },
      }),
    );
    expect(sessionResponse.status).toBe(200);
    await expect(sessionResponse.json()).resolves.toMatchObject({
      user: { email },
    });

    const signOutResponse = await handleAuthRequest(
      jsonRequest("/api/auth/sign-out", undefined, cookie ?? ""),
    );
    expect(signOutResponse.status).toBe(200);

    const clearedCookie = signOutResponse.headers.get("set-cookie");
    const signedOutSession = await handleAuthRequest(
      new Request(`${baseUrl}/api/auth/get-session`, {
        headers: { cookie: clearedCookie ?? "" },
      }),
    );
    await expect(signedOutSession.json()).resolves.toBeNull();
  });

  it("rejects browser requests from an untrusted origin", async () => {
    const secondEmail = "auth-csrf-e2e@example.com";
    await handleAuthRequest(
      jsonRequest("/api/auth/email-otp/send-verification-otp", {
        email: secondEmail,
        type: "sign-in",
      }),
    );
    const signInResponse = await handleAuthRequest(
      jsonRequest("/api/auth/sign-in/email-otp", {
        email: secondEmail,
        otp: latestOtp,
        name: "Auth CSRF E2E",
      }),
    );

    const response = await handleAuthRequest(
      new Request(`${baseUrl}/api/auth/sign-out`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: signInResponse.headers.get("set-cookie") ?? "",
          origin: "https://attacker.example",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "cross-site",
        },
      }),
    );

    expect(response.status).toBe(403);
  });
});

function jsonRequest(path: string, body?: unknown, cookie?: string) {
  return new Request(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: baseUrl,
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
