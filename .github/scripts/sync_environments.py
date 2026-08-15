#!/usr/bin/env python3
"""Reconcile GitHub Actions environments from .github/environments.yml.

Creates each environment, overwrites its protection rules to match the manifest,
and copies the listed secrets in from the repo/org scope available to the calling
workflow. Secret values are read from the ALL_SECRETS env var and are only ever
written to a subprocess stdin - never logged, never placed on a command line.
"""

import json
import os
import subprocess
import sys

REPO = os.environ["REPO"]
MANIFEST = os.environ["MANIFEST"]
DRY_RUN = os.environ.get("DRY_RUN", "false").lower() == "true"
PRUNE = os.environ.get("PRUNE_SECRETS", "false").lower() == "true"

# Source values arrive as SECRET_<NAME> env vars, one per entry in the workflow's
# explicit allowlist. An empty value means the name exists in no store this job
# can see; a missing key means the allowlist has drifted from the manifest.
SECRET_PREFIX = "SECRET_"

missing: list[tuple[str, str]] = []
changed = 0


def gh(args: list[str], stdin: str | None = None, check: bool = True) -> str:
    """Run gh and return stdout. stdin is used for secret values."""
    proc = subprocess.run(
        ["gh", *args],
        input=stdin,
        capture_output=True,
        text=True,
    )
    if check and proc.returncode != 0:
        # gh masks nothing itself; only surface stderr, never our stdin.
        raise SystemExit(f"::error::gh {' '.join(args)} failed: {proc.stderr.strip()}")
    return proc.stdout


def api(path: str, method: str = "GET", body: dict | None = None, check: bool = True) -> str:
    args = ["api", "-H", "Accept: application/vnd.github+json", "--method", method, path]
    if body is not None:
        args += ["--input", "-"]
        return gh(args, stdin=json.dumps(body), check=check)
    return gh(args, check=check)


def user_id(login: str) -> int:
    return int(gh(["api", f"users/{login}", "--jq", ".id"]).strip())


def branch_policy_shape(branches) -> dict | None:
    if branches == "all":
        return None
    if branches == "protected":
        return {"protected_branches": True, "custom_branch_policies": False}
    return {"protected_branches": False, "custom_branch_policies": True}


def desired_policies(branches) -> list[dict]:
    if not isinstance(branches, list):
        return []
    out = []
    for entry in branches:
        if entry.startswith("tag:"):
            out.append({"name": entry[4:], "type": "tag"})
        else:
            out.append({"name": entry, "type": "branch"})
    return out


def sync_branch_policies(env: str, branches) -> None:
    wanted = desired_policies(branches)
    if not wanted:
        return
    # 404s when the environment does not exist yet, which is the normal dry-run
    # case since dry run skips the creating PUT above.
    raw = api(f"repos/{REPO}/environments/{env}/deployment-branch-policies", check=False)
    existing = json.loads(raw or '{"branch_policies":[]}')
    have = {(p["name"], p.get("type", "branch")): p["id"] for p in existing.get("branch_policies", [])}
    want = {(p["name"], p["type"]) for p in wanted}

    for key, pid in have.items():
        if key not in want:
            print(f"    - branch policy {key[1]}:{key[0]} (remove)")
            if not DRY_RUN:
                api(f"repos/{REPO}/environments/{env}/deployment-branch-policies/{pid}", "DELETE")
    for p in wanted:
        if (p["name"], p["type"]) not in have:
            print(f"    + branch policy {p['type']}:{p['name']}")
            if not DRY_RUN:
                api(f"repos/{REPO}/environments/{env}/deployment-branch-policies", "POST", p)


def sync_secrets(env: str, wanted: list[str], available: dict) -> None:
    global changed
    listed = json.loads(api(f"repos/{REPO}/environments/{env}/secrets", check=False) or '{"secrets":[]}')
    present = {s["name"] for s in listed.get("secrets", [])}

    for name in wanted:
        if name in available:
            verb = "update" if name in present else "create"
            print(f"    + secret {name} ({verb} from repo/org scope)")
            if not DRY_RUN:
                gh(["secret", "set", name, "--env", env, "--repo", REPO], stdin=available[name])
            changed += 1
        elif name in present:
            # Already environment-scoped and not visible at repo/org level. Correct.
            print(f"    = secret {name} (already in environment, no source to copy)")
        else:
            print(f"    ! secret {name} MISSING from both {env} and repo/org scope")
            missing.append((env, name))

    if PRUNE:
        for name in sorted(present - set(wanted)):
            print(f"    - secret {name} (prune)")
            if not DRY_RUN:
                gh(["secret", "delete", name, "--env", env, "--repo", REPO])


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

    print(f"repo={REPO} dry_run={DRY_RUN} prune={PRUNE}")
    print(f"{len(available)}/{len(declared)} allowlisted secrets resolved at repo/org scope\n")

    for env, cfg in manifest["environments"].items():
        branches = cfg.get("branches", "all")
        reviewers = cfg.get("reviewers") or []
        print(
            f"[{env}] branches={branches} reviewers={reviewers or 'none'} "
            f"prevent_self_review={cfg.get('prevent_self_review', bool(reviewers))}"
        )

        # PUT replaces the whole protection-rule set, so anything omitted here is
        # cleared. prevent_self_review defaults on whenever reviewers are required -
        # sending a bare False would silently let a reviewer approve their own run.
        body = {
            "wait_timer": cfg.get("wait_timer", 0),
            "prevent_self_review": cfg.get("prevent_self_review", bool(reviewers)),
            "reviewers": [{"type": "User", "id": user_id(r)} for r in reviewers],
            "deployment_branch_policy": branch_policy_shape(branches),
        }
        if not DRY_RUN:
            api(f"repos/{REPO}/environments/{env}", "PUT", body)
        sync_branch_policies(env, branches)
        sync_secrets(env, cfg.get("secrets") or [], available)
        print()

    if missing:
        print("::group::Missing secrets")
        for env, name in missing:
            print(
                f"::error::{name} is required by environment '{env}' but exists in neither "
                f"the environment nor repo/org scope. Add it, then re-run."
            )
        print("::endgroup::")
        return 1

    print(f"Done. {changed} secret writes{' (dry run - nothing applied)' if DRY_RUN else ''}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
