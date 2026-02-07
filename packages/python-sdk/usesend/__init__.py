"""Python client for the UseSend API."""

from .usesend import UseSend, UseSendHTTPError
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
    "Domains",
    "Campaigns",
    "Webhooks",
    "WebhookVerificationError",
    "WEBHOOK_SIGNATURE_HEADER",
    "WEBHOOK_TIMESTAMP_HEADER",
    "WEBHOOK_EVENT_HEADER",
    "WEBHOOK_CALL_HEADER",
]
