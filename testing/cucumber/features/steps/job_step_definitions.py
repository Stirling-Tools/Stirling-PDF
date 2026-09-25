"""Steps for the async job API. DELETE is a cancel, so it 400s once the job finishes."""
import time

import requests
from behave import then, when
from job_support import API_HEADERS, BASE_URL, trigger_cleanup

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


# --- Cleanup: the async job files must actually go away, not just age out ---


@when("I trigger the async job cleanup")
def step_trigger_cleanup(context):
    context.response = trigger_cleanup()
    try:
        context.cleanup_summary = context.response.json()
    except ValueError:
        context.cleanup_summary = {}


@then("the cleanup should report at least {count:d} job(s) removed")
def step_check_cleanup_jobs(context, count):
    removed = context.cleanup_summary.get("jobsRemoved")
    assert removed is not None, f"No jobsRemoved in cleanup response: {context.cleanup_summary}"
    assert removed >= count, f"Expected at least {count} job(s) removed, got {removed}"


@then("the cleanup should report at least {count:d} file(s) deleted")
def step_check_cleanup_files(context, count):
    deleted = context.cleanup_summary.get("filesDeleted")
    assert deleted is not None, f"No filesDeleted in cleanup response: {context.cleanup_summary}"
    assert deleted >= count, f"Expected at least {count} file(s) deleted, got {deleted}"


@then("the cleanup should report nothing left to remove")
def step_check_cleanup_idempotent(context):
    removed = context.cleanup_summary.get("jobsRemoved")
    deleted = context.cleanup_summary.get("filesDeleted")
    assert removed == 0 and deleted == 0, (
        "A repeat cleanup still found work to do, so the first pass did not fully clean up: "
        f"{context.cleanup_summary}"
    )


@then("the job should no longer exist")
def step_check_job_gone(context):
    response = requests.get(
        f"{BASE_URL}/api/v1/general/job/{context.job_id}",
        headers=API_HEADERS, timeout=30,
    )
    assert response.status_code == 404, (
        f"Job {context.job_id} still exists after cleanup: "
        f"{response.status_code} {response.text[:200]}"
    )


@then("the job result file should no longer be downloadable")
def step_check_job_file_gone(context):
    assert getattr(context, "job_file_id", None), "No fileId captured from the result file list"
    response = requests.get(
        f"{BASE_URL}/api/v1/general/files/{context.job_file_id}",
        headers=API_HEADERS, timeout=30,
    )
    assert response.status_code == 404, (
        f"File {context.job_file_id} still downloadable after cleanup: "
        f"{response.status_code} {response.text[:200]}"
    )


@then("the job result file should still be downloadable")
def step_check_job_file_still_there(context):
    assert getattr(context, "job_file_id", None), "No fileId captured from the result file list"
    response = requests.get(
        f"{BASE_URL}/api/v1/general/files/{context.job_file_id}",
        headers=API_HEADERS, timeout=60,
    )
    assert response.status_code == 200, (
        f"File {context.job_file_id} was not retrievable a second time: "
        f"{response.status_code} {response.text[:200]}"
    )
    assert len(response.content) > 0, "Second download returned an empty body"
