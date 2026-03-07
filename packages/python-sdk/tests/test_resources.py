from typing import Any, Dict, List, Optional

from usesend import UseSend


class MockResponse:
    def __init__(self, payload: Dict[str, Any], ok: bool = True, reason: str = "OK") -> None:
        self._payload = payload
        self.ok = ok
        self.reason = reason
        self.status_code = 200 if ok else 400

    def json(self) -> Dict[str, Any]:
        return self._payload


class MockSession:
    def __init__(self, responses: List[MockResponse]) -> None:
        self._responses = responses
        self.calls: List[Dict[str, Any]] = []

    def request(
        self,
        method: str,
        url: str,
        headers: Optional[Dict[str, str]] = None,
        json: Optional[Any] = None,
    ) -> MockResponse:
        self.calls.append(
            {
                "method": method,
                "url": url,
                "headers": headers,
                "json": json,
            }
        )
        return self._responses.pop(0)


def test_contact_books_list_uses_expected_path_and_returns_data() -> None:
    session = MockSession(
        [
            MockResponse(
                [
                    {
                        "id": "cb_123",
                        "name": "Newsletter Subscribers",
                        "teamId": 1,
                        "properties": {},
                        "variables": ["company"],
                        "emoji": "📙",
                        "doubleOptInEnabled": True,
                        "doubleOptInFrom": "Newsletter <hello@example.com>",
                        "doubleOptInSubject": "Please confirm your subscription",
                        "doubleOptInContent": "{}",
                        "createdAt": "2026-03-01T00:00:00.000Z",
                        "updatedAt": "2026-03-01T00:00:00.000Z",
                        "_count": {"contacts": 12},
                    }
                ]
            )
        ]
    )
    client = UseSend("us_test", session=session)

    data, err = client.contact_books.list()

    assert err is None
    assert data is not None
    assert data[0]["variables"] == ["company"]
    assert session.calls[0]["method"] == "GET"
    assert session.calls[0]["url"].endswith("/api/v1/contactBooks")


def test_contact_books_alias_matches_js_style_client() -> None:
    session = MockSession([MockResponse({"id": "cb_123", "name": "Book"})])
    client = UseSend("us_test", session=session)

    data, err = client.contactBooks.get("cb_123")

    assert err is None
    assert data is not None
    assert data["id"] == "cb_123"
    assert session.calls[0]["url"].endswith("/api/v1/contactBooks/cb_123")


def test_contacts_list_encodes_query_params() -> None:
    session = MockSession([MockResponse([])])
    client = UseSend("us_test", session=session)

    data, err = client.contacts.list(
        "cb_123",
        emails="a@example.com,b@example.com",
        page=2,
        limit=50,
        ids="ct_1,ct_2",
    )

    assert err is None
    assert data == []
    assert session.calls[0]["method"] == "GET"
    assert session.calls[0]["url"].endswith(
        "/api/v1/contactBooks/cb_123/contacts?emails=a%40example.com%2Cb%40example.com&page=2&limit=50&ids=ct_1%2Cct_2"
    )


def test_contacts_bulk_methods_use_expected_payloads() -> None:
    session = MockSession(
        [
            MockResponse({"message": "Contacts imported", "count": 2}),
            MockResponse({"success": True, "count": 2}),
        ]
    )
    client = UseSend("us_test", session=session)

    create_data, create_err = client.contacts.bulk_create(
        "cb_123",
        [
            {"email": "a@example.com"},
            {"email": "b@example.com", "firstName": "B"},
        ],
    )
    delete_data, delete_err = client.contacts.bulk_delete(
        "cb_123",
        {"contactIds": ["ct_1", "ct_2"]},
    )

    assert create_err is None
    assert create_data == {"message": "Contacts imported", "count": 2}
    assert delete_err is None
    assert delete_data == {"success": True, "count": 2}
    assert session.calls[0]["method"] == "POST"
    assert session.calls[0]["json"] == [
        {"email": "a@example.com"},
        {"email": "b@example.com", "firstName": "B"},
    ]
    assert session.calls[1]["method"] == "DELETE"
    assert session.calls[1]["json"] == {"contactIds": ["ct_1", "ct_2"]}
