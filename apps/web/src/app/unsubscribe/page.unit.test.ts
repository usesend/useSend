import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UnsubscribePage from "./page";

const campaignService = vi.hoisted(() => ({
  getContactFromUnsubscribeLink: vi.fn(async () => ({
    id: "contact-1",
    email: "person@example.com",
    subscribed: true,
  })),
  unsubscribeContactFromLink: vi.fn(async () => undefined),
}));

vi.mock("~/server/service/campaign-service", () => campaignService);

describe("unsubscribe page", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    campaignService.getContactFromUnsubscribeLink.mockClear();
    campaignService.unsubscribeContactFromLink.mockClear();
  });

  it("does not unsubscribe when a valid link is rendered by GET", async () => {
    const page = await UnsubscribePage({
      searchParams: Promise.resolve({ id: "contact-campaign", hash: "hash" }),
    });

    expect(page).toBeTruthy();
    expect(campaignService.getContactFromUnsubscribeLink).toHaveBeenCalledWith(
      "contact-campaign",
      "hash",
    );
    expect(campaignService.unsubscribeContactFromLink).not.toHaveBeenCalled();
  });

  it("does not call campaign services for a malformed link", async () => {
    const page = await UnsubscribePage({
      searchParams: Promise.resolve({}),
    });

    expect(page).toBeTruthy();
    expect(campaignService.getContactFromUnsubscribeLink).not.toHaveBeenCalled();
    expect(campaignService.unsubscribeContactFromLink).not.toHaveBeenCalled();
  });
});
