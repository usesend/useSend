import { SMTPServer, SMTPServerOptions, SMTPServerSession } from "smtp-server";
import { Readable } from "stream";
import dotenv from "dotenv";
import { simpleParser } from "mailparser";
import { readFileSync, watch, FSWatcher } from "fs";
import he from "he";
import { parseHTML } from "linkedom";

dotenv.config();

const AUTH_USERNAME = process.env.SMTP_AUTH_USERNAME ?? "usesend";
const BASE_URL =
  process.env.USESEND_BASE_URL ??
  process.env.UNSEND_BASE_URL ??
  "https://app.usesend.com";
const SSL_KEY_PATH =
  process.env.USESEND_API_KEY_PATH ?? process.env.UNSEND_API_KEY_PATH;
const SSL_CERT_PATH =
  process.env.USESEND_API_CERT_PATH ?? process.env.UNSEND_API_CERT_PATH;
const CAMPAIGN_DOMAIN = process.env.USESEND_CAMPAIGN_DOMAIN ?? "usesend.com";

interface ParsedRecipients {
  contactBookIds: string[];
  emailAddresses: string[];
}

/**
 * Parses all recipients from the "to" field.
 * - Addresses like "listId@usesend.com" (or configured domain) are contact book IDs
 * - All other addresses are treated as individual email recipients
 */
function parseRecipients(to: string | undefined): ParsedRecipients {
  const result: ParsedRecipients = {
    contactBookIds: [],
    emailAddresses: [],
  };

  if (!to) return result;

  const emailRegex = /<?([^<>\s,]+@[^<>\s,]+)>?/g;
  let match;

  while ((match = emailRegex.exec(to)) !== null) {
    const email = match[1].toLowerCase();
    const [localPart, domain] = email.split("@");

    if (domain === CAMPAIGN_DOMAIN.toLowerCase() && localPart) {
      result.contactBookIds.push(localPart);
    } else {
      result.emailAddresses.push(email);
    }
  }

  return result;
}

interface CampaignData {
  name: string;
  from: string;
  subject: string;
  contactBookId: string;
  html: string;
  replyTo?: string;
}

interface CampaignResponse {
  id: string;
  name: string;
  status: string;
}

/**
 * Creates a campaign and schedules it for immediate sending via the UseSend API.
 */
async function sendCampaignToUseSend(
  campaignData: CampaignData,
  apiKey: string,
): Promise<CampaignResponse> {
  try {
    const createEndpoint = "/api/v1/campaigns";
    const createUrl = new URL(createEndpoint, BASE_URL);

    const payload = {
      name: campaignData.name,
      from: campaignData.from,
      subject: campaignData.subject,
      contactBookId: campaignData.contactBookId,
      html: campaignData.html,
      replyTo: campaignData.replyTo,
      sendNow: true,
    };

    const response = await fetch(createUrl.href, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorDisplay: string;
      try {
        // Try to parse and pretty-print JSON error responses
        errorDisplay = JSON.stringify(JSON.parse(errorText), null, 2);
      } catch {
        errorDisplay = errorText;
      }
      console.error("useSend Campaign API error response:", errorDisplay);
      throw new Error(
        `Failed to create campaign: ${errorText || "Unknown error from server"}`,
      );
    }

    const responseData = (await response.json()) as CampaignResponse;
    return responseData;
  } catch (error) {
    if (error instanceof Error) {
      console.error("Campaign error message:", error.message);
      throw new Error(`Failed to send campaign: ${error.message}`);
    } else {
      console.error("Unexpected campaign error:", error);
      throw new Error("Failed to send campaign: Unexpected error occurred");
    }
  }
}

/**
 * Sends an individual email via the UseSend API.
 *
 * @param emailData - The email data object containing to, from, subject, text, html, and replyTo
 * @param apiKey - The API key for authentication
 * @throws Error if the API request fails
 */
async function sendEmailToUseSend(emailData: any, apiKey: string) {
  try {
    const apiEndpoint = "/api/v1/emails";
    const url = new URL(apiEndpoint, BASE_URL);
    console.log("Sending email to useSend API at:", url.href);

    const emailDataText = JSON.stringify(emailData);

    const response = await fetch(url.href, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: emailDataText,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorDisplay: string;
      try {
        // Try to parse and pretty-print JSON error responses
        errorDisplay = JSON.stringify(JSON.parse(errorText), null, 2);
      } catch {
        errorDisplay = errorText;
      }
      console.error(
        "useSend API error response:",
        errorDisplay,
        `\nemail data: ${emailDataText}`,
      );
      throw new Error(
        `Failed to send email: ${errorText || "Unknown error from server"}`,
      );
    }

    const responseData = await response.json();
    console.log("useSend API response:", responseData);
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      throw new Error(`Failed to send email: ${error.message}`);
    } else {
      console.error("Unexpected error:", error);
      throw new Error("Failed to send email: Unexpected error occurred");
    }
  }
}

/**
 * Converts plain text to a basic HTML document.
 *
 * Escapes HTML entities using the `he` library and converts newlines to `<br>` tags.
 * Wraps the result in a minimal HTML document structure.
 *
 * @param text - The plain text content to convert
 * @returns A complete HTML document string with the text as body content
 */
function textToHtml(text: string): string {
  const escapedText = he.encode(text, { useNamedReferences: true });
  // Convert newlines to <br> tags
  const htmlText = escapedText.replace(/\n/g, "<br>\n");
  return `<!DOCTYPE html><html><body><p>${htmlText}</p></body></html>`;
}

/**
 * Creates an unsubscribe footer element for campaign emails.
 *
 * Generates a styled paragraph containing an unsubscribe link with the
 * `{{usesend_unsubscribe_url}}` placeholder, which will be replaced with
 * the actual unsubscribe URL when the campaign is sent.
 *
 * @param document - The DOM Document to create elements in
 * @returns An HTMLElement containing the styled unsubscribe link
 */
function createUnsubscribeFooter(document: Document): HTMLElement {
  const footer = document.createElement("p");
  footer.setAttribute(
    "style",
    "margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;",
  );

  const link = document.createElement("a");
  link.setAttribute("href", "{{usesend_unsubscribe_url}}");
  link.setAttribute("style", "color: #666;");
  link.textContent = "Unsubscribe";

  footer.appendChild(link);
  return footer;
}

/**
 * Checks if the HTML content already contains an unsubscribe link placeholder.
 *
 * Looks for both legacy `{{unsend_unsubscribe_url}}` and current
 * `{{usesend_unsubscribe_url}}` placeholders.
 *
 * @param html - The HTML content to check
 * @returns True if an unsubscribe placeholder is found, false otherwise
 */
function hasUnsubscribeLink(html: string): boolean {
  return (
    html.includes("{{unsend_unsubscribe_url}}") ||
    html.includes("{{usesend_unsubscribe_url}}")
  );
}

/**
 * Prepares HTML content for campaign sending.
 *
 * This function ensures the email content is ready for campaign delivery by:
 * 1. Converting plain text to HTML if no HTML content is provided
 * 2. Adding an unsubscribe footer if one doesn't already exist
 *
 * Uses linkedom for proper DOM manipulation rather than string replacement,
 * ensuring robust handling of various HTML structures.
 *
 * @param html - The HTML content from the email, or false/undefined if not provided
 * @param text - The plain text content from the email, used as fallback
 * @returns The prepared HTML string, or null if no content is available
 */
function prepareCampaignHtml(
  html: string | false | undefined,
  text: string | undefined,
): string | null {
  // Convert plain text to HTML if no HTML provided
  let htmlContent: string;
  if (!html && text) {
    htmlContent = textToHtml(text);
  } else if (html) {
    htmlContent = html;
  } else {
    return null;
  }

  // Check if unsubscribe link already exists
  if (hasUnsubscribeLink(htmlContent)) {
    return htmlContent;
  }

  // Parse the HTML and add the unsubscribe footer using DOM APIs
  const { document } = parseHTML(htmlContent);

  const footer = createUnsubscribeFooter(document);

  // Append to body if it exists, otherwise append to document
  const body = document.querySelector("body");
  if (body) {
    body.appendChild(footer);
  } else {
    // No body tag - wrap content and add footer
    const html = document.querySelector("html");
    if (html) {
      html.appendChild(footer);
    } else {
      // Minimal HTML - just append
      document.appendChild(footer);
    }
  }

  return document.toString();
}

function loadCertificates(): { key?: Buffer; cert?: Buffer } {
  return {
    key: SSL_KEY_PATH ? readFileSync(SSL_KEY_PATH) : undefined,
    cert: SSL_CERT_PATH ? readFileSync(SSL_CERT_PATH) : undefined,
  };
}

const initialCerts = loadCertificates();

const serverOptions: SMTPServerOptions = {
  secure: false,
  key: initialCerts.key,
  cert: initialCerts.cert,
  onData(
    stream: Readable,
    session: SMTPServerSession,
    callback: (error?: Error) => void,
  ) {
    console.log("Receiving email data..."); // Debug statement
    simpleParser(stream, async (err, parsed) => {
      if (err) {
        console.error("Failed to parse email data:", err.message);
        return callback(err);
      }

      if (!session.user) {
        console.error("No API key found in session");
        return callback(new Error("No API key found in session"));
      }

      const toAddress = Array.isArray(parsed.to)
        ? parsed.to.map((addr) => addr.text).join(", ")
        : parsed.to?.text;

      const fromAddress = Array.isArray(parsed.from)
        ? parsed.from.map((addr) => addr.text).join(", ")
        : parsed.from?.text;

      const sendPromises: Promise<any>[] = [];
      const recipients = parseRecipients(toAddress);
      const hasCampaigns = recipients.contactBookIds.length > 0;
      const hasIndividualEmails = recipients.emailAddresses.length > 0;

      // Handle campaign sends (one campaign per contact book)
      if (hasCampaigns) {
        if (!fromAddress) {
          console.error("No from address found for campaign");
          return callback(new Error("From address is required for campaigns"));
        }

        if (!parsed.subject) {
          console.error("No subject found for campaign");
          return callback(new Error("Subject is required for campaigns"));
        }

        const htmlContent = prepareCampaignHtml(parsed.html, parsed.text);
        if (!htmlContent) {
          console.error("No content found for campaign");
          return callback(
            new Error("HTML or text content is required for campaigns"),
          );
        }

        for (const contactBookId of recipients.contactBookIds) {
          const campaignData: CampaignData = {
            name: `SMTP Campaign: ${parsed.subject}`,
            from: fromAddress,
            subject: parsed.subject,
            contactBookId,
            html: htmlContent,
            replyTo: parsed.replyTo?.text,
          };

          const campaignPromise = sendCampaignToUseSend(
            campaignData,
            session.user,
          ).catch((error) => {
            console.error(
              `Failed to send campaign to ${contactBookId}:`,
              error.message,
            );
            throw error;
          });

          sendPromises.push(campaignPromise);
        }
      }

      // Handle individual email sends
      if (hasIndividualEmails) {
        // Send to all individual recipients in one API call
        const emailObject = {
          to: recipients.emailAddresses,
          from: fromAddress,
          subject: parsed.subject,
          text: parsed.text,
          html: parsed.html,
          replyTo: parsed.replyTo?.text,
        };

        const emailPromise = sendEmailToUseSend(
          emailObject,
          session.user,
        ).catch((error) => {
          console.error("Failed to send individual emails:", error.message);
          throw error;
        });

        sendPromises.push(emailPromise);
      }

      if (sendPromises.length === 0) {
        console.error("No valid recipients found");
        return callback(new Error("No valid recipients found"));
      }

      try {
        await Promise.all(sendPromises);
        callback();
      } catch (error) {
        if (error instanceof Error) {
          callback(error);
        } else {
          callback(new Error("One or more sends failed"));
        }
      }
    });
  },
  onAuth(auth, session: any, callback: (error?: Error, user?: any) => void) {
    if (auth.username === AUTH_USERNAME && auth.password) {
      console.log("Authenticated successfully"); // Debug statement
      callback(undefined, { user: auth.password });
    } else {
      console.error("Invalid username or password");
      callback(new Error("Invalid username or password"));
    }
  },
  size: 10485760,
};

function startServers() {
  const servers: SMTPServer[] = [];
  const watchers: FSWatcher[] = [];

  if (SSL_KEY_PATH && SSL_CERT_PATH) {
    // Implicit SSL/TLS for ports 465 and 2465
    [465, 2465].forEach((port) => {
      const server = new SMTPServer({ ...serverOptions, secure: true });

      server.listen(port, () => {
        console.log(
          `Implicit SSL/TLS SMTP server is listening on port ${port}`,
        );
      });

      server.on("error", (err) => {
        console.error(`Error occurred on port ${port}:`, err);
      });

      servers.push(server);
    });
  }

  // STARTTLS for ports 25, 587, and 2587
  [25, 587, 2587].forEach((port) => {
    const server = new SMTPServer(serverOptions);

    server.listen(port, () => {
      console.log(`STARTTLS SMTP server is listening on port ${port}`);
    });

    server.on("error", (err) => {
      console.error(`Error occurred on port ${port}:`, err);
    });

    servers.push(server);
  });

  if (SSL_KEY_PATH && SSL_CERT_PATH) {
    const reloadCertificates = () => {
      try {
        const { key, cert } = loadCertificates();
        if (key && cert) {
          servers.forEach((srv) => srv.updateSecureContext({ key, cert }));
          console.log("TLS certificates reloaded");
        }
      } catch (err) {
        console.error("Failed to reload TLS certificates", err);
      }
    };

    [SSL_KEY_PATH, SSL_CERT_PATH].forEach((file) => {
      watchers.push(watch(file, { persistent: false }, reloadCertificates));
    });
  }
  return { servers, watchers };
}

const { servers, watchers } = startServers();

function shutdown() {
  console.log("Shutting down SMTP server...");
  watchers.forEach((w) => w.close());
  servers.forEach((s) => s.close());
  process.exit(0);
}

["SIGINT", "SIGTERM", "SIGQUIT"].forEach((signal) => {
  process.on(signal, shutdown);
});
