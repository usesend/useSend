# Webhook Test Project (Flask)

This example project helps you validate Python SDK webhook signature verification locally.

## What it includes

- `receiver.py`: local webhook endpoint that verifies and parses events
- `send_test_webhook.py`: sends a signed test webhook request to your local endpoint

## Setup

```bash
cd packages/python-sdk/example/webhook-test-project
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

Terminal 1:

```bash
python receiver.py
```

Terminal 2:

```bash
python send_test_webhook.py
```

You should see:

- `200` response from the receiver
- parsed webhook event output in the receiver terminal

## Environment variables

- `USESEND_WEBHOOK_SECRET` (default: `whsec_test`)
- `WEBHOOK_URL` (default: `http://127.0.0.1:8000/webhook`)

Use the same `USESEND_WEBHOOK_SECRET` for both scripts.
