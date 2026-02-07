"""Webhook verification and event construction for UseSend webhooks.

This module provides secure webhook signature verification using HMAC-SHA256,
timestamp validation, and type-safe event parsing.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any, Dict, Literal, Mapping, Optional, Union

from .types import WebhookEventData


# Webhook header names
WEBHOOK_SIGNATURE_HEADER = "X-UseSend-Signature"
WEBHOOK_TIMESTAMP_HEADER = "X-UseSend-Timestamp"
WEBHOOK_EVENT_HEADER = "X-UseSend-Event"
WEBHOOK_CALL_HEADER = "X-UseSend-Call"

# Signature format
SIGNATURE_PREFIX = "v1="

# Default tolerance: 5 minutes in milliseconds
DEFAULT_TOLERANCE_MS = 5 * 60 * 1000


WebhookVerificationErrorCode = Literal[
    "MISSING_SIGNATURE",
    "MISSING_TIMESTAMP",
    "INVALID_SIGNATURE_FORMAT",
    "INVALID_TIMESTAMP",
    "TIMESTAMP_OUT_OF_RANGE",
    "SIGNATURE_MISMATCH",
    "INVALID_BODY",
    "INVALID_JSON",
]


class WebhookVerificationError(Exception):
    """Error raised when webhook verification fails.

    Attributes:
        code: The error code indicating the type of verification failure.
        message: A human-readable description of the error.
    """

    def __init__(self, code: WebhookVerificationErrorCode, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)

    def __str__(self) -> str:
        return f"[{self.code}] {self.message}"


class Webhooks:
    """Webhook verification and event construction.

    This class provides methods to verify webhook signatures and parse
    webhook events with type safety.

    Parameters
    ----------
    secret:
        The webhook signing secret (starts with 'whsec_').

    Example
    -------
    ```python
    from usesend import UseSend

    usesend = UseSend("us_12345")
    webhooks = usesend.webhooks("whsec_xxx")

    # Flask example
    @app.route("/webhook", methods=["POST"])
    def handle_webhook():
        try:
            event = webhooks.construct_event(
                request.data,
                headers=request.headers
            )

            if event["type"] == "email.delivered":
                print(f"Email delivered to {event['data']['to']}")

            return "OK", 200
        except WebhookVerificationError as e:
            return str(e), 400
    ```
    """

    def __init__(self, secret: str) -> None:
        self._secret = secret

    def verify(
        self,
        body: Union[str, bytes],
        *,
        headers: Mapping[str, Any],
        secret: Optional[str] = None,
        tolerance: Optional[int] = None,
    ) -> bool:
        """Verify webhook signature without parsing the event.

        Parameters
        ----------
        body:
            Raw webhook body (string or bytes).
        headers:
            Request headers (dict-like object).
        secret:
            Optional override for the webhook secret.
        tolerance:
            Optional tolerance in milliseconds for timestamp validation.
            Defaults to 5 minutes. Set to -1 to disable timestamp validation.

        Returns
        -------
        bool
            True if signature is valid, False otherwise.

        Example
        -------
        ```python
        is_valid = webhooks.verify(body, headers=request.headers)

        if not is_valid:
            return "Invalid signature", 401
        ```
        """
        try:
            self._verify_internal(body, headers=headers, secret=secret, tolerance=tolerance)
            return True
        except WebhookVerificationError:
            return False

    def construct_event(
        self,
        body: Union[str, bytes],
        *,
        headers: Mapping[str, Any],
        secret: Optional[str] = None,
        tolerance: Optional[int] = None,
    ) -> WebhookEventData:
        """Verify and parse a webhook event.

        Parameters
        ----------
        body:
            Raw webhook body (string or bytes).
        headers:
            Request headers (dict-like object).
        secret:
            Optional override for the webhook secret.
        tolerance:
            Optional tolerance in milliseconds for timestamp validation.
            Defaults to 5 minutes. Set to -1 to disable timestamp validation.

        Returns
        -------
        WebhookEventData
            Verified and typed webhook event.

        Raises
        ------
        WebhookVerificationError
            If the webhook signature is invalid or the payload cannot be parsed.

        Example
        -------
        ```python
        # Flask
        event = webhooks.construct_event(
            request.data,
            headers=request.headers
        )

        # Django
        event = webhooks.construct_event(
            request.body,
            headers=request.headers
        )

        # FastAPI
        event = webhooks.construct_event(
            await request.body(),
            headers=dict(request.headers)
        )

        # Type-safe event handling
        if event["type"] == "email.delivered":
            print(event["data"]["to"])
        elif event["type"] == "email.bounced":
            print(event["data"]["bounce"]["type"])
        ```
        """
        self._verify_internal(body, headers=headers, secret=secret, tolerance=tolerance)

        body_string = _to_string(body)
        try:
            return json.loads(body_string)
        except (json.JSONDecodeError, ValueError) as e:
            raise WebhookVerificationError(
                "INVALID_JSON",
                f"Webhook payload is not valid JSON: {e}",
            ) from e

    def _verify_internal(
        self,
        body: Union[str, bytes],
        *,
        headers: Mapping[str, Any],
        secret: Optional[str] = None,
        tolerance: Optional[int] = None,
    ) -> None:
        """Internal verification logic."""
        webhook_secret = secret if secret is not None else self._secret
        signature = _get_header(headers, WEBHOOK_SIGNATURE_HEADER)
        timestamp = _get_header(headers, WEBHOOK_TIMESTAMP_HEADER)

        if not signature:
            raise WebhookVerificationError(
                "MISSING_SIGNATURE",
                f"Missing {WEBHOOK_SIGNATURE_HEADER} header",
            )

        if not timestamp:
            raise WebhookVerificationError(
                "MISSING_TIMESTAMP",
                f"Missing {WEBHOOK_TIMESTAMP_HEADER} header",
            )

        if not signature.startswith(SIGNATURE_PREFIX):
            raise WebhookVerificationError(
                "INVALID_SIGNATURE_FORMAT",
                "Signature header must start with v1=",
            )

        try:
            timestamp_num = int(timestamp)
        except ValueError as e:
            raise WebhookVerificationError(
                "INVALID_TIMESTAMP",
                "Timestamp header must be a number (milliseconds since epoch)",
            ) from e

        tolerance_ms = tolerance if tolerance is not None else DEFAULT_TOLERANCE_MS
        now = int(time.time() * 1000)

        if tolerance_ms >= 0 and abs(now - timestamp_num) > tolerance_ms:
            raise WebhookVerificationError(
                "TIMESTAMP_OUT_OF_RANGE",
                "Webhook timestamp is outside the allowed tolerance",
            )

        body_string = _to_string(body)
        expected = _compute_signature(webhook_secret, timestamp, body_string)

        if not _safe_compare(expected, signature):
            raise WebhookVerificationError(
                "SIGNATURE_MISMATCH",
                "Webhook signature does not match",
            )


def _compute_signature(secret: str, timestamp: str, body: str) -> str:
    """Compute the HMAC-SHA256 signature for webhook verification."""
    message = f"{timestamp}.{body}"
    signature = hmac.new(
        secret.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"{SIGNATURE_PREFIX}{signature}"


def _to_string(body: Union[str, bytes]) -> str:
    """Convert body to UTF-8 string."""
    if isinstance(body, str):
        return body
    if isinstance(body, bytes):
        try:
            return body.decode("utf-8")
        except UnicodeDecodeError as e:
            raise WebhookVerificationError(
                "INVALID_BODY",
                "Webhook body must be valid UTF-8.",
            ) from e
    raise WebhookVerificationError(
        "INVALID_BODY",
        f"Unsupported body type: {type(body).__name__}. Expected str or bytes.",
    )


def _get_header(headers: Mapping[str, Any], name: str) -> Optional[str]:
    """Get header value in a case-insensitive manner."""
    if headers is None:
        return None

    # Try direct access first
    if name in headers:
        value = headers[name]
        if isinstance(value, list):
            return value[0] if value else None
        return str(value) if value is not None else None

    # Case-insensitive lookup
    lower_name = name.lower()
    for key in headers:
        if key.lower() == lower_name:
            value = headers[key]
            if isinstance(value, list):
                return value[0] if value else None
            return str(value) if value is not None else None

    return None


def _safe_compare(a: str, b: str) -> bool:
    """Timing-safe string comparison to prevent timing attacks."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))
