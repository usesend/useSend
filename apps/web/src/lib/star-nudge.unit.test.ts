import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  isStarNudgeDismissed,
  dismissStarNudge,
  triggerStarNudge,
  STAR_NUDGE_STORAGE_KEY,
  FEEDBACK_ACTIVE_SESSION_KEY,
  GITHUB_REPO_URL,
} from "./star-nudge";
import { toast } from "@usesend/ui/src/toaster";

vi.mock("@usesend/ui/src/toaster", () => ({
  toast: vi.fn(),
}));

describe("star-nudge utility", () => {
  let localStorageMock: Record<string, string> = {};
  let sessionStorageMock: Record<string, string> = {};
  let windowOpenSpy = vi.fn();

  beforeEach(() => {
    localStorageMock = {};
    sessionStorageMock = {};
    windowOpenSpy = vi.fn();

    vi.useFakeTimers();

    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => localStorageMock[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        localStorageMock[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete localStorageMock[key];
      }),
    });

    vi.stubGlobal("sessionStorage", {
      getItem: vi.fn((key: string) => sessionStorageMock[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        sessionStorageMock[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete sessionStorageMock[key];
      }),
    });

    vi.stubGlobal("window", {
      open: windowOpenSpy,
      setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
      clearTimeout: (id: any) => clearTimeout(id),
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns false for isStarNudgeDismissed when storage is empty", () => {
    expect(isStarNudgeDismissed()).toBe(false);
  });

  it("returns true for isStarNudgeDismissed when already marked dismissed", () => {
    localStorageMock[STAR_NUDGE_STORAGE_KEY] = "true";
    expect(isStarNudgeDismissed()).toBe(true);
  });

  it("dismissStarNudge writes true to localStorage", () => {
    dismissStarNudge();
    expect(localStorageMock[STAR_NUDGE_STORAGE_KEY]).toBe("true");
    expect(isStarNudgeDismissed()).toBe(true);
  });

  it("triggerStarNudge does not trigger toast if already dismissed", () => {
    localStorageMock[STAR_NUDGE_STORAGE_KEY] = "true";

    triggerStarNudge(500);
    vi.advanceTimersByTime(600);

    expect(toast).not.toHaveBeenCalled();
  });

  it("triggerStarNudge does not trigger toast if feedback is active in session", () => {
    sessionStorageMock[FEEDBACK_ACTIVE_SESSION_KEY] = "true";

    triggerStarNudge(500);
    vi.advanceTimersByTime(600);

    expect(toast).not.toHaveBeenCalled();
  });

  it("triggerStarNudge shows toast after specified delay when eligible", () => {
    triggerStarNudge(1000);
    expect(toast).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(toast).toHaveBeenCalledTimes(1);

    const toastCall = (toast as any).mock.calls[0];
    expect(toastCall[0]).toBe("Enjoying useSend?");
    expect(toastCall[1]).toMatchObject({
      action: expect.objectContaining({ label: "Star on GitHub" }),
      cancel: expect.objectContaining({ label: "Not now" }),
    });

    // Test clicking Star on GitHub action
    toastCall[1].action.onClick();
    expect(windowOpenSpy).toHaveBeenCalledWith(
      GITHUB_REPO_URL,
      "_blank",
      "noopener,noreferrer"
    );
    expect(localStorageMock[STAR_NUDGE_STORAGE_KEY]).toBe("true");
  });

  it("clicking cancel in toast marks nudge dismissed", () => {
    triggerStarNudge(500);
    vi.advanceTimersByTime(500);

    const toastCall = (toast as any).mock.calls[0];
    toastCall[1].cancel.onClick();
    expect(localStorageMock[STAR_NUDGE_STORAGE_KEY]).toBe("true");
  });
});
