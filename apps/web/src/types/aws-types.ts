export interface SnsNotificationMessage {
  Type: string;
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string; // This is a JSON string that needs to be parsed into one of the SES event types below
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  UnsubscribeURL?: string;
  SubscribeURL?: string; // For SubscriptionConfirmation messages
  Token?: string; // For SubscriptionConfirmation messages
}

export interface SesMail {
  timestamp: string;
  source: string;
  messageId: string;
  destination: string[];
  headersTruncated: boolean;
  headers: Array<{ name: string; value: string }>;
  commonHeaders: {
    from: string[];
    to: string[];
    messageId: string;
    subject?: string;
  };
  tags: { [key: string]: string[] };
}

export interface SesBounce {
  bounceType: "Transient" | "Permanent" | "Undetermined";
  bounceSubType:
    | "General"
    | "NoEmail"
    | "Suppressed"
    | "OnAccountSuppressionList	"
    | "MailboxFull"
    | "MessageTooLarge"
    | "ContentRejected"
    | "AttachmentRejected";
  bouncedRecipients: Array<{
    emailAddress: string;
    action: string;
    status: string;
    diagnosticCode?: string;
  }>;
  timestamp: string;
  feedbackId: string;
  reportingMTA: string;
}

export interface SesComplaint {
  complainedRecipients: Array<{
    emailAddress: string;
  }>;
  timestamp: string;
  feedbackId: string;
  complaintFeedbackType: string;
  userAgent: string;
  complaintSubType?: string;
  arrivedDate?: string;
}

export interface SesDelivery {
  timestamp: string;
  processingTimeMillis: number;
  recipients: string[];
  smtpResponse: string;
  reportingMTA: string;
  remoteMtaIp?: string;
}

export interface SesSend {
  timestamp: string;
  smtpResponse: string;
  reportingMTA: string;
  recipients: string[];
}

export interface SesReject {
  reason: string;
  timestamp: string;
}

export interface SesOpen {
  ipAddress: string;
  timestamp: string;
  userAgent: string;
}

export interface SesClick {
  ipAddress: string;
  timestamp: string;
  userAgent: string;
  link: string;
  linkTags: { [key: string]: string };
}

export interface SesRenderingFailure {
  errorMessage: string;
  templateName: string;
}

export interface SesDeliveryDelay {
  delayType:
    | "InternalFailure"
    | "General"
    | "MailboxFull"
    | "SpamDetected"
    | "RecipientServerError"
    | "IPFailure"
    | "TransientCommunicationFailure"
    | "BYOIPHostNameLookupUnavailable"
    | "Undetermined"
    | "SendingDeferral";
  expirationTime: string;
  delayedRecipients: string[];
  timestamp: string;
}

export type SesEventType =
  | "Bounce"
  | "Complaint"
  | "Delivery"
  | "Send"
  | "Reject"
  | "Open"
  | "Click"
  | "Rendering Failure"
  | "DeliveryDelay";

export type SesEventDataKey =
  | "bounce"
  | "complaint"
  | "delivery"
  | "send"
  | "reject"
  | "open"
  | "click"
  | "renderingFailure"
  | "deliveryDelay";

export interface SesEvent {
  eventType: SesEventType;
  mail: SesMail;
  bounce?: SesBounce;
  complaint?: SesComplaint;
  delivery?: SesDelivery;
  send?: SesSend;
  reject?: SesReject;
  open?: SesOpen;
  click?: SesClick;
  renderingFailure?: SesRenderingFailure;
  deliveryDelay?: SesDeliveryDelay;
  // Additional fields for other event types can be added here
}
