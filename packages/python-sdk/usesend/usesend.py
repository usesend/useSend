"""Core client for interacting with the UseSend API."""
from __future__ import annotations

import os
from typing import Dict, Optional, Tuple

import requests


DEFAULT_BASE_URL = "https://app.usesend.com"


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

    def __init__(self, key: Optional[str] = None, url: Optional[str] = None) -> None:
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

        # Lazily initialise resource clients.
        self.emails = Emails(self)
        self.contacts = Contacts(self)

    # ------------------------------------------------------------------
    # Internal request helper
    # ------------------------------------------------------------------
    def _request(
        self, method: str, path: str, json: Optional[Dict[str, object]] = None
    ) -> Tuple[Optional[Dict[str, object]], Optional[Dict[str, object]]]:
        """Perform an HTTP request and return ``(data, error)``."""
        resp = requests.request(method, f"{self.url}{path}", headers=self.headers, json=json)
        default_error = {"code": "INTERNAL_SERVER_ERROR", "message": resp.reason}

        if not resp.ok:
            try:
                payload = resp.json()
                error = payload.get("error", default_error)
            except Exception:
                error = default_error
            return None, error

        try:
            return resp.json(), None
        except Exception:
            return None, default_error

    # ------------------------------------------------------------------
    # HTTP verb helpers
    # ------------------------------------------------------------------
    def post(self, path: str, body: Dict[str, object]) -> Tuple[Optional[Dict[str, object]], Optional[Dict[str, object]]]:
        return self._request("POST", path, json=body)

    def get(self, path: str) -> Tuple[Optional[Dict[str, object]], Optional[Dict[str, object]]]:
        return self._request("GET", path)

    def put(self, path: str, body: Dict[str, object]) -> Tuple[Optional[Dict[str, object]], Optional[Dict[str, object]]]:
        return self._request("PUT", path, json=body)

    def patch(self, path: str, body: Dict[str, object]) -> Tuple[Optional[Dict[str, object]], Optional[Dict[str, object]]]:
        return self._request("PATCH", path, json=body)

    def delete(
        self, path: str, body: Optional[Dict[str, object]] = None
    ) -> Tuple[Optional[Dict[str, object]], Optional[Dict[str, object]]]:
        return self._request("DELETE", path, json=body)


# Import here to avoid circular dependency during type checking
from .emails import Emails  # noqa: E402  pylint: disable=wrong-import-position
from .contacts import Contacts  # noqa: E402  pylint: disable=wrong-import-position
