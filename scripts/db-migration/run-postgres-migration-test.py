#!/usr/bin/env python3
"""Boot historical releases on PostgreSQL, seed data, then test the current JAR.

Requires Docker, Java 25, and an Enterprise PREMIUM_KEY for audit fixtures.
Only disposable containers created by this script are used. No external DB is touched.
"""

import argparse
import http.cookiejar
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request


REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = REPO_ROOT / "app/proprietary/src/test/resources/db-migration-fixtures"
FIXTURE_PASSWORD = "migration-test-password"
FIXTURE_USERS = {
    "migration_alice": "Migration Finance",
    "migration_bob": "Migration Operations",
    "migration_disabled": "Migration Finance",
}
FIXTURE_SETTINGS = {
    "theme": "dark",
    "language": "en-GB",
    "migrationNote": "R\u00e9sum\u00e9 \u03a9 \u2014 preserved setting",
}
SCHEMA_ERRORS = re.compile(
    r"SchemaManagementException|GenerationTarget encountered exception|Flyway.*FAILED",
    re.IGNORECASE,
)
# Compare persistent identity/credential/relationship data, excluding timestamps and
# license entitlements which may legitimately change when the new app starts.
SNAPSHOT_SQL = """
SELECT json_build_object(
  'users', (SELECT json_agg(row_to_json(u) ORDER BY u.user_id) FROM
    (SELECT user_id, username, team_id, enabled, authenticationtype FROM users) u),
  'credentials', (SELECT json_agg(row_to_json(u) ORDER BY u.user_id) FROM
    (SELECT user_id, username, password, api_key FROM users
     WHERE username IN ('admin', 'migration_alice', 'migration_bob', 'migration_disabled')) u),
  'authorities', (SELECT json_agg(row_to_json(a) ORDER BY a.user_id, a.authority) FROM
    (SELECT user_id, authority FROM authorities) a),
  'teams', (SELECT json_agg(row_to_json(t) ORDER BY t.team_id) FROM
    (SELECT team_id, name FROM teams) t)
);
"""


def log(message):
    print(f"[postgres-migration] {message}", flush=True)


def run(*args, **kwargs):
    return subprocess.run(args, check=True, text=True, encoding="utf-8", capture_output=True, **kwargs).stdout.strip()


def sql(container, statement):
    return run(
        "docker",
        "exec",
        "-i",
        container,
        "psql",
        "-X",
        "-qAt",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "migration",
        "-d",
        "stirling",
        input=statement,
    )


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def request(base_url, path, data=None, *, token=None, form=False):
    payload = None
    headers = {"Content-Type": "application/x-www-form-urlencoded" if form else "application/json"}
    if data is not None:
        payload = (urllib.parse.urlencode(data) if form else json.dumps(data)).encode()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    cookies = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))
    if token and data is not None:
        # Historical releases require a CSRF cookie/header even with a JWT.
        with opener.open(urllib.request.Request(base_url + "/api/v1/info/status", headers=headers), timeout=30):
            pass
        for cookie in cookies:
            if cookie.name == "XSRF-TOKEN":
                headers["X-XSRF-TOKEN"] = urllib.parse.unquote(cookie.value)
    req = urllib.request.Request(base_url + path, data=payload, headers=headers)
    try:
        with opener.open(req, timeout=30) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read()


def api(base_url, path, data=None, **kwargs):
    code, body = request(base_url, path, data, **kwargs)
    if code != 200:
        raise RuntimeError(f"{path} returned HTTP {code}: {body.decode(errors='replace')[:300]}")
    return json.loads(body)


def login(base_url, username, password):
    response = api(base_url, "/api/v1/auth/login", {"username": username, "password": password})
    token = response.get("session", {}).get("access_token")
    if not token or response.get("user", {}).get("username") != username:
        raise RuntimeError(f"Login did not authenticate {username}")
    return token


def settings_for(username):
    return {**FIXTURE_SETTINGS, "migrationNote": f"{FIXTURE_SETTINGS['migrationNote']} ({username})"}


def seed_data(base_url, container, admin_token):
    for name in sorted(set(FIXTURE_USERS.values())):
        api(base_url, "/api/v1/team/create", {"name": name}, token=admin_token, form=True)
    team_ids = {
        row["name"]: row["team_id"]
        for row in json.loads(sql(container, "SELECT json_agg(t) FROM (SELECT team_id, name FROM teams) t;"))
    }
    for username, team in FIXTURE_USERS.items():
        api(
            base_url,
            "/api/v1/user/admin/saveUser",
            {
                "username": username,
                "password": FIXTURE_PASSWORD,
                "role": "ROLE_USER",
                "authType": "WEB",
                "forceChange": "false",
                "teamId": team_ids[team],
            },
            token=admin_token,
            form=True,
        )
        token = login(base_url, username, FIXTURE_PASSWORD)
        api(base_url, "/api/v1/user/updateUserSettings", settings_for(username), token=token)
        log(f"Seeded {username}: {team}, ROLE_USER, and {len(FIXTURE_SETTINGS)} settings")
    api(
        base_url,
        "/api/v1/user/admin/changeUserEnabled/migration_disabled",
        {"enabled": "false"},
        token=admin_token,
        form=True,
    )
    # Audit writes are asynchronous and fail open in historical releases. An
    # HTTP success alone must not let an empty audit table pass as a fixture.
    for _ in range(30):
        principals = json.loads(
            sql(container, "SELECT coalesce(json_agg(DISTINCT principal), '[]') FROM audit_events;")
        )
        if {"admin", *FIXTURE_USERS} <= set(principals):
            return
        time.sleep(1)
    raise RuntimeError("Historical release did not persist audit events for every seeded user and admin")


def snapshot(container, *, legacy=False, audit_ids=None):
    result = json.loads(sql(container, SNAPSHOT_SQL))
    settings_value = "s.setting_value"
    if legacy:
        # @Lob on historical user_settings stores a large-object reference even
        # though the column is declared text. Only decode it before the upgrade:
        # current releases must expose the actual text, not an orphaned OID.
        settings_value = """CASE WHEN s.setting_value ~ '^[0-9]+$' AND EXISTS
          (SELECT 1 FROM pg_largeobject_metadata WHERE oid::text = s.setting_value)
          THEN convert_from(lo_get(s.setting_value::oid), 'UTF8') ELSE s.setting_value END"""
    result["settings"] = json.loads(
        sql(
            container,
            f"""
        SELECT coalesce(json_agg(row_to_json(s) ORDER BY s.username, s.setting_key), '[]') FROM
        (SELECT u.username, s.setting_key, {settings_value} AS setting_value
         FROM user_settings s JOIN users u ON u.user_id = s.user_id
         WHERE u.username IN ('migration_alice', 'migration_bob', 'migration_disabled')
           AND s.setting_key IN ('theme', 'language', 'migrationNote')) s;
    """,
        )
    )
    data = "data"
    if (
        legacy
        and sql(
            container,
            "SELECT udt_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'audit_events' AND column_name = 'data';",
        )
        == "oid"
    ):
        data = "convert_from(lo_get(data::oid), 'UTF8')"
    condition = "principal IN ('admin', 'migration_alice', 'migration_bob', 'migration_disabled')"
    if audit_ids is not None:
        condition = "id IN (" + ",".join(str(int(event_id)) for event_id in audit_ids) + ")"
    result["audit"] = json.loads(
        sql(
            container,
            f"""
        SELECT coalesce(json_agg(row_to_json(a) ORDER BY a.id), '[]') FROM
        (SELECT id, principal, type, timestamp, {data} AS data FROM audit_events WHERE {condition}) a;
    """,
        )
    )
    for event in result["audit"]:
        event["data"] = json.loads(event["data"])
    return result


def validate_fixture(result):
    users = {user["username"]: user for user in result["users"] or []}
    teams = {team["team_id"]: team["name"] for team in result["teams"] or []}
    if not {"admin", "STIRLING-PDF-BACKEND-API-USER", *FIXTURE_USERS} <= users.keys():
        raise RuntimeError("Missing users from the fixture")
    if not {"Default", "Internal", *FIXTURE_USERS.values()} <= set(teams.values()):
        raise RuntimeError("Missing default or custom teams")
    for username, team in FIXTURE_USERS.items():
        user = users[username]
        if teams.get(user["team_id"]) != team or user["enabled"] != (username != "migration_disabled"):
            raise RuntimeError(f"Incorrect team or enabled state for {username}")
        if {"user_id": user["user_id"], "authority": "ROLE_USER"} not in result["authorities"]:
            raise RuntimeError(f"Missing role for {username}")
        settings = {s["setting_key"]: s["setting_value"] for s in result["settings"] if s["username"] == username}
        if settings != settings_for(username):
            raise RuntimeError(f"User settings were not preserved for {username}")
    if {"user_id": users["admin"]["user_id"], "authority": "ROLE_ADMIN"} not in result["authorities"]:
        raise RuntimeError("Missing admin authority")
    if len(result["credentials"]) != 4 or any(not user["password"] for user in result["credentials"]):
        raise RuntimeError("Missing fixture credentials")
    if not {"admin", *FIXTURE_USERS} <= {event["principal"] for event in result["audit"]}:
        raise RuntimeError("Missing audit history for fixture users")
    if any(not isinstance(event["data"], dict) or not event["data"] for event in result["audit"]):
        raise RuntimeError("Audit history is missing its JSON payloads")


def stop_app(process):
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=20)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=10)


def boot_and_check(jar, workdir, db_port, timeout, container, seed_version=None, audit_ids=None):
    workdir.mkdir(parents=True)
    port = free_port()
    base_url = f"http://127.0.0.1:{port}"
    env = os.environ.copy()
    env.update(
        {
            "PREMIUM_ENABLED": "true",
            "PREMIUM_ENTERPRISEFEATURES_AUDIT_ENABLED": "true",
            "PREMIUM_ENTERPRISEFEATURES_AUDIT_LEVEL": "2",
            "PREMIUM_ENTERPRISEFEATURES_AUDIT_RETENTIONDAYS": "0",
            "SECURITY_ENABLELOGIN": "true",
            "SECURITY_INITIALLOGIN_USERNAME": "admin",
            "SECURITY_INITIALLOGIN_PASSWORD": "stirling",
            "SYSTEM_ENABLEANALYTICS": "false",
            "SYSTEM_DATASOURCE_ENABLECUSTOMDATABASE": "true",
            "SYSTEM_DATASOURCE_CUSTOMDATABASEURL": f"jdbc:postgresql://127.0.0.1:{db_port}/stirling",
            "SYSTEM_DATASOURCE_TYPE": "postgresql",
            "SYSTEM_DATASOURCE_USERNAME": "migration",
            "SYSTEM_DATASOURCE_PASSWORD": "migration-test-only",
        }
    )
    log_file = workdir / "app.log"
    process = None
    try:
        with log_file.open("w", encoding="utf-8") as output:
            process = subprocess.Popen(
                [
                    "java",
                    "-Xmx1g",
                    "-jar",
                    str(jar),
                    f"--server.port={port}",
                    "--spring.jpa.hibernate.ddl-auto=update",
                    "--spring.jpa.show-sql=false",
                    "--logging.level.root=WARN",
                    "--logging.level.stirling=INFO",
                    "--logging.level.org.hibernate.tool.schema=INFO",
                ],
                cwd=workdir,
                env=env,
                stdout=output,
                stderr=subprocess.STDOUT,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError(f"App exited with code {process.returncode}: {log_file}")
                try:
                    code, _ = request(base_url, "/api/v1/info/status")
                    if code == 200:
                        break
                except (urllib.error.URLError, TimeoutError, ConnectionError):
                    pass
                time.sleep(2)
            else:
                raise RuntimeError(f"App did not become ready: {log_file}")

            contents = log_file.read_text(encoding="utf-8", errors="replace")
            if SCHEMA_ERRORS.search(contents):
                raise RuntimeError(f"Schema migration errors: {log_file}")
            if "Using custom database configuration" not in contents or "Using default H2 database" in contents:
                raise RuntimeError(f"App did not select PostgreSQL; check PREMIUM_KEY: {log_file}")
            # A live connection to this exact DB, plus rows in PostgreSQL, guards
            # against accidentally testing H2 or connecting to a different database.
            if (
                int(
                    sql(
                        container,
                        "SELECT count(*) FROM pg_stat_activity WHERE datname = 'stirling' AND backend_type = 'client backend' AND pid <> pg_backend_pid();",
                    )
                )
                < 1
            ):
                raise RuntimeError("No app connection to the test PostgreSQL database")
            admin_token = login(base_url, "admin", "stirling")
            if seed_version is not None:
                seed_data(base_url, container, admin_token)
            for username in FIXTURE_USERS:
                if username == "migration_disabled":
                    code, _ = request(
                        base_url, "/api/v1/auth/login", {"username": username, "password": FIXTURE_PASSWORD}
                    )
                    if code not in (401, 403):
                        raise RuntimeError("Disabled user was not denied login")
                else:
                    login(base_url, username, FIXTURE_PASSWORD)
            result = snapshot(container, legacy=seed_version is not None, audit_ids=audit_ids)
            if int(sql(container, "SELECT count(*) FROM user_license_settings;")) != 1:
                raise RuntimeError("Missing license settings singleton")
            log(
                f"Read {len(result['users'])} users, {len(result['teams'])} teams, "
                f"{len(result['settings'])} settings, and {len(result['audit'])} audit events"
            )
            return result
    finally:
        stop_app(process)


def release_jar(version, directory):
    directory.mkdir(parents=True, exist_ok=True)
    jar = directory / f"stirling-pdf-{version}.jar"
    if not jar.is_file():
        log(f"Downloading historical release {version}")
        url = f"https://github.com/Stirling-Tools/Stirling-PDF/releases/download/{version}/Stirling-PDF-with-login.jar"
        partial = jar.with_suffix(".jar.part")
        with (
            urllib.request.urlopen(url, timeout=120) as response,
            partial.open("wb") as output,
        ):
            shutil.copyfileobj(response, output)
        partial.replace(jar)
    return jar.resolve()


def test_version(version, old_jar, current_jar, workdir, image, timeout):
    workdir.mkdir(parents=True)
    container = None
    try:
        # Docker allocates the host port; bind only to loopback. Every release
        # gets its own DB and volume, and only the returned container is removed.
        container = run(
            "docker",
            "run",
            "--detach",
            "--publish",
            "127.0.0.1::5432",
            "--env",
            "POSTGRES_USER=migration",
            "--env",
            "POSTGRES_PASSWORD=migration-test-only",
            "--env",
            "POSTGRES_DB=stirling",
            image,
        )
        db_port = int(run("docker", "port", container, "5432/tcp").rsplit(":", 1)[1])
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            try:
                if sql(container, "SELECT 1;") == "1":
                    break
            except subprocess.CalledProcessError:
                pass
            time.sleep(2)
        else:
            raise RuntimeError("PostgreSQL did not become ready")

        log(f"{version}: creating native PostgreSQL schema and fixture data")
        before = boot_and_check(old_jar, workdir / "historical", db_port, timeout, container, version)
        validate_fixture(before)
        # Keep a real PostgreSQL dump for reproducing failures / inspecting the
        # pre-upgrade schema. Restore it into a clean database before upgrading.
        dump = run(
            "docker",
            "exec",
            container,
            "pg_dump",
            "-U",
            "migration",
            "-d",
            "stirling",
            "--no-owner",
            "--no-privileges",
        )
        (workdir / "fixture.sql").write_text(dump + "\n", encoding="utf-8")
        run("docker", "exec", container, "dropdb", "-U", "migration", "stirling")
        run("docker", "exec", container, "createdb", "-U", "migration", "stirling")
        sql(container, dump)
        audit_ids = [event["id"] for event in before["audit"]]
        if snapshot(container, legacy=True, audit_ids=audit_ids) != before:
            raise RuntimeError("Restoring the PostgreSQL fixture changed its data")

        log(f"{version}: upgrading restored fixture with {current_jar.name}")
        # Startup and verification logins may append audit events. Compare all
        # original IDs so new activity cannot hide deleted or changed history.
        after = boot_and_check(current_jar, workdir / "upgraded", db_port, timeout, container, audit_ids=audit_ids)
        if before != after:
            changed = [key for key in before if before[key] != after[key]]
            raise RuntimeError(f"Upgrade changed fixture data: {', '.join(changed)}")
        log(f"PASS {version}: PostgreSQL upgrade, user logins, settings, and audit preservation")
    finally:
        if container:
            try:
                result = subprocess.run(["docker", "logs", container], text=True, capture_output=True)
                (workdir / "postgres.log").write_text(result.stdout + result.stderr, encoding="utf-8")
            finally:
                run("docker", "rm", "--force", "--volumes", container)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--jar",
        type=Path,
        default=os.environ.get("STIRLING_JAR"),
        required=not os.environ.get("STIRLING_JAR"),
    )
    parser.add_argument("--release-jar-dir", type=Path)
    parser.add_argument("--work-dir", type=Path)
    parser.add_argument("--versions", nargs="+", help="Defaults to the versions of the H2 fixtures")
    parser.add_argument("--postgres-image", default="postgres:16")
    parser.add_argument("--startup-timeout", type=int, default=300)
    args = parser.parse_args()
    if not os.environ.get("PREMIUM_KEY"):
        parser.error("PREMIUM_KEY is required: historical releases need an Enterprise license for audit fixtures")
    if not args.jar.is_file():
        parser.error(f"Current JAR does not exist: {args.jar}")
    versions = args.versions or sorted(
        p.name.removeprefix("stirling-pdf-").removesuffix(".mv.db") for p in FIXTURES.glob("stirling-pdf-*.mv.db")
    )
    if not versions or any(not re.fullmatch(r"v\d+\.\d+\.\d+", version) for version in versions):
        parser.error("Expected fixture versions such as v2.0.0")
    workdir = (args.work_dir or Path(tempfile.mkdtemp(prefix="stirling-mig-postgres-"))).resolve()
    release_dir = (args.release_jar_dir or workdir / "jars").resolve()
    log(f"Logs and pre-upgrade SQL fixtures: {workdir}")
    failed = []
    for version in versions:
        try:
            old_jar = release_jar(version, release_dir)
            test_version(
                version,
                old_jar,
                args.jar.resolve(),
                workdir / version,
                args.postgres_image,
                args.startup_timeout,
            )
        except (RuntimeError, OSError, ValueError, subprocess.SubprocessError) as exc:
            log(f"FAIL {version}: {exc}")
            failed.append(version)
    if failed:
        raise SystemExit(f"PostgreSQL migration failures: {', '.join(failed)}")
    log(f"All {len(versions)} PostgreSQL fixtures migrated cleanly")


if __name__ == "__main__":
    main()
