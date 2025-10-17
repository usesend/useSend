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

# 3) Campaigns
campaign_payload: types.CampaignCreate = {
    "name": "Welcome Series",
    "subject": "Welcome to our service!",
    "html": "<p>Thanks for joining us!</p>",
    "from": "welcome@example.com",
    "contactBookId": "cb_1234567890",
}
campaign_resp, _ = client.campaigns.create(payload=campaign_payload)

# Schedule a campaign
schedule_payload: types.CampaignSchedule = {
    "scheduledAt": "2024-12-01T10:00:00Z",
}
schedule_resp, _ = client.campaigns.schedule(
    campaign_id=campaign_resp["id"],
    payload=schedule_payload
)

# Pause/resume campaigns
client.campaigns.pause(campaign_id="campaign_123")
client.campaigns.resume(campaign_id="campaign_123")

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

## Available Resources

- **Emails**: `client.emails.send()`, `client.emails.get()`
- **Contacts**: `client.contacts.create()`, `client.contacts.get()`, `client.contacts.list()`
- **Domains**: `client.domains.create()`, `client.domains.get()`, `client.domains.verify()`
- **Campaigns**: `client.campaigns.create()`, `client.campaigns.get()`, `client.campaigns.schedule()`, `client.campaigns.pause()`, `client.campaigns.resume()`

Notes

- Human-friendly models are available under `usesend.types` (e.g., `EmailCreate`, `CampaignCreate`, `Contact`, `APIError`).
- Endpoint methods accept TypedDict payloads or plain dicts via the `payload=` keyword.
