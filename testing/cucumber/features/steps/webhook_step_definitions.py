import hashlib
import hmac

import requests
from behave import given, when, then

BASE_URL = "http://localhost:8080"
API_HEADERS = {"X-API-KEY": "123456789"}


def _sign(secret, body):
    digest = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
    return "sha256=" + digest


@given('I create a webhook source named "{name}"')
def step_create_webhook_source(context, name):
    resp = requests.post(
        f"{BASE_URL}/api/v1/sources",
        headers={**API_HEADERS, "Content-Type": "application/json"},
        json={"name": name, "type": "webhook", "options": {}, "enabled": True},
        timeout=15,
    )
    assert resp.status_code == 200, f"create source failed: {resp.status_code} {resp.text}"
    context.webhook_create_response = resp
    body = resp.json()
    context.webhook_source_id = body["id"]
    context.webhook_id = body["options"]["webhookId"]
    context.webhook_secret = body["options"]["signingSecret"]


@when('I deliver "{payload}" to the webhook with a valid signature')
def step_deliver_signed(context, payload):
    signature = _sign(context.webhook_secret, payload)
    context.webhook_response = requests.post(
        f"{BASE_URL}/api/v1/webhooks/{context.webhook_id}",
        headers={"Content-Type": "application/pdf", "X-Stirling-Signature": signature},
        data=payload.encode(),
        timeout=15,
    )


@when('I deliver "{payload}" to the webhook with signature "{signature}"')
def step_deliver_with_signature(context, payload, signature):
    context.webhook_response = requests.post(
        f"{BASE_URL}/api/v1/webhooks/{context.webhook_id}",
        headers={"Content-Type": "application/pdf", "X-Stirling-Signature": signature},
        data=payload.encode(),
        timeout=15,
    )


@when('I deliver "{payload}" to webhook id "{webhook_id}"')
def step_deliver_to_id(context, payload, webhook_id):
    context.webhook_response = requests.post(
        f"{BASE_URL}/api/v1/webhooks/{webhook_id}",
        headers={"Content-Type": "application/pdf", "X-Stirling-Signature": "sha256=00"},
        data=payload.encode(),
        timeout=15,
    )


@then("the webhook response status should be {status:d}")
def step_check_status(context, status):
    actual = context.webhook_response.status_code
    assert actual == status, f"expected {status}, got {actual}: {context.webhook_response.text}"


@then("the webhook create response includes a signing secret")
def step_secret_present(context):
    secret = context.webhook_create_response.json()["options"].get("signingSecret", "")
    assert secret and secret != "********", f"expected a revealed secret, got '{secret}'"


@then("reading the webhook source back masks the signing secret")
def step_secret_masked(context):
    resp = requests.get(
        f"{BASE_URL}/api/v1/sources/{context.webhook_source_id}",
        headers=API_HEADERS,
        timeout=15,
    )
    assert resp.status_code == 200, f"get source failed: {resp.status_code} {resp.text}"
    secret = resp.json()["options"].get("signingSecret", "")
    assert secret != context.webhook_secret, "secret was returned in clear text on read"
