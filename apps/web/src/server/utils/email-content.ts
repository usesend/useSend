export function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function toPlainHtml(text: string) {
  return `<pre style="font-family: inherit; white-space: pre-wrap; margin: 0;">${escapeHtml(text)}</pre>`;
}
