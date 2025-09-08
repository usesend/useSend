# UseSend Python SDK

A minimal Python SDK for the [UseSend](https://usesend.com) API, mirroring the structure of the JavaScript SDK.

## Installation

Install via pip or Poetry:

```
pip install usesend
# or
poetry add usesend
```

## Usage

```python
from usesend import UseSend, types

# By default: raises UseSendHTTPError on non-2xx.
client = UseSend("us_123")

# 1) TypedDict payload (autocomplete in IDEs). Use dict to pass 'from'.
payload: types.EmailCreate = {
    "to": "test@example.com",
    "from": "no-reply@example.com",
    "subject": "Hello",
    "html": "<strong>Hi!</strong>",
}
resp, _ = client.emails.send(payload=payload)

# 2) Or pass a plain dict (supports 'from')
resp, _ = client.emails.send(payload={
    "to": "test@example.com",
    "from": "no-reply@example.com",
    "subject": "Hello",
    "html": "<strong>Hi!</strong>",
})

# Toggle behavior if desired:
# - raise_on_error=False: return (None, error_dict) instead of raising
# No model parsing occurs; methods return plain dicts following the typed shapes.
client = UseSend("us_123", raise_on_error=False)
raw, err = client.emails.get(email_id="email_123")
if err:
    print("error:", err)
else:
    print("ok:", raw)
```

## Development

This package is managed with Poetry. Models are maintained in-repo under
`usesend/types.py` (readable names). Update this file as the API evolves.

It is published as `usesend` on PyPI.

Notes

- Human-friendly models are available under `usesend.types` (e.g., `EmailCreate`, `Contact`, `APIError`).
- Endpoint methods accept TypedDict payloads or plain dicts via the `payload=` keyword.
