import {
  SESv2Client,
  CreateEmailIdentityCommand,
  DeleteEmailIdentityCommand,
  GetEmailIdentityCommand,
  PutEmailIdentityMailFromAttributesCommand,
  SendEmailCommand,
  CreateConfigurationSetEventDestinationCommand,
  CreateConfigurationSetCommand,
  DeleteConfigurationSetCommand,
  PutConfigurationSetTrackingOptionsCommand,
  EventType,
  GetAccountCommand,
  CreateTenantResourceAssociationCommand,
  DeleteTenantResourceAssociationCommand,
  DeleteSuppressedDestinationCommand,
} from "@aws-sdk/client-sesv2";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { generateKeyPairSync } from "crypto";
import nodemailer from "nodemailer";
import { env } from "~/env";
import { EmailContent } from "~/types";
import { logger } from "../logger/log";
import { buildHeaders } from "~/server/utils/email-headers";
import { addSesNoTrackToUnsubscribeLinks } from "~/server/utils/ses-tracking-html";

let accountId: string | undefined = undefined;

async function getAccountId(region: string) {
  if (accountId) {
    return accountId;
  }

  const stsClient = new STSClient({
    region: region,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY,
      secretAccessKey: env.AWS_SECRET_KEY,
    },
  });
  const command = new GetCallerIdentityCommand({});
  const response = await stsClient.send(command);
  accountId = response.Account;
  return accountId;
}

async function getIdentityArn(domain: string, region: string) {
  const accountId = await getAccountId(region);
  return `arn:aws:ses:${region}:${accountId}:identity/${domain}`;
}

function getSesClient(region: string) {
  return new SESv2Client({
    region: region,
    endpoint: env.AWS_SES_ENDPOINT,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY,
      secretAccessKey: env.AWS_SECRET_KEY,
    },
  });
}

function generateKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 1024, // Length of your key in bits
    publicKeyEncoding: {
      type: "spki", // Recommended to be 'spki' by the Node.js docs
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8", // Recommended to be 'pkcs8' by the Node.js docs
      format: "pem",
    },
  });

  const base64PrivateKey = privateKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\n/g, "");

  const base64PublicKey = publicKey
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\n/g, "");

  return { privateKey: base64PrivateKey, publicKey: base64PublicKey };
}

export async function addDomain(
  domain: string,
  region: string,
  sesTenantId?: string,
  dkimSelector: string = "usesend"
) {
  const sesClient = getSesClient(region);

  const { privateKey, publicKey } = generateKeyPair();
  const command = new CreateEmailIdentityCommand({
    EmailIdentity: domain,
    DkimSigningAttributes: {
      DomainSigningSelector: dkimSelector,
      DomainSigningPrivateKey: privateKey,
    },
  });
  const response = await sesClient.send(command);

  const emailIdentityCommand = new PutEmailIdentityMailFromAttributesCommand({
    EmailIdentity: domain,
    MailFromDomain: `mail.${domain}`,
  });

  const emailIdentityResponse = await sesClient.send(emailIdentityCommand);

  if (sesTenantId) {
    const tenantResourceAssociationCommand =
      new CreateTenantResourceAssociationCommand({
        TenantName: sesTenantId,
        ResourceArn: await getIdentityArn(domain, region),
      });

    const tenantResourceAssociationResponse = await sesClient.send(
      tenantResourceAssociationCommand
    );

    if (tenantResourceAssociationResponse.$metadata.httpStatusCode !== 200) {
      logger.error(
        { tenantResourceAssociationResponse },
        "Failed to associate domain with tenant"
      );
      throw new Error("Failed to associate domain with tenant");
    }
  }

  if (
    response.$metadata.httpStatusCode !== 200 ||
    emailIdentityResponse.$metadata.httpStatusCode !== 200
  ) {
    logger.error(
      { response, emailIdentityResponse },
      "Failed to create domain identity"
    );
    throw new Error("Failed to create domain identity");
  }

  return publicKey;
}

/**
 * DKIM-only identity for a custom click/open tracking hostname (no custom MAIL FROM).
 * Used for self-hosted per-domain SES tracking domains.
 */
export async function addTrackingEmailIdentity(
  hostname: string,
  region: string,
  sesTenantId?: string,
  dkimSelector: string = "utrack",
) {
  const sesClient = getSesClient(region);

  const { privateKey, publicKey } = generateKeyPair();
  const command = new CreateEmailIdentityCommand({
    EmailIdentity: hostname,
    DkimSigningAttributes: {
      DomainSigningSelector: dkimSelector,
      DomainSigningPrivateKey: privateKey,
    },
  });
  const response = await sesClient.send(command);

  if (sesTenantId) {
    const tenantResourceAssociationCommand =
      new CreateTenantResourceAssociationCommand({
        TenantName: sesTenantId,
        ResourceArn: await getIdentityArn(hostname, region),
      });

    const tenantResourceAssociationResponse = await sesClient.send(
      tenantResourceAssociationCommand,
    );

    if (tenantResourceAssociationResponse.$metadata.httpStatusCode !== 200) {
      logger.error(
        { tenantResourceAssociationResponse },
        "Failed to associate tracking identity with tenant",
      );
      throw new Error("Failed to associate tracking identity with tenant");
    }
  }

  if (response.$metadata.httpStatusCode !== 200) {
    logger.error({ response }, "Failed to create tracking email identity");
    throw new Error("Failed to create tracking email identity");
  }

  return publicKey;
}

/** Values supported for PutConfigurationSetTrackingOptions / HttpsPolicy in our app. */
export type SesTrackingHttpsPolicy = "OPTIONAL" | "REQUIRE";

export function trackingHttpsRequiredToSesPolicy(
  trackingHttpsRequired: boolean,
): SesTrackingHttpsPolicy {
  return trackingHttpsRequired ? "REQUIRE" : "OPTIONAL";
}

export async function putConfigurationSetHttpsTracking(
  configurationSetName: string,
  customRedirectDomain: string,
  region: string,
  httpsPolicy: SesTrackingHttpsPolicy,
) {
  const sesClient = getSesClient(region);
  const cmd = new PutConfigurationSetTrackingOptionsCommand({
    ConfigurationSetName: configurationSetName,
    CustomRedirectDomain: customRedirectDomain,
    HttpsPolicy: httpsPolicy,
  });
  const response = await sesClient.send(cmd);
  const code = response.$metadata.httpStatusCode;
  if (code !== 200) {
    throw new Error(
      `PutConfigurationSetTrackingOptions failed for ${configurationSetName}: HTTP ${code ?? "unknown"}`,
    );
  }
}

export async function deleteConfigurationSet(
  configurationSetName: string,
  region: string,
) {
  const sesClient = getSesClient(region);
  try {
    const response = await sesClient.send(
      new DeleteConfigurationSetCommand({
        ConfigurationSetName: configurationSetName,
      }),
    );
    return response.$metadata.httpStatusCode === 200;
  } catch (error: unknown) {
    const err = error as { name?: string };
    if (err.name === "NotFoundException") {
      return true;
    }
    throw error;
  }
}

export async function deleteDomain(
  domain: string,
  region: string,
  sesTenantId?: string
) {
  const sesClient = getSesClient(region);

  if (sesTenantId) {
    const tenantResourceAssociationCommand =
      new DeleteTenantResourceAssociationCommand({
        TenantName: sesTenantId,
        ResourceArn: await getIdentityArn(domain, region),
      });

    const tenantResourceAssociationResponse = await sesClient.send(
      tenantResourceAssociationCommand
    );

    if (tenantResourceAssociationResponse.$metadata.httpStatusCode !== 200) {
      logger.error(
        { tenantResourceAssociationResponse },
        "Failed to delete tenant resource association"
      );
      throw new Error("Failed to delete tenant resource association");
    }
  }

  const command = new DeleteEmailIdentityCommand({
    EmailIdentity: domain,
  });
  const response = await sesClient.send(command);
  return response.$metadata.httpStatusCode === 200;
}

export async function getDomainIdentity(domain: string, region: string) {
  const sesClient = getSesClient(region);
  const command = new GetEmailIdentityCommand({
    EmailIdentity: domain,
  });
  const response = await sesClient.send(command);
  return response;
}

export async function sendRawEmail({
  to,
  from,
  subject,
  replyTo,
  cc,
  bcc,
  text,
  html,
  attachments,
  region,
  configurationSetName,
  unsubUrl,
  isBulk,
  inReplyToMessageId,
  emailId,
  sesTenantId,
  headers,
}: Partial<EmailContent> & {
  region: string;
  configurationSetName: string;
  attachments?: { filename: string; content: string }[]; // Made attachments optional
  cc?: string[];
  bcc?: string[];
  replyTo?: string[];
  to?: string[];
  unsubUrl?: string;
  isBulk?: boolean;
  inReplyToMessageId?: string;
  emailId?: string;
}) {
  const sesClient = getSesClient(region);

  const htmlForSes = html ? addSesNoTrackToUnsubscribeLinks(html) : html;

  const { message: messageStream } = await nodemailer
    .createTransport({ streamTransport: true })
    .sendMail({
      from,
      to,
      subject,
      html: htmlForSes,
      attachments: attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        encoding: "base64",
      })),
      text,
      replyTo,
      cc,
      bcc,
      headers: buildHeaders({
        emailId,
        headers,
        unsubUrl,
        isBulk,
        inReplyToMessageId,
      }),
    });

  const chunks = [];
  for await (const chunk of messageStream) {
    chunks.push(chunk);
  }
  const finalMessageData = Buffer.concat(chunks);

  const command = new SendEmailCommand({
    Content: {
      Raw: {
        Data: finalMessageData,
      },
    },
    ConfigurationSetName: configurationSetName,
    TenantName: sesTenantId ? sesTenantId : undefined,
  });

  try {
    const response = await sesClient.send(command);
    logger.info({ messageId: response.MessageId }, "Email sent!");
    return response.MessageId;
  } catch (error) {
    logger.error({ err: error }, "Failed to send email");
    // It's better to throw the original error or a new error with more context
    // throw new Error("Failed to send email");
    throw error;
  }
}

export async function getAccount(region: string) {
  const client = getSesClient(region);
  const input = new GetAccountCommand({});
  const response = await client.send(input);
  return response;
}

function isAlreadyExistsError(error: unknown): boolean {
  return (error as { name?: string })?.name === "AlreadyExistsException";
}

export async function addWebhookConfiguration(
  configName: string,
  topicArn: string,
  eventTypes: EventType[],
  region: string
) {
  const sesClient = getSesClient(region);

  const configSetCommand = new CreateConfigurationSetCommand({
    ConfigurationSetName: configName,
  });

  try {
    const configSetResponse = await sesClient.send(configSetCommand);
    if (configSetResponse.$metadata.httpStatusCode !== 200) {
      throw new Error("Failed to create configuration set");
    }
  } catch (error: unknown) {
    if (!isAlreadyExistsError(error)) {
      throw error;
    }
    logger.debug(
      { configName, region },
      "SES configuration set already exists; continuing",
    );
  }

  const command = new CreateConfigurationSetEventDestinationCommand({
    ConfigurationSetName: configName, // required
    EventDestinationName: "usesend_destination", // required
    EventDestination: {
      Enabled: true,
      MatchingEventTypes: eventTypes,
      SnsDestination: {
        TopicArn: topicArn,
      },
    },
  });

  try {
    const response = await sesClient.send(command);
    if (response.$metadata.httpStatusCode !== 200) {
      throw new Error("Failed to create configuration set event destination");
    }
  } catch (error: unknown) {
    if (!isAlreadyExistsError(error)) {
      throw error;
    }
    logger.debug(
      { configName, region },
      "SES event destination already exists; continuing",
    );
  }

  return true;
}

/**
 * Remove email from AWS SES account-level suppression list
 * Returns true if successful or email wasn't suppressed, false on error
 */
export async function deleteFromSesSuppressionList(
  email: string,
  region: string
): Promise<boolean> {
  const sesClient = getSesClient(region);
  try {
    const command = new DeleteSuppressedDestinationCommand({
      EmailAddress: email,
    });
    await sesClient.send(command);
    logger.info({ email, region }, "Removed email from SES suppression list");
    return true;
  } catch (error: any) {
    // NotFoundException means email wasn't in SES suppression list - that's fine
    if (error.name === "NotFoundException") {
      logger.debug(
        { email, region },
        "Email not in SES suppression list (already removed or never added)"
      );
      return true;
    }
    logger.error(
      { email, region, error: error.message },
      "Failed to remove email from SES suppression list"
    );
    return false;
  }
}
