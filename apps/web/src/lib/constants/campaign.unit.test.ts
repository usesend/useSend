import { describe, expect, it } from "vitest";
import { EmailRenderer } from "@usesend/email-editor/src/renderer";
import {
  CAMPAIGN_UNSUBSCRIBE_VARIABLE,
  getCampaignEditorVariables,
  getCampaignUnsubscribeVariableValues,
} from "~/lib/constants/campaign";

describe("campaign editor variables", () => {
  it("includes the canonical unsubscribe variable", () => {
    expect(getCampaignEditorVariables()).toContain(
      CAMPAIGN_UNSUBSCRIBE_VARIABLE,
    );
  });

  it("combines built-in and contact book variables without duplicates", () => {
    expect(getCampaignEditorVariables(["company", "email", "company"])).toEqual(
      [
        "email",
        "firstName",
        "lastName",
        CAMPAIGN_UNSUBSCRIBE_VARIABLE,
        "company",
      ],
    );
  });

  it("renders an autocomplete unsubscribe variable with the recipient URL", async () => {
    const renderer = new EmailRenderer({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "variable",
              attrs: {
                id: CAMPAIGN_UNSUBSCRIBE_VARIABLE,
                name: CAMPAIGN_UNSUBSCRIBE_VARIABLE,
                fallback: "",
              },
            },
          ],
        },
      ],
    });
    const unsubscribeUrl = "https://example.com/unsubscribe/recipient";

    const html = await renderer.render({
      shouldReplaceVariableValues: true,
      variableValues: getCampaignUnsubscribeVariableValues(unsubscribeUrl),
    });

    expect(html).toContain(unsubscribeUrl);
    expect(html).not.toContain(`{{${CAMPAIGN_UNSUBSCRIBE_VARIABLE}}}`);
  });
});
