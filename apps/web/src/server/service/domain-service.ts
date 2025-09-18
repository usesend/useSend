import dns from "dns";
import util from "util";
import * as tldts from "tldts";
import * as ses from "~/server/aws/ses";
import { db } from "~/server/db";
import { SesSettingsService } from "./ses-settings-service";
import { UnsendApiError } from "../public-api/api-error";
import { logger } from "../logger/log";
import { ApiKey, Domain } from "@prisma/client";
import { LimitService } from "./limit-service";

const dnsResolveTxt = util.promisify(dns.resolveTxt);

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

type DomainWithDefaultFrom = Domain & { defaultFrom: string | null };

export function resolveFromAddress(
  domain: Pick<DomainWithDefaultFrom, "name" | "defaultFrom">
) {
  if (domain.defaultFrom && domain.defaultFrom.trim().length > 0) {
    return domain.defaultFrom.trim();
  }

  return `hello@${domain.name}`;
}

export async function validateApiKeyDomainAccess(
  email: string,
  teamId: number,
  apiKey: ApiKey & { domain?: { name: string } | null }
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
  sesTenantId?: string
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
    dkimSelector
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
    },
  });

  return domain;
}

export async function getDomain(id: number) {
  let domain = await db.domain.findUnique({
    where: {
      id,
    },
  });

  if (!domain) {
    throw new Error("Domain not found");
  }

  if (domain.isVerifying) {
    const domainIdentity = await ses.getDomainIdentity(
      domain.name,
      domain.region
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

    return {
      ...domain,
      dkimStatus: dkimStatus?.toString() ?? null,
      spfDetails: spfDetails?.toString() ?? null,
      verificationError: verificationError?.toString() ?? null,
      lastCheckedTime,
      dmarcAdded: dmarcRecord ? true : false,
    };
  }

  return domain;
}

export async function updateDomain(
  id: number,
  data: { clickTracking?: boolean; openTracking?: boolean }
) {
  return db.domain.update({
    where: { id },
    data,
  });
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
    domain.sesTenantId ?? undefined
  );

  if (!deleted) {
    throw new Error("Error in deleting domain");
  }

  const deletedRecord = await db.domain.delete({ where: { id } });

  return deletedRecord;
}

export async function getDomains(teamId: number) {
  return db.domain.findMany({
    where: {
      teamId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getVerifiedDomains(teamId: number) {
  return db.domain.findMany({
    where: {
      teamId,
      status: "SUCCESS",
    },
    orderBy: {
      createdAt: "desc",
    },
  });
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
