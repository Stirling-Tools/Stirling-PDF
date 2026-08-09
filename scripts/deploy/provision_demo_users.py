#!/usr/bin/env python3
"""Create the demo accounts in a running preview deployment, from a manifest.

Accounts are provisioned here rather than baked into the seed database because
their passwords come from repository secrets: a committed password in a public
repo is a published password. The seed database therefore ships with teams and
policies but no users at all, which also leaves ``UserService.hasUsers()``
false so the container bootstraps its own admin from
SECURITY_INITIALLOGIN_USERNAME / _PASSWORD, exactly as a fresh install would.

Idempotent, but not for free: ``/admin/saveUser`` is create-only and answers
409 for a username that already exists, so an account that is already there is
brought back into line with the manifest via ``/admin/changeRole`` and
``/admin/changePasswordForUser`` instead. That path matters whenever a
deployment is redeployed without being reseeded.

Inputs (env):
    BASE_URL        e.g. http://1.2.3.4:900
    ADMIN_USERNAME  the bootstrap admin, from SECURITY_INITIALLOGIN_USERNAME
    ADMIN_PASSWORD  from SECURITY_INITIALLOGIN_PASSWORD
    DEMO_PASSWORD   shared password for every provisioned account
    MANIFEST        path to the users JSON

Outputs: appends ``users_provisioned=<n>`` to $GITHUB_OUTPUT when set.

Stdlib only - GitHub runners have python3 but not necessarily jq.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import NoReturn

TIMEOUT = 30
MIN_PASSWORD_LEN = 16


def log(msg: str) -> None:
    print(f"[provision] {msg}", file=sys.stderr, flush=True)


def die(msg: str) -> NoReturn:
    print(f"[provision][error] {msg}", file=sys.stderr, flush=True)
    raise SystemExit(1)


def require(name: str) -> str:
    value = os.environ.get(name, "")
    if not value:
        die(f"{name} is required")
    return value


class Client:
    """Minimal JSON/form HTTP client that never raises on a non-2xx."""

    def __init__(self, base_url: str) -> None:
        self.base = base_url.rstrip("/")
        self.token: str | None = None

    def _send(
        self, method: str, path: str, *, data: bytes | None, content_type: str | None
    ):
        req = urllib.request.Request(self.base + path, data=data, method=method)
        if content_type:
            req.add_header("Content-Type", content_type)
        if self.token:
            req.add_header("Authorization", f"Bearer {self.token}")
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                return resp.status, resp.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode("utf-8", "replace")
        except urllib.error.URLError as e:
            return 0, str(e.reason)

    def get(self, path: str):
        return self._send("GET", path, data=None, content_type=None)

    def post_json(self, path: str, payload: dict):
        return self._send(
            "POST",
            path,
            data=json.dumps(payload).encode(),
            content_type="application/json",
        )

    def post_form(self, path: str, fields: dict):
        return self._send(
            "POST",
            path,
            data=urllib.parse.urlencode(fields).encode(),
            content_type="application/x-www-form-urlencoded",
        )


def main() -> int:
    base_url = require("BASE_URL")
    admin_user = require("ADMIN_USERNAME")
    admin_pass = require("ADMIN_PASSWORD")
    demo_pass = require("DEMO_PASSWORD")
    manifest_path = require("MANIFEST")

    # These deployments are reachable by anyone with the URL, so refuse to
    # provision behind a weak shared password.
    if len(demo_pass) < MIN_PASSWORD_LEN:
        die(
            f"DEMO_PASSWORD is only {len(demo_pass)} characters; use at least {MIN_PASSWORD_LEN}"
        )

    try:
        with open(manifest_path, encoding="utf-8") as fh:
            users = json.load(fh)["users"]
    except OSError as e:
        die(f"Cannot read manifest {manifest_path}: {e}")
    except (KeyError, json.JSONDecodeError) as e:
        die(f"Manifest {manifest_path} is not valid: {e}")

    client = Client(base_url)

    log(f"Authenticating as {admin_user!r}...")
    status, body = client.post_json(
        "/api/v1/auth/login", {"username": admin_user, "password": admin_pass}
    )
    if status != 200:
        die(f"Admin login failed: HTTP {status} {body[:200]}")
    try:
        client.token = json.loads(body)["session"]["access_token"]
    except (KeyError, json.JSONDecodeError):
        die("Login succeeded but returned no access token")

    # Resolve team names to ids so the manifest can stay readable. This
    # endpoint filters out the Internal team, which is what we want.
    status, body = client.get("/api/v1/proprietary/ui-data/teams")
    if status != 200:
        die(f"Could not list teams: HTTP {status} {body[:200]}")
    teams = {t["name"]: t["id"] for t in json.loads(body).get("teamsWithCounts") or []}
    log(f"Teams available: {', '.join(sorted(teams)) or '(none)'}")

    provisioned = 0
    failures = []

    for entry in users:
        username = entry["username"]
        team_name = entry["team"]
        team_id = teams.get(team_name)
        if team_id is None:
            failures.append(
                f"{username}: team {team_name!r} does not exist (is the seed applied?)"
            )
            continue

        force_change = str(entry.get("forceChange", False)).lower()
        notes = []

        # authType 'web' matches what the app records for form-login accounts.
        status, body = client.post_form(
            "/api/v1/user/admin/saveUser",
            {
                "username": username,
                "password": demo_pass,
                "role": entry["role"],
                "teamId": team_id,
                "authType": "web",
                "forceChange": force_change,
            },
        )

        if status == 409:
            # Already present from an earlier deploy that was not reseeded.
            # saveUser cannot update, so bring the account back into line with
            # the manifest through the two endpoints that can.
            status, body = client.post_form(
                "/api/v1/user/admin/changeRole",
                {"username": username, "role": entry["role"], "teamId": team_id},
            )
            if status != 200:
                failures.append(f"{username}: changeRole HTTP {status} {body[:150]}")
                continue
            status, body = client.post_form(
                "/api/v1/user/admin/changePasswordForUser",
                {
                    "username": username,
                    "newPassword": demo_pass,
                    "forcePasswordChange": force_change,
                },
            )
            if status != 200:
                failures.append(
                    f"{username}: changePasswordForUser HTTP {status} {body[:150]}"
                )
                continue
            notes.append("updated")
        elif status != 200:
            failures.append(f"{username}: saveUser HTTP {status} {body[:150]}")
            continue

        # Team leader is a separate call and needs the numeric user id, which
        # saveUser does not return - read it back off the team detail endpoint.
        if entry.get("leader"):
            status, body = client.get(f"/api/v1/proprietary/ui-data/teams/{team_id}")
            user_id = None
            if status == 200:
                user_id = next(
                    (
                        u["id"]
                        for u in json.loads(body).get("teamUsers") or []
                        if u.get("username") == username
                    ),
                    None,
                )
            if user_id is None:
                log(f"WARN {username}: could not resolve user id, leaving as member")
            else:
                status, body = client.post_form(
                    "/api/v1/team/setOwner", {"teamId": team_id, "userId": user_id}
                )
                if status == 200:
                    notes.append("leader")
                else:
                    log(f"WARN {username}: setOwner HTTP {status}")

        # Disable last - the account has to exist before it can be turned off.
        if entry.get("enabled", True) is False:
            status, body = client.post_form(
                f"/api/v1/user/admin/changeUserEnabled/{urllib.parse.quote(username)}",
                {"enabled": "false"},
            )
            if status == 200:
                notes.append("disabled")
            else:
                log(f"WARN {username}: disable HTTP {status}")

        suffix = f", {', '.join(notes)}" if notes else ""
        log(f"ok   {username} ({entry['role']}, {team_name}{suffix})")
        provisioned += 1

    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a", encoding="utf-8") as fh:
            fh.write(f"users_provisioned={provisioned}\n")

    log(f"Provisioned {provisioned} account(s), {len(failures)} failure(s).")
    if failures:
        for f in failures:
            log(f"FAIL {f}")
        # A partial provision leaves the demo half set up and looking broken,
        # so fail the build rather than bury it in the log.
        die(f"{len(failures)} account(s) could not be provisioned")
    return 0


if __name__ == "__main__":
    sys.exit(main())
