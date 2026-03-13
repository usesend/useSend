import dns from "dns";
import util from "util";
import * as tldts from "tldts";
import * as ses from "~/server/aws/ses";
import { db } from "~/server/db";
import { env } from "~/env";
import { renderDomainVerificationStatusEmail } from "~/server/email-templates";
import { logger } from "~/server/logger/log";
import { sendMail } from "~/server/mailer";
import { getRedis, redisKey } from "~/server/redis";
import { SesSettingsService } from "./ses-settings-service";
import { UnsendApiError } from "../public-api/api-error";
import { ApiKey, DomainStatus, type Domain } from "@prisma/client";
import {
  type DomainPayload,
  type DomainWebhookEventType,
} from "@usesend/lib/src/webhook/webhook-events";
import { LimitService } from "./limit-service";
import type { DomainDnsRecord } from "~/types/domain";
import { WebhookService } from "./webhook-service";

const DOMAIN_STATUS_VALUES = new Set(Object.values(DomainStatus));
export const DOMAIN_UNVERIFIED_RECHECK_MS = 6 * 60 * 60 * 1000;
export const DOMAIN_VERIFIED_RECHECK_MS = 30 * 24 * 60 * 60 * 1000;
const VERIFIED_DOMAIN_STATUSES = new Set<DomainStatus>([DomainStatus.SUCCESS]);

type DomainVerificationState = {
  hasEverVerified: boolean;
  lastCheckedAt: Date | null;
  lastNotifiedStatus: DomainStatus | null;
};

type DomainWithDnsRecords = Domain & { dnsRecords: DomainDnsRecord[] };

type DomainVerificationRefreshResult = DomainWithDnsRecords & {
  verificationError: string | null;
  lastCheckedTime: string | null;
  previousStatus: DomainStatus;
  statusChanged: boolean;
  hasEverVerified: boolean;
};

function parseDomainStatus(status?: string | null): DomainStatus {
  if (!status) {
    return DomainStatus.NOT_STARTED;
  }

  const normalized = status.toUpperCase();

  if (DOMAIN_STATUS_VALUES.has(normalized as DomainStatus)) {
    return normalized as DomainStatus;
  }

  return DomainStatus.NOT_STARTED;
}

function buildDnsRecords(domain: Domain): DomainDnsRecord[] {
  const subdomainSuffix = domain.subdomain ? `.${domain.subdomain}` : "";
  const mailDomain = `mail${subdomainSuffix}`;
  const dkimSelector = domain.dkimSelector ?? "usesend";

  const spfStatus = parseDomainStatus(domain.spfDetails);
  const dkimStatus = parseDomainStatus(domain.dkimStatus);
  const dmarcStatus = domain.dmarcAdded
    ? DomainStatus.SUCCESS
    : DomainStatus.NOT_STARTED;

  return [
    {
      type: "MX",
      name: mailDomain,
      value: `feedback-smtp.${domain.region}.amazonses.com`,
      ttl: "Auto",
      priority: "10",
      status: spfStatus,
    },
    {
      type: "TXT",
      name: `${dkimSelector}._domainkey${subdomainSuffix}`,
      value: `p=${domain.publicKey}`,
      ttl: "Auto",
      status: dkimStatus,
    },
    {
      type: "TXT",
      name: mailDomain,
      value: "v=spf1 include:amazonses.com ~all",
      ttl: "Auto",
      status: spfStatus,
    },
    {
      type: "TXT",
      name: "_dmarc",
      value: "v=DMARC1; p=none;",
      ttl: "Auto",
      status: dmarcStatus,
      recommended: true,
    },
  ];
}

function withDnsRecords<T extends Domain>(
  domain: T,
): T & { dnsRecords: DomainDnsRecord[] } {
  return {
    ...domain,
    dnsRecords: buildDnsRecords(domain),
  };
}

const dnsResolveTxt = util.promisify(dns.resolveTxt);

function getDomainVerificationKey(kind: string, domainId: number) {
  return redisKey(`domain:verification:${kind}:${domainId}`);
}

function normalizeDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function getDomainVerificationState(
  domainId: number,
): Promise<DomainVerificationState> {
  const redis = getRedis();
  const [lastCheckedValue, lastNotifiedStatusValue, hasEverVerifiedValue] =
    await redis.mget([
      getDomainVerificationKey("last-check", domainId),
      getDomainVerificationKey("last-notified-status", domainId),
      getDomainVerificationKey("has-ever-verified", domainId),
    ]);

  return {
    hasEverVerified: hasEverVerifiedValue === "1",
    lastCheckedAt: normalizeDate(lastCheckedValue),
    lastNotifiedStatus: DOMAIN_STATUS_VALUES.has(
      (lastNotifiedStatusValue ?? "") as DomainStatus,
    )
      ? (lastNotifiedStatusValue as DomainStatus)
      : null,
  };
}

async function setDomainVerificationCheckedAt(
  domainId: number,
  checkedAt: Date,
) {
  await getRedis().set(
    getDomainVerificationKey("last-check", domainId),
    checkedAt.toISOString(),
  );
}

async function markDomainEverVerified(domainId: number) {
  await getRedis().set(
    getDomainVerificationKey("has-ever-verified", domainId),
    "1",
  );
}

async function setLastNotifiedDomainStatus(
  domainId: number,
  status: DomainStatus,
) {
  await getRedis().set(
    getDomainVerificationKey("last-notified-status", domainId),
    status,
  );
}

async function reserveDomainStatusNotification(
  domainId: number,
  status: DomainStatus,
) {
  const result = await getRedis().set(
    getDomainVerificationKey(`notification-lock:${status}`, domainId),
    "1",
    "EX",
    300,
    "NX",
  );

  return result === "OK";
}

async function clearDomainVerificationState(domainId: number) {
  await getRedis().del(
    getDomainVerificationKey("last-check", domainId),
    getDomainVerificationKey("last-notified-status", domainId),
    getDomainVerificationKey("has-ever-verified", domainId),
  );
}

function shouldContinueVerifying(
  verificationStatus: DomainStatus,
  dkimStatus: string | undefined,
  spfDetails: string | undefined,
) {
  if (
    verificationStatus === DomainStatus.SUCCESS &&
    dkimStatus === DomainStatus.SUCCESS &&
    spfDetails === DomainStatus.SUCCESS
  ) {
    return false;
  }

  return verificationStatus !== DomainStatus.FAILED;
}

function shouldSendDomainStatusNotification({
  previousStatus,
  currentStatus,
  hasEverVerified,
  lastNotifiedStatus,
}: {
  previousStatus: DomainStatus;
  currentStatus: DomainStatus;
  hasEverVerified: boolean;
  lastNotifiedStatus: DomainStatus | null;
}) {
  if (lastNotifiedStatus === null && currentStatus === previousStatus) {
    return false;
  }

  if (hasEverVerified) {
    return currentStatus !== lastNotifiedStatus;
  }

  if (
    currentStatus !== DomainStatus.SUCCESS &&
    currentStatus !== DomainStatus.FAILED
  ) {
    return false;
  }

  return currentStatus !== lastNotifiedStatus;
}

async function sendDomainStatusNotification({
  domain,
  previousStatus,
  verificationError,
}: {
  domain: Domain;
  previousStatus: DomainStatus;
  verificationError: string | null;
}) {
  const recipients = (
    await db.teamUser.findMany({
      where: {
        teamId: domain.teamId,
      },
      include: {
        user: true,
      },
    })
  )
    .map((teamUser) => teamUser.user?.email)
    .filter((email): email is string => Boolean(email));

  if (recipients.length === 0) {
    logger.info(
      { domainId: domain.id, teamId: domain.teamId },
      "[DomainService]: Skipping domain status email because team has no recipients",
    );
    return;
  }

  const subject =
    domain.status === DomainStatus.SUCCESS
      ? `useSend: ${domain.name} is verified`
      : previousStatus === DomainStatus.SUCCESS
        ? `useSend: ${domain.name} verification status changed`
        : `useSend: ${domain.name} verification failed`;

  const domainUrl = `${env.NEXTAUTH_URL}/domains/${domain.id}`;
  const html = await renderDomainVerificationStatusEmail({
    domainName: domain.name,
    currentStatus: domain.status,
    previousStatus,
    verificationError,
    domainUrl,
  });
  const textLines = [
    `Domain: ${domain.name}`,
    `Current status: ${domain.status}`,
    previousStatus !== domain.status
      ? `Previous status: ${previousStatus}`
      : null,
    verificationError ? `Verification error: ${verificationError}` : null,
    `Manage domain: ${domainUrl}`,
  ].filter((value): value is string => Boolean(value));

  await Promise.all(
    recipients.map((email) =>
      sendMail(email, subject, textLines.join("\n"), html, "hey@usesend.com"),
    ),
  );
}

function buildDomainPayload(domain: Domain): DomainPayload {
  return {
    id: domain.id,
    name: domain.name,
    status: domain.status,
    region: domain.region,
    createdAt: domain.createdAt.toISOString(),
    updatedAt: domain.updatedAt.toISOString(),
    clickTracking: domain.clickTracking,
    openTracking: domain.openTracking,
    subdomain: domain.subdomain,
    sesTenantId: domain.sesTenantId,
    dkimStatus: domain.dkimStatus,
    spfDetails: domain.spfDetails,
    dmarcAdded: domain.dmarcAdded,
  };
}

export async function validateDomainFromEmail(email: string, teamId: number) {
  // Extract email from format like 'Name <email@domain>' this will allow entries such as "Someone @ something <some@domain.com>" to parse correctly as well.
  const match = email.match(/<([^>]+)>/);
  let fromDomain: string | undefined;

  if (match && match[1]) {
    const parts = match[1].split("@");
    fromDomain = parts.length > 1 ? parts[1] : undefined;
  } else {
    const parts = email.split("@");
    fromDomain = parts.length > 1 ? parts[1] : undefined;
  }

  if (fromDomain?.endsWith(">")) {
    fromDomain = fromDomain.slice(0, -1);
  }

  if (!fromDomain) {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message: "From email is invalid",
    });
  }

  const domain = await db.domain.findFirst({
    where: { name: fromDomain, teamId },
  });

  if (!domain) {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message: `Domain: ${fromDomain} of from email is wrong. Use the domain verified by useSend`,
    });
  }

  if (domain.status !== "SUCCESS") {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message: `Domain: ${fromDomain} is not verified`,
    });
  }

  return domain;
}

export async function validateApiKeyDomainAccess(
  email: string,
  teamId: number,
  apiKey: ApiKey & { domain?: { name: string } | null },
) {
  // First validate the domain exists and is verified
  const domain = await validateDomainFromEmail(email, teamId);

  // If API key has no domain restriction (domainId is null), allow all domains
  if (!apiKey.domainId) {
    return domain;
  }

  // If API key is restricted to a specific domain, check if it matches
  if (apiKey.domainId !== domain.id) {
    throw new UnsendApiError({
      code: "FORBIDDEN",
      message: `API key does not have access to domain: ${domain.name}`,
    });
  }

  return domain;
}

export async function createDomain(
  teamId: number,
  name: string,
  region: string,
  sesTenantId?: string,
) {
  const domainStr = tldts.getDomain(name);

  logger.info({ domainStr, name, region }, "Creating domain");

  if (!domainStr) {
    throw new Error("Invalid domain");
  }

  const setting = await SesSettingsService.getSetting(region);

  if (!setting) {
    throw new Error("Ses setting not found");
  }

  const { isLimitReached, reason } =
    await LimitService.checkDomainLimit(teamId);

  if (isLimitReached) {
    throw new UnsendApiError({
      code: "FORBIDDEN",
      message: reason ?? "Domain limit reached",
    });
  }

  const subdomain = tldts.getSubdomain(name);
  const dkimSelector = "usesend";
  const publicKey = await ses.addDomain(
    name,
    region,
    sesTenantId,
    dkimSelector,
  );

  const domain = await db.domain.create({
    data: {
      name,
      publicKey,
      teamId,
      subdomain,
      region,
      sesTenantId,
      dkimSelector,
      dkimStatus: DomainStatus.NOT_STARTED,
      spfDetails: DomainStatus.NOT_STARTED,
    },
  });

  await emitDomainEvent(domain, "domain.created");

  return withDnsRecords(domain);
}

export async function getDomain(id: number, teamId: number) {
  let domain = await db.domain.findUnique({
    where: {
      id,
      teamId,
    },
  });

  if (!domain) {
    throw new UnsendApiError({
      code: "NOT_FOUND",
      message: "Domain not found",
    });
  }

  if (domain.isVerifying) {
    return refreshDomainVerification(domain);
  }

  return withDnsRecords(domain);
}

export async function refreshDomainVerification(
  domainOrId: number | Domain,
): Promise<DomainVerificationRefreshResult> {
  const domain =
    typeof domainOrId === "number"
      ? await db.domain.findUnique({ where: { id: domainOrId } })
      : domainOrId;

  if (!domain) {
    throw new UnsendApiError({
      code: "NOT_FOUND",
      message: "Domain not found",
    });
  }

  const verificationState = await getDomainVerificationState(domain.id);
  const previousStatus = domain.status;
  const domainIdentity = await ses.getDomainIdentity(
    domain.name,
    domain.region,
  );
  const dkimStatus = domainIdentity.DkimAttributes?.Status?.toString();
  const spfDetails =
    domainIdentity.MailFromAttributes?.MailFromDomainStatus?.toString();
  const verificationError =
    domainIdentity.VerificationInfo?.ErrorType?.toString() ?? null;
  const verificationStatus = parseDomainStatus(
    domainIdentity.VerificationStatus?.toString(),
  );
  const lastCheckedTime = domainIdentity.VerificationInfo?.LastCheckedTimestamp;
  const baseDomain = tldts.getDomain(domain.name);
  const _dmarcRecord = baseDomain ? await getDmarcRecord(baseDomain) : null;
  const dmarcRecord = _dmarcRecord?.[0]?.[0];
  const checkedAt = new Date();

  const updatedDomain = await db.domain.update({
    where: {
      id: domain.id,
    },
    data: {
      dkimStatus: dkimStatus ?? null,
      spfDetails: spfDetails ?? null,
      status: verificationStatus,
      errorMessage: verificationError,
      dmarcAdded: Boolean(dmarcRecord),
      isVerifying: shouldContinueVerifying(
        verificationStatus,
        dkimStatus,
        spfDetails,
      ),
    },
  });

  await setDomainVerificationCheckedAt(domain.id, checkedAt);

  if (updatedDomain.status === DomainStatus.SUCCESS) {
    await markDomainEverVerified(domain.id);
  }

  if (
    shouldSendDomainStatusNotification({
      previousStatus,
      currentStatus: updatedDomain.status,
      hasEverVerified:
        verificationState.hasEverVerified ||
        updatedDomain.status === DomainStatus.SUCCESS,
      lastNotifiedStatus: verificationState.lastNotifiedStatus,
    })
  ) {
    const reservedNotification = await reserveDomainStatusNotification(
      domain.id,
      updatedDomain.status,
    );

    if (reservedNotification) {
      try {
        await sendDomainStatusNotification({
          domain: updatedDomain,
          previousStatus,
          verificationError,
        });
        await setLastNotifiedDomainStatus(domain.id, updatedDomain.status);
      } catch (error) {
        logger.error(
          { err: error, domainId: domain.id, status: updatedDomain.status },
          "[DomainService]: Failed to send domain status notification",
        );
      }
    }
  }

  const normalizedDomain = {
    ...updatedDomain,
    dkimStatus: dkimStatus ?? null,
    spfDetails: spfDetails ?? null,
    dmarcAdded: Boolean(dmarcRecord),
  } satisfies Domain;

  const domainWithDns = withDnsRecords(normalizedDomain);
  const normalizedLastCheckedTime =
    lastCheckedTime instanceof Date
      ? lastCheckedTime.toISOString()
      : lastCheckedTime != null
        ? String(lastCheckedTime)
        : null;

  if (previousStatus !== domainWithDns.status) {
    const eventType: DomainWebhookEventType =
      domainWithDns.status === DomainStatus.SUCCESS
        ? "domain.verified"
        : "domain.updated";
    await emitDomainEvent(domainWithDns, eventType);
  }

  return {
    ...domainWithDns,
    dkimStatus: normalizedDomain.dkimStatus,
    spfDetails: normalizedDomain.spfDetails,
    verificationError,
    lastCheckedTime: normalizedLastCheckedTime,
    dmarcAdded: normalizedDomain.dmarcAdded,
    previousStatus,
    statusChanged: previousStatus !== domainWithDns.status,
    hasEverVerified:
      verificationState.hasEverVerified ||
      domainWithDns.status === DomainStatus.SUCCESS,
  };
}

export async function updateDomain(
  id: number,
  data: { clickTracking?: boolean; openTracking?: boolean },
) {
  const updated = await db.domain.update({
    where: { id },
    data,
  });

  await emitDomainEvent(updated, "domain.updated");

  return updated;
}

export async function deleteDomain(id: number) {
  const domain = await db.domain.findUnique({
    where: { id },
  });

  if (!domain) {
    throw new Error("Domain not found");
  }

  const deleted = await ses.deleteDomain(
    domain.name,
    domain.region,
    domain.sesTenantId ?? undefined,
  );

  if (!deleted) {
    throw new Error("Error in deleting domain");
  }

  const deletedRecord = await db.domain.delete({ where: { id } });
  await clearDomainVerificationState(id);

  await emitDomainEvent(domain, "domain.deleted");

  return deletedRecord;
}

export async function getDomains(
  teamId: number,
  options?: { domainId?: number },
) {
  const domains = await db.domain.findMany({
    where: {
      teamId,
      ...(options?.domainId ? { id: options.domainId } : {}),
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return domains.map((d) => withDnsRecords(d));
}

async function getDmarcRecord(domain: string) {
  try {
    const dmarcRecord = await dnsResolveTxt(`_dmarc.${domain}`);
    return dmarcRecord;
  } catch (error) {
    logger.error({ err: error, domain }, "Error fetching DMARC record");
    return null; // or handle error as appropriate
  }
}

async function emitDomainEvent(domain: Domain, type: DomainWebhookEventType) {
  try {
    await WebhookService.emit(domain.teamId, type, buildDomainPayload(domain), {
      domainId: domain.id,
    });
  } catch (error) {
    logger.error(
      { error, domainId: domain.id, type },
      "[DomainService]: Failed to emit domain webhook event",
    );
  }
}

export async function isDomainVerificationDue(domain: Domain) {
  const verificationState = await getDomainVerificationState(domain.id);

  if (
    !verificationState.hasEverVerified &&
    domain.status === DomainStatus.FAILED &&
    !domain.isVerifying
  ) {
    return false;
  }

  const now = Date.now();
  const lastCheckedAt = verificationState.lastCheckedAt?.getTime() ?? 0;
  const intervalMs =
    verificationState.hasEverVerified ||
    VERIFIED_DOMAIN_STATUSES.has(domain.status)
      ? DOMAIN_VERIFIED_RECHECK_MS
      : DOMAIN_UNVERIFIED_RECHECK_MS;

  if (!verificationState.lastCheckedAt) {
    return true;
  }

  return now - lastCheckedAt >= intervalMs;
}
