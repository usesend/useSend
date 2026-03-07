"""Python client for the UseSend API."""

from .usesend import UseSend, UseSendHTTPError
from .contacts import Contacts  # type: ignore
from .contact_books import ContactBooks  # type: ignore
from .domains import Domains  # type: ignore
from .campaigns import Campaigns  # type: ignore
from .webhooks import (
    Webhooks,
    WebhookVerificationError,
    WEBHOOK_SIGNATURE_HEADER,
    WEBHOOK_TIMESTAMP_HEADER,
    WEBHOOK_EVENT_HEADER,
    WEBHOOK_CALL_HEADER,
)
from . import types

__all__ = [
    "UseSend",
    "UseSendHTTPError",
    "types",
    "Contacts",
    "ContactBooks",
    "Domains",
    "Campaigns",
    "Webhooks",
    "WebhookVerificationError",
    "WEBHOOK_SIGNATURE_HEADER",
    "WEBHOOK_TIMESTAMP_HEADER",
    "WEBHOOK_EVENT_HEADER",
    "WEBHOOK_CALL_HEADER",
]
