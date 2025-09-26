import { EmailContent } from "~/types";
import { db } from "../db";
import { UnsendApiError } from "~/server/public-api/api-error";
import { EmailQueueService } from "./email-queue-service";
import { validateDomainFromEmail, validateApiKeyDomainAccess } from "./domain-service";
import { EmailRenderer } from "@usesend/email-editor/src/renderer";
import { logger } from "../logger/log";
import { SuppressionService } from "./suppression-service";
import { sanitizeCustomHeaders } from "~/server/utils/email-headers";

async function checkIfValidEmail(emailId: string) {
  const email = await db.email.findUnique({
    where: { id: emailId },
  });

  if (!email || !email.domainId) {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message: "Email not found",
    });
  }

  const domain = await db.domain.findUnique({
    where: { id: email.domainId },
  });

  if (!domain) {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message: "Email not found",
    });
  }

  return { email, domain };
}

export const replaceVariables = (
  text: string,
  variables: Record<string, string>
) => {
  return Object.keys(variables).reduce((accum, key) => {
    const re = new RegExp(`{{${key}}}`, "g");
    const returnTxt = accum.replace(re, variables[key] as string);
    return returnTxt;
  }, text);
};

/**
 Send transactional email
 */
export async function sendEmail(
  emailContent: EmailContent & { teamId: number; apiKeyId?: number }
) {
  const {
    to,
    from,
    subject: subjectFromApiCall,
    templateId,
    variables,
    text,
    html: htmlFromApiCall,
    teamId,
    attachments,
    replyTo,
    cc,
    bcc,
    scheduledAt,
    apiKeyId,
    inReplyToId,
    headers,
  } = emailContent;
  let subject = subjectFromApiCall;
  let html = htmlFromApiCall;
  const sanitizedHeaders = sanitizeCustomHeaders(headers);

  let domain: Awaited<ReturnType<typeof validateDomainFromEmail>>;
  
  // If this is an API call with an API key, validate domain access
  if (apiKeyId) {
    const apiKey = await db.apiKey.findUnique({
      where: { id: apiKeyId },
      include: { domain: true },
    });
    
    if (!apiKey) {
      throw new UnsendApiError({
        code: "BAD_REQUEST",
        message: "Invalid API key",
      });
    }
    
    domain = await validateApiKeyDomainAccess(from, teamId, apiKey);
  } else {
    // For non-API calls (dashboard, etc.), use regular domain validation
    domain = await validateDomainFromEmail(from, teamId);
  }

  // Check for suppressed emails before sending
  const toEmails = Array.isArray(to) ? to : [to];
  const ccEmails = cc ? (Array.isArray(cc) ? cc : [cc]) : [];
  const bccEmails = bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : [];

  // Collect all unique emails to check for suppressions
  const allEmailsToCheck = [
    ...new Set([...toEmails, ...ccEmails, ...bccEmails]),
  ];

  const suppressionResults = await SuppressionService.checkMultipleEmails(
    allEmailsToCheck,
    teamId
  );

  // Filter each field separately
  const filteredToEmails = toEmails.filter(
    (email) => !suppressionResults[email]
  );
  const filteredCcEmails = ccEmails.filter(
    (email) => !suppressionResults[email]
  );
  const filteredBccEmails = bccEmails.filter(
    (email) => !suppressionResults[email]
  );

  // Only block the email if all TO recipients are suppressed
  if (filteredToEmails.length === 0) {
    logger.info(
      {
        to,
        teamId,
      },
      "All TO recipients are suppressed. No emails to send."
    );

    const emailCreateData: Record<string, unknown> = {
      to: toEmails,
      from,
      subject: subject as string,
      teamId,
      domainId: domain.id,
      latestStatus: "SUPPRESSED",
      apiId: apiKeyId,
      text,
      html,
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      bcc: bccEmails.length > 0 ? bccEmails : undefined,
      inReplyToId,
    };

    if (sanitizedHeaders) {
      emailCreateData.headers = sanitizedHeaders;
    }

    const email = await db.email.create({
      data: emailCreateData as any,
    });

    await db.emailEvent.create({
      data: {
        emailId: email.id,
        status: "SUPPRESSED",
        data: {
          error: "All TO recipients are suppressed. No emails to send.",
        },
        teamId,
      },
    });

    return email;
  }

  // Log if any CC/BCC emails were filtered out
  if (ccEmails.length > filteredCcEmails.length) {
    logger.info(
      {
        originalCc: ccEmails,
        filteredCc: filteredCcEmails,
        teamId,
      },
      "Some CC recipients were suppressed and filtered out."
    );
  }

  if (bccEmails.length > filteredBccEmails.length) {
    logger.info(
      {
        originalBcc: bccEmails,
        filteredBcc: filteredBccEmails,
        teamId,
      },
      "Some BCC recipients were suppressed and filtered out."
    );
  }

  if (templateId) {
    const template = await db.template.findUnique({
      where: { id: templateId },
    });

    if (template) {
      const jsonContent = JSON.parse(template.content || "{}");
      const renderer = new EmailRenderer(jsonContent);

      subject = replaceVariables(template.subject || "", variables || {});

      // {{}} for link replacements
      const modifiedVariables = {
        ...variables,
        ...Object.keys(variables || {}).reduce(
          (acc, key) => {
            acc[`{{${key}}}`] = variables?.[key] || "";
            return acc;
          },
          {} as Record<string, string>
        ),
      };

      html = await renderer.render({
        shouldReplaceVariableValues: true,
        variableValues: modifiedVariables,
      });
    }
  }

  if (inReplyToId) {
    const email = await db.email.findUnique({
      where: {
        id: inReplyToId,
        teamId,
      },
    });

    if (!email) {
      throw new UnsendApiError({
        code: "BAD_REQUEST",
        message: '"inReplyTo" is invalid',
      });
    }
  }

  if (!text && !html) {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message: "Either text or html is required",
    });
  }

  const scheduledAtDate = scheduledAt ? new Date(scheduledAt) : undefined;
  const delay = scheduledAtDate
    ? Math.max(0, scheduledAtDate.getTime() - Date.now())
    : undefined;

  const emailCreateData: Record<string, unknown> = {
    to: filteredToEmails,
    from,
    subject: subject as string,
    replyTo: replyTo
      ? Array.isArray(replyTo)
        ? replyTo
        : [replyTo]
      : undefined,
    cc: filteredCcEmails.length > 0 ? filteredCcEmails : undefined,
    bcc: filteredBccEmails.length > 0 ? filteredBccEmails : undefined,
    text,
    html,
    teamId,
    domainId: domain.id,
    attachments: attachments ? JSON.stringify(attachments) : undefined,
    scheduledAt: scheduledAtDate,
    latestStatus: scheduledAtDate ? "SCHEDULED" : "QUEUED",
    apiId: apiKeyId,
    inReplyToId,
  };

  if (sanitizedHeaders) {
    emailCreateData.headers = sanitizedHeaders;
  }

  const email = await db.email.create({
    data: emailCreateData as any,
  });

  try {
    await EmailQueueService.queueEmail(
      email.id,
      teamId,
      domain.region,
      true,
      undefined,
      delay
    );
  } catch (error: any) {
    await db.emailEvent.create({
      data: {
        emailId: email.id,
        status: "FAILED",
        data: {
          error: error.toString(),
        },
        teamId,
      },
    });
    await db.email.update({
      where: { id: email.id },
      data: { latestStatus: "FAILED" },
    });
    throw error;
  }

  return email;
}

export async function updateEmail(
  emailId: string,
  {
    scheduledAt,
  }: {
    scheduledAt?: string;
  }
) {
  const { email, domain } = await checkIfValidEmail(emailId);

  if (email.latestStatus !== "SCHEDULED") {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message: "Email already processed",
    });
  }

  const scheduledAtDate = scheduledAt ? new Date(scheduledAt) : undefined;
  const delay = scheduledAtDate
    ? Math.max(0, scheduledAtDate.getTime() - Date.now())
    : undefined;

  await db.email.update({
    where: { id: emailId },
    data: {
      scheduledAt: scheduledAtDate,
    },
  });

  await EmailQueueService.changeDelay(emailId, domain.region, true, delay ?? 0);
}

export async function cancelEmail(emailId: string) {
  const { email, domain } = await checkIfValidEmail(emailId);

  if (email.latestStatus !== "SCHEDULED") {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message: "Email already processed",
    });
  }

  await EmailQueueService.chancelEmail(emailId, domain.region, true);

  await db.email.update({
    where: { id: emailId },
    data: {
      latestStatus: "CANCELLED",
    },
  });

  await db.emailEvent.create({
    data: {
      emailId,
      status: "CANCELLED",
      teamId: email.teamId,
    },
  });
}

/**
 * Send multiple emails in bulk (up to 100 at a time)
 * Handles template rendering, variable replacement, and efficient bulk queuing
 */
export async function sendBulkEmails(
  emailContents: Array<
    EmailContent & {
      teamId: number;
      apiKeyId?: number;
    }
  >
) {
  if (emailContents.length === 0) {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message: "No emails provided for bulk send",
    });
  }

  if (emailContents.length > 100) {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message: "Cannot send more than 100 emails in a single bulk request",
    });
  }

  // Filter out suppressed emails
  const emailChecks = await Promise.all(
    emailContents.map(async (content, index) => {
      const toEmails = Array.isArray(content.to) ? content.to : [content.to];
      const ccEmails = content.cc
        ? Array.isArray(content.cc)
          ? content.cc
          : [content.cc]
        : [];
      const bccEmails = content.bcc
        ? Array.isArray(content.bcc)
          ? content.bcc
          : [content.bcc]
        : [];

      // Collect all unique emails to check for suppressions
      const allEmailsToCheck = [
        ...new Set([...toEmails, ...ccEmails, ...bccEmails]),
      ];

      const suppressionResults = await SuppressionService.checkMultipleEmails(
        allEmailsToCheck,
        content.teamId
      );

      // Filter each field separately
      const filteredToEmails = toEmails.filter(
        (email) => !suppressionResults[email]
      );
      const filteredCcEmails = ccEmails.filter(
        (email) => !suppressionResults[email]
      );
      const filteredBccEmails = bccEmails.filter(
        (email) => !suppressionResults[email]
      );

      // Only consider it suppressed if all TO recipients are suppressed
      const hasSuppressedToEmails = filteredToEmails.length === 0;

      return {
        originalIndex: index,
        content: {
          ...content,
          to: filteredToEmails,
          cc: filteredCcEmails.length > 0 ? filteredCcEmails : undefined,
          bcc: filteredBccEmails.length > 0 ? filteredBccEmails : undefined,
        },
        suppressed: hasSuppressedToEmails,
        suppressedEmails: toEmails.filter((email) => suppressionResults[email]),
        suppressedCcEmails: ccEmails.filter(
          (email) => suppressionResults[email]
        ),
        suppressedBccEmails: bccEmails.filter(
          (email) => suppressionResults[email]
        ),
      };
    })
  );

  const validEmails = emailChecks.filter((check) => !check.suppressed);
  const suppressedEmailsInfo = emailChecks.filter((check) => check.suppressed);

  // Log suppressed emails for reporting
  if (suppressedEmailsInfo.length > 0) {
    logger.info(
      {
        suppressedCount: suppressedEmailsInfo.length,
        totalCount: emailContents.length,
        suppressedEmails: suppressedEmailsInfo.map((info) => ({
          to: info.content.to,
          suppressedAddresses: info.suppressedEmails,
        })),
      },
      "Filtered suppressed emails from bulk send"
    );
  }

  // Update emailContents to only include valid emails
  const filteredEmailContents = validEmails.map((check) => check.content);

  // Create suppressed email records
  const suppressedEmails = [];
  for (const suppressedInfo of suppressedEmailsInfo) {
    const originalContent = emailContents[suppressedInfo.originalIndex];
    if (!originalContent) continue;

    const {
      to,
      from,
      subject: subjectFromApiCall,
      templateId,
      variables,
      text,
      html: htmlFromApiCall,
      teamId,
      attachments,
      replyTo,
      cc,
      bcc,
      scheduledAt,
      apiKeyId,
      inReplyToId,
    } = originalContent;

    let subject = subjectFromApiCall;
    let html = htmlFromApiCall;

    // Validate domain for suppressed email too
    const domain = await validateDomainFromEmail(from, teamId);

    // Process template if specified
    if (templateId) {
      const template = await db.template.findUnique({
        where: { id: templateId },
      });

      if (template) {
        const jsonContent = JSON.parse(template.content || "{}");
        const renderer = new EmailRenderer(jsonContent);

        subject = replaceVariables(template.subject || "", variables || {});

        // {{}} for link replacements
        const modifiedVariables = {
          ...variables,
          ...Object.keys(variables || {}).reduce(
            (acc, key) => {
              acc[`{{${key}}}`] = variables?.[key] || "";
              return acc;
            },
            {} as Record<string, string>
          ),
        };

        html = await renderer.render({
          shouldReplaceVariableValues: true,
          variableValues: modifiedVariables,
        });
      }
    }

    const originalToEmails = Array.isArray(originalContent.to)
      ? originalContent.to
      : [originalContent.to];
    const originalCcEmails = originalContent.cc
      ? Array.isArray(originalContent.cc)
        ? originalContent.cc
        : [originalContent.cc]
      : [];
    const originalBccEmails = originalContent.bcc
      ? Array.isArray(originalContent.bcc)
        ? originalContent.bcc
        : [originalContent.bcc]
      : [];

    const sanitizedHeaders = sanitizeCustomHeaders(originalContent.headers);

    const emailCreateData: Record<string, unknown> = {
      to: originalToEmails,
      from,
      subject: subject as string,
      replyTo: replyTo
        ? Array.isArray(replyTo)
          ? replyTo
          : [replyTo]
        : undefined,
      cc: originalCcEmails.length > 0 ? originalCcEmails : undefined,
      bcc: originalBccEmails.length > 0 ? originalBccEmails : undefined,
      text,
      html,
      teamId,
      domainId: domain.id,
      attachments: attachments ? JSON.stringify(attachments) : undefined,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      latestStatus: "SUPPRESSED",
      apiId: apiKeyId,
      inReplyToId,
    };

    if (sanitizedHeaders) {
      emailCreateData.headers = sanitizedHeaders;
    }

    const email = await db.email.create({
      data: emailCreateData as any,
    });

    await db.emailEvent.create({
      data: {
        emailId: email.id,
        status: "SUPPRESSED",
        data: {
          error: "All TO recipients are suppressed. No emails to send.",
        },
        teamId,
      },
    });

    suppressedEmails.push({
      email,
      originalIndex: suppressedInfo.originalIndex,
    });
  }

  if (filteredEmailContents.length === 0) {
    // Return only suppressed emails if no valid emails to send
    return suppressedEmails.map((item) => item.email);
  }

  // Group emails by domain to minimize domain validations
  const emailsByDomain = new Map<
    string,
    {
      domain: Awaited<ReturnType<typeof validateDomainFromEmail>>;
      emails: typeof filteredEmailContents;
    }
  >();

  // First pass: validate domains and group emails
  for (const content of filteredEmailContents) {
    const { from } = content;
    if (!emailsByDomain.has(from)) {
      const domain = await validateDomainFromEmail(from, content.teamId);
      emailsByDomain.set(from, { domain, emails: [] });
    }
    emailsByDomain.get(from)?.emails.push(content);
  }

  // Cache templates to avoid repeated database queries
  const templateCache = new Map<
    number,
    { subject: string; content: any; renderer: EmailRenderer }
  >();

  const createdEmails = [];
  const queueJobs = [];

  // Process each domain group
  for (const { domain, emails } of emailsByDomain.values()) {
    // Process emails in each domain group
    for (const content of emails) {
      const {
        to,
        from,
        subject: subjectFromApiCall,
        templateId,
        variables,
        text,
        html: htmlFromApiCall,
        teamId,
        attachments,
        replyTo,
        cc,
        bcc,
        scheduledAt,
        apiKeyId,
        headers,
      } = content;

      // Find the original index for this email
      const originalIndex =
        validEmails.find((check) => check.content === content)?.originalIndex ??
        -1;

      let subject = subjectFromApiCall;
      let html = htmlFromApiCall;
      const sanitizedHeaders = sanitizeCustomHeaders(headers);

      // Process template if specified
      if (templateId) {
        let templateData = templateCache.get(Number(templateId));
        if (!templateData) {
          const template = await db.template.findUnique({
            where: { id: templateId },
          });
          if (template) {
            const jsonContent = JSON.parse(template.content || "{}");
            templateData = {
              subject: template.subject || "",
              content: jsonContent,
              renderer: new EmailRenderer(jsonContent),
            };
            templateCache.set(Number(templateId), templateData);
          }
        }

        if (templateData) {
          subject = replaceVariables(templateData.subject, variables || {});

          // {{}} for link replacements
          const modifiedVariables = {
            ...variables,
            ...Object.keys(variables || {}).reduce(
              (acc, key) => {
                acc[`{{${key}}}`] = variables?.[key] || "";
                return acc;
              },
              {} as Record<string, string>
            ),
          };

          html = await templateData.renderer.render({
            shouldReplaceVariableValues: true,
            variableValues: modifiedVariables,
          });
        }
      }

      if (!text && !html) {
        throw new UnsendApiError({
          code: "BAD_REQUEST",
          message: `Either text or html is required for email to ${to}`,
        });
      }

      const scheduledAtDate = scheduledAt ? new Date(scheduledAt) : undefined;
      const delay = scheduledAtDate
        ? Math.max(0, scheduledAtDate.getTime() - Date.now())
        : undefined;

      try {
        // Create email record
        const emailCreateData: Record<string, unknown> = {
          to: Array.isArray(to) ? to : [to],
          from,
          subject: subject as string,
          replyTo: replyTo
            ? Array.isArray(replyTo)
              ? replyTo
              : [replyTo]
            : undefined,
          cc: cc && cc.length > 0 ? cc : undefined,
          bcc: bcc && bcc.length > 0 ? bcc : undefined,
          text,
          html,
          teamId,
          domainId: domain.id,
          attachments: attachments ? JSON.stringify(attachments) : undefined,
          scheduledAt: scheduledAtDate,
          latestStatus: scheduledAtDate ? "SCHEDULED" : "QUEUED",
          apiId: apiKeyId,
        };

        if (sanitizedHeaders) {
          emailCreateData.headers = sanitizedHeaders;
        }

        const email = await db.email.create({
          data: emailCreateData as any,
        });

        createdEmails.push({ email, originalIndex });

        // Prepare queue job
        queueJobs.push({
          emailId: email.id,
          teamId,
          region: domain.region,
          transactional: true, // Bulk emails are still transactional
          delay,
          timestamp: Date.now(),
        });
      } catch (error: any) {
        logger.error(
          { err: error, to },
          `Failed to create email record for recipient`
        );
        // Continue processing other emails
      }
    }
  }

  if (queueJobs.length === 0) {
    throw new UnsendApiError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create any email records",
    });
  }

  // Bulk queue all jobs
  try {
    await EmailQueueService.queueBulk(queueJobs);
  } catch (error: any) {
    // Mark all created emails as failed
    await Promise.all(
      createdEmails.map(async (email) => {
        await db.emailEvent.create({
          data: {
            emailId: email.email.id,
            status: "FAILED",
            data: {
              error: error.toString(),
            },
            teamId: email.email.teamId,
          },
        });
        await db.email.update({
          where: { id: email.email.id },
          data: { latestStatus: "FAILED" },
        });
      })
    );
    throw error;
  }

  // Combine and sort all emails by original index to preserve order
  const allEmails = [...suppressedEmails, ...createdEmails];
  allEmails.sort((a, b) => a.originalIndex - b.originalIndex);

  // Return just the email objects in the correct order
  return allEmails.map((item) => item.email);
}
