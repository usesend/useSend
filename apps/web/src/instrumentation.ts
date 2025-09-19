import { env } from "./env";
import { isCloud } from "./utils/common";

let initialized = false;

/**
 * Add things here to be executed during server startup.
 *
 * more details here: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  if (process.env.NEXT_RUNTIME === "nodejs" && !initialized) {
    console.log("Registering instrumentation");

    try {
      const { EmailQueueService } = await import(
        "~/server/service/email-queue-service"
      );
      
      console.log("Initializing EmailQueueService...");
      await EmailQueueService.init();
      console.log("EmailQueueService initialized successfully");

      /**
       * Send usage data to Stripe
       */
      if (isCloud()) {
        await import("~/server/jobs/usage-job");
      }

      initialized = true;
      console.log("Instrumentation registration completed");
    } catch (error) {
      console.error("Failed to initialize services during instrumentation:", error);
      // Don't throw here to prevent application from completely failing to start
      // The error will be logged and the application can still handle requests
      // Individual services will handle their own initialization as needed
    }
  }
}
