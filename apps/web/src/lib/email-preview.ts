const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Builds the srcDoc for the sandboxed email preview iframe. Emails sent with
 * only a `text` body have no html, so the plain text is escaped and wrapped
 * in a minimal document instead of rendering an empty preview.
 */
export function getEmailPreviewSrcDoc(
  html: string | null | undefined,
  text: string | null | undefined,
): string | null {
  if (html) {
    return html;
  }

  if (text) {
    return `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><pre style="margin:0;padding:16px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-word;color:#0f172a">${escapeHtml(text)}</pre></body></html>`;
  }

  return null;
}
