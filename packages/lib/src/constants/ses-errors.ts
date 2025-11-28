export const DELIVERY_DELAY_ERRORS = {
  InternalFailure: "An internal useSend issue caused the message to be delayed.",
  General: "A generic failure occurred during the SMTP conversation.",
  MailboxFull:
    "The recipient's mailbox is full and is unable to receive additional messages.",
  SpamDetected:
    "The recipient's mail server has detected a large amount of unsolicited email from your account.",
  RecipientServerError:
    "A temporary issue with the recipient's email server is preventing the delivery of the message.",
  IPFailure:
    "The IP address that's sending the message is being blocked or throttled by the recipient's email provider.",
  TransientCommunicationFailure:
    "There was a temporary communication failure during the SMTP conversation with the recipient's email provider.",
  BYOIPHostNameLookupUnavailable:
    "useSend was unable to look up the DNS hostname for your IP addresses. This type of delay only occurs when you use Bring Your Own IP.",
  Undetermined:
    "useSend wasn't able to determine the reason for the delivery delay.",
  SendingDeferral:
    "useSend has deemed it appropriate to internally defer the message.",
};

export const BOUNCE_ERROR_MESSAGES = {
  Undetermined: "useSend was unable to determine a specific bounce reason.",
  Permanent: {
    General:
      "useSend received a general hard bounce. If you receive this type of bounce, you should remove the recipient's email address from your mailing list.",
    NoEmail:
      "useSend received a permanent hard bounce because the target email address does not exist. If you receive this type of bounce, you should remove the recipient's email address from your mailing list.",
    Suppressed:
      "useSend has suppressed sending to this address because it has a recent history of bouncing as an invalid address. To override the global suppression list, see Using the useSend account-level suppression list.",
    OnAccountSuppressionList:
      "useSend has suppressed sending to this address because it is on the account-level suppression list. This does not count toward your bounce rate metric.",
  },
  Transient: {
    General:
      "useSend received a general bounce. You may be able to successfully send to this recipient in the future.",
    MailboxFull:
      "useSend received a mailbox full bounce. You may be able to successfully send to this recipient in the future.",
    MessageTooLarge:
      "useSend received a message too large bounce. You may be able to successfully send to this recipient if you reduce the size of the message.",
    ContentRejected:
      "useSend received a content rejected bounce. You may be able to successfully send to this recipient if you change the content of the message.",
    AttachmentRejected:
      "useSend received an attachment rejected bounce. You may be able to successfully send to this recipient if you remove or change the attachment.",
  },
};

export const COMPLAINT_ERROR_MESSAGES = {
  abuse: "Indicates unsolicited email or some other kind of email abuse.",
  "auth-failure": "Email authentication failure report.",
  fraud: "Indicates some kind of fraud or phishing activity.",
  "not-spam":
    "Indicates that the entity providing the report does not consider the message to be spam. This may be used to correct a message that was incorrectly tagged or categorized as spam.",
  other:
    "Indicates any other feedback that does not fit into other registered types.",
  virus: "Reports that a virus is found in the originating message.",
};
