import { EmailRenderer } from "@usesend/email-editor/src/renderer";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const data = await req.json();

  try {
    const renderer = new EmailRenderer(data);
    const time = Date.now();
    const html = await renderer.render({
      shouldReplaceVariableValues: true,
      linkValues: {
        "{{usesend_unsubscribe_url}}": "https://usesend.com/unsubscribe",
        "{{unsend_unsubscribe_url}}": "https://usesend.com/unsubscribe",
      },
    });
    console.log(`Time taken: ${Date.now() - time}ms`);
    return new Response(JSON.stringify({ data: html }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ data: "Error in converting to html" }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      },
    );
  }
}

export function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
