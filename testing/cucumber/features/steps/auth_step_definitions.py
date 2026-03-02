"""
Step definitions for JWT authentication end-to-end tests.

Covers:
  - Login / logout (POST /api/v1/auth/login, /logout)
  - Token refresh (POST /api/v1/auth/refresh)
  - Current user (GET /api/v1/auth/me)
  - Role-based access (admin-only endpoints)
  - API key authentication (X-API-KEY header)
  - MFA endpoints
  - User registration
"""

import json as json_module

import requests
from behave import given, then, when

BASE_URL = "http://localhost:8080"

# Default test credentials (set in docker-compose-security-with-login.yml)
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "stirling"
GLOBAL_API_KEY = "123456789"


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------


def _jwt_headers(context):
    """Return Authorization: Bearer headers using the stored JWT token."""
    token = getattr(context, "jwt_token", None)
    assert token, "No JWT token stored in context – did you use 'Given I am logged in as admin'?"
    return {"Authorization": f"Bearer {token}"}


def _api_key_headers(api_key):
    """Return X-API-KEY headers for a given key."""
    return {"X-API-KEY": api_key}


def _do_login(username, password):
    """Perform a login POST and return the raw response."""
    payload = {"username": username, "password": password}
    return requests.post(
        f"{BASE_URL}/api/v1/auth/login",
        json=payload,
        timeout=30,
    )


# ---------------------------------------------------------------------------
# GIVEN – session setup
# ---------------------------------------------------------------------------


@given("I am logged in as admin")
def step_logged_in_as_admin(context):
    """Login as the default admin user and store the JWT token in context."""
    response = _do_login(ADMIN_USERNAME, ADMIN_PASSWORD)
    assert response.status_code == 200, (
        f"Admin login failed (status {response.status_code}): {response.text}"
    )
    data = response.json()
    context.jwt_token = data["session"]["access_token"]


@given("I store the JWT token")
def step_store_current_jwt(context):
    """Store the currently held jwt_token into context for later comparison."""
    assert hasattr(context, "jwt_token") and context.jwt_token, (
        "No JWT token available – did you log in first?"
    )
    context.original_jwt_token = context.jwt_token


# ---------------------------------------------------------------------------
# WHEN – login
# ---------------------------------------------------------------------------


@when('I login with username "{username}" and password "{password}"')
def step_login(context, username, password):
    """Send a login request with the given username and password."""
    payload = {"username": username, "password": password}
    context.response = requests.post(
        f"{BASE_URL}/api/v1/auth/login",
        json=payload,
        timeout=30,
    )


@when('I login with only username "{username}"')
def step_login_only_username(context, username):
    """Send a login request with only a username field (no password key)."""
    context.response = requests.post(
        f"{BASE_URL}/api/v1/auth/login",
        json={"username": username},
        timeout=30,
    )


@when('I login with only password "{password}"')
def step_login_only_password(context, password):
    """Send a login request with only a password field (no username key)."""
    context.response = requests.post(
        f"{BASE_URL}/api/v1/auth/login",
        json={"password": password},
        timeout=30,
    )


@when('I login with an empty username and password "{password}"')
def step_login_empty_username(context, password):
    """Send a login request with an explicit empty string as the username."""
    context.response = requests.post(
        f"{BASE_URL}/api/v1/auth/login",
        json={"username": "", "password": password},
        timeout=30,
    )


@when('I login with username "{username}" and an empty password')
def step_login_empty_password(context, username):
    """Send a login request with an explicit empty string as the password."""
    context.response = requests.post(
        f"{BASE_URL}/api/v1/auth/login",
        json={"username": username, "password": ""},
        timeout=30,
    )


# ---------------------------------------------------------------------------
# WHEN – GET with various authentication methods
# ---------------------------------------------------------------------------


@when('I send a GET request to "{endpoint}" with JWT authentication')
def step_get_with_jwt(context, endpoint):
    """Send GET request using the stored JWT token in the Authorization header."""
    context.response = requests.get(
        f"{BASE_URL}{endpoint}",
        headers=_jwt_headers(context),
        timeout=60,
    )


@when('I send a GET request to "{endpoint}" with no authentication')
def step_get_no_auth(context, endpoint):
    """Send GET request with no authentication headers whatsoever."""
    context.response = requests.get(
        f"{BASE_URL}{endpoint}",
        timeout=60,
    )


@when('I send a GET request to "{endpoint}" with an invalid JWT token "{token_value}"')
def step_get_with_invalid_jwt(context, endpoint, token_value):
    """Send GET request with a specific invalid JWT string."""
    context.response = requests.get(
        f"{BASE_URL}{endpoint}",
        headers={"Authorization": f"Bearer {token_value}"},
        timeout=60,
    )


@when('I send a GET request to "{endpoint}" with a malformed authorization header')
def step_get_with_malformed_auth(context, endpoint):
    """Send GET request with a non-Bearer authorization header."""
    context.response = requests.get(
        f"{BASE_URL}{endpoint}",
        headers={"Authorization": "Basic dXNlcjpwYXNz"},
        timeout=60,
    )


@when('I send a GET request to "{endpoint}" with API key "{api_key}"')
def step_get_with_api_key(context, endpoint, api_key):
    """Send GET request using an X-API-KEY header."""
    context.response = requests.get(
        f"{BASE_URL}{endpoint}",
        headers=_api_key_headers(api_key),
        timeout=60,
    )


@when('I send a GET request to "{endpoint}" with Authorization header value "{header_value}"')
def step_get_with_auth_header_value(context, endpoint, header_value):
    """Send GET request with an arbitrary Authorization header value."""
    context.response = requests.get(
        f"{BASE_URL}{endpoint}",
        headers={"Authorization": header_value},
        timeout=60,
    )


@when('I send a GET request to "{endpoint}" with an empty Authorization header')
def step_get_with_empty_auth_header(context, endpoint):
    """Send GET request with an explicitly empty Authorization header."""
    context.response = requests.get(
        f"{BASE_URL}{endpoint}",
        headers={"Authorization": ""},
        timeout=60,
    )




@when('I send a GET request to "{endpoint}" with the stored JWT token')
def step_get_with_stored_jwt(context, endpoint):
    """Send GET request using the JWT token currently stored in context."""
    context.response = requests.get(
        f"{BASE_URL}{endpoint}",
        headers=_jwt_headers(context),
        timeout=60,
    )


# ---------------------------------------------------------------------------
# WHEN – POST with various authentication methods
# ---------------------------------------------------------------------------


@when('I send a POST request to "{endpoint}" with JWT authentication')
def step_post_with_jwt(context, endpoint):
    """Send POST request (no body) using the stored JWT token."""
    context.response = requests.post(
        f"{BASE_URL}{endpoint}",
        headers=_jwt_headers(context),
        timeout=60,
    )


@when('I send a POST request to "{endpoint}" with no authentication')
def step_post_no_auth(context, endpoint):
    """Send POST request with no authentication headers."""
    context.response = requests.post(
        f"{BASE_URL}{endpoint}",
        timeout=60,
    )


@when('I send a POST request to "{endpoint}" with an invalid JWT token "{token_value}"')
def step_post_with_invalid_jwt(context, endpoint, token_value):
    """Send POST request with a specific invalid JWT string."""
    context.response = requests.post(
        f"{BASE_URL}{endpoint}",
        headers={"Authorization": f"Bearer {token_value}"},
        timeout=60,
    )


@when(
    'I send a JSON POST request to "{endpoint}" with JWT authentication and body \'{json_body}\''
)
def step_json_post_with_jwt(context, endpoint, json_body):
    """Send JSON POST request using the stored JWT token and a JSON body."""
    headers = {
        "Authorization": f"Bearer {context.jwt_token}",
        "Content-Type": "application/json",
    }
    context.response = requests.post(
        f"{BASE_URL}{endpoint}",
        headers=headers,
        data=json_body,
        timeout=60,
    )


@when(
    'I send a JSON POST request to "{endpoint}" with API key "{api_key}" and body \'{json_body}\''
)
def step_json_post_with_api_key(context, endpoint, api_key, json_body):
    """Send JSON POST request using X-API-KEY header and a JSON body."""
    headers = {
        "X-API-KEY": api_key,
        "Content-Type": "application/json",
    }
    context.response = requests.post(
        f"{BASE_URL}{endpoint}",
        headers=headers,
        data=json_body,
        timeout=60,
    )


# ---------------------------------------------------------------------------
# WHEN – token refresh
# ---------------------------------------------------------------------------


@when("I refresh the JWT token")
def step_refresh_jwt(context):
    """Send POST /api/v1/auth/refresh with the stored JWT token."""
    context.response = requests.post(
        f"{BASE_URL}/api/v1/auth/refresh",
        headers=_jwt_headers(context),
        timeout=60,
    )


@when("I refresh the stored JWT token")
def step_refresh_stored_jwt(context):
    """Send POST /api/v1/auth/refresh with the stored JWT token (alias)."""
    step_refresh_jwt(context)


# ---------------------------------------------------------------------------
# WHEN – logout
# ---------------------------------------------------------------------------


@when("I logout with JWT authentication")
def step_logout_with_jwt(context):
    """Send POST /api/v1/auth/logout using the stored JWT token."""
    context.response = requests.post(
        f"{BASE_URL}/api/v1/auth/logout",
        headers=_jwt_headers(context),
        timeout=30,
    )


# ---------------------------------------------------------------------------
# THEN – status code variants
# ---------------------------------------------------------------------------


@then('the response status code should be one of "{codes}"')
def step_status_code_one_of(context, codes):
    """Assert that the response status code matches any one of a comma-separated list."""
    allowed = [int(c.strip()) for c in codes.split(",")]
    actual = context.response.status_code
    assert actual in allowed, (
        f"Expected status code to be one of {allowed} but got {actual}. "
        f"Body: {context.response.text[:500]}"
    )


# ---------------------------------------------------------------------------
# THEN – JWT structure assertions
# ---------------------------------------------------------------------------


@then("the response should contain a JWT access token")
def step_response_contains_jwt(context):
    """Assert the response has a session.access_token that looks like a JWT."""
    data = context.response.json()
    assert "session" in data, f"No 'session' key in response: {data}"
    assert "access_token" in data["session"], (
        f"No 'access_token' in session: {data['session']}"
    )
    token = data["session"]["access_token"]
    assert token, "access_token is empty"
    parts = token.split(".")
    assert len(parts) == 3, (
        f"JWT should have 3 dot-separated parts but got {len(parts)}: {token[:60]}..."
    )


@then("the JWT access token should have three dot-separated parts")
def step_jwt_three_parts(context):
    """Assert the access_token in the response is a three-part JWT."""
    data = context.response.json()
    token = data.get("session", {}).get("access_token", "")
    assert token, "No access_token found in response"
    parts = token.split(".")
    assert len(parts) == 3, (
        f"JWT must have 3 parts (header.payload.signature) but got {len(parts)}: {token[:60]}"
    )


# ---------------------------------------------------------------------------
# THEN – JSON field assertions
# ---------------------------------------------------------------------------


@then("the response JSON should have field \"{field}\"")
def step_json_has_field(context, field):
    """Assert the top-level response JSON contains the specified field."""
    data = context.response.json()
    assert field in data, (
        f"Expected field '{field}' in response JSON but only found: {list(data.keys())}"
    )


@then('the response JSON should have a user with username "{username}"')
def step_json_user_username(context, username):
    """Assert response.user.username equals the expected value."""
    data = context.response.json()
    assert "user" in data, f"No 'user' in response: {list(data.keys())}"
    actual = data["user"].get("username") or data["user"].get("email", "")
    assert actual == username, f"Expected username '{username}' but got '{actual}'"


@then('the response JSON should have a user with role "{role}"')
def step_json_user_role(context, role):
    """Assert response.user.role equals the expected role string."""
    data = context.response.json()
    assert "user" in data, f"No 'user' in response: {list(data.keys())}"
    actual = data["user"].get("role", "")
    assert actual == role, f"Expected role '{role}' but got '{actual}'"


@then('the response JSON user field "{field}" should not be empty')
def step_json_user_field_not_empty(context, field):
    """Assert response.user.<field> exists and is non-empty."""
    data = context.response.json()
    assert "user" in data, f"No 'user' in response: {list(data.keys())}"
    value = data["user"].get(field)
    assert value is not None and str(value) != "", (
        f"Expected user field '{field}' to be non-empty, got: {value!r}"
    )


@then('the response JSON user field "{field}" should equal "{expected}"')
def step_json_user_field_equals(context, field, expected):
    """Assert response.user.<field> equals the expected string value.

    JSON booleans are compared as lowercase strings ("true"/"false").
    """
    data = context.response.json()
    assert "user" in data, f"No 'user' in response: {list(data.keys())}"
    value = data["user"].get(field, "")
    actual = str(value).lower() if isinstance(value, bool) else str(value)
    assert actual == expected, (
        f"Expected user field '{field}' == '{expected}' but got '{actual}'"
    )


@then('the response JSON field "{field}" should equal "{expected}"')
def step_json_top_field_equals(context, field, expected):
    """Assert a top-level JSON field equals the expected string value.

    JSON booleans (true/false) are compared as lowercase strings to match
    JSON serialisation ("true"/"false"), not Python's "True"/"False".
    """
    data = context.response.json()
    value = data.get(field, "")
    actual = str(value).lower() if isinstance(value, bool) else str(value)
    assert actual == expected, (
        f"Expected JSON field '{field}' == '{expected}' but got '{actual}'. "
        f"Full response: {data}"
    )


@then('the response JSON session field "{field}" should be positive')
def step_json_session_field_positive(context, field):
    """Assert response.session.<field> is a number greater than zero."""
    data = context.response.json()
    assert "session" in data, f"No 'session' in response: {list(data.keys())}"
    value = data["session"].get(field)
    assert value is not None, f"Field '{field}' not found in session: {data['session']}"
    assert int(value) > 0, f"Expected session field '{field}' > 0 but got {value}"


@then('the response JSON error should contain "{error_text}"')
def step_json_error_contains(context, error_text):
    """Assert the error/message/detail field contains the expected substring (case-insensitive)."""
    data = context.response.json()
    error = (
        data.get("error")
        or data.get("message")
        or data.get("detail")
        or ""
    )
    assert error_text.lower() in str(error).lower(), (
        f"Expected '{error_text}' (case-insensitive) in error response but got: '{error}'. "
        f"Full response: {data}"
    )


# ---------------------------------------------------------------------------
# THEN – token storage and chaining
# ---------------------------------------------------------------------------


@then("I store the JWT token from the login response")
def step_store_jwt_from_login(context):
    """Extract and store access_token from the login response."""
    data = context.response.json()
    assert "session" in data and "access_token" in data["session"], (
        f"No access_token in login response: {data}"
    )
    context.jwt_token = data["session"]["access_token"]
    assert context.jwt_token, "Stored JWT token is empty"


@then("I update the stored JWT token from the response")
def step_update_stored_jwt(context):
    """Replace the stored JWT token with the new one from the current response."""
    data = context.response.json()
    assert "session" in data and "access_token" in data["session"], (
        f"No access_token in response: {data}"
    )
    new_token = data["session"]["access_token"]
    assert new_token, "New JWT token from response is empty"
    context.jwt_token = new_token
