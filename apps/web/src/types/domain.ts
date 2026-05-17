import type { Domain, DomainStatus } from "@prisma/client";

export type DomainDnsRecord = {
  type: "MX" | "TXT";
  name: string;
  value: string;
  ttl: string;
  priority?: string | null;
  status: DomainStatus;
  recommended?: boolean;
};

export type DomainWithDnsRecords = Domain & {
  /** Worst of identity verification, DKIM, and MAIL FROM (SPF); use for UI badges. */
  aggregateStatus: DomainStatus;
  dnsRecords: DomainDnsRecord[];
  verificationError?: string | null;
  lastCheckedTime?: Date | string | null;
};
