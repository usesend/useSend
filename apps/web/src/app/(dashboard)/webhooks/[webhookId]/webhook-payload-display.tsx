import { CodeBlock } from "@usesend/ui/src/code-block";

interface WebhookPayloadDisplayProps {
  payload: string;
  title: string;
  lang?: "json" | "text";
}

export async function WebhookPayloadDisplay({
  payload,
  title,
  lang = "json",
}: WebhookPayloadDisplayProps) {
  let displayContent = payload;

  // For JSON, try to pretty-print it
  if (lang === "json") {
    try {
      const parsed = JSON.parse(payload);
      displayContent = JSON.stringify(parsed, null, 2);
    } catch {
      // If parsing fails, use as-is
      displayContent = payload;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h4 className="font-medium text-sm">{title}</h4>
      <div className="rounded-lg overflow-hidden border">
        <CodeBlock lang={lang} className="text-xs max-h-[300px] overflow-auto">
          {displayContent}
        </CodeBlock>
      </div>
    </div>
  );
}
