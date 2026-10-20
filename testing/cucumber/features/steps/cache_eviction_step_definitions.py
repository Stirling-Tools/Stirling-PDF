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
STABLE_READS = 3


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
    later = [_role_on_node(context, idx, name) for _ in range(STABLE_READS)]
    assert later == [role] * STABLE_READS, f'node {idx} drifted back for "{name}" on later reads: {later}'


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


CHANNEL = "stirling:cache-evict"
GLOBAL_API_KEY = "multinode-test-key"
USER_ENTITY = "stirling.software.proprietary.security.model.User"
AUTHORITY_ENTITY = "stirling.software.proprietary.security.model.Authority"
EVICTIONS_PATH = "/api/v1/admin/cache/evictions"
VALKEY = "multinode-valkey"


def _curl(node, method, path, headers=(), data=None, timeout=30):
    cmd = ["docker", "exec", node, "curl", "-s", "-w", "\n%{http_code}", "-X", method]
    for header in headers:
        cmd += ["-H", header]
    if data is not None:
        cmd += ["--data-binary", data]
    cmd.append(f"http://localhost:8080{path}")
    rc, out, err = _sh(cmd, timeout=timeout)
    body, _, status = out.rstrip("\n").rpartition("\n")
    return (int(status) if status.strip().isdigit() else 0), body


def _login_status(idx, username, password):
    status, _ = _curl(
        _node(idx),
        "POST",
        "/api/v1/auth/login",
        headers=["Content-Type: application/json"],
        data=json.dumps({"username": username, "password": password}),
    )
    return status


def _team_name_on_node(context, idx, name):
    status, body = _me(context, idx, name)
    assert status == 200, f"node {idx} /me for {name} returned HTTP {status}: {body[:200]}"
    return (json.loads(body)["user"].get("team") or {}).get("name")


def _team_name(context, team):
    return _scenario_dict(context, "cache_teams").setdefault(team, f"{team}-{uuid.uuid4().hex[:8]}")


def _team_id(context, team):
    name = _team_name(context, team).replace("'", "''")
    current = _scenario_dict(context, "cache_team_renames").get(team, name)
    return int(_psql(f"SELECT team_id FROM teams WHERE name = '{current}'"))


def _valkey(*args):
    rc, out, err = _sh(["docker", "exec", VALKEY, "valkey-cli", *args])
    assert rc == 0, f"valkey-cli {' '.join(args)} failed: {err.strip() or out.strip()}"
    return out.strip()


@then("an eviction request with no credentials should get HTTP {code:d}")
def step_no_credentials(context, code):
    status, body = _curl(_node(1), "POST", EVICTIONS_PATH, headers=["Content-Type: application/json"], data="{}")
    assert status == code, f"expected HTTP {code}, got {status}: {body[:200]}"


@then("an eviction request with the global API key should get HTTP {code:d}")
def step_global_key(context, code):
    status, body = _curl(
        _node(1),
        "POST",
        EVICTIONS_PATH,
        headers=["Content-Type: application/json", f"X-API-KEY: {GLOBAL_API_KEY}"],
        data="{}",
    )
    assert status == code, f"expected HTTP {code}, got {status}: {body[:200]}"


@then('an eviction request as "{name}" should get HTTP {code:d}')
def step_user_evicts(context, name, code):
    status, body = _curl(
        _node(1),
        "POST",
        EVICTIONS_PATH,
        headers=["Content-Type: application/json", f"Authorization: Bearer {_user_token(context, name)}"],
        data="{}",
    )
    assert status == code, f"expected HTTP {code}, got {status}: {body[:200]}"


@when('the admin sends the eviction body {body} as "{content_type}" on node {idx:d}')
def step_raw_body(context, body, content_type, idx):
    context.cache_eviction_status, context.cache_eviction_body = _curl(
        _node(idx),
        "POST",
        EVICTIONS_PATH,
        headers=[f"Content-Type: {content_type}", f"Authorization: Bearer {_token(context)}"],
        data=body,
    )


@then("the eviction response should be HTTP {code:d}")
def step_eviction_status(context, code):
    assert context.cache_eviction_status == code, (
        f"expected HTTP {code}, got {context.cache_eviction_status}: {getattr(context, 'cache_eviction_body', '')[:200]}"
    )


@when("the admin requests a cache eviction for {count:d} user ids on node {idx:d}")
def step_many_ids(context, count, idx):
    step_raw_body(context, json.dumps({"userIds": list(range(1, count + 1))}), "application/json", idx)


@when('the admin requests a cache eviction for the raw username "{raw}" on node {idx:d}')
def step_raw_username(context, raw, idx):
    step_raw_body(context, json.dumps({"usernames": [raw]}), "application/json", idx)


@given("the users table has been counted")
def step_count_users(context):
    context.cache_user_count = int(_psql("SELECT count(*) FROM users"))


@then("the users table should still hold the same number of users")
def step_same_users(context):
    assert int(_psql("SELECT count(*) FROM users")) == context.cache_user_count


@when("the admin requests a cache eviction for an unknown Supabase user on node {idx:d}")
def step_unknown_supabase(context, idx):
    step_raw_body(context, json.dumps({"supabaseUserIds": [str(uuid.uuid4())]}), "application/json", idx)
    assert context.cache_eviction_status == 200, context.cache_eviction_body[:200]


@when('the admin resets the password of "{name}" to "{password}" on node {idx:d}')
def step_reset_password(context, name, password, idx):
    status, body = _curl(
        _node(idx),
        "POST",
        "/api/v1/user/admin/changePasswordForUser",
        headers=[f"Authorization: Bearer {_token(context)}", "Content-Type: application/x-www-form-urlencoded"],
        data=urlencode({"username": _username(context, name), "newPassword": password}),
    )
    assert status == 200, f"changePasswordForUser returned HTTP {status}: {body[:200]}"


@then('logging in as "{name}" with the old password on node {idx:d} should fail')
def step_old_password_fails(context, name, idx):
    status = _login_status(idx, _username(context, name), CACHE_TEST_PASSWORD)
    assert status in (401, 403), f"login with the old password returned HTTP {status}"


@then('logging in as "{name}" with password "{password}" on node {idx:d} should succeed')
def step_new_password_works(context, name, password, idx):
    status = _login_status(idx, _username(context, name), password)
    assert status == 200, f"login with the new password returned HTTP {status}"


@when('"{name}" renames themselves on node {idx:d}')
def step_rename(context, name, idx):
    new_name = f"{_username(context, name)}-renamed"
    status, body = _curl(
        _node(idx),
        "POST",
        "/api/v1/user/change-username",
        headers=[
            f"Authorization: Bearer {_user_token(context, name)}",
            "Content-Type: application/x-www-form-urlencoded",
        ],
        data=urlencode({"currentPasswordChangeUsername": CACHE_TEST_PASSWORD, "newUsername": new_name}),
    )
    assert status == 200, f"change-username returned HTTP {status}: {body[:200]}"
    _scenario_dict(context, "cache_renamed")[name] = new_name


@then('logging in as "{name}" by the old name on node {idx:d} should fail')
def step_old_name_fails(context, name, idx):
    status = _login_status(idx, _username(context, name), CACHE_TEST_PASSWORD)
    assert status in (401, 403), f"login by the old name returned HTTP {status}"


@then('logging in as "{name}" by the new name on node {idx:d} should succeed')
def step_new_name_works(context, name, idx):
    status = _login_status(idx, _scenario_dict(context, "cache_renamed")[name], CACHE_TEST_PASSWORD)
    assert status == 200, f"login by the new name returned HTTP {status}"


@when('the admin deletes "{name}" on node {idx:d}')
def step_delete_user(context, name, idx):
    status, body = _curl(
        _node(idx),
        "POST",
        f"/api/v1/user/admin/deleteUser/{_username(context, name)}",
        headers=[f"Authorization: Bearer {_token(context)}"],
    )
    assert status == 200, f"deleteUser returned HTTP {status}: {body[:200]}"


@given('a team named "{team}" exists')
def step_team_exists(context, team):
    status, body = _curl(
        _node(1),
        "POST",
        "/api/v1/team/create",
        headers=[f"Authorization: Bearer {_token(context)}", "Content-Type: application/x-www-form-urlencoded"],
        data=urlencode({"name": _team_name(context, team)}),
    )
    assert status == 200, f"team create returned HTTP {status}: {body[:200]}"


def _move_to_team(context, name, team, idx):
    status, body = _curl(
        _node(idx),
        "POST",
        "/api/v1/user/admin/changeRole",
        headers=[f"Authorization: Bearer {_token(context)}", "Content-Type: application/x-www-form-urlencoded"],
        data=urlencode({"username": _username(context, name), "role": "ROLE_USER", "teamId": _team_id(context, team)}),
    )
    assert status == 200, f"changeRole with teamId returned HTTP {status}: {body[:200]}"


@when('the admin moves "{name}" to team "{team}" on node {idx:d}')
def step_move_team(context, name, team, idx):
    _move_to_team(context, name, team, idx)


@given('"{name}" is in team "{team}"')
def step_in_team(context, name, team):
    _move_to_team(context, name, team, 1)


@then('node {idx:d} should report "{name}" in team "{team}" within {seconds:d} seconds')
def step_team_within(context, idx, name, team, seconds):
    expected = _scenario_dict(context, "cache_team_renames").get(team, _team_name(context, team))
    _await(
        f'node {idx} reporting team {expected} for "{name}"',
        lambda: ((current := _team_name_on_node(context, idx, name)) == expected, current),
        seconds,
    )
    later = [_team_name_on_node(context, idx, name) for _ in range(STABLE_READS)]
    assert later == [expected] * STABLE_READS, f'node {idx} drifted back for "{name}" on later reads: {later}'


@then('node {idx:d} should still report "{name}" in team "{team}"')
def step_team_still(context, idx, name, team):
    expected = _team_name(context, team)
    current = _team_name_on_node(context, idx, name)
    assert current == expected, f"node {idx} reported team {current}; the external rename was not cached"


@when('the team "{old}" is renamed to "{new}" directly in the database')
def step_sql_team_rename(context, old, new):
    old_name = _team_name(context, old).replace("'", "''")
    new_name = _team_name(context, new)
    context.cache_renamed_team_id = int(_psql(f"SELECT team_id FROM teams WHERE name = '{old_name}'"))
    _psql(f"UPDATE teams SET name = '{new_name}' WHERE team_id = {context.cache_renamed_team_id}")
    _scenario_dict(context, "cache_team_renames")[new] = new_name


@when('the admin requests a cache eviction for the team "{team}" on node {idx:d}')
def step_evict_team(context, team, idx):
    _post_eviction(context, idx, {"teamIds": [context.cache_renamed_team_id]})


@given("I am listening on the cache eviction channel")
def step_listen(context):
    import subprocess
    import threading

    proc = subprocess.Popen(
        ["docker", "exec", "-i", VALKEY, "valkey-cli", "SUBSCRIBE", CHANNEL],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        bufsize=1,
    )
    lines = []
    threading.Thread(target=lambda: [lines.append(line.rstrip("\n")) for line in proc.stdout], daemon=True).start()
    context.add_cleanup(proc.kill)
    context.cache_channel_lines = lines
    _await("the test subscriber joining the channel", lambda: ("subscribe" in lines, len(lines)), 10)
    context.cache_channel_mark = len(lines)


def _messages_since_mark(context):
    lines = context.cache_channel_lines[context.cache_channel_mark :]
    return [lines[i + 2] for i, line in enumerate(lines) if line == "message" and i + 2 < len(lines)]


@when('the admin changes a user that does not exist to role "{role}" on node {idx:d}')
def step_change_missing(context, role, idx):
    status, body = _curl(
        _node(idx),
        "POST",
        "/api/v1/user/admin/changeRole",
        headers=[f"Authorization: Bearer {_token(context)}", "Content-Type: application/x-www-form-urlencoded"],
        data=urlencode({"username": f"nobody-{uuid.uuid4().hex[:8]}", "role": role}),
    )
    assert status == 404, f"changeRole for a missing user returned HTTP {status}: {body[:200]}"


@then("the cache eviction channel should carry no message")
def step_no_message(context):
    marker = f"marker-{uuid.uuid4().hex}"
    _valkey("PUBLISH", CHANNEL, marker)
    _await("the marker on the channel", lambda: (marker in _messages_since_mark(context), "waiting"), 10)
    before_marker = _messages_since_mark(context)
    before_marker = before_marker[: before_marker.index(marker)]
    assert not before_marker, f"unexpected eviction messages: {before_marker}"
    context.cache_channel_mark = len(context.cache_channel_lines)


@then('the cache eviction channel should carry an eviction for "{entity}"')
def step_message_for(context, entity):
    _await(
        f"an eviction for {entity} on the channel",
        lambda: (any(entity in m for m in _messages_since_mark(context)), _messages_since_mark(context)),
        10,
    )


@when('someone publishes "{payload}" on the cache eviction channel')
def step_publish_raw(context, payload):
    _valkey("PUBLISH", CHANNEL, payload)


@when('someone publishes an eviction batch for "{name}" that also names an unknown entity')
def step_publish_unknown(context, name):
    context.cache_published_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    username = _username(context, name).replace("'", "''")
    user_id = _psql(f"SELECT user_id FROM users WHERE username = '{username}'")
    authority_ids = _psql(f"SELECT id FROM authorities WHERE user_id = {user_id}").split()
    payload = json.dumps(
        {
            "origin": "cucumber",
            "evictions": [
                {"kind": "ENTITY", "role": "com.example.NotAnEntity", "key": "1"},
                {"kind": "ENTITY_WITH_COLLECTIONS", "role": USER_ENTITY, "key": user_id},
                *({"kind": "ENTITY", "role": AUTHORITY_ENTITY, "key": a} for a in authority_ids),
            ],
        }
    )
    _valkey("PUBLISH", CHANNEL, payload)


@then("node {idx:d} should have logged that it skipped an unknown eviction")
def step_logged_skip(context, idx):
    _await(
        "the skip warning",
        lambda: ("Skipping second-level cache eviction" in _logs(_node(idx), context.cache_published_at), "not yet"),
        10,
    )


@when("Valkey is stopped")
def step_valkey_stop(context):
    context.cache_valkey_stopped_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    rc, out, err = _sh(["docker", "stop", VALKEY], timeout=60)
    assert rc == 0, err
    context.add_cleanup(lambda: _sh(["docker", "start", VALKEY], timeout=60))


@when("Valkey is started again")
def step_valkey_start(context):
    rc, out, err = _sh(["docker", "start", VALKEY], timeout=60)
    assert rc == 0, err
    _await(
        "Valkey answering PING",
        lambda: ((reply := _sh(["docker", "exec", VALKEY, "valkey-cli", "PING"])[1].strip()) == "PONG", reply),
        30,
    )


@then("node {idx:d} should have logged that it could not publish an eviction")
def step_logged_publish_failure(context, idx):
    _await(
        "the publish failure warning",
        lambda: ("Could not publish" in _logs(_node(idx), context.cache_valkey_stopped_at), "not yet"),
        15,
    )


@when("Valkey is paused")
def step_valkey_pause(context):
    rc, out, err = _sh(["docker", "pause", VALKEY])
    assert rc == 0, err
    context.add_cleanup(lambda: _sh(["docker", "unpause", VALKEY]))


@when("Valkey is unpaused")
def step_valkey_unpause(context):
    _sh(["docker", "unpause", VALKEY])


@then('the admin changing "{name}" to role "{role}" on node {idx:d} should finish within {seconds:d} seconds')
def step_change_role_timed(context, name, role, idx, seconds):
    started = time.monotonic()
    status, body = _curl(
        _node(idx),
        "POST",
        "/api/v1/user/admin/changeRole",
        headers=[f"Authorization: Bearer {_token(context)}", "Content-Type: application/x-www-form-urlencoded"],
        data=urlencode({"username": _username(context, name), "role": role}),
        timeout=seconds + 30,
    )
    elapsed = time.monotonic() - started
    print(f"    changeRole with Valkey paused: HTTP {status} in {elapsed:.1f}s")
    assert elapsed <= seconds, f"changeRole took {elapsed:.1f}s with Valkey paused"
    assert status == 200, f"changeRole returned HTTP {status}: {body[:200]}"


def _probe_status(context, idx, name):
    return _curl_on_node(_node(idx), "GET", FILTERED_PROBE, token=_user_token(context, name))[0]


@then('node {idx:d} should stop serving "{name}" within {seconds:d} seconds')
def step_stop_serving(context, idx, name, seconds):
    _await(
        f'node {idx} refusing "{name}"',
        lambda: (not 200 <= (status := _probe_status(context, idx, name)) < 300, status),
        seconds,
    )


@then('node {idx:d} should answer "{name}" the same way as node {other:d}')
def step_same_answer(context, idx, name, other):
    mine, theirs = _probe_status(context, idx, name), _probe_status(context, other, name)
    assert mine == theirs, f"node {idx} answered HTTP {mine}, node {other} answered HTTP {theirs}"
