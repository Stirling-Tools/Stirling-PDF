"""
Step definitions for enterprise and proprietary API endpoints.

Covers:
  - User management (password change, API keys, admin CRUD)
  - Admin settings
  - Audit log
  - Invite links
  - Mobile scanner sessions
  - Signatures
  - Teams
"""

import requests
from behave import given, then, when

BASE_URL = "http://localhost:8080"


def _jwt_headers(context):
    """Return Authorization: Bearer headers using the stored JWT token."""
    token = getattr(context, "jwt_token", None)
    assert token, "No JWT token stored in context – did you use 'Given I am logged in as admin'?"
    return {"Authorization": f"Bearer {token}"}


def _parse_params(params_str):
    """Parse 'key1=val1&key2=val2' into a dict, supporting values that contain '='."""
    result = {}
    for part in params_str.split("&"):
        if "=" in part:
            k, v = part.split("=", 1)
            result[k.strip()] = v.strip()
    return result


def _expand_stored(template, context):
    """Replace '{stored}' in an endpoint template with context.stored_value."""
    return template.replace("{stored}", getattr(context, "stored_value", ""))


# ---------------------------------------------------------------------------
# WHEN – POST with query params
# ---------------------------------------------------------------------------


@when('I send a POST request to "{endpoint}" with JWT authentication and params "{params}"')
def step_post_with_jwt_and_params(context, endpoint, params):
    """Send POST request with query parameters using the stored JWT token."""
    context.response = requests.post(
        f"{BASE_URL}{endpoint}",
        headers=_jwt_headers(context),
        params=_parse_params(params),
        timeout=60,
    )


@when('I send a POST request to "{endpoint}" with no authentication and params "{params}"')
def step_post_no_auth_and_params(context, endpoint, params):
    """Send POST request with query parameters and no authentication."""
    context.response = requests.post(
        f"{BASE_URL}{endpoint}",
        params=_parse_params(params),
        timeout=60,
    )


# ---------------------------------------------------------------------------
# WHEN – GET with query params
# ---------------------------------------------------------------------------


@when('I send a GET request to "{endpoint}" with JWT authentication and params "{params}"')
def step_get_with_jwt_and_params(context, endpoint, params):
    """Send GET request with query parameters using the stored JWT token."""
    context.response = requests.get(
        f"{BASE_URL}{endpoint}",
        headers=_jwt_headers(context),
        params=_parse_params(params),
        timeout=60,
    )


# ---------------------------------------------------------------------------
# WHEN – DELETE
# ---------------------------------------------------------------------------


@when('I send a DELETE request to "{endpoint}" with JWT authentication')
def step_delete_with_jwt(context, endpoint):
    """Send DELETE request using the stored JWT token."""
    context.response = requests.delete(
        f"{BASE_URL}{endpoint}",
        headers=_jwt_headers(context),
        timeout=60,
    )


@when('I send a DELETE request to "{endpoint}" with no authentication')
def step_delete_no_auth(context, endpoint):
    """Send DELETE request with no authentication headers."""
    context.response = requests.delete(
        f"{BASE_URL}{endpoint}",
        timeout=60,
    )


@when('I send a DELETE request to "{endpoint}" with JWT authentication and params "{params}"')
def step_delete_with_jwt_and_params(context, endpoint, params):
    """Send DELETE request with query parameters using the stored JWT token."""
    context.response = requests.delete(
        f"{BASE_URL}{endpoint}",
        headers=_jwt_headers(context),
        params=_parse_params(params),
        timeout=60,
    )


@when('I send a DELETE request to "{endpoint}" with no authentication and params "{params}"')
def step_delete_no_auth_and_params(context, endpoint, params):
    """Send DELETE request with query parameters and no authentication."""
    context.response = requests.delete(
        f"{BASE_URL}{endpoint}",
        params=_parse_params(params),
        timeout=60,
    )


# ---------------------------------------------------------------------------
# WHEN – steps that use a previously stored value in the URL path
# ---------------------------------------------------------------------------


@when(
    'I use the stored value to send a GET request to "{endpoint_template}" with JWT authentication'
)
def step_get_stored_jwt(context, endpoint_template):
    """Send GET request substituting {stored} in the path with context.stored_value."""
    endpoint = _expand_stored(endpoint_template, context)
    context.response = requests.get(
        f"{BASE_URL}{endpoint}",
        headers=_jwt_headers(context),
        timeout=60,
    )


@when(
    'I use the stored value to send a GET request to "{endpoint_template}" with no authentication'
)
def step_get_stored_no_auth(context, endpoint_template):
    """Send GET request substituting {stored} in the path with no authentication."""
    endpoint = _expand_stored(endpoint_template, context)
    context.response = requests.get(
        f"{BASE_URL}{endpoint}",
        timeout=60,
    )


@when(
    'I use the stored value to send a DELETE request to "{endpoint_template}" with JWT authentication'
)
def step_delete_stored_jwt(context, endpoint_template):
    """Send DELETE request substituting {stored} in the path with context.stored_value."""
    endpoint = _expand_stored(endpoint_template, context)
    context.response = requests.delete(
        f"{BASE_URL}{endpoint}",
        headers=_jwt_headers(context),
        timeout=60,
    )


@when(
    'I use the stored value to send a POST request to "{endpoint_template}" with JWT authentication'
)
def step_post_stored_jwt(context, endpoint_template):
    """Send POST request substituting {stored} in the path with context.stored_value."""
    endpoint = _expand_stored(endpoint_template, context)
    context.response = requests.post(
        f"{BASE_URL}{endpoint}",
        headers=_jwt_headers(context),
        timeout=60,
    )


# ---------------------------------------------------------------------------
# THEN – store response value for later steps
# ---------------------------------------------------------------------------


@then('I store the response JSON field "{field}"')
def step_store_response_field(context, field):
    """Store a top-level JSON field from the current response into context.stored_value."""
    data = context.response.json()
    value = data.get(field)
    assert value is not None, f"Field '{field}' not found in response: {data}"
    context.stored_value = str(value)


# ---------------------------------------------------------------------------
# THEN – response body / field assertions
# ---------------------------------------------------------------------------


@then('the response JSON field "{field}" should not be empty')
def step_json_top_field_not_empty(context, field):
    """Assert a top-level JSON field is present and non-empty."""
    data = context.response.json()
    value = data.get(field)
    assert value is not None and str(value) != "", (
        f"Expected field '{field}' to be non-empty, got: {value!r}. "
        f"Full response: {data}"
    )


@then("the response body should not be empty")
def step_response_body_not_empty(context):
    """Assert that the raw response body contains at least one byte."""
    assert len(context.response.content) > 0, "Response body is empty"


@then("the response JSON should be a list")
def step_response_is_list(context):
    """Assert that the top-level response JSON value is a list."""
    data = context.response.json()
    assert isinstance(data, list), (
        f"Expected response to be a JSON list but got: {type(data).__name__}. "
        f"Content: {str(data)[:200]}"
    )


@then('the response JSON field "{field}" should be a list')
def step_json_field_is_list(context, field):
    """Assert a top-level JSON field is a list."""
    data = context.response.json()
    value = data.get(field)
    assert isinstance(value, list), (
        f"Expected field '{field}' to be a list but got: {type(value).__name__}. "
        f"Full response: {data}"
    )


@then('the response JSON field "{field}" should be true')
def step_json_field_is_true(context, field):
    """Assert a top-level JSON boolean field is true."""
    data = context.response.json()
    value = data.get(field)
    actual = str(value).lower() if isinstance(value, bool) else str(value).lower()
    assert actual == "true", (
        f"Expected field '{field}' to be true but got: {value!r}. "
        f"Full response: {data}"
    )


@then('the response JSON field "{field}" should be false')
def step_json_field_is_false(context, field):
    """Assert a top-level JSON boolean field is false."""
    data = context.response.json()
    value = data.get(field)
    actual = str(value).lower() if isinstance(value, bool) else str(value).lower()
    assert actual == "false", (
        f"Expected field '{field}' to be false but got: {value!r}. "
        f"Full response: {data}"
    )
