#!/usr/bin/env python3
"""Boot historical releases on PostgreSQL, seed data, then test the current JAR.

Requires Docker, Java 25, and PREMIUM_KEY for licensed historical releases.
Only disposable containers created by this script are used. No external DB is touched.
"""

import argparse
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
import urllib.request


REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = REPO_ROOT / "app/proprietary/src/test/resources/db-migration-fixtures"
SCHEMA_ERRORS = re.compile(
    r"SchemaManagementException|GenerationTarget encountered exception|Flyway.*FAILED",
    re.IGNORECASE,
)
# Compare persistent identity/credential/relationship data, excluding timestamps and
# license entitlements which may legitimately change when the new app starts.
SNAPSHOT_SQL = """
SELECT json_build_object(
  'users', (SELECT json_agg(row_to_json(u) ORDER BY u.user_id) FROM
    (SELECT user_id, username, team_id FROM users) u),
  'admin', (SELECT json_agg(row_to_json(u)) FROM
    (SELECT user_id, password, api_key FROM users WHERE username = 'admin') u),
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


def request(base_url, path, data=None):
    payload = None if data is None else json.dumps(data).encode()
    req = urllib.request.Request(base_url + path, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as response:
        return response.status, response.read()


def stop_app(process):
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=20)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=10)


def boot_and_check(jar, workdir, db_port, timeout, container, seed_version=None):
    workdir.mkdir(parents=True)
    port = free_port()
    base_url = f"http://127.0.0.1:{port}"
    env = os.environ.copy()
    env.update(
        {
            "PREMIUM_ENABLED": "true",
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
            code, body = request(
                base_url,
                "/api/v1/auth/login",
                {"username": "admin", "password": "stirling"},
            )
            if code != 200 or not json.loads(body).get("session", {}).get("access_token"):
                raise RuntimeError("Admin login did not return a JWT")

            if seed_version is not None:
                # Versions are validated before interpolation. Seed a persistent
                # marker which the current app cannot recreate during startup.
                sql(
                    container,
                    f"""
                    INSERT INTO teams (name) VALUES ('Migration fixture {seed_version}');
                """,
                )
            snapshot = json.loads(sql(container, SNAPSHOT_SQL))
            usernames = {user["username"] for user in snapshot["users"] or []}
            teams = {team["name"] for team in snapshot["teams"] or []}
            if not {"admin", "STIRLING-PDF-BACKEND-API-USER"} <= usernames:
                raise RuntimeError("Missing users from the historical fixture")
            if not {"Default", "Internal"} <= teams or not any(name.startswith("Migration fixture ") for name in teams):
                raise RuntimeError("Missing default teams or the seeded fixture team")
            if not snapshot["admin"] or not snapshot["admin"][0]["password"]:
                raise RuntimeError("Missing admin credentials")
            admin_id = snapshot["admin"][0]["user_id"]
            if {"user_id": admin_id, "authority": "ROLE_ADMIN"} not in (snapshot["authorities"] or []):
                raise RuntimeError("Missing admin authority")
            if int(sql(container, "SELECT count(*) FROM user_license_settings;")) != 1:
                raise RuntimeError("Missing license settings singleton")
            return snapshot
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
        if json.loads(sql(container, SNAPSHOT_SQL)) != before:
            raise RuntimeError("Restoring the PostgreSQL fixture changed its data")

        log(f"{version}: upgrading restored fixture with {current_jar.name}")
        after = boot_and_check(current_jar, workdir / "upgraded", db_port, timeout, container)
        if before != after:
            changed = [key for key in before if before[key] != after[key]]
            raise RuntimeError(f"Upgrade changed fixture data: {', '.join(changed)}")
        log(f"PASS {version}: PostgreSQL upgrade, admin login, and data preservation")
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
        parser.error("PREMIUM_KEY is required: historical releases need a Server/Enterprise license for PostgreSQL")
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
