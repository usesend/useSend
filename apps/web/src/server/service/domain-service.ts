import dns from "dns";
import util from "util";
import * as tldts from "tldts";
import * as ses from "~/server/aws/ses";
import { db } from "~/server/db";
import { SesSettingsService } from "./ses-settings-service";
import { UnsendApiError } from "../public-api/api-error";
import { logger } from "../logger/log";
import { ApiKey, DomainStatus, type Domain } from "@prisma/client";
import {
  type DomainPayload,
  type DomainWebhookEventType,
} from "@usesend/lib/src/webhook/webhook-events";
import { LimitService } from "./limit-service";
import type { DomainDnsRecord } from "~/types/domain";
import { WebhookService } from "./webhook-service";

const DOMAIN_STATUS_VALUES = new Set(Object.values(DomainStatus));

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
    const previousStatus = domain.status;
    const domainIdentity = await ses.getDomainIdentity(
      domain.name,
      domain.region,
    );

    const dkimStatus = domainIdentity.DkimAttributes?.Status;
    const spfDetails = domainIdentity.MailFromAttributes?.MailFromDomainStatus;
    const verificationError = domainIdentity.VerificationInfo?.ErrorType;
    const verificationStatus = domainIdentity.VerificationStatus;
    const lastCheckedTime =
      domainIdentity.VerificationInfo?.LastCheckedTimestamp;
    const _dmarcRecord = await getDmarcRecord(tldts.getDomain(domain.name)!);
    const dmarcRecord = _dmarcRecord?.[0]?.[0];

    domain = await db.domain.update({
      where: {
        id,
      },
      data: {
        dkimStatus,
        spfDetails,
        status: verificationStatus ?? "NOT_STARTED",
        dmarcAdded: dmarcRecord ? true : false,
        isVerifying:
          verificationStatus === "SUCCESS" &&
          dkimStatus === "SUCCESS" &&
          spfDetails === "SUCCESS"
            ? false
            : true,
      },
    });

    const normalizedDomain = {
      ...domain,
      dkimStatus: dkimStatus?.toString() ?? null,
      spfDetails: spfDetails?.toString() ?? null,
      dmarcAdded: dmarcRecord ? true : false,
    } satisfies Domain;

    const domainWithDns = withDnsRecords(normalizedDomain);
    const normalizedLastCheckedTime =
      lastCheckedTime instanceof Date
        ? lastCheckedTime.toISOString()
        : (lastCheckedTime ?? null);

    const response = {
      ...domainWithDns,
      dkimStatus: normalizedDomain.dkimStatus,
      spfDetails: normalizedDomain.spfDetails,
      verificationError: verificationError?.toString() ?? null,
      lastCheckedTime: normalizedLastCheckedTime,
      dmarcAdded: normalizedDomain.dmarcAdded,
    };

    if (previousStatus !== domainWithDns.status) {
      const eventType: DomainWebhookEventType =
        domainWithDns.status === DomainStatus.SUCCESS
          ? "domain.verified"
          : "domain.updated";
      await emitDomainEvent(domainWithDns, eventType);
    }

    return response;
  }

  return withDnsRecords(domain);
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
    await WebhookService.emit(domain.teamId, type, buildDomainPayload(domain));
  } catch (error) {
    logger.error(
      { error, domainId: domain.id, type },
      "[DomainService]: Failed to emit domain webhook event",
    );
  }
}
