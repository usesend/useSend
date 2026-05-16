/**
 * SES wraps tracked links unless the anchor has `ses:no-track` (see SES metrics FAQ).
 * Apply to unsubscribe / preference URLs so opt-outs are not counted as engagement clicks.
 *
 * @see https://docs.aws.amazon.com/ses/latest/dg/faqs-metrics.html
 */
export function addSesNoTrackToUnsubscribeLinks(html: string): string {
  if (!/unsubscribe/i.test(html)) {
    return html;
  }

  return html.replace(
    /<a(?![^>]*\sses:no-track)([^>]*\bhref\s*=\s*["'][^"']*unsubscribe[^"']*["'][^>]*)>/gi,
    "<a ses:no-track$1>",
  );
}
