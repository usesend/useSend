export const DEFAULT_DOUBLE_OPT_IN_SUBJECT = "Please confirm your subscription";

const DEFAULT_DOUBLE_OPT_IN_CONTENT_JSON = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { textAlign: "left" },
      content: [
        {
          type: "text",
          text: "Hello, Thank you for signing up. Please confirm that you want to receive emails from us.",
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
    {
      type: "button",
      attrs: {
        component: "button",
        text: "Confirm",
        url: "{{doubleOptInUrl}}",
        alignment: "left",
        borderRadius: "8",
        borderWidth: "1",
        buttonColor: "#000000",
        borderColor: "#000000",
        textColor: "#ffffff",
      },
    },
    {
      type: "horizontalRule",
    },
    {
      type: "paragraph",
      attrs: { textAlign: "left" },
      content: [
        {
          type: "text",
          text: "You are receiving this email because you opted in via our site.",
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

const DOUBLE_OPT_IN_URL_PLACEHOLDER_REGEX =
  /\{\{\s*doubleOptInUrl(?:\s*,\s*fallback=[^}]+)?\s*\}\}/i;

function valueIncludesDoubleOptInUrl(value: unknown): boolean {
  if (typeof value === "string") {
    const normalizedValue = value.trim().toLowerCase();

    return (
      DOUBLE_OPT_IN_URL_PLACEHOLDER_REGEX.test(value) ||
      normalizedValue === "doubleoptinurl"
    );
  }

  if (Array.isArray(value)) {
    return value.some(valueIncludesDoubleOptInUrl);
  }

  if (value && typeof value === "object") {
    return Object.values(value).some(valueIncludesDoubleOptInUrl);
  }

  return false;
}

export function hasDoubleOptInUrlPlaceholder(content: string): boolean {
  if (DOUBLE_OPT_IN_URL_PLACEHOLDER_REGEX.test(content)) {
    return true;
  }

  try {
    return valueIncludesDoubleOptInUrl(JSON.parse(content));
  } catch {
    return false;
  }
}

export function getDefaultDoubleOptInContent() {
  return structuredClone(DEFAULT_DOUBLE_OPT_IN_CONTENT_JSON) as Record<
    string,
    any
  >;
}
