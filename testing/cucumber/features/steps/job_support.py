"""Shared helpers for the async job API.

Support module, not a step module: behave execs everything under features/steps as
step definitions, so anything environment.py needs to import has to live apart from
the @when/@then decorators or they would register twice.
"""

import requests

BASE_URL = "http://localhost:8080"
API_HEADERS = {"X-API-KEY": "123456789"}
CLEANUP_URL = f"{BASE_URL}/api/v1/general/jobs/cleanup"


def trigger_cleanup():
    """Force-expire finished jobs so their stored files are released now.

    An async submit persists a copy of the upload plus its results and holds them for
    the job retention window (30 minutes by default), which far outlasts a test run.
    Calling this keeps the post-run temp-file check strict: anything it still reports
    afterwards is a genuine leak rather than a file that simply had not aged out.
    """
    return requests.post(CLEANUP_URL, headers=API_HEADERS, timeout=60)
