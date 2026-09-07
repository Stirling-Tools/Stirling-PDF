"""Step definitions for the multi-node regression suite: drive the stack (testing/compose/docker-compose-multinode.yml) via the LB, docker exec curl/psql on individual nodes, and a throwaway minio/mc container."""

import io
import json
import subprocess
import time
import uuid

import requests
from behave import given, then, when

LB_URL = "http://localhost:8080"
NODES = ["multinode-stirling-1", "multinode-stirling-2"]
PG = "multinode-postgres"
MINIO = "multinode-minio"
BUCKET = "policy-data"
SOURCE_PREFIX = "incoming/"
OUTPUT_PREFIX = "processed/"
ADMIN_USER = "admin"
ADMIN_PASS = "stirling"


# --------------------------------------------------------------------------- helpers
def _sh(args, stdin=None, timeout=60):
    """Run a command, return (returncode, stdout, stderr)."""
    r = subprocess.run(
        args, input=stdin, capture_output=True, timeout=timeout,
        text=(stdin is None or isinstance(stdin, str)),
    )
    out = r.stdout if isinstance(r.stdout, str) else r.stdout.decode("utf-8", "replace")
    err = r.stderr if isinstance(r.stderr, str) else r.stderr.decode("utf-8", "replace")
    return r.returncode, out, err


def _psql(query):
    """Run a query against the shared Postgres, return the raw tab/newline output (trimmed)."""
    rc, out, err = _sh(
        ["docker", "exec", PG, "psql", "-U", "stirling", "-d", "stirling", "-tAc", query]
    )
    assert rc == 0, f"psql failed: {err.strip() or out.strip()}"
    return out.strip()


def _psql_int(query):
    val = _psql(query)
    return int(val) if val else 0


def _network():
    rc, out, _ = _sh(
        ["docker", "inspect", "-f",
         "{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}", NODES[0]]
    )
    return out.strip() or "compose_stirling-multinode"


def _token(context):
    tok = getattr(context, "jwt_token", None)
    assert tok, "No JWT token in context - use 'Given I am logged in as admin' first."
    return tok


def _curl_on_node(node, method, path, token=None, data=None, content_type=None, timeout=30):
    """Hit a node's own :8080 from inside the cluster (bypasses the LB). Returns (status, body)."""
    cmd = ["docker", "exec", node, "curl", "-s", "-w", "\n%{http_code}", "-X", method]
    if token:
        cmd += ["-H", f"Authorization: Bearer {token}"]
    if content_type:
        cmd += ["-H", f"Content-Type: {content_type}"]
    if data is not None:
        cmd += ["--data", data]
    cmd.append(f"http://localhost:8080{path}")
    rc, out, err = _sh(cmd, timeout=timeout)
    # Body then a newline then the status code; split the status off the end.
    text = out.rstrip("\n")
    body, _, status = text.rpartition("\n")
    return (int(status.strip()) if status.strip().isdigit() else 0), body


def _node(idx):
    return NODES[int(idx) - 1]


def _names_on_node(node, path, token):
    """GET a list endpoint on a node and return the set of resource names it reports."""
    status, body = _curl_on_node(node, "GET", path, token=token)
    assert status == 200, f"{node} GET {path} returned HTTP {status}: {body[:150]}"
    try:
        data = json.loads(body)
    except ValueError:
        return set()
    items = data if isinstance(data, list) else data.get(path.rsplit("/", 1)[-1], []) \
        or data.get("sources", []) or data.get("policies", [])
    return {i.get("name") for i in items if isinstance(i, dict)}


def _policy_body(name, source_ids=None, enabled=True):
    return json.dumps({
        "name": name, "enabled": enabled, "trigger": None,
        "sourceIds": source_ids or [],
        "steps": [{"operation": "/api/v1/misc/compress-pdf", "parameters": {}}],
        "output": {"type": "inline", "options": {}},
    })


def _any_connection_id(context):
    """Id of any usable S3 connection (the seed creates one). Cached on the context."""
    cid = getattr(context, "_seed_conn_id", None)
    if cid:
        return cid
    r = requests.get(f"{LB_URL}/api/v1/integrations",
                     headers={"Authorization": f"Bearer {_token(context)}"}, timeout=15)
    assert r.status_code == 200, f"list integrations failed: HTTP {r.status_code}"
    s3 = next((c for c in r.json() if c.get("integrationType") == "S3"), None)
    assert s3, "no S3 connection available (did the seed run?)"
    context._seed_conn_id = s3["id"]
    return s3["id"]


def _s3_source_body(name, connection_id):
    # Folder sources are config-gated; S3 sources against the seeded connection always work.
    return json.dumps({
        "name": name, "type": "s3",
        "options": {"connectionId": connection_id, "prefix": "regr/", "mode": "snapshot"},
        "enabled": True,
    })


def _source_id_by_name(context, name):
    r = requests.get(f"{LB_URL}/api/v1/sources",
                     headers={"Authorization": f"Bearer {_token(context)}"}, timeout=15)
    assert r.status_code == 200, f"list sources failed: HTTP {r.status_code}"
    return next((s["id"] for s in r.json().get("sources", []) if s.get("name") == name), None)


def _s3_connection_body(name):
    return json.dumps({
        "integrationType": "S3", "name": name, "scope": "SERVER", "enabled": True,
        "locked": False, "defaultAccess": "ORG_ALL",
        "config": {"bucket": BUCKET, "region": "us-east-1", "endpoint": "http://minio:9000",
                   "accessKeyId": "minioadmin", "secretAccessKey": "minioadmin",
                   "pathStyleAccess": True},
    })


def _lb_login(context):
    r = requests.post(f"{LB_URL}/api/v1/auth/login",
                      json={"username": ADMIN_USER, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"admin login via LB failed: HTTP {r.status_code}"
    context.jwt_token = r.json()["session"]["access_token"]


def _pdf_bytes(marker):
    """A minimal valid single-page PDF carrying a unique marker (so outputs are identifiable)."""
    try:
        from reportlab.pdfgen import canvas
        buf = io.BytesIO()
        c = canvas.Canvas(buf)
        c.drawString(100, 750, f"multinode-regression {marker}")
        c.showPage()
        c.save()
        return buf.getvalue()
    except Exception:
        # Fallback: a hand-rolled minimal PDF if reportlab is unavailable.
        return (b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
                b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
                b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n"
                b"trailer<</Root 1 0 R>>\n%%EOF")


def _mc(context, script, stdin=None):
    """Run an mc script in a throwaway minio/mc container on the cluster network."""
    net = getattr(context, "_net", None) or _network()
    context._net = net
    full = f"mc alias set local http://minio:9000 minioadmin minioadmin >/dev/null 2>&1 && {script}"
    args = ["docker", "run", "-i", "--rm", "--network", net, "--entrypoint", "/bin/sh",
            "minio/mc", "-c", full]
    return _sh(args, stdin=stdin, timeout=90)


def _policy_id_by_name(context, name):
    r = requests.get(f"{LB_URL}/api/v1/policies",
                     headers={"Authorization": f"Bearer {_token(context)}"}, timeout=15)
    assert r.status_code == 200, f"list policies failed: HTTP {r.status_code}"
    data = r.json()
    items = data if isinstance(data, list) else data.get("policies", [])
    for p in items:
        if p.get("name") == name:
            return p.get("id")
    return None


# --------------------------------------------------------------------------- preconditions
@given("the multi-node stack is running")
def step_stack_running(context):
    for node in NODES:
        rc, out, _ = _sh(["docker", "inspect", "-f", "{{.State.Health.Status}}", node])
        assert rc == 0 and out.strip() == "healthy", f"{node} is not healthy (got '{out.strip()}')"
    context._net = _network()


@given("both nodes are cluster members using the Valkey backplane")
def step_cluster_members(context):
    for node in NODES:
        rc, out, err = _sh(["docker", "logs", node])
        logs = out + err
        assert "backplane=valkey" in logs, f"{node} did not join the Valkey backplane"


# --------------------------------------------------------------------------- load balancer
@when('I request "{endpoint}" {count:d} times through the load balancer')
def step_lb_requests(context, endpoint, count):
    context._served_by = []
    context._lb_statuses = []
    headers = {}
    if getattr(context, "jwt_token", None):
        headers["Authorization"] = f"Bearer {context.jwt_token}"
    for _ in range(count):
        r = requests.get(f"{LB_URL}{endpoint}", headers=headers, timeout=15)
        context._lb_statuses.append(r.status_code)
        node = r.headers.get("X-Served-By")
        if node:
            context._served_by.append(node)


@then("the requests should be served by at least {n:d} distinct nodes")
def step_distinct_nodes(context, n):
    distinct = set(context._served_by)
    assert len(distinct) >= n, (
        f"expected >= {n} distinct upstreams, saw {sorted(distinct)} "
        f"(is the X-Served-By header configured on the LB?)")


@then("every load-balanced response should be {code:d}")
def step_all_lb_ok(context, code):
    bad = [s for s in context._lb_statuses if s != code]
    assert not bad, f"expected all {code}, got failures: {bad}"


# --------------------------------------------------------------------------- cross-node auth
@then("the current token should be accepted by every node")
def step_token_every_node(context):
    token = _token(context)
    for node in NODES:
        status, body = _curl_on_node(node, "GET", "/api/v1/sources", token=token)
        assert status == 200, f"{node} rejected the LB-minted token (HTTP {status}): {body[:200]}"


@then("the signing keys should be stored in the shared database")
def step_keys_in_db(context):
    assert _psql_int("select count(*) from jwt_signing_keys") >= 1, \
        "no rows in jwt_signing_keys - keys are not persisted in the shared DB"


@then("every stored private key should be encrypted at rest")
def step_keys_encrypted(context):
    # A plaintext PKCS#8 RSA key base64 begins with 'MII'; an encrypted blob does not.
    plaintext = _psql_int("select count(*) from jwt_signing_keys where signing_key like 'MII%'")
    assert plaintext == 0, f"{plaintext} signing key(s) look like plaintext PKCS#8 (not encrypted)"


# --------------------------------------------------------------------------- shared state
@when('I create a team named "{name}" through the load balancer')
def step_create_team(context, name):
    context._team_name = name
    r = requests.post(f"{LB_URL}/api/v1/team/create",
                      headers={"Authorization": f"Bearer {_token(context)}"},
                      data={"name": name}, timeout=15)
    assert r.status_code in (200, 201, 409), f"create team failed: HTTP {r.status_code}"


@then('the team "{name}" should exist in the shared database')
def step_team_in_db(context, name):
    n = _psql_int(f"select count(*) from teams where name = '{name}'")
    assert n >= 1, f"team '{name}' not found in the shared DB"


@then("every node should report the same number of sources")
def step_same_sources(context):
    token = _token(context)
    counts = {}
    for node in NODES:
        status, body = _curl_on_node(node, "GET", "/api/v1/sources", token=token)
        assert status == 200, f"{node} /sources returned HTTP {status}"
        counts[node] = body.count('"id"')
    values = set(counts.values())
    assert len(values) == 1 and values != {0}, f"source counts differ across nodes: {counts}"


@then('the "{table}" table should contain at least {n:d} row(s)')
def step_table_rows(context, table, n):
    got = _psql_int(f"select count(*) from {table}")
    assert got >= n, f"{table} has {got} rows, expected >= {n}"


# --------------------------------------------------------------------------- processor / ledger
@given("the processor workspace is clean")
def step_clean_workspace(context):
    # Start from a known state so file/output/ledger counts reflect only this scenario.
    _mc(context, f"mc rm --recursive --force local/{BUCKET}/{SOURCE_PREFIX} || true")
    _mc(context, f"mc rm --recursive --force local/{BUCKET}/{OUTPUT_PREFIX} || true")
    _psql("delete from policy_processed_files")


@when('I drop {count:d} PDF file(s) into the S3 source under "{prefix}"')
def step_drop_files(context, count, prefix):
    context._dropped = []
    for _ in range(count):
        marker = uuid.uuid4().hex[:12]
        key = f"{prefix}regr-{marker}.pdf"
        rc, out, err = _mc(context, f"mc pipe local/{BUCKET}/{key}", stdin=_pdf_bytes(marker))
        assert rc == 0, f"failed to upload {key}: {err.strip() or out.strip()}"
        context._dropped.append(key)


@when('I trigger the policy "{name}" on every node simultaneously')
def step_trigger_all_nodes(context, name):
    pid = _policy_id_by_name(context, name)
    assert pid, f"policy '{name}' not found"
    context._policy_id = pid
    token = _token(context)
    # Fire the trigger on both nodes as close together as possible to race the ledger claim.
    for node in NODES:
        _curl_on_node(node, "POST", f"/api/v1/policies/{pid}/trigger", token=token, timeout=15)


@then("within {seconds:d}s every dropped file should be processed across the cluster")
def step_files_processed(context, seconds):
    # Consume-mode deletes processed files, so an empty source prefix signals every file was processed (ledger rows are pruned too, so counting them would be racy).
    deadline = time.monotonic() + seconds
    remaining = None
    while time.monotonic() < deadline:
        rc, out, _ = _mc(context, f"mc ls --recursive local/{BUCKET}/{SOURCE_PREFIX} | wc -l")
        remaining = int(out.strip() or "0") if rc == 0 else -1
        if remaining == 0:
            break
        time.sleep(3)
    assert remaining == 0, (
        f"{remaining} of {len(context._dropped)} dropped files were still unprocessed after "
        f"{seconds}s")
    for node in NODES:
        rc, out, _ = _sh(["docker", "inspect", "-f", "{{.State.Status}}", node])
        assert out.strip() == "running", f"{node} crashed during concurrent processing"


@then("a duplicate ledger claim for the same file and policy is rejected")
def step_ledger_claim_atomic(context):
    # Exactly-once relies on the (identity_hash, policy_id) primary key: two nodes claiming the same file both insert it, but only one wins; this proves the constraint rejects the second claim.
    ihash = "regr-" + uuid.uuid4().hex
    pol = "regr-policy-" + uuid.uuid4().hex[:8]
    insert = (f"insert into policy_processed_files (identity_hash, policy_id, status, attempts) "
              f"values ('{ihash}', '{pol}', 'PROCESSING', 1)")
    _psql(insert)  # first claim wins
    rc, out, err = _sh(["docker", "exec", PG, "psql", "-U", "stirling", "-d", "stirling",
                        "-tAc", insert])  # second claim must be rejected
    _psql(f"delete from policy_processed_files where identity_hash = '{ihash}'")
    assert rc != 0 and "duplicate key" in (out + err).lower(), (
        "a second claim for the same file and policy was NOT rejected - the ledger's exactly-once "
        "guarantee is not enforced by the primary key")


# --------------------------------------------------------------------------- policy run coordination (gap)
@when('I run the policy "{name}" on node "{idx}"')
def step_run_policy_on_node(context, name, idx):
    node = _node(idx)
    context._run_node = node
    pid = _policy_id_by_name(context, name)
    assert pid, f"policy '{name}' not found"
    # Drop an input so the trigger actually produces a run (the source is otherwise empty).
    marker = uuid.uuid4().hex[:12]
    _mc(context, f"mc pipe local/{BUCKET}/{SOURCE_PREFIX}runvis-{marker}.pdf",
        stdin=_pdf_bytes(marker))
    status, _ = _curl_on_node(node, "POST", f"/api/v1/policies/{pid}/trigger", token=_token(context))
    assert status in (200, 202), f"triggering the policy on {node} failed: HTTP {status}"
    # Grab the runId that node recorded for the run it just executed.
    context._run_id = None
    for _ in range(8):
        s, body = _curl_on_node(node, "GET", "/api/v1/policies/runs", token=_token(context))
        runs = json.loads(body) if s == 200 and body.strip().startswith("[") else []
        if runs:
            context._run_id = runs[0]["runId"]
            break
        time.sleep(2)
    assert context._run_id, f"{node} recorded no run after triggering '{name}'"


@then("the run should be visible from every node")
def step_run_visible_every(context):
    for node in NODES:
        status, body = _curl_on_node(node, "GET", "/api/v1/policies/runs", token=_token(context))
        assert status == 200, f"{node} /policies/runs returned HTTP {status}"
        run_ids = [r.get("runId") for r in json.loads(body)] if body.strip().startswith("[") else []
        assert context._run_id in run_ids, (
            f"run {context._run_id} (executed on {context._run_node}) is not visible from {node} - "
            f"PolicyRunRegistry is a per-node in-JVM map, so run status and cancellation do not "
            f"cross nodes")


# --------------------------------------------------------------------------- rate limiting
@then("the rate-limit counter should be shared across nodes")
def step_ratelimit_shared(context):
    # In cluster mode the ValkeyRateLimitStore holds counters in Valkey; probe that a key exists.
    net = context._net or _network()
    rc, out, err = _sh(["docker", "run", "--rm", "--network", net, "--entrypoint", "/bin/sh",
                        "valkey/valkey:8-alpine", "-c",
                        "valkey-cli -h valkey keys '*'"], timeout=30)
    assert rc == 0, f"valkey probe failed: {err.strip()}"
    assert out.strip(), "no keys in Valkey - rate-limit/backplane state is not shared"


# --------------------------------------------------------------------------- failover
@when('I kill node "{idx}"')
def step_kill_node(context, idx):
    node = NODES[int(idx) - 1]
    context._killed = getattr(context, "_killed", [])
    _sh(["docker", "kill", node])
    context._killed.append(node)
    time.sleep(2)


@then("the load balancer should still serve requests")
def step_lb_survives(context):
    ok = 0
    for _ in range(6):
        try:
            r = requests.get(f"{LB_URL}/api/v1/info/status", timeout=10)
            if r.status_code == 200:
                ok += 1
        except requests.RequestException:
            pass
    assert ok >= 4, f"LB served only {ok}/6 requests with a node down (does it drain dead nodes?)"


@when('I restart node "{idx}"')
def step_restart_node(context, idx):
    node = NODES[int(idx) - 1]
    _sh(["docker", "start", node])
    context._killed = [n for n in getattr(context, "_killed", []) if n != node]


@then('node "{idx}" should become healthy again within {seconds:d}s')
def step_node_recovers(context, idx, seconds):
    node = NODES[int(idx) - 1]
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        rc, out, _ = _sh(["docker", "inspect", "-f", "{{.State.Health.Status}}", node])
        if out.strip() == "healthy":
            return
        time.sleep(5)
    raise AssertionError(f"{node} did not become healthy within {seconds}s")


# ------------------------------------------------- policy / source / connection management (CRUD)
def _auth(context):
    return {"Authorization": f"Bearer {_token(context)}"}


# --- policies ---
@when('I create a policy named "{name}" on node "{idx}"')
def step_create_policy_on_node(context, name, idx):
    status, body = _curl_on_node(_node(idx), "POST", "/api/v1/policies", token=_token(context),
                                 data=_policy_body(name), content_type="application/json")
    assert status in (200, 201), f"create policy on {_node(idx)} failed: HTTP {status}: {body[:200]}"


@when('I create a policy named "{name}" referencing source "{src}" via the load balancer')
def step_create_policy_ref(context, name, src):
    sid = _source_id_by_name(context, src)
    assert sid, f"source '{src}' not found"
    r = requests.post(f"{LB_URL}/api/v1/policies",
                      headers={**_auth(context), "Content-Type": "application/json"},
                      data=_policy_body(name, [sid]), timeout=15)
    assert r.status_code in (200, 201), f"create referencing policy failed: HTTP {r.status_code}"


@when('I rename the policy "{old}" to "{new}" via the load balancer')
def step_rename_policy(context, old, new):
    pid = _policy_id_by_name(context, old)
    assert pid, f"policy '{old}' not found"
    pol = requests.get(f"{LB_URL}/api/v1/policies/{pid}", headers=_auth(context), timeout=15).json()
    pol["name"] = new
    r = requests.post(f"{LB_URL}/api/v1/policies",
                      headers={**_auth(context), "Content-Type": "application/json"},
                      json=pol, timeout=15)
    assert r.status_code in (200, 201), f"rename policy failed: HTTP {r.status_code}"


@when('I delete the policy "{name}" on node "{idx}"')
def step_delete_policy_on_node(context, name, idx):
    pid = _policy_id_by_name(context, name)
    assert pid, f"policy '{name}' not found"
    status, body = _curl_on_node(_node(idx), "DELETE", f"/api/v1/policies/{pid}", token=_token(context))
    assert status in (200, 204), f"delete policy on {_node(idx)} failed: HTTP {status}"


@then('the policy "{name}" should be visible from every node')
def step_policy_visible(context, name):
    for node in NODES:
        names = _names_on_node(node, "/api/v1/policies", _token(context))
        assert name in names, f"{node} does not see policy '{name}' (sees {sorted(names)})"


@then('the policy "{name}" should be absent from every node')
def step_policy_absent(context, name):
    for node in NODES:
        names = _names_on_node(node, "/api/v1/policies", _token(context))
        assert name not in names, f"{node} still sees deleted policy '{name}'"


@then("the trigger registry should be identical across nodes")
def step_triggers_identical(context):
    seen = {}
    for node in NODES:
        status, body = _curl_on_node(node, "GET", "/api/v1/policies/triggers", token=_token(context))
        assert status == 200, f"{node} GET /policies/triggers returned HTTP {status}"
        items = json.loads(body)
        # Trigger descriptors are dicts; normalise to a canonical, order-independent form.
        seen[node] = sorted(json.dumps(t, sort_keys=True) for t in items)
    a, b = (seen[n] for n in NODES)
    assert a == b, f"trigger registry differs across nodes: {seen}"


# --- sources ---
@when('I create an S3 source named "{name}" on node "{idx}"')
def step_create_source_on_node(context, name, idx):
    conn = _any_connection_id(context)
    status, body = _curl_on_node(_node(idx), "POST", "/api/v1/sources", token=_token(context),
                                 data=_s3_source_body(name, conn), content_type="application/json")
    assert status in (200, 201), f"create source on {_node(idx)} failed: HTTP {status}: {body[:200]}"


@when('I delete the source "{name}" on node "{idx}"')
def step_delete_source_on_node(context, name, idx):
    sid = _source_id_by_name(context, name)
    assert sid, f"source '{name}' not found"
    status, body = _curl_on_node(_node(idx), "DELETE", f"/api/v1/sources/{sid}", token=_token(context))
    assert status in (200, 204), f"delete source on {_node(idx)} failed: HTTP {status}"


@then('the source "{name}" should be visible from every node')
def step_source_visible(context, name):
    for node in NODES:
        names = _names_on_node(node, "/api/v1/sources", _token(context))
        assert name in names, f"{node} does not see source '{name}' (sees {sorted(names)})"


@then('the source "{name}" should be absent from every node')
def step_source_absent(context, name):
    for node in NODES:
        names = _names_on_node(node, "/api/v1/sources", _token(context))
        assert name not in names, f"{node} still sees deleted source '{name}'"


@then('deleting the source "{name}" from node "{idx}" is rejected because it is referenced')
def step_source_delete_guarded(context, name, idx):
    sid = _source_id_by_name(context, name)
    assert sid, f"source '{name}' not found"
    status, body = _curl_on_node(_node(idx), "DELETE", f"/api/v1/sources/{sid}", token=_token(context))
    assert status == 409, (
        f"expected 409 (source referenced by a policy created on another node), got HTTP {status}")


# --- connections (integration configs) ---
@when('I create an S3 connection named "{name}" via the load balancer')
def step_create_conn(context, name):
    r = requests.post(f"{LB_URL}/api/v1/integrations",
                      headers={**_auth(context), "Content-Type": "application/json"},
                      data=_s3_connection_body(name), timeout=15)
    assert r.status_code in (200, 201), f"create connection failed: HTTP {r.status_code}: {r.text[:200]}"
    context._conn_id = r.json()["id"]


@then('the connection "{name}" should resolve from every node with its secret masked')
def step_conn_resolves(context, name):
    cid = context._conn_id
    for node in NODES:
        status, body = _curl_on_node(node, "GET", f"/api/v1/integrations/{cid}", token=_token(context))
        assert status == 200, f"{node} cannot resolve connection {cid}: HTTP {status}"
        secret = json.loads(body).get("config", {}).get("secretAccessKey")
        assert secret in (None, "", "********"), f"{node} leaked the connection secret on read"


@when('I delete the connection via the load balancer')
def step_delete_conn(context):
    r = requests.delete(f"{LB_URL}/api/v1/integrations/{context._conn_id}",
                        headers=_auth(context), timeout=15)
    assert r.status_code in (200, 204), f"delete connection failed: HTTP {r.status_code}"


@then("the connection should be gone from every node")
def step_conn_absent(context):
    cid = context._conn_id
    for node in NODES:
        status, _ = _curl_on_node(node, "GET", f"/api/v1/integrations/{cid}", token=_token(context))
        assert status in (403, 404), f"{node} still resolves deleted connection {cid}: HTTP {status}"
