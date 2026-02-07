from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
import uuid

import requests


WEBHOOK_SECRET = os.getenv("USESEND_WEBHOOK_SECRET", "whsec_test")
WEBHOOK_URL = os.getenv("WEBHOOK_URL", "http://127.0.0.1:8000/webhook")


def _signature(secret: str, timestamp_ms: str, body: str) -> str:
    digest = hmac.new(
        secret.encode("utf-8"),
        f"{timestamp_ms}.{body}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"v1={digest}"


def main() -> None:
    payload = {
        "id": f"evt_{uuid.uuid4().hex[:8]}",
        "type": "email.bounced",
        "createdAt": "2026-02-08T10:00:00.000Z",
        "data": {
            "id": "email_123",
            "status": "BOUNCED",
            "from": "sender@example.com",
            "to": ["recipient@example.com"],
            "occurredAt": "2026-02-08T10:00:00.000Z",
            "bounce": {
                "type": "Permanent",
                "subType": "General",
                "message": "Mailbox unavailable",
            },
        },
    }

    body = json.dumps(payload)
    timestamp = str(int(time.time() * 1000))
    signature = _signature(WEBHOOK_SECRET, timestamp, body)

    headers = {
        "Content-Type": "application/json",
        "X-UseSend-Signature": signature,
        "X-UseSend-Timestamp": timestamp,
        "X-UseSend-Event": payload["type"],
        "X-UseSend-Call": f"call_{uuid.uuid4().hex[:10]}",
    }

    response = requests.post(WEBHOOK_URL, data=body, headers=headers, timeout=10)
    print("Status:", response.status_code)
    print("Body:", response.text)


if __name__ == "__main__":
    main()
