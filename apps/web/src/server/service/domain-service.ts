import dns from "dns";
import util from "util";
import { EventType } from "@aws-sdk/client-sesv2";
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

const SES_GENERAL_EVENTS: EventType[] = [
  "BOUNCE",
  "COMPLAINT",
  "DELIVERY",
  "DELIVERY_DELAY",
  "REJECT",
  "RENDERING_FAILURE",
  "SEND",
  "SUBSCRIPTION",
];
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

/**
 * Regional SES open/click tracking origin (HTTP). Required CNAME target for custom tracking
 * hostnames. See "Tracking domains for open/click links" in AWS General Reference (SES).
 */
function sesRegionalTrackingRedirectHost(region: string): string {
  return `r.${region}.awstrack.me`;
}

function buildTrackingDnsRecords(domain: Domain): DomainDnsRecord[] {
  if (!domain.customTrackingHostname || !domain.customTrackingPublicKey) {
    return [];
  }
  const selector = domain.customTrackingDkimSelector ?? "utrack";
  const parsed = tldts.parse(domain.customTrackingHostname);
  const sub = parsed.subdomain;
  const suffix = sub ? `.${sub}` : "";
  const dkimStatus = parseDomainStatus(domain.customTrackingDkimStatus);
  const routingStatus = parseDomainStatus(domain.customTrackingStatus);

  const rows: DomainDnsRecord[] = [
    {
      type: "TXT",
      name: `${selector}._domainkey${suffix}`,
      value: `p=${domain.customTrackingPublicKey}`,
      ttl: "Auto",
      status: dkimStatus,
    },
  ];

  if (sub) {
    rows.push({
      type: "CNAME",
      name: sub,
      value: sesRegionalTrackingRedirectHost(domain.region),
      ttl: "Auto",
      status: routingStatus,
      recommended: true,
    });
  }

  return rows;
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
    dnsRecords: [...buildDnsRecords(domain), ...buildTrackingDnsRecords(domain)],
  };
}

function isCustomTrackingProvisioningComplete(domain: Domain): boolean {
  return !!(
    domain.trackingConfigGeneral &&
    domain.trackingConfigClick &&
    domain.trackingConfigOpen &&
    domain.trackingConfigFull
  );
}

function shouldPollCustomTrackingVerification(domain: Domain): boolean {
  if (env.NEXT_PUBLIC_IS_CLOUD) {
    return false;
  }
  if (!domain.customTrackingHostname || !domain.customTrackingPublicKey) {
    return false;
  }
  if (domain.customTrackingStatus === DomainStatus.FAILED) {
    return false;
  }
  if (domain.customTrackingStatus === DomainStatus.SUCCESS) {
    return !isCustomTrackingProvisioningComplete(domain);
  }
  return true;
}

function assertTrackingHostnameAllowed(
  sendingDomainName: string,
  trackingHost: string,
) {
  const sendReg = tldts.getDomain(sendingDomainName);
  const trackReg = tldts.getDomain(trackingHost);
  if (!sendReg || !trackReg || sendReg !== trackReg) {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message:
        "Custom tracking hostname must use the same registrable domain as this sending domain.",
    });
  }
}

async function removeCustomTrackingResources(domain: Domain) {
  const region = domain.region;
  for (const name of [
    domain.trackingConfigGeneral,
    domain.trackingConfigClick,
    domain.trackingConfigOpen,
    domain.trackingConfigFull,
  ]) {
    if (name) {
      try {
        await ses.deleteConfigurationSet(name, region);
      } catch (error) {
        logger.error(
          { err: error, configurationSetName: name },
          "[DomainService]: Failed to delete tracking configuration set",
        );
      }
    }
  }
  if (domain.customTrackingHostname) {
    try {
      await ses.deleteDomain(
        domain.customTrackingHostname,
        region,
        domain.sesTenantId ?? undefined,
      );
    } catch (error) {
      logger.error(
        { err: error, hostname: domain.customTrackingHostname },
        "[DomainService]: Failed to delete tracking email identity",
      );
    }
  }
}

async function reapplyCustomTrackingSesPolicy(domain: Domain) {
  if (
    !domain.customTrackingHostname ||
    !domain.trackingConfigClick ||
    !domain.trackingConfigOpen ||
    !domain.trackingConfigFull
  ) {
    return;
  }
  const host = domain.customTrackingHostname;
  const region = domain.region;
  const httpsPolicy = ses.trackingHttpsRequiredToSesPolicy(
    domain.trackingHttpsRequired,
  );
  await ses.putConfigurationSetHttpsTracking(
    domain.trackingConfigClick,
    host,
    region,
    httpsPolicy,
  );
  await ses.putConfigurationSetHttpsTracking(
    domain.trackingConfigOpen,
    host,
    region,
    httpsPolicy,
  );
  await ses.putConfigurationSetHttpsTracking(
    domain.trackingConfigFull,
    host,
    region,
    httpsPolicy,
  );
}

async function ensureCustomTrackingProvisioned(domainId: number) {
  const domain = await db.domain.findUnique({ where: { id: domainId } });
  if (!domain?.customTrackingHostname) {
    return;
  }
  if (
    domain.trackingConfigGeneral &&
    domain.trackingConfigClick &&
    domain.trackingConfigOpen &&
    domain.trackingConfigFull
  ) {
    try {
      await reapplyCustomTrackingSesPolicy(domain);
    } catch (error) {
      logger.error(
        { err: error, domainId },
        "[DomainService]: Failed to reapply custom tracking HTTPS policy",
      );
    }
    return;
  }
  if (domain.customTrackingStatus !== DomainStatus.SUCCESS) {
    return;
  }

  const setting = await SesSettingsService.getSetting(domain.region);
  if (!setting?.topicArn) {
    logger.error(
      { region: domain.region },
      "[DomainService]: No SES setting for custom tracking provision",
    );
    return;
  }

  const base = `${setting.idPrefix}-dom${domain.id}-${domain.region}-unsend`;
  const configGeneral = `${base}-general`;
  const configClick = `${base}-click`;
  const configOpen = `${base}-open`;
  const configFull = `${base}-full`;
  const region = domain.region;
  const topicArn = setting.topicArn;
  const host = domain.customTrackingHostname;

  try {
    await ses.addWebhookConfiguration(
      configGeneral,
      topicArn,
      SES_GENERAL_EVENTS,
      region,
    );
    await ses.addWebhookConfiguration(
      configClick,
      topicArn,
      [...SES_GENERAL_EVENTS, "CLICK"],
      region,
    );
    await ses.addWebhookConfiguration(
      configOpen,
      topicArn,
      [...SES_GENERAL_EVENTS, "OPEN"],
      region,
    );
    await ses.addWebhookConfiguration(
      configFull,
      topicArn,
      [...SES_GENERAL_EVENTS, "CLICK", "OPEN"],
      region,
    );

    const httpsPolicy = ses.trackingHttpsRequiredToSesPolicy(
      domain.trackingHttpsRequired,
    );
    await ses.putConfigurationSetHttpsTracking(
      configClick,
      host,
      region,
      httpsPolicy,
    );
    await ses.putConfigurationSetHttpsTracking(
      configOpen,
      host,
      region,
      httpsPolicy,
    );
    await ses.putConfigurationSetHttpsTracking(
      configFull,
      host,
      region,
      httpsPolicy,
    );

    await db.domain.update({
      where: { id: domainId },
      data: {
        trackingConfigGeneral: configGeneral,
        trackingConfigClick: configClick,
        trackingConfigOpen: configOpen,
        trackingConfigFull: configFull,
      },
    });
  } catch (error) {
    logger.error(
      { err: error, domainId },
      "[DomainService]: Failed to provision custom tracking configuration sets",
    );
    throw error;
  }
}

export async function setCustomTrackingHostname(
  domainId: number,
  teamId: number,
  hostname: string | null,
  trackingHttpsRequired?: boolean,
) {
  if (env.NEXT_PUBLIC_IS_CLOUD) {
    throw new UnsendApiError({
      code: "FORBIDDEN",
      message:
        "Custom tracking domains are only available for self-hosted useSend.",
    });
  }

  const domain = await db.domain.findFirst({
    where: { id: domainId, teamId },
  });

  if (!domain) {
    throw new UnsendApiError({
      code: "NOT_FOUND",
      message: "Domain not found",
    });
  }

  const trimmed =
    hostname === null || hostname === undefined ? "" : hostname.trim();

  if (!trimmed) {
    await removeCustomTrackingResources(domain);
    const cleared = await db.domain.update({
      where: { id: domainId },
      data: {
        customTrackingHostname: null,
        customTrackingPublicKey: null,
        customTrackingDkimSelector: "utrack",
        customTrackingDkimStatus: null,
        customTrackingStatus: DomainStatus.NOT_STARTED,
        trackingConfigGeneral: null,
        trackingConfigClick: null,
        trackingConfigOpen: null,
        trackingConfigFull: null,
        trackingHttpsRequired: false,
      },
    });
    await emitDomainEvent(cleared, "domain.updated");
    return cleared;
  }

  const normalized = trimmed.toLowerCase();
  if (
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(
      normalized,
    )
  ) {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message: "Invalid tracking hostname",
    });
  }

  assertTrackingHostnameAllowed(domain.name, normalized);

  const parsedHost = tldts.parse(normalized);
  if (!parsedHost.subdomain) {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message:
        "Tracking hostname must be a subdomain (for example track.example.com), not the zone apex.",
    });
  }

  if (
    domain.customTrackingHostname === normalized &&
    domain.customTrackingPublicKey
  ) {
    if (
      trackingHttpsRequired !== undefined &&
      trackingHttpsRequired !== domain.trackingHttpsRequired
    ) {
      const domainForSes: Domain = {
        ...domain,
        trackingHttpsRequired,
      };
      await reapplyCustomTrackingSesPolicy(domainForSes);
      const updated = await db.domain.update({
        where: { id: domainId },
        data: { trackingHttpsRequired },
      });
      await emitDomainEvent(updated, "domain.updated");
      return updated;
    }
    return domain;
  }

  const previousForCleanup =
    domain.customTrackingHostname &&
    domain.customTrackingHostname !== normalized
      ? domain
      : null;

  const selector = domain.customTrackingDkimSelector ?? "utrack";
  const publicKey = await ses.addTrackingEmailIdentity(
    normalized,
    domain.region,
    domain.sesTenantId ?? undefined,
    selector,
  );

  const updated = await db.domain.update({
    where: { id: domainId },
    data: {
      customTrackingHostname: normalized,
      customTrackingPublicKey: publicKey,
      customTrackingDkimSelector: selector,
      customTrackingDkimStatus: null,
      customTrackingStatus: DomainStatus.PENDING,
      trackingConfigGeneral: null,
      trackingConfigClick: null,
      trackingConfigOpen: null,
      trackingConfigFull: null,
      trackingHttpsRequired:
        trackingHttpsRequired ?? domain.trackingHttpsRequired ?? false,
    },
  });

  if (previousForCleanup) {
    await removeCustomTrackingResources(previousForCleanup);
  }

  await emitDomainEvent(updated, "domain.updated");
  return updated;
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
}: {
  domain: Domain;
  previousStatus: DomainStatus;
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
    domainUrl,
  });
  const statusMessage =
    domain.status === DomainStatus.SUCCESS
      ? `Your domain ${domain.name} is now verified, and you can start sending emails.`
      : `Your domain ${domain.name} could not be verified because the DNS records are not set up correctly yet. Please review your DNS settings and try again.`;
  const textLines = [
    "Hey,",
    null,
    statusMessage,
    null,
    `Open domain settings: ${domainUrl}`,
    null,
    "Thanks,",
    "useSend Team",
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

  if (domain.isVerifying || shouldPollCustomTrackingVerification(domain)) {
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

  let trackingDkimStatus: string | null = null;
  let trackingVerificationStatus: DomainStatus | undefined;

  if (domain.customTrackingHostname) {
    try {
      const trackingIdentity = await ses.getDomainIdentity(
        domain.customTrackingHostname,
        domain.region,
      );
      trackingDkimStatus =
        trackingIdentity.DkimAttributes?.Status?.toString() ?? null;
      trackingVerificationStatus = parseDomainStatus(
        trackingIdentity.VerificationStatus?.toString(),
      );
    } catch (error) {
      logger.error(
        { err: error, domainId: domain.id },
        "[DomainService]: Failed to refresh custom tracking identity status",
      );
    }
  }

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
      ...(domain.customTrackingHostname &&
      trackingVerificationStatus !== undefined
        ? {
            customTrackingDkimStatus: trackingDkimStatus,
            customTrackingStatus: trackingVerificationStatus,
          }
        : {}),
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

  let provisionedDomain = updatedDomain;

  if (
    domain.customTrackingHostname &&
    trackingVerificationStatus === DomainStatus.SUCCESS
  ) {
    try {
      await ensureCustomTrackingProvisioned(domain.id);
      const reloaded = await db.domain.findUnique({ where: { id: domain.id } });
      if (reloaded) {
        provisionedDomain = reloaded;
      }
    } catch (error) {
      logger.error(
        { err: error, domainId: domain.id },
        "[DomainService]: ensureCustomTrackingProvisioned failed after refresh",
      );
    }
  }

  const normalizedDomain = {
    ...provisionedDomain,
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

  await removeCustomTrackingResources(domain);

  const deleted = await ses.deleteDomain(
    domain.name,
    domain.region,
    domain.sesTenantId ?? undefined,
  );

  if (!deleted) {
    throw new Error("Error in deleting domain");
  }

  const deletedRecord = await db.domain.delete({ where: { id } });
  try {
    await clearDomainVerificationState(id);
  } catch (error) {
    logger.error(
      { err: error, domainId: id },
      "[DomainService]: Failed to clear domain verification state",
    );
  }

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

  if (shouldPollCustomTrackingVerification(domain)) {
    const now = Date.now();
    const lastCheckedAt = verificationState.lastCheckedAt?.getTime() ?? 0;
    if (!verificationState.lastCheckedAt) {
      return true;
    }
    return now - lastCheckedAt >= DOMAIN_UNVERIFIED_RECHECK_MS;
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
