"""Email resource client with typed models."""
from __future__ import annotations

from typing import Optional, Sequence, Tuple

from .types import (
    APIError,
    V1EmailsBatchPostRequest,
    V1EmailsBatchPostRequestItem,
    V1EmailsBatchPostResponse,
    V1EmailsEmailIdCancelPostResponse,
    V1EmailsEmailIdGetResponse,
    V1EmailsEmailIdPatchRequest,
    V1EmailsEmailIdPatchResponse,
    V1EmailsPostRequest,
    V1EmailsPostResponse,
)


class Emails:
    """Client for `/emails` endpoints."""

    def __init__(self, usesend: "UseSend") -> None:
        self.usesend = usesend

    # Basic operations -------------------------------------------------
    def send(
        self, payload: V1EmailsPostRequest
    ) -> Tuple[Optional[V1EmailsPostResponse], Optional[APIError]]:
        """Alias for :meth:`create`."""
        return self.create(payload)

    def create(
        self, payload: V1EmailsPostRequest
    ) -> Tuple[Optional[V1EmailsPostResponse], Optional[APIError]]:
        data, err = self.usesend.post(
            "/emails", payload.model_dump(by_alias=True, exclude_none=True)
        )
        return (
            V1EmailsPostResponse.model_validate(data) if data else None,
            APIError.model_validate(err) if err else None,
        )

    def batch(
        self, payload: Sequence[V1EmailsBatchPostRequestItem]
    ) -> Tuple[Optional[V1EmailsBatchPostResponse], Optional[APIError]]:
        body = V1EmailsBatchPostRequest(__root__=list(payload))
        data, err = self.usesend.post(
            "/emails/batch",
            body.model_dump(by_alias=True, exclude_none=True),
        )
        return (
            V1EmailsBatchPostResponse.model_validate(data) if data else None,
            APIError.model_validate(err) if err else None,
        )

    def get(
        self, email_id: str
    ) -> Tuple[Optional[V1EmailsEmailIdGetResponse], Optional[APIError]]:
        data, err = self.usesend.get(f"/emails/{email_id}")
        return (
            V1EmailsEmailIdGetResponse.model_validate(data) if data else None,
            APIError.model_validate(err) if err else None,
        )

    def update(
        self, email_id: str, payload: V1EmailsEmailIdPatchRequest
    ) -> Tuple[Optional[V1EmailsEmailIdPatchResponse], Optional[APIError]]:
        data, err = self.usesend.patch(
            f"/emails/{email_id}",
            payload.model_dump(by_alias=True, exclude_none=True),
        )
        return (
            V1EmailsEmailIdPatchResponse.model_validate(data) if data else None,
            APIError.model_validate(err) if err else None,
        )

    def cancel(
        self, email_id: str
    ) -> Tuple[Optional[V1EmailsEmailIdCancelPostResponse], Optional[APIError]]:
        data, err = self.usesend.post(f"/emails/{email_id}/cancel", {})
        return (
            V1EmailsEmailIdCancelPostResponse.model_validate(data) if data else None,
            APIError.model_validate(err) if err else None,
        )


from .usesend import UseSend  # noqa: E402  pylint: disable=wrong-import-position
