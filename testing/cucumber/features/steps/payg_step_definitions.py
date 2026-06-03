"""
Step definitions for PAYG shadow-mode end-to-end tests.

Runs against the saas-profile stack defined in
testing/compose/docker-compose-saas.yml — the backend with STIRLING_FLAVOR=saas
plus a Postgres container holding the stirling_pdf schema.

The test harness talks to the backend over HTTP and inspects the resulting
rows in `payg_shadow_charge`, `processing_job`, `processing_job_step`, and
`job_artifact_hash` via a direct psycopg connection. Direct DB inspection is
deliberate — we want to verify the *side effects* of the filter, not relay
them through another API layer that itself might be wrong.

Auth model: the saas profile expects Supabase JWTs. For cucumber we
configure the stack with a test user whose API key is recognised via the
X-API-KEY header, which the PaygChargeInterceptor.resolveUser() path
handles natively. The companion docker-compose-saas.yml seeds the user +
team rows via saas-init.sql so each scenario starts from a known state.
"""

import os
import time

import psycopg
import requests
from behave import given, then, when

BASE_URL = os.environ.get("PAYG_BASE_URL", "http://localhost:8080")
API_KEY = os.environ.get("PAYG_API_KEY", "payg-cucumber-key")

DB_HOST = os.environ.get("PAYG_DB_HOST", "localhost")
DB_PORT = int(os.environ.get("PAYG_DB_PORT", "5433"))
DB_NAME = os.environ.get("PAYG_DB_NAME", "postgres")
DB_USER = os.environ.get("PAYG_DB_USER", "postgres")
DB_PASSWORD = os.environ.get("PAYG_DB_PASSWORD", "postgres")
DB_SCHEMA = os.environ.get("PAYG_DB_SCHEMA", "stirling_pdf")

# Fixture paths — small PDFs that ship with the cucumber harness.
FIXTURE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "exampleFiles",
)
# Existing cucumber fixtures — ghost1.pdf is a small single-page test PDF;
# tables.pdf is multi-page. If you add more PAYG scenarios that need a
# specific shape, drop the new fixture in exampleFiles/ and reference it
# here so the rest of the test corpus stays close to the regular cucumber suite.
SINGLE_PAGE_PDF = os.path.join(FIXTURE_DIR, "ghost1.pdf")
THREE_PAGE_PDF = os.path.join(FIXTURE_DIR, "tables.pdf")


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------


def _db():
    """Open a fresh connection for each step — keeps things simple."""
    return psycopg.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        autocommit=True,
    )


def _team_id_for(team_name, conn):
    """Look up our test team's id (seeded by saas-init.sql)."""
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT team_id FROM {DB_SCHEMA}.teams WHERE name = %s LIMIT 1",
            (team_name,),
        )
        row = cur.fetchone()
        assert row is not None, f"No team named '{team_name}' in {DB_SCHEMA}.teams"
        return row[0]


def _shadow_rows_for(team_name):
    with _db() as conn:
        team_id = _team_id_for(team_name, conn)
        with conn.cursor() as cur:
            cur.execute(
                f"""SELECT shadow_id, payg_units, status, refunded_at, refund_reason, job_id
                       FROM {DB_SCHEMA}.payg_shadow_charge
                       WHERE team_id = %s
                       ORDER BY occurred_at DESC""",
                (team_id,),
            )
            return cur.fetchall()


def _latest_job_for(team_name):
    """Return the most recently opened job for the team as a dict."""
    with _db() as conn:
        team_id = _team_id_for(team_name, conn)
        with conn.cursor() as cur:
            cur.execute(
                f"""SELECT job_id, status, source, step_count, started_at, closed_at
                       FROM {DB_SCHEMA}.processing_job
                       WHERE owner_team_id = %s
                       ORDER BY started_at DESC
                       LIMIT 1""",
                (team_id,),
            )
            row = cur.fetchone()
            assert row is not None, f"No processing_job rows for team '{team_name}'"
            return {
                "job_id": row[0],
                "status": row[1],
                "source": row[2],
                "step_count": row[3],
                "started_at": row[4],
                "closed_at": row[5],
            }


def _steps_for_job(job_id):
    with _db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""SELECT step_id, tool_id, status, error_code
                       FROM {DB_SCHEMA}.processing_job_step
                       WHERE job_id = %s
                       ORDER BY started_at ASC""",
                (job_id,),
            )
            return cur.fetchall()


def _output_artifact_count(job_id):
    with _db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""SELECT COUNT(*) FROM {DB_SCHEMA}.job_artifact_hash
                       WHERE job_id = %s AND kind = 'OUTPUT'""",
                (job_id,),
            )
            return cur.fetchone()[0]


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------


def _api_headers(extra=None):
    headers = {"X-API-KEY": API_KEY}
    if extra:
        headers.update(extra)
    return headers


def _wait_for_health(timeout_seconds=60):
    """Block until /api/v1/info/status returns 2xx, or timeout."""
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            r = requests.get(f"{BASE_URL}/api/v1/info/status", timeout=5)
            if 200 <= r.status_code < 300:
                return
        except requests.RequestException:
            pass
        time.sleep(2)
    raise AssertionError(
        f"SaaS stack did not become healthy within {timeout_seconds}s at {BASE_URL}"
    )


# ---------------------------------------------------------------------------
# GIVEN — environment + test fixtures
# ---------------------------------------------------------------------------


@given("the SaaS stack is running with PAYG enabled")
def step_saas_stack_running(context):
    _wait_for_health()


@given('team "{team_name}" exists with wallet_policy.engine = "{engine}"')
def step_team_exists_with_engine(context, team_name, engine):
    """Verify the seed migration created the team + flipped its engine."""
    with _db() as conn:
        team_id = _team_id_for(team_name, conn)
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT engine FROM {DB_SCHEMA}.wallet_policy WHERE team_id = %s",
                (team_id,),
            )
            row = cur.fetchone()
            assert row is not None, f"No wallet_policy row for team '{team_name}'"
            assert row[0] == engine, (
                f"Team '{team_name}' engine is '{row[0]}', expected '{engine}'. "
                "Check saas-init.sql seeded the row correctly."
            )
    context.team_name = team_name


@given('I am authenticated as a member of team "{team_name}"')
def step_authenticated_as_team_member(context, team_name):
    # The seeded API key is bound to a member of this team via saas-init.sql.
    context.team_name = team_name


@given('there are no existing shadow charges for team "{team_name}"')
def step_clear_shadow_charges(context, team_name):
    with _db() as conn:
        team_id = _team_id_for(team_name, conn)
        with conn.cursor() as cur:
            cur.execute(
                f"DELETE FROM {DB_SCHEMA}.payg_shadow_charge WHERE team_id = %s",
                (team_id,),
            )
            cur.execute(
                f"""DELETE FROM {DB_SCHEMA}.job_artifact_hash
                       WHERE job_id IN (
                           SELECT job_id FROM {DB_SCHEMA}.processing_job
                           WHERE owner_team_id = %s
                       )""",
                (team_id,),
            )
            cur.execute(
                f"""DELETE FROM {DB_SCHEMA}.processing_job_step
                       WHERE job_id IN (
                           SELECT job_id FROM {DB_SCHEMA}.processing_job
                           WHERE owner_team_id = %s
                       )""",
                (team_id,),
            )
            cur.execute(
                f"DELETE FROM {DB_SCHEMA}.processing_job WHERE owner_team_id = %s",
                (team_id,),
            )


@given("the SaaS stack is restarted with payg.filter.enabled = {value}")
def step_restart_with_filter_toggle(context, value):
    # Implementation depends on how the harness manages compose state — see
    # the TODO at the top of the file. For now mark this scenario as
    # requiring manual coordination. The harness wrapper in testing/test.sh
    # (saas variant) flips the env var and restarts the container.
    raise NotImplementedError(
        "Filter-restart steps require a harness hook — see testing/test.sh saas variant TODO. "
        "Tag the scenario @manual until the restart hook lands."
    )


# ---------------------------------------------------------------------------
# WHEN — invoke tool endpoints
# ---------------------------------------------------------------------------


@when('I POST a single-page PDF to "{endpoint}"')
def step_post_single_pdf(context, endpoint):
    _post_pdf(context, endpoint, SINGLE_PAGE_PDF)


@when('I POST a 3-page PDF to "{endpoint}"')
def step_post_three_page_pdf(context, endpoint):
    _post_pdf(context, endpoint, THREE_PAGE_PDF)


@when('I POST a malformed PDF to "{endpoint}" expecting 5xx')
def step_post_malformed(context, endpoint):
    malformed = b"%PDF-not-actually-a-pdf\nbroken bytes here"
    files = {"fileInput": ("broken.pdf", malformed, "application/pdf")}
    context.response = requests.post(
        f"{BASE_URL}{endpoint}",
        files=files,
        headers=_api_headers(),
        timeout=30,
    )


@when('I POST a single-page PDF to "{endpoint}" with invalid params expecting 4xx')
def step_post_invalid_params(context, endpoint):
    # add-password without the required `password` form field → 400/422.
    with open(SINGLE_PAGE_PDF, "rb") as f:
        files = {"fileInput": ("input.pdf", f, "application/pdf")}
        context.response = requests.post(
            f"{BASE_URL}{endpoint}",
            files=files,
            headers=_api_headers(),
            timeout=30,
        )


@when('I POST a single-page PDF to "{endpoint}" with header "{header_name}: {header_value}"')
def step_post_with_header(context, endpoint, header_name, header_value):
    _post_pdf(context, endpoint, SINGLE_PAGE_PDF, extra_headers={header_name: header_value})


@when('I POST two single-page PDFs as a multi-file payload to "{endpoint}"')
def step_post_two_pdfs(context, endpoint):
    with open(SINGLE_PAGE_PDF, "rb") as a, open(SINGLE_PAGE_PDF, "rb") as b:
        files = [
            ("fileInput", ("a.pdf", a.read(), "application/pdf")),
            ("fileInput", ("b.pdf", b.read(), "application/pdf")),
        ]
    context.response = requests.post(
        f"{BASE_URL}{endpoint}",
        files=files,
        headers=_api_headers(),
        timeout=30,
    )


@when('I take the response body as "{name}"')
def step_capture_response_body(context, name):
    assert context.response is not None, "No response on context"
    if not hasattr(context, "captured_bodies"):
        context.captured_bodies = {}
    context.captured_bodies[name] = context.response.content


@when('I POST "{captured_name}" to "{endpoint}"')
def step_post_captured(context, captured_name, endpoint):
    body = context.captured_bodies[captured_name]
    files = {"fileInput": (f"{captured_name}.pdf", body, "application/pdf")}
    # Most tools need at least one extra form field; for the sanitize endpoint
    # the defaults are sufficient.
    context.response = requests.post(
        f"{BASE_URL}{endpoint}",
        files=files,
        headers=_api_headers(),
        timeout=30,
    )


def _post_pdf(context, endpoint, fixture_path, extra_headers=None):
    with open(fixture_path, "rb") as f:
        files = {"fileInput": (os.path.basename(fixture_path), f, "application/pdf")}
        # add-password needs a password field; harmless for tools that ignore extra fields.
        data = {"password": "cucumber-test-password"}
        context.response = requests.post(
            f"{BASE_URL}{endpoint}",
            files=files,
            data=data,
            headers=_api_headers(extra_headers),
            timeout=60,
        )


# ---------------------------------------------------------------------------
# THEN — assertions
# ---------------------------------------------------------------------------


@then("the response status is {status:d}")
def step_assert_status(context, status):
    assert context.response.status_code == status, (
        f"Expected {status}, got {context.response.status_code}: {context.response.text[:300]}"
    )


@then("the response status is >= {minimum:d}")
def step_assert_status_min(context, minimum):
    assert context.response.status_code >= minimum, (
        f"Expected >= {minimum}, got {context.response.status_code}"
    )


@then("the response status is >= {minimum:d} and < {maximum:d}")
def step_assert_status_range(context, minimum, maximum):
    code = context.response.status_code
    assert minimum <= code < maximum, f"Expected [{minimum}, {maximum}), got {code}"


@then('the response Content-Type is "{expected}"')
def step_assert_content_type(context, expected):
    actual = (context.response.headers.get("Content-Type") or "").split(";")[0].strip()
    assert actual == expected, f"Expected {expected}, got {actual}"


@then('exactly {n:d} shadow charge row exists for team "{team_name}"')
@then('exactly {n:d} shadow charge rows exist for team "{team_name}"')
def step_assert_shadow_count(context, n, team_name):
    rows = _shadow_rows_for(team_name)
    assert len(rows) == n, f"Expected {n} shadow rows for '{team_name}', found {len(rows)}: {rows}"


@then('the latest shadow charge row has status "{status}"')
def step_assert_latest_shadow_status(context, status):
    rows = _shadow_rows_for(context.team_name)
    assert rows, "No shadow rows for team"
    assert rows[0][2] == status, f"Expected status '{status}', got '{rows[0][2]}'"


@then("the latest shadow charge row has payg_units >= {minimum:d}")
def step_assert_payg_units_min(context, minimum):
    rows = _shadow_rows_for(context.team_name)
    assert rows[0][1] >= minimum, f"Expected payg_units >= {minimum}, got {rows[0][1]}"


@then("the latest shadow charge row's refunded_at is not null")
def step_assert_refunded_at_set(context):
    rows = _shadow_rows_for(context.team_name)
    assert rows[0][3] is not None, "refunded_at is null on the latest shadow row"


@then('the latest shadow charge row\'s refund_reason starts with "{prefix}"')
def step_assert_refund_reason(context, prefix):
    rows = _shadow_rows_for(context.team_name)
    reason = rows[0][4] or ""
    assert reason.startswith(prefix), f"refund_reason '{reason}' does not start with '{prefix}'"


@then("the latest shadow charge row's job is {status}")
def step_assert_latest_jobstatus_via_shadow(context, status):
    job = _latest_job_for(context.team_name)
    assert job["status"] == status, f"Latest job status is '{job['status']}', expected '{status}'"


@then("the latest job is {status}")
def step_assert_latest_job_status(context, status):
    job = _latest_job_for(context.team_name)
    assert job["status"] == status, f"Latest job status is '{job['status']}', expected '{status}'"


@then("the latest job has step_count = {expected:d}")
def step_assert_step_count(context, expected):
    job = _latest_job_for(context.team_name)
    assert job["step_count"] == expected, (
        f"Latest job step_count is {job['step_count']}, expected {expected}"
    )


@then('the latest job\'s source is "{source}"')
def step_assert_job_source(context, source):
    job = _latest_job_for(context.team_name)
    assert job["source"] == source, f"Latest job source is '{job['source']}', expected '{source}'"


@then('the latest job has {n:d} step recorded with status "{status}"')
@then('the latest job has {n:d} steps recorded with status "{status}"')
def step_assert_step_count_with_status(context, n, status):
    job = _latest_job_for(context.team_name)
    steps = _steps_for_job(job["job_id"])
    matching = [s for s in steps if s[2] == status]
    assert len(matching) == n, (
        f"Expected {n} steps with status '{status}', got {len(matching)}: {steps}"
    )


@then("the latest step's error_code matches the response status")
def step_assert_step_error_code(context):
    job = _latest_job_for(context.team_name)
    steps = _steps_for_job(job["job_id"])
    assert steps, "No steps recorded"
    latest_step = steps[-1]
    expected = str(context.response.status_code)
    assert latest_step[3] == expected, (
        f"Latest step error_code is '{latest_step[3]}', expected '{expected}'"
    )


@then("the latest job has at least {n:d} OUTPUT artifact hashes recorded")
def step_assert_output_artifact_count(context, n):
    job = _latest_job_for(context.team_name)
    count = _output_artifact_count(job["job_id"])
    assert count >= n, f"Latest job has {count} OUTPUT artifacts, expected >= {n}"
