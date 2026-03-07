"""Contact resource client using TypedDict shapes (no Pydantic)."""
from __future__ import annotations

from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlencode

from .types import (
    APIError,
    ContactDeleteResponse,
    Contact,
    ContactBulkCreate,
    ContactBulkCreateResponse,
    ContactBulkDelete,
    ContactBulkDeleteResponse,
    ContactList,
    ContactUpdate,
    ContactUpdateResponse,
    ContactUpsert,
    ContactUpsertResponse,
    ContactCreate,
    ContactCreateResponse,
)


class Contacts:
    """Client for `/contactBooks` endpoints."""

    def __init__(self, usesend: "UseSend") -> None:
        self.usesend = usesend

    def create(
        self, book_id: str, payload: ContactCreate
    ) -> Tuple[Optional[ContactCreateResponse], Optional[APIError]]:
        data, err = self.usesend.post(
            f"/contactBooks/{book_id}/contacts",
            payload,
        )
        return (data, err)  # type: ignore[return-value]

    def list(
        self,
        book_id: str,
        *,
        emails: Optional[str] = None,
        page: Optional[int] = None,
        limit: Optional[int] = None,
        ids: Optional[str] = None,
    ) -> Tuple[Optional[ContactList], Optional[APIError]]:
        query: Dict[str, Any] = {}
        if emails is not None:
            query["emails"] = emails
        if page is not None:
            query["page"] = page
        if limit is not None:
            query["limit"] = limit
        if ids is not None:
            query["ids"] = ids

        path = f"/contactBooks/{book_id}/contacts"
        if query:
            path = f"{path}?{urlencode(query)}"

        data, err = self.usesend.get(path)
        return (data, err)  # type: ignore[return-value]

    def get(
        self, book_id: str, contact_id: str
    ) -> Tuple[Optional[Contact], Optional[APIError]]:
        data, err = self.usesend.get(
            f"/contactBooks/{book_id}/contacts/{contact_id}"
        )
        return (data, err)  # type: ignore[return-value]

    def update(
        self, book_id: str, contact_id: str, payload: ContactUpdate
    ) -> Tuple[Optional[ContactUpdateResponse], Optional[APIError]]:
        data, err = self.usesend.patch(
            f"/contactBooks/{book_id}/contacts/{contact_id}",
            payload,
        )
        return (data, err)  # type: ignore[return-value]

    def upsert(
        self, book_id: str, contact_id: str, payload: ContactUpsert
    ) -> Tuple[Optional[ContactUpsertResponse], Optional[APIError]]:
        data, err = self.usesend.put(
            f"/contactBooks/{book_id}/contacts/{contact_id}",
            payload,
        )
        return (data, err)  # type: ignore[return-value]

    def bulk_create(
        self, book_id: str, payload: ContactBulkCreate
    ) -> Tuple[Optional[ContactBulkCreateResponse], Optional[APIError]]:
        data, err = self.usesend.post(
            f"/contactBooks/{book_id}/contacts/bulk",
            payload,
        )
        return (data, err)  # type: ignore[return-value]

    def bulk_delete(
        self, book_id: str, payload: ContactBulkDelete
    ) -> Tuple[Optional[ContactBulkDeleteResponse], Optional[APIError]]:
        data, err = self.usesend.delete(
            f"/contactBooks/{book_id}/contacts/bulk",
            payload,
        )
        return (data, err)  # type: ignore[return-value]

    def delete(
        self, *, book_id: str, contact_id: str
    ) -> Tuple[Optional[ContactDeleteResponse], Optional[APIError]]:
        data, err = self.usesend.delete(
            f"/contactBooks/{book_id}/contacts/{contact_id}"
        )
        return (data, err)  # type: ignore[return-value]


from .usesend import UseSend  # noqa: E402  pylint: disable=wrong-import-position
