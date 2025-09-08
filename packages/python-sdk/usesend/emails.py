"""Email resource client using TypedDict shapes (no Pydantic)."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

from .types import (
    APIError,
    Attachment,
    EmailBatchItem,
    EmailBatchResponse,
    EmailCancelResponse,
    Email,
    EmailUpdate,
    EmailUpdateResponse,
    EmailCreate,
    EmailCreateResponse,
)


class Emails:
    """Client for `/emails` endpoints."""

    def __init__(self, usesend: "UseSend") -> None:
        self.usesend = usesend

    # Basic operations -------------------------------------------------
    def send(self, payload: EmailCreate) -> Tuple[Optional[EmailCreateResponse], Optional[APIError]]:
        """Alias for :meth:`create`."""
        return self.create(payload)

    def create(self, payload: Union[EmailCreate, Dict[str, Any]]) -> Tuple[Optional[EmailCreateResponse], Optional[APIError]]:
        if isinstance(payload, dict):
            payload = dict(payload)

        # Normalize fields
        body: Dict[str, Any] = dict(payload)
        # Support accidental 'from_' usage
        if "from_" in body and "from" not in body:
            body["from"] = body.pop("from_")
        # Convert scheduledAt to ISO 8601 if datetime
        if isinstance(body.get("scheduledAt"), datetime):
            body["scheduledAt"] = body["scheduledAt"].isoformat()

        data, err = self.usesend.post("/emails", body)
        return (data, err)  # type: ignore[return-value]

    def batch(self, payload: Sequence[Union[EmailBatchItem, Dict[str, Any]]]) -> Tuple[Optional[EmailBatchResponse], Optional[APIError]]:
        items: List[Dict[str, Any]] = []
        for item in payload:
            d = dict(item)
            if "from_" in d and "from" not in d:
                d["from"] = d.pop("from_")
            if isinstance(d.get("scheduledAt"), datetime):
                d["scheduledAt"] = d["scheduledAt"].isoformat()
            items.append(d)
        data, err = self.usesend.post("/emails/batch", items)
        return (data, err)  # type: ignore[return-value]

    def get(self, email_id: str) -> Tuple[Optional[Email], Optional[APIError]]:
        data, err = self.usesend.get(f"/emails/{email_id}")
        return (data, err)  # type: ignore[return-value]

    def update(self, email_id: str, payload: EmailUpdate) -> Tuple[Optional[EmailUpdateResponse], Optional[APIError]]:
        body: Dict[str, Any] = dict(payload)
        if isinstance(body.get("scheduledAt"), datetime):
            body["scheduledAt"] = body["scheduledAt"].isoformat()

        data, err = self.usesend.patch(f"/emails/{email_id}", body)
        return (data, err)  # type: ignore[return-value]

    def cancel(self, email_id: str) -> Tuple[Optional[EmailCancelResponse], Optional[APIError]]:
        data, err = self.usesend.post(f"/emails/{email_id}/cancel", {})
        return (data, err)  # type: ignore[return-value]


from .usesend import UseSend  # noqa: E402  pylint: disable=wrong-import-position
