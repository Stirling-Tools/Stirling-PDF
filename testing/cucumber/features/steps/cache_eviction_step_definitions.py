import json
import time
import uuid
from datetime import datetime, timezone
from urllib.parse import urlencode

from behave import given, then, when
from multinode_step_definitions import NODES, _curl_on_node, _node, _psql, _sh, _token

CACHE_TEST_PASSWORD = "CacheTest123!"
CHANNEL_LOST_LOG = "Re-subscribed to stirling:cache-evict"
CACHE_OFF_LOG = "disabling the Hibernate second-level cache"
REGIONS_LOG = "Second-level cache regions:"
FILTERED_PROBE = "/api/v1/proprietary/ui-data/account"


def _scenario_dict(context, attribute):
    if not hasattr(context, attribute):
        setattr(context, attribute, {})
    return getattr(context, attribute)


def _username(context, name):
    names = _scenario_dict(context, "cache_usernames")
    if name not in names:
        names[name] = f"{name}-{uuid.uuid4().hex[:8]}"
    return names[name]


def _user_token(context, name):
    tokens = _scenario_dict(context, "cache_user_tokens")
    assert name in tokens, f'No token for "{name}" - create it with "a cache test user" first.'
    return tokens[name]


def _me(context, idx, name):
    return _curl_on_node(_node(idx), "GET", "/api/v1/auth/me", token=_user_token(context, name))


def _role_on_node(context, idx, name):
    status, body = _me(context, idx, name)
    assert status == 200, f"node {idx} GET /api/v1/auth/me for {name} returned HTTP {status}: {body[:200]}"
    return json.loads(body)["user"]["role"]


def _await(description, probe, seconds):
    deadline = time.monotonic() + seconds
    last = None
    while time.monotonic() < deadline:
        ok, last = probe()
        if ok:
            return last
        time.sleep(0.2)
    raise AssertionError(f"{description} not observed within {seconds}s (last: {last})")


@given('a cache test user "{name}" with role "{role}"')
def step_cache_user(context, name, role):
    username = _username(context, name)
    status, body = _curl_on_node(
        _node(1),
        "POST",
        "/api/v1/user/admin/saveUser",
        token=_token(context),
        data=urlencode(
            {
                "username": username,
                "password": CACHE_TEST_PASSWORD,
                "role": role,
                "authType": "WEB",
                "forceChange": "false",
            }
        ),
        content_type="application/x-www-form-urlencoded",
    )
    assert status in (200, 201), f"saveUser {username} returned HTTP {status}: {body[:200]}"
    status, body = _curl_on_node(
        _node(1),
        "POST",
        "/api/v1/auth/login",
        data=json.dumps({"username": username, "password": CACHE_TEST_PASSWORD}),
        content_type="application/json",
    )
    assert status == 200, f"login as {username} returned HTTP {status}: {body[:200]}"
    _scenario_dict(context, "cache_user_tokens")[name] = json.loads(body)["session"]["access_token"]


@given('node {idx} has cached "{name}"')
def step_node_cached(context, idx, name):
    first = _role_on_node(context, idx, name)
    second = _role_on_node(context, idx, name)
    assert first == second, f"node {idx} answered {first} then {second} for {name}"


@when('the admin changes "{name}" to role "{role}" on node {idx}')
def step_change_role(context, name, role, idx):
    status, body = _curl_on_node(
        _node(idx),
        "POST",
        "/api/v1/user/admin/changeRole",
        token=_token(context),
        data=urlencode({"username": _username(context, name), "role": role}),
        content_type="application/x-www-form-urlencoded",
    )
    assert status == 200, f"changeRole returned HTTP {status}: {body[:200]}"


@when('the admin disables "{name}" on node {idx}')
def step_disable(context, name, idx):
    status, body = _curl_on_node(
        _node(idx),
        "POST",
        f"/api/v1/user/admin/changeUserEnabled/{_username(context, name)}",
        token=_token(context),
        data=urlencode({"enabled": "false"}),
        content_type="application/x-www-form-urlencoded",
    )
    assert status == 200, f"changeUserEnabled returned HTTP {status}: {body[:200]}"


@when('the role of "{name}" is changed to "{role}" directly in the database')
def step_sql_role(context, name, role):
    username = _username(context, name).replace("'", "''")
    _psql(
        f"UPDATE authorities SET authority = '{role}' WHERE user_id = "
        f"(SELECT user_id FROM users WHERE username = '{username}')"
    )


@when('the admin requests a cache eviction for username "{name}" on node {idx}')
def step_evict_username(context, name, idx):
    _post_eviction(context, idx, {"usernames": [_username(context, name)]})


@when('the admin requests a cache eviction for the user id of "{name}" on node {idx}')
def step_evict_user_id(context, name, idx):
    username = _username(context, name).replace("'", "''")
    user_id = int(_psql(f"SELECT user_id FROM users WHERE username = '{username}'"))
    _post_eviction(context, idx, {"userIds": [user_id]})


def _post_eviction(context, idx, payload, token=None):
    status, body = _curl_on_node(
        _node(idx),
        "POST",
        "/api/v1/admin/cache/evictions",
        token=token or _token(context),
        data=json.dumps(payload),
        content_type="application/json",
    )
    context.cache_eviction_status = status
    if token is None:
        assert status == 200, f"cache eviction returned HTTP {status}: {body[:200]}"


@when('"{name}" requests a cache eviction on node {idx}')
def step_nonadmin_evict(context, name, idx):
    _post_eviction(context, idx, {"usernames": ["admin"]}, token=_user_token(context, name))


@then("the cache eviction request should be refused")
def step_eviction_refused(context):
    assert context.cache_eviction_status in (401, 403), (
        f"a non-admin eviction returned HTTP {context.cache_eviction_status}"
    )


@then('node {idx} should report "{name}" with role "{role}" within {seconds:d} seconds')
def step_role_within(context, idx, name, role, seconds):
    _await(
        f'node {idx} reporting {role} for "{name}"',
        lambda: ((current := _role_on_node(context, idx, name)) == role, current),
        seconds,
    )


@then('node {idx} should still report "{name}" with role "{role}"')
def step_role_still(context, idx, name, role):
    current = _role_on_node(context, idx, name)
    assert current == role, (
        f'node {idx} reported {current} for "{name}": the external write was not cached,'
        " so the second-level cache is not serving this read"
    )


@then('node {idx} should reject "{name}" within {seconds:d} seconds')
def step_reject_within(context, idx, name, seconds):
    _await(
        f'node {idx} rejecting "{name}"',
        lambda: (
            (status := _curl_on_node(_node(idx), "GET", FILTERED_PROBE, token=_user_token(context, name))[0])
            in (401, 403),
            status,
        ),
        seconds,
    )


@when("Valkey drops every pub/sub connection")
def step_kill_pubsub(context):
    context.cache_channel_dropped_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    rc, out, err = _sh(["docker", "ps", "--format", "{{.Names}}", "--filter", "name=multinode-valkey"])
    containers = [c for c in out.split() if c]
    assert containers, "no multinode-valkey container is running"
    killed = 0
    for container in containers:
        rc, out, err = _sh(["docker", "exec", container, "valkey-cli", "CLIENT", "KILL", "TYPE", "pubsub"])
        if rc == 0 and out.strip().isdigit():
            killed += int(out.strip())
    assert killed >= len(NODES), f"expected to drop at least {len(NODES)} subscribers, dropped {killed}"


@then("every node should log that it cleared its second-level cache")
def step_logged_clear(context):
    for node in NODES:
        _await(
            f"{node} logging '{CHANNEL_LOST_LOG}'",
            lambda node=node: (
                CHANNEL_LOST_LOG in _logs(node, context.cache_channel_dropped_at),
                "not yet",
            ),
            20,
        )


@then("every node should run with the second-level cache enabled")
def step_cache_enabled(context):
    for node in NODES:
        logs = _logs(node)
        assert CACHE_OFF_LOG not in logs, f"{node} turned the second-level cache off"
        assert REGIONS_LOG in logs, f"{node} never logged its second-level cache regions"


def _logs(node, since=None):
    args = ["docker", "logs", node]
    if since:
        args[2:2] = ["--since", since]
    rc, out, err = _sh(args, timeout=60)
    return out + err
