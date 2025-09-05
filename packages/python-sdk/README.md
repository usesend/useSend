# UseSend Python SDK

A minimal Python SDK for the [UseSend](https://usesend.com) API, mirroring the structure of the JavaScript SDK.

## Installation

Install via [Poetry](https://python-poetry.org/) to respect the project's dependency metadata:

```
poetry add usesend-sdk
```

## Usage

```python
from usesend import UseSend, types

client = UseSend("us_123")
payload = types.V1EmailsPostRequest(
    to="test@example.com",
    subject="Hello",
    html="<strong>Hi!</strong>",
)
resp, err = client.emails.send(payload)

if err:
    print(err)
else:
    print(resp)
```

## Development

This package is managed with Poetry. The typed request/response models under `usesend.types` are generated from the repository's OpenAPI schema via `datamodel-code-generator`:

```
poetry run datamodel-codegen \
  --input ../../apps/docs/api-reference/openapi.json \
  --input-file-type openapi --openapi-scopes schemas paths \
  --output usesend/types.py
```

It is not currently published to PyPI.
