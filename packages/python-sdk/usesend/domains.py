"""Domain resource client using TypedDict shapes (no Pydantic)."""
from __future__ import annotations

from typing import Optional, Tuple, List

from .types import (
    APIError,
    Domain,
    DomainCreate,
    DomainCreateResponse,
    DomainDeleteResponse,
    DomainVerifyResponse,
)


class Domains:
    """Client for `/domains` endpoints."""

    def __init__(self, usesend: "UseSend") -> None:
        self.usesend = usesend

    def list(self) -> Tuple[Optional[List[Domain]], Optional[APIError]]:
        data, err = self.usesend.get("/domains")
        return (data, err)  # type: ignore[return-value]

    def create(self, payload: DomainCreate) -> Tuple[Optional[DomainCreateResponse], Optional[APIError]]:
        data, err = self.usesend.post("/domains", payload)
        return (data, err)  # type: ignore[return-value]

    def verify(self, domain_id: int) -> Tuple[Optional[DomainVerifyResponse], Optional[APIError]]:
        data, err = self.usesend.put(f"/domains/{domain_id}/verify", {})
        return (data, err)  # type: ignore[return-value]

    def get(self, domain_id: int) -> Tuple[Optional[Domain], Optional[APIError]]:
        data, err = self.usesend.get(f"/domains/{domain_id}")
        return (data, err)  # type: ignore[return-value]

    def delete(self, domain_id: int) -> Tuple[Optional[DomainDeleteResponse], Optional[APIError]]:
        data, err = self.usesend.delete(f"/domains/{domain_id}")
        return (data, err)  # type: ignore[return-value]

from .usesend import UseSend  # noqa: E402  pylint: disable=wrong-import-position
