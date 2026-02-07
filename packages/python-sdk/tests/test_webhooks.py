import hashlib
import hmac
import json
import time
from typing import get_args, get_type_hints

import pytest

from usesend import types
from usesend.webhooks import (
    WEBHOOK_SIGNATURE_HEADER,
    WEBHOOK_TIMESTAMP_HEADER,
    WebhookVerificationError,
    Webhooks,
)


def _sign(secret: str, timestamp: str, body: str) -> str:
    digest = hmac.new(
        secret.encode("utf-8"),
        f"{timestamp}.{body}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"v1={digest}"


def test_verify_returns_false_for_non_utf8_bytes_body() -> None:
    webhooks = Webhooks("whsec_test")
    timestamp = str(int(time.time() * 1000))

    is_valid = webhooks.verify(
        b"\xff",
        headers={
            WEBHOOK_SIGNATURE_HEADER: "v1=deadbeef",
            WEBHOOK_TIMESTAMP_HEADER: timestamp,
        },
    )

    assert is_valid is False


def test_construct_event_raises_invalid_body_for_non_utf8_bytes() -> None:
    webhooks = Webhooks("whsec_test")
    timestamp = str(int(time.time() * 1000))

    with pytest.raises(WebhookVerificationError) as exc:
        webhooks.construct_event(
            b"\xff",
            headers={
                WEBHOOK_SIGNATURE_HEADER: "v1=deadbeef",
                WEBHOOK_TIMESTAMP_HEADER: timestamp,
            },
        )

    assert exc.value.code == "INVALID_BODY"


def test_email_webhook_event_type_excludes_specialized_events() -> None:
    email_event_type = get_type_hints(types.EmailWebhookEvent)["type"]
    supported = set(get_args(email_event_type))

    assert "email.delivered" in supported
    assert "email.bounced" not in supported
    assert "email.failed" not in supported
    assert "email.suppressed" not in supported
    assert "email.opened" not in supported
    assert "email.clicked" not in supported


def test_construct_event_parses_bounced_event_with_valid_signature() -> None:
    secret = "whsec_test"
    webhooks = Webhooks(secret)
    timestamp = str(int(time.time() * 1000))

    payload = {
        "id": "evt_123",
        "type": "email.bounced",
        "createdAt": "2026-02-08T10:00:00.000Z",
        "data": {
            "id": "email_123",
            "status": "BOUNCED",
            "from": "from@example.com",
            "to": ["to@example.com"],
            "occurredAt": "2026-02-08T10:00:00.000Z",
            "bounce": {
                "type": "Permanent",
                "subType": "General",
            },
        },
    }
    body = json.dumps(payload)
    signature = _sign(secret, timestamp, body)

    event = webhooks.construct_event(
        body,
        headers={
            WEBHOOK_SIGNATURE_HEADER: signature,
            WEBHOOK_TIMESTAMP_HEADER: timestamp,
        },
    )

    assert event["type"] == "email.bounced"
    assert event["data"]["bounce"]["type"] == "Permanent"
