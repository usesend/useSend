const ENTITLED_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
]);

export function isEntitledSubscriptionStatus(
  status: string | null | undefined,
) {
  return Boolean(status && ENTITLED_SUBSCRIPTION_STATUSES.has(status));
}
