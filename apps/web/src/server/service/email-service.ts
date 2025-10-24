import { EmailContent } from "~/types";
import { db } from "../db";
import { UnsendApiError } from "~/server/public-api/api-error";
import { EmailQueueService } from "./email-queue-service";
import {
  validateDomainFromEmail,
  validateApiKeyDomainAccess,
} from "./domain-service";
import { EmailRenderer } from "@usesend/email-editor/src/renderer";
import { logger } from "../logger/log";
import { SuppressionService } from "./suppression-service";
import { sanitizeCustomHeaders } from "~/server/utils/email-headers";
import { Prisma } from "@prisma/client";
import { deleteKey, getJsonValue, setJsonValue } from "../redis";

const IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24 * 3; // 3 days
const IDEMPOTENCY_WAIT_ATTEMPTS = 5;
const IDEMPOTENCY_WAIT_DELAY_MS = 100;

type EmailIdempotencyStatus = "PENDING" | "CREATED" | "QUEUED" | "FAILED";

type EmailIdempotencyRecord = {
  status: EmailIdempotencyStatus;
  emailId?: string;
  createdAt: string;
  queuedAt?: string;
  lastUpdatedAt: string;
  error?: string;
};

async function waitForIdempotentRecord(
  redisKey: string
): Promise<EmailIdempotencyRecord | null> {
  for (let attempt = 0; attempt < IDEMPOTENCY_WAIT_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, IDEMPOTENCY_WAIT_DELAY_MS));
    const record = await getJsonValue<EmailIdempotencyRecord>(redisKey);
    if (!record || record.status === "FAILED" || record.emailId) {
      return record ?? null;
    }
  }

  return getJsonValue<EmailIdempotencyRecord>(redisKey);
}

async function resolveEmailFromRecord(
  record: EmailIdempotencyRecord | null,
  redisKey: string,
  teamId: number
) {
  if (!record || !record.emailId) {
    return null;
  }

  const email = await db.email.findUnique({ where: { id: record.emailId } });

  if (!email) {
    await deleteKey(redisKey);
    return null;
  }

  logger.info(
    {
      emailId: email.id,
      teamId,
      redisKey,
      status: record.status,
    },
    "Returning cached idempotent email send result (entries expire after 3 days)."
  );

  return email;
}

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
    idempotencyKey,
  } = emailContent;
  let subject = subjectFromApiCall;
  let html = htmlFromApiCall;

  const normalizedIdempotencyKey = idempotencyKey?.trim();
  const idempotencyRedisKey = normalizedIdempotencyKey
    ? `email-idempotency:${teamId}:${normalizedIdempotencyKey}`
    : null;
  let idempotencyRecordSnapshot: EmailIdempotencyRecord | null = null;
  let idempotencyCreatedAt = new Date().toISOString();

  if (idempotencyRedisKey) {
    let existingRecord = await getJsonValue<EmailIdempotencyRecord>(
      idempotencyRedisKey
    );

    if (existingRecord?.status === "FAILED") {
      await deleteKey(idempotencyRedisKey);
      existingRecord = null;
    } else {
      const cachedEmail = await resolveEmailFromRecord(
        existingRecord,
        idempotencyRedisKey,
        teamId
      );

      if (cachedEmail) {
        return cachedEmail;
      }

      if (existingRecord?.status === "PENDING") {
        const awaitedRecord = await waitForIdempotentRecord(
          idempotencyRedisKey
        );
        const awaitedEmail = await resolveEmailFromRecord(
          awaitedRecord,
          idempotencyRedisKey,
          teamId
        );

        if (awaitedEmail) {
          return awaitedEmail;
        }

        if (awaitedRecord?.status === "FAILED") {
          await deleteKey(idempotencyRedisKey);
          existingRecord = null;
        } else {
          existingRecord = awaitedRecord;
        }
      }
    }

    const nowIso = new Date().toISOString();
    const pendingRecord: EmailIdempotencyRecord = {
      status: "PENDING",
      createdAt: existingRecord?.createdAt ?? nowIso,
      lastUpdatedAt: nowIso,
    };

    const setResult = await setJsonValue(idempotencyRedisKey, pendingRecord, {
      ttlSeconds: IDEMPOTENCY_TTL_SECONDS,
      mode: "NX",
    });

    if (setResult !== "OK") {
      const latestRecord = await waitForIdempotentRecord(idempotencyRedisKey);
      const latestEmail = await resolveEmailFromRecord(
        latestRecord,
        idempotencyRedisKey,
        teamId
      );

      if (latestEmail) {
        return latestEmail;
      }

      if (latestRecord?.status === "FAILED") {
        await deleteKey(idempotencyRedisKey);
      }

      throw new UnsendApiError({
        code: "NOT_UNIQUE",
        message: "A request with this idempotency key is already in progress.",
      });
    }

    idempotencyCreatedAt = pendingRecord.createdAt;
    idempotencyRecordSnapshot = pendingRecord;
  }

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

    const email = await db.email.create({
      data: {
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
      },
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

  const email = await db.email.create({
    data: {
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
      headers: headers ? JSON.stringify(headers) : undefined,
    },
  });

  if (idempotencyRedisKey) {
    const createdAtIso = new Date().toISOString();
    const createdRecord: EmailIdempotencyRecord = {
      status: "CREATED",
      emailId: email.id,
      createdAt: idempotencyCreatedAt,
      lastUpdatedAt: createdAtIso,
    };

    await setJsonValue(idempotencyRedisKey, createdRecord, {
      ttlSeconds: IDEMPOTENCY_TTL_SECONDS,
    });

    idempotencyRecordSnapshot = createdRecord;
  }

  try {
    await EmailQueueService.queueEmail(
      email.id,
      teamId,
      domain.region,
      true,
      undefined,
      delay
    );

    if (idempotencyRedisKey) {
      const queuedAt = new Date().toISOString();
      const queuedRecord: EmailIdempotencyRecord = {
        status: "QUEUED",
        emailId: email.id,
        createdAt: idempotencyRecordSnapshot?.createdAt ?? idempotencyCreatedAt,
        queuedAt,
        lastUpdatedAt: queuedAt,
      };

      await setJsonValue(idempotencyRedisKey, queuedRecord, {
        ttlSeconds: IDEMPOTENCY_TTL_SECONDS,
      });

      idempotencyRecordSnapshot = queuedRecord;
    }
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

    if (idempotencyRedisKey) {
      const failedAt = new Date().toISOString();
      const failureRecord: EmailIdempotencyRecord = {
        status: "FAILED",
        emailId: email.id,
        createdAt:
          idempotencyRecordSnapshot?.createdAt ?? idempotencyCreatedAt,
        lastUpdatedAt: failedAt,
        error: error instanceof Error ? error.message : String(error),
      };

      await setJsonValue(idempotencyRedisKey, failureRecord, {
        ttlSeconds: IDEMPOTENCY_TTL_SECONDS,
      });
    }
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

    const email = await db.email.create({
      data: {
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
        headers: originalContent.headers
          ? JSON.stringify(originalContent.headers)
          : undefined,
      },
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
        const email = await db.email.create({
          data: {
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
            headers: headers ? JSON.stringify(headers) : undefined,
          },
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
