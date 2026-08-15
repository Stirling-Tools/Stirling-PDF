#!/usr/bin/env python3
"""Fill in missing GitHub Actions environment secrets from .github/environments.yml.

Strictly additive. It creates an environment only if it does not exist, and sets a
secret only if that environment does not already have one by that name. It never
overwrites a secret, never deletes anything, and never touches protection rules,
reviewers or branch policies - those are managed by hand.

Secret values arrive as SECRET_<NAME> env vars and are only ever written to a
subprocess stdin - never logged, never placed on a command line.
"""

import json
import os
import subprocess
import sys

REPO = os.environ["REPO"]
MANIFEST = os.environ["MANIFEST"]
DRY_RUN = os.environ.get("DRY_RUN", "false").lower() == "true"

# Source values arrive as SECRET_<NAME> env vars, one per entry in the workflow's
# explicit allowlist. An empty value means the name exists in no store this job
# can see; a missing key means the allowlist has drifted from the manifest.
SECRET_PREFIX = "SECRET_"

missing: list[tuple[str, str]] = []
absent_envs: list[str] = []
created_secrets = 0


def gh(args: list[str], stdin: str | None = None, check: bool = True) -> str:
    """Run gh and return stdout. stdin is used for secret values."""
    proc = subprocess.run(
        ["gh", *args],
        input=stdin,
        capture_output=True,
        text=True,
    )
    if check and proc.returncode != 0:
        # Only surface stderr, never our stdin.
        raise SystemExit(f"::error::gh {' '.join(args)} failed: {proc.stderr.strip()}")
    return proc.stdout


def api(path: str, method: str = "GET", check: bool = True) -> str:
    return gh(["api", "-H", "Accept: application/vnd.github+json", "--method", method, path], check=check)


def api_ok(path: str) -> bool:
    """True when the GET succeeds. Must test the exit code, not the output:
    gh prints the 404 error body to stdout, so a truthiness check reads as success."""
    proc = subprocess.run(
        ["gh", "api", "-H", "Accept: application/vnd.github+json", path],
        capture_output=True,
        text=True,
    )
    return proc.returncode == 0


def environment_exists(env: str) -> bool:
    """Report whether the environment exists. Never creates one.

    Creating an environment needs Administration: write, and it is also where the
    protection rules get set - both of which are handled by hand, not here.
    """
    if api_ok(f"repos/{REPO}/environments/{env}"):
        return True
    print("    ! environment does not exist - create it by hand, then re-run")
    absent_envs.append(env)
    return False


def fill_secrets(env: str, wanted: list[str], available: dict, env_exists: bool) -> None:
    global created_secrets
    listed = (
        json.loads(api(f"repos/{REPO}/environments/{env}/secrets", check=False) or '{"secrets":[]}')
        if env_exists
        else {}
    )
    present = {s["name"] for s in listed.get("secrets", [])}

    for name in wanted:
        if name in present:
            print(f"    = secret {name} (already set - left untouched)")
        elif name in available:
            print(f"    + secret {name} (create from repo/org scope)")
            if not DRY_RUN:
                gh(["secret", "set", name, "--env", env, "--repo", REPO], stdin=available[name])
            created_secrets += 1
        else:
            print(f"    ! secret {name} MISSING from both {env} and repo/org scope")
            missing.append((env, name))


def main() -> int:
    manifest = json.load(open(MANIFEST, encoding="utf-8"))

    declared = {k[len(SECRET_PREFIX) :]: v for k, v in os.environ.items() if k.startswith(SECRET_PREFIX)}
    available = {k: v for k, v in declared.items() if v}

    wanted = {s for cfg in manifest["environments"].values() for s in (cfg.get("secrets") or [])}
    undeclared = sorted(wanted - declared.keys())
    if undeclared:
        for name in undeclared:
            print(
                f"::error::{name} is listed in .github/environments.yml but has no "
                f"SECRET_{name} entry in the workflow's allowlist. Add it, then re-run."
            )
        return 1

    print(f"repo={REPO} dry_run={DRY_RUN} mode=additive-only")
    print(f"{len(available)}/{len(declared)} allowlisted secrets resolved at repo/org scope")
    print("Protection rules, reviewers and branch policies are NOT managed here.\n")

    for env, cfg in manifest["environments"].items():
        print(f"[{env}]")
        if environment_exists(env):
            fill_secrets(env, cfg.get("secrets") or [], available, True)
        print()

    if absent_envs:
        print("::group::Missing environments")
        for env in absent_envs:
            print(
                f"::error::environment '{env}' does not exist. Create it in "
                f"Settings > Environments (no protection rules needed), then re-run."
            )
        print("::endgroup::")

    if missing:
        print("::group::Missing secrets")
        for env, name in missing:
            print(
                f"::error::{name} is required by environment '{env}' but exists in neither "
                f"the environment nor repo/org scope. Add it, then re-run."
            )
        print("::endgroup::")
        return 1

    suffix = " (dry run - nothing applied)" if DRY_RUN else ""
    print(f"Done. {created_secrets} secrets created{suffix}.")
    print("Nothing was overwritten or deleted.")
    return 1 if absent_envs else 0


if __name__ == "__main__":
    sys.exit(main())
