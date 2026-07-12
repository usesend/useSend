export const INVITATION_REQUIRED_MESSAGE =
  "You need a team invitation to create an account on this instance.";

export function getAuthErrorMessage(error?: string | null) {
  if (!error) {
    return null;
  }

  if (error === "AccessDenied") {
    return INVITATION_REQUIRED_MESSAGE;
  }

  return "Unable to sign in. Please try again.";
}
