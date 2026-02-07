from __future__ import annotations

import os

from flask import Flask, jsonify, request
from flask.typing import ResponseReturnValue

from usesend import UseSend, WebhookVerificationError  # type: ignore[import-not-found]


WEBHOOK_SECRET = os.getenv("USESEND_WEBHOOK_SECRET", "whsec_test")

app = Flask(__name__)
usesend = UseSend("us_test")
webhooks = usesend.webhooks(WEBHOOK_SECRET)


@app.post("/webhook")
def webhook() -> ResponseReturnValue:
    raw_body = request.get_data()

    try:
        event = webhooks.construct_event(raw_body, headers=request.headers)
    except WebhookVerificationError as exc:
        return jsonify({"ok": False, "code": exc.code, "message": str(exc)}), 400

    print(f"Received event: {event['type']}")

    if event["type"] == "email.bounced":
        bounce = event["data"].get("bounce", {})
        print("Bounce details:", bounce)

    return jsonify({"ok": True, "type": event["type"]}), 200


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000)
