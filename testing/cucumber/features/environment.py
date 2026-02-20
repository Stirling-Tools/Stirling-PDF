import os

import requests

_BASE_URL = "http://localhost:8080"

# Tags that indicate a scenario requires JWT Bearer auth to be functional.
# These scenarios are skipped when the server has JWT disabled (V2=false).
# @login and @register scenarios work in both modes.
_JWT_DEPENDENT_TAGS = frozenset({"me", "refresh", "logout", "role", "token", "mfa", "apikey"})


def _check_jwt_available():
    """Probe the server to determine whether JWT Bearer auth is functional.

    Logs in as admin, then attempts to use the returned token on /me.
    Returns True only when the full JWT round-trip succeeds (V2 enabled).
    """
    try:
        login = requests.post(
            f"{_BASE_URL}/api/v1/auth/login",
            json={"username": "admin", "password": "stirling"},
            timeout=10,
        )
        if login.status_code != 200:
            return False
        token = login.json().get("session", {}).get("access_token")
        if not token:
            return False
        me = requests.get(
            f"{_BASE_URL}/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        return me.status_code == 200
    except Exception:
        return False


def before_all(context):
    context.endpoint = None
    context.request_data = None
    context.files = {}
    context.response = None
    context.jwt_available = _check_jwt_available()
    if not context.jwt_available:
        print(
            "\n[JWT] JWT Bearer authentication is not available in this environment "
            "(server likely running with V2=false). "
            "Scenarios tagged with JWT-dependent tags will be skipped."
        )


def before_scenario(context, scenario):
    """Reset all per-scenario state before each scenario runs."""
    # Skip scenarios that require JWT Bearer auth when it is not functional.
    scenario_tags = set(scenario.effective_tags)
    if _JWT_DEPENDENT_TAGS & scenario_tags and not context.jwt_available:
        scenario.skip(
            "JWT Bearer authentication not available in this environment (V2 disabled). "
            "Run against a server with V2=true to execute these scenarios."
        )
        return

    context.files = {}
    context.multi_files = []
    context.json_parts = {}
    context.request_data = None
    # JWT auth state
    context.jwt_token = None
    context.original_jwt_token = None
    # OR-status helper used by auth step definitions
    context._status_ok = False


def after_scenario(context, scenario):
    if hasattr(context, "files"):
        for file in context.files.values():
            try:
                file.close()
            except Exception:
                pass

    # Close any multi-file handles
    for _key, file in getattr(context, "multi_files", []):
        try:
            file.close()
        except Exception:
            pass

    if os.path.exists("response_file"):
        os.remove("response_file")
    # Guard against context.file_name being None (e.g. reset from a previous scenario)
    if hasattr(context, "file_name") and context.file_name and os.path.exists(context.file_name):
        os.remove(context.file_name)

    # Remove any temporary files generated during the scenario
    for temp_file in os.listdir("."):
        if temp_file.startswith("genericNonCustomisableName") or temp_file.startswith(
            "temp_image_"
        ):
            try:
                os.remove(temp_file)
            except Exception:
                pass

    # Reset all per-scenario state so stale handles don't bleed into the next scenario
    context.files = {}
    context.multi_files = []
    context.json_parts = {}
    context.request_data = None
    # JWT auth state
    context.jwt_token = None
    context.original_jwt_token = None
    context._status_ok = False
