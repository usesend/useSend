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
  dnsRecords: DomainDnsRecord[];
  verificationError?: string | null;
  lastCheckedTime?: Date | string | null;
};
