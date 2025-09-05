"""Contact resource client with typed models."""
from __future__ import annotations

from typing import Optional, Tuple

from .types import (
    APIError,
    V1ContactBooksContactBookIdContactsContactIdDeleteResponse,
    V1ContactBooksContactBookIdContactsContactIdGetResponse,
    V1ContactBooksContactBookIdContactsContactIdPatchRequest,
    V1ContactBooksContactBookIdContactsContactIdPatchResponse,
    V1ContactBooksContactBookIdContactsContactIdPutRequest,
    V1ContactBooksContactBookIdContactsContactIdPutResponse,
    V1ContactBooksContactBookIdContactsPostRequest,
    V1ContactBooksContactBookIdContactsPostResponse,
)


class Contacts:
    """Client for `/contactBooks` endpoints."""

    def __init__(self, usesend: "UseSend") -> None:
        self.usesend = usesend

    def create(
        self, book_id: str, payload: V1ContactBooksContactBookIdContactsPostRequest
    ) -> Tuple[
        Optional[V1ContactBooksContactBookIdContactsPostResponse],
        Optional[APIError],
    ]:
        data, err = self.usesend.post(
            f"/contactBooks/{book_id}/contacts",
            payload.model_dump(exclude_none=True),
        )
        return (
            V1ContactBooksContactBookIdContactsPostResponse.model_validate(data)
            if data
            else None,
            APIError.model_validate(err) if err else None,
        )

    def get(
        self, book_id: str, contact_id: str
    ) -> Tuple[
        Optional[V1ContactBooksContactBookIdContactsContactIdGetResponse],
        Optional[APIError],
    ]:
        data, err = self.usesend.get(
            f"/contactBooks/{book_id}/contacts/{contact_id}"
        )
        return (
            V1ContactBooksContactBookIdContactsContactIdGetResponse.model_validate(data)
            if data
            else None,
            APIError.model_validate(err) if err else None,
        )

    def update(
        self,
        book_id: str,
        contact_id: str,
        payload: V1ContactBooksContactBookIdContactsContactIdPatchRequest,
    ) -> Tuple[
        Optional[V1ContactBooksContactBookIdContactsContactIdPatchResponse],
        Optional[APIError],
    ]:
        data, err = self.usesend.patch(
            f"/contactBooks/{book_id}/contacts/{contact_id}",
            payload.model_dump(exclude_none=True),
        )
        return (
            V1ContactBooksContactBookIdContactsContactIdPatchResponse.model_validate(
                data
            )
            if data
            else None,
            APIError.model_validate(err) if err else None,
        )

    def upsert(
        self,
        book_id: str,
        contact_id: str,
        payload: V1ContactBooksContactBookIdContactsContactIdPutRequest,
    ) -> Tuple[
        Optional[V1ContactBooksContactBookIdContactsContactIdPutResponse],
        Optional[APIError],
    ]:
        data, err = self.usesend.put(
            f"/contactBooks/{book_id}/contacts/{contact_id}",
            payload.model_dump(exclude_none=True),
        )
        return (
            V1ContactBooksContactBookIdContactsContactIdPutResponse.model_validate(
                data
            )
            if data
            else None,
            APIError.model_validate(err) if err else None,
        )

    def delete(
        self, book_id: str, contact_id: str
    ) -> Tuple[
        Optional[V1ContactBooksContactBookIdContactsContactIdDeleteResponse],
        Optional[APIError],
    ]:
        data, err = self.usesend.delete(
            f"/contactBooks/{book_id}/contacts/{contact_id}"
        )
        return (
            V1ContactBooksContactBookIdContactsContactIdDeleteResponse.model_validate(
                data
            )
            if data
            else None,
            APIError.model_validate(err) if err else None,
        )


from .usesend import UseSend  # noqa: E402  pylint: disable=wrong-import-position
