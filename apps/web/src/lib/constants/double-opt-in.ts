export const DEFAULT_DOUBLE_OPT_IN_SUBJECT = "Please confirm your subscription";

const DEFAULT_DOUBLE_OPT_IN_CONTENT_JSON = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: {
        level: 2,
        textAlign: "left",
      },
      content: [{ type: "text", text: "Confirm your subscription" }],
    },
    {
      type: "paragraph",
      attrs: { textAlign: "left" },
      content: [
        {
          type: "text",
          text: "Please confirm that you want to receive emails from us.",
        },
      ],
    },
    {
      type: "paragraph",
      attrs: { textAlign: "left" },
      content: [
        {
          type: "text",
          text: "Confirm your subscription",
          marks: [
            {
              type: "link",
              attrs: {
                href: "{{doubleOptInUrl}}",
                target: "_blank",
                rel: "noopener noreferrer nofollow",
              },
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      attrs: { textAlign: "left" },
      content: [
        {
          type: "text",
          text: "If you did not request this, you can ignore this email.",
        },
      ],
    },
  ],
};

export const DEFAULT_DOUBLE_OPT_IN_CONTENT = JSON.stringify(
  DEFAULT_DOUBLE_OPT_IN_CONTENT_JSON,
);

export const DOUBLE_OPT_IN_EDITOR_VARIABLES = [
  "email",
  "firstName",
  "lastName",
  "doubleOptInUrl",
];

export function getDefaultDoubleOptInContent() {
  return structuredClone(DEFAULT_DOUBLE_OPT_IN_CONTENT_JSON) as Record<
    string,
    any
  >;
}
