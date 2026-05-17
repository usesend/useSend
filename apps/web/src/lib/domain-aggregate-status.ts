import { DomainStatus } from "@prisma/client";

/**
 * Severity order: worst first. Used to combine identity, DKIM, and MAIL FROM (SPF) checks.
 */
const STATUS_WORST_FIRST: DomainStatus[] = [
  DomainStatus.FAILED,
  DomainStatus.TEMPORARY_FAILURE,
  DomainStatus.PENDING,
  DomainStatus.NOT_STARTED,
  DomainStatus.SUCCESS,
];

function parseLooseStatus(value?: string | null): DomainStatus {
  if (!value) {
    return DomainStatus.NOT_STARTED;
  }
  const normalized = value.toUpperCase();
  if ((Object.values(DomainStatus) as string[]).includes(normalized)) {
    return normalized as DomainStatus;
  }
  return DomainStatus.NOT_STARTED;
}

/**
 * Single status for UX: all of SES identity verification, DKIM, and MAIL FROM (SPF) must be SUCCESS
 * for the aggregate to be SUCCESS.
 */
export function aggregateDomainStatus(domain: {
  status: DomainStatus;
  dkimStatus?: string | null;
  spfDetails?: string | null;
}): DomainStatus {
  const parts: DomainStatus[] = [
    domain.status,
    parseLooseStatus(domain.dkimStatus),
    parseLooseStatus(domain.spfDetails),
  ];

  let minIdx = STATUS_WORST_FIRST.length - 1;
  for (const p of parts) {
    const idx = STATUS_WORST_FIRST.indexOf(p);
    if (idx !== -1 && idx < minIdx) {
      minIdx = idx;
    }
  }
  return STATUS_WORST_FIRST[minIdx]!;
}
