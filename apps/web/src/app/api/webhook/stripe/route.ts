import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { env } from "~/env";
import { getStripe, syncStripeData } from "~/server/billing/payments";
import { logger } from "~/server/logger/log";

const allowedEvents: Stripe.Event.Type[] = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "customer.subscription.pending_update_applied",
  "customer.subscription.pending_update_expired",
  "customer.subscription.trial_will_end",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "invoice.upcoming",
  "invoice.marked_uncollectible",
  "invoice.payment_succeeded",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
];

export async function POST(req: Request) {
  const body = await req.text();
  const signature = (await headers()).get("Stripe-Signature");

  if (!signature) {
    console.error("No signature");
    return new NextResponse("No signature", { status: 400 });
  }

  if (!env.STRIPE_WEBHOOK_SECRET) {
    console.error("No webhook secret");
    return new NextResponse("No webhook secret", { status: 400 });
  }

  const stripe = getStripe();

  let event: Stripe.Event | undefined;
  let customerId: string | undefined;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );

    if (!allowedEvents.includes(event.type)) {
      return new NextResponse("OK", { status: 200 });
    }

    // All the events I track have a customerId
    customerId = (event.data.object as { customer: string }).customer;

    // This helps make it typesafe and also lets me know if my assumption is wrong
    if (typeof customerId !== "string") {
      throw new Error(
        `[STRIPE HOOK][CANCER] ID isn't string.\nEvent type: ${event.type}`
      );
    }

    await syncStripeData(customerId);

    return new NextResponse("OK", { status: 200 });
  } catch (err) {
    logger.error(
      {
        err,
        stripeEventId: event?.id,
        stripeEventType: event?.type,
        stripeCustomerId: customerId,
      },
      "[StripeHook]: Failed to process the billing event"
    );
    return new NextResponse("Webhook error", { status: 400 });
  }
}
