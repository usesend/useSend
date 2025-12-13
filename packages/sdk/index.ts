export { UseSend } from "./src/usesend";
export { UseSend as Unsend } from "./src/usesend"; // deprecated alias
export { Campaigns } from "./src/campaign";
export {
  Webhooks,
  WebhookVerificationError,
  WEBHOOK_EVENT_HEADER,
  WEBHOOK_CALL_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
} from "./src/webhooks";
export type {
  WebhookEvent,
  WebhookEventData,
  WebhookEventPayloadMap,
  WebhookEventType,
} from "./src/webhooks";
