export const SES_WEBHOOK_QUEUE = "ses-webhook";
export const CAMPAIGN_MAIL_PROCESSING_QUEUE = "campaign-emails-processing";
export const CONTACT_BULK_ADD_QUEUE = "contact-bulk-add";
export const CAMPAIGN_BATCH_QUEUE = "campaign-batch";
export const CAMPAIGN_SCHEDULER_QUEUE = "campaign-scheduler";
export const WEBHOOK_DISPATCH_QUEUE = "webhook-dispatch";
export const WEBHOOK_CLEANUP_QUEUE = "webhook-cleanup";

export const DEFAULT_QUEUE_OPTIONS = {
  removeOnComplete: true,
  removeOnFail: {
    age: 30 * 24 * 3600, // 30 days
  },
};
