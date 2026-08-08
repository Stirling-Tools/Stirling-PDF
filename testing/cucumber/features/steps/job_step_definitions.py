"""Steps for the asynchronous job API (submit with ?async=true, then poll).

DELETE on a job is a cancel, so it only succeeds while the job is still running.
"""
import time

import requests
from behave import then, when

BASE_URL = "http://localhost:8080"
API_HEADERS = {"X-API-KEY": "123456789"}
POLL_TIMEOUT_SECONDS = 60


@when("I store the job id from the response")
def step_store_job_id(context):
    payload = context.response.json()
    context.job_id = payload.get("jobId")
    assert context.job_id, f"No jobId in async submit response: {payload}"


@when("I wait for the job to complete")
def step_wait_for_job(context):
    deadline = time.time() + POLL_TIMEOUT_SECONDS
    while time.time() < deadline:
        response = requests.get(
            f"{BASE_URL}/api/v1/general/job/{context.job_id}",
            headers=API_HEADERS, timeout=30,
        )
        assert response.status_code == 200, (
            f"Job status returned {response.status_code}: {response.text}"
        )
        context.response = response
        payload = response.json()
        if payload.get("complete"):
            context.job_status = payload
            return
        time.sleep(0.2)
    raise AssertionError(
        f"Job {context.job_id} did not complete within {POLL_TIMEOUT_SECONDS}s"
    )


@when("I request the job result")
def step_request_job_result(context):
    context.response = requests.get(
        f"{BASE_URL}/api/v1/general/job/{context.job_id}/result",
        headers=API_HEADERS, timeout=60,
    )


@when("I request the job result file list")
def step_request_job_result_files(context):
    context.response = requests.get(
        f"{BASE_URL}/api/v1/general/job/{context.job_id}/result/files",
        headers=API_HEADERS, timeout=60,
    )
    files = context.response.json().get("files") or []
    context.job_files = files
    if files:
        context.job_file_id = files[0].get("fileId")


@when("I download the first job result file")
def step_download_job_file(context):
    assert getattr(context, "job_file_id", None), "No fileId captured from the result file list"
    context.response = requests.get(
        f"{BASE_URL}/api/v1/general/files/{context.job_file_id}",
        headers=API_HEADERS, timeout=60,
    )


@when("I request the first job result file metadata")
def step_job_file_metadata(context):
    assert getattr(context, "job_file_id", None), "No fileId captured from the result file list"
    context.response = requests.get(
        f"{BASE_URL}/api/v1/general/files/{context.job_file_id}/metadata",
        headers=API_HEADERS, timeout=60,
    )


@when("I cancel the job")
def step_cancel_job(context):
    context.response = requests.delete(
        f"{BASE_URL}/api/v1/general/job/{context.job_id}",
        headers=API_HEADERS, timeout=30,
    )


@then("the job result file list should contain at least {count:d} file(s)")
def step_check_job_file_count(context, count):
    files = context.response.json().get("files") or []
    assert len(files) >= count, f"Expected at least {count} result file(s), got {len(files)}"


@then("the job should be reported complete")
def step_check_job_complete(context):
    payload = context.response.json()
    assert payload.get("complete") is True, f"Job not complete: {payload}"
    assert not payload.get("error"), f"Job reported an error: {payload.get('error')}"
