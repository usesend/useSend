import Stripe from "stripe";
import { env } from "~/env";
import { getUsageDate, getUsageTimestamp } from "~/lib/usage";

const METER_EVENT_NAME = "unsend_usage";

export async function sendUsageToStripe(customerId: string, usage: number) {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-03-31.basil",
  });

  // Send one meter event per team per reported day. Stripe enforces identifier
  // uniqueness over a rolling 24 hour period, so a repeat of this report cannot
  // count the same day's usage twice.
  const usageDate = getUsageDate();

  const meterEvent = await stripe.billing.meterEvents.create({
    event_name: METER_EVENT_NAME,
    identifier: `${METER_EVENT_NAME}_${customerId}_${usageDate}`,
    payload: {
      value: usage.toString(),
      stripe_customer_id: customerId,
    },
    timestamp: getUsageTimestamp(),
  });

  return meterEvent;
}
