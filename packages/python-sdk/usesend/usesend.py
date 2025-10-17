"""Core client for interacting with the UseSend API.

Enhancements:
- Optional ``raise_on_error`` to raise ``UseSendHTTPError`` on non-2xx.
- Reusable ``requests.Session`` support for connection reuse.
"""
from __future__ import annotations

import os
from typing import Any, Dict, Optional, Tuple

import requests


DEFAULT_BASE_URL = "https://app.usesend.com"


class UseSendHTTPError(Exception):
    """HTTP error raised when ``raise_on_error=True`` and a request fails."""

    def __init__(self, status_code: int, error: Dict[str, Any], method: str, path: str) -> None:
        self.status_code = status_code
        self.error = error
        self.method = method
        self.path = path
        super().__init__(self.__str__())

    def __str__(self) -> str:  # pragma: no cover - presentation only
        code = self.error.get("code", "UNKNOWN_ERROR")
        message = self.error.get("message", "")
        return f"{self.method} {self.path} -> {self.status_code} {code}: {message}"


class UseSend:
    """UseSend API client.

    Parameters
    ----------
    key:
        API key issued by UseSend. If not provided, the client attempts to
        read ``USESEND_API_KEY`` or ``UNSEND_API_KEY`` from the environment.
    url:
        Optional base URL for the API (useful for testing).
    """

    def __init__(
        self,
        key: Optional[str] = None,
        url: Optional[str] = None,
        *,
        raise_on_error: bool = True,
        session: Optional[requests.Session] = None,
    ) -> None:
        self.key = key or os.getenv("USESEND_API_KEY") or os.getenv("UNSEND_API_KEY")
        if not self.key:
            raise ValueError("Missing API key. Pass it to UseSend('us_123')")

        base = os.getenv("USESEND_BASE_URL") or os.getenv("UNSEND_BASE_URL") or DEFAULT_BASE_URL
        if url:
            base = url
        self.url = f"{base}/api/v1"

        self.headers = {
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }

        self.raise_on_error = raise_on_error
        self._session = session or requests.Session()

        # Lazily initialise resource clients.
        self.emails = Emails(self)
        self.contacts = Contacts(self)
        self.domains = Domains(self)
        self.campaigns = Campaigns(self)

    # ------------------------------------------------------------------
    # Internal request helper
    # ------------------------------------------------------------------
    def _request(
        self, method: str, path: str, json: Optional[Any] = None
    ) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
        """Perform an HTTP request and return ``(data, error)``."""
        resp = self._session.request(
            method, f"{self.url}{path}", headers=self.headers, json=json
        )
        default_error = {"code": "INTERNAL_SERVER_ERROR", "message": resp.reason}

        if not resp.ok:
            try:
                payload = resp.json()
                error = payload.get("error", default_error)
            except Exception:
                error = default_error
            if self.raise_on_error:
                raise UseSendHTTPError(resp.status_code, error, method, path)
            return None, error

        try:
            return resp.json(), None
        except Exception:
            return None, default_error

    # ------------------------------------------------------------------
    # HTTP verb helpers
    # ------------------------------------------------------------------
    def post(self, path: str, body: Any) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
        return self._request("POST", path, json=body)

    def get(self, path: str) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
        return self._request("GET", path)

    def put(self, path: str, body: Any) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
        return self._request("PUT", path, json=body)

    def patch(self, path: str, body: Any) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
        return self._request("PATCH", path, json=body)

    def delete(
        self, path: str, body: Optional[Any] = None
    ) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
        return self._request("DELETE", path, json=body)


# Import here to avoid circular dependency during type checking
from .emails import Emails  # noqa: E402  pylint: disable=wrong-import-position
from .contacts import Contacts  # noqa: E402  pylint: disable=wrong-import-position
from .domains import Domains  # type: ignore  # noqa: E402
from .campaigns import Campaigns  # type: ignore  # noqa: E402
