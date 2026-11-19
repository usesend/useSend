import { toast } from "@usesend/ui/src/toaster";

export const STAR_NUDGE_STORAGE_KEY = "usesend:star-nudge-dismissed";
const STAR_NUDGE_TOAST_ID = "usesend-star-nudge";
export const FEEDBACK_ACTIVE_SESSION_KEY = "usesend:feedback-active";
export const GITHUB_REPO_URL = "https://github.com/usesend/usesend";

export function isStarNudgeDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(STAR_NUDGE_STORAGE_KEY) === "true";
  } catch {
    return true;
  }
}

export function dismissStarNudge(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STAR_NUDGE_STORAGE_KEY, "true");
  } catch {
    // Graceful fallback for restricted storage environments
  }
}

export function isFeedbackActive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(FEEDBACK_ACTIVE_SESSION_KEY) === "true";
  } catch {
    return false;
  }
}

export function triggerStarNudge(delayMs = 1500): void {
  if (isStarNudgeDismissed() || isFeedbackActive()) return;

  window.setTimeout(() => {
    if (isStarNudgeDismissed() || isFeedbackActive()) return;

    toast("Enjoying useSend?", {
      id: STAR_NUDGE_TOAST_ID,
      description:
        "It's open source — a star on GitHub helps others find it! ⭐",
      duration: 10000,
      action: {
        label: "Star on GitHub",
        onClick: () => {
          dismissStarNudge();
          window.open(GITHUB_REPO_URL, "_blank", "noopener,noreferrer");
        },
      },
      cancel: {
        label: "Not now",
        onClick: () => {
          dismissStarNudge();
        },
      },
      onDismiss: () => {
        dismissStarNudge();
      },
      onAutoClose: () => {
        dismissStarNudge();
      },
    });
  }, delayMs);
}
