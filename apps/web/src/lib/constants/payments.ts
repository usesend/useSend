export const PLAN_PERKS = {
  FREE: [
    "Send up to 3000 emails per month",
    "Send up to 100 emails per day",
    "Can have 1 contact book",
    "Can have 1 domain",
    "Can have 1 team member",
  ],
  BASIC: [
    "Includes $10 of usage monthly",
    "Send transactional emails at $0.0004 per email",
    "Send marketing emails at $0.001 per email",
    "Can have unlimited contact books",
    "Can have unlimited domains",
    "Can have unlimited team members",
  ],
};

/**
 * How new teams pay: $10 a month (Stripe STRIPE_BASIC_PRICE_ID) includes
 * 10,000 usage units, then $0.001 per unit (STRIPE_BASIC_USAGE_PRICE_ID).
 * A unit is one marketing or 2.5 transactional emails (see lib/usage.ts).
 */
export const PAY_AS_YOU_GO = {
  price: "$10 a month",
  includes: "Includes 25,000 transactional or 10,000 marketing emails",
  details: [
    "Includes 25,000 transactional or 10,000 marketing emails a month",
    "Then $0.40 per 1,000 transactional and $1 per 1,000 marketing emails",
    "Unlimited domains, contact books and team members",
    "Cancel anytime",
  ],
  cta: "Start for $10 a month",
};
