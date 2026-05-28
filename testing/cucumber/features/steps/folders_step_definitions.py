"""
Step definitions for the server-side folders feature
(folders_and_files.feature).

Covers:
  - POST/PATCH/DELETE/GET /api/v1/storage/folders[/{id}]
  - POST /api/v1/storage/files  (multipart upload)
  - PATCH /api/v1/storage/files/{id}/folder
  - GET /api/v1/storage/files

Authentication: uses the JWT token stashed in context.jwt_token by the
existing auth step "Given I am logged in as admin".

State stashing per scenario:
  context.folders_by_name  -> { display_name: uuid }
  context.uploaded_files   -> { filename: numeric file id }
  context.response         -> the most recent requests.Response

The "Name.id" placeholder convention in the Gherkin lets us write
human-readable scenarios while resolving to real UUIDs at step time.
"""

import io

import requests
from behave import given, then, when
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

BASE_URL = "http://localhost:8080"
FOLDERS_URL = f"{BASE_URL}/api/v1/storage/folders"
FILES_URL = f"{BASE_URL}/api/v1/storage/files"
HTTP_TIMEOUT = 30


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _jwt_headers(context):
    token = getattr(context, "jwt_token", None)
    assert token, (
        "No JWT token in context. Use 'Given I am logged in as admin' first."
    )
    return {"Authorization": f"Bearer {token}"}


def _json_jwt_headers(context):
    return {**_jwt_headers(context), "Content-Type": "application/json"}


def _ensure_folders_dict(context):
    if not hasattr(context, "folders_by_name"):
        context.folders_by_name = {}


def _ensure_files_dict(context):
    if not hasattr(context, "uploaded_files"):
        context.uploaded_files = {}


def _resolve_folder_id(context, ref):
    """
    Resolve a Gherkin placeholder to a folder id.

    Conventions:
      'null'    -> Python None  (means "no folder" / root)
      'Name.id' -> uuid stashed under 'Name' in folders_by_name
      anything else -> returned unchanged (raw UUID string)
    """
    if ref is None or ref == "null":
        return None
    if ref.endswith(".id"):
        name = ref[:-3]
        _ensure_folders_dict(context)
        assert name in context.folders_by_name, (
            f"No folder named {name!r} stashed; available: "
            f"{list(context.folders_by_name)}"
        )
        return context.folders_by_name[name]
    return ref


def _generate_pdf_bytes():
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    c.drawString(100, 700, "behave folder fixture")
    c.showPage()
    c.save()
    return buffer.getvalue()


def _create_folder(context, name, parent_id=None):
    payload = {"name": name}
    if parent_id is not None:
        payload["parentFolderId"] = parent_id
    response = requests.post(
        FOLDERS_URL,
        headers=_json_jwt_headers(context),
        json=payload,
        timeout=HTTP_TIMEOUT,
    )
    return response


# ---------------------------------------------------------------------------
# GIVEN - setup
# ---------------------------------------------------------------------------


@given("I clear all my folders")
def step_clear_all_folders(context):
    """
    Tear-down for prior runs. Folder DELETE cascades to children, so
    a single pass over the top-level list is enough.

    A 404 from the GET means the folder endpoint isn't deployed on this
    build, which would render every scenario unrunnable - surface that
    early as a clear assertion rather than letting individual steps fail
    with cryptic errors.
    """
    response = requests.get(
        FOLDERS_URL, headers=_jwt_headers(context), timeout=HTTP_TIMEOUT
    )
    assert response.status_code in (200, 204), (
        f"Folder list returned {response.status_code} during teardown - "
        f"is the proprietary storage-folders module deployed? Body: "
        f"{response.text[:300]}"
    )
    for folder in response.json() or []:
        # Top-level folders only; cascade does the rest. Skipping children
        # avoids 404s on the second pass when their parent has already gone.
        if folder.get("parentFolderId") is None:
            requests.delete(
                f"{FOLDERS_URL}/{folder['id']}",
                headers=_jwt_headers(context),
                timeout=HTTP_TIMEOUT,
            )
    _ensure_folders_dict(context)
    context.folders_by_name.clear()


@given('a folder "{name}" exists')
def step_folder_exists(context, name):
    response = _create_folder(context, name)
    assert response.status_code == 201, (
        f"Could not create folder {name!r} during Given step: "
        f"{response.status_code} {response.text}"
    )
    _ensure_folders_dict(context)
    context.folders_by_name[name] = response.json()["id"]
    context.response = response


@given('a folder "{name}" exists under "{parent}"')
def step_folder_exists_under(context, name, parent):
    _ensure_folders_dict(context)
    parent_id = context.folders_by_name.get(parent)
    assert parent_id, (
        f"Parent folder {parent!r} not created yet; available: "
        f"{list(context.folders_by_name)}"
    )
    response = _create_folder(context, name, parent_id=parent_id)
    assert response.status_code == 201, (
        f"Could not create child folder {name!r}: "
        f"{response.status_code} {response.text}"
    )
    context.folders_by_name[name] = response.json()["id"]
    context.response = response


@given('I upload a file as "{filename}"')
@when('I upload a file as "{filename}"')
def step_upload_file(context, filename):
    pdf_bytes = _generate_pdf_bytes()
    response = requests.post(
        FILES_URL,
        headers=_jwt_headers(context),  # multipart sets its own Content-Type
        files={"file": (filename, pdf_bytes, "application/pdf")},
        timeout=HTTP_TIMEOUT,
    )
    context.response = response
    if response.status_code == 200:
        _ensure_files_dict(context)
        context.uploaded_files[filename] = response.json()["id"]


# ---------------------------------------------------------------------------
# WHEN - folder mutations
# ---------------------------------------------------------------------------


@when('I POST a folder with name "{name}"')
def step_post_folder(context, name):
    response = _create_folder(context, name)
    context.response = response
    if response.status_code == 201:
        _ensure_folders_dict(context)
        context.folders_by_name[name] = response.json()["id"]


@when("I POST a folder with a 256-character name")
def step_post_oversize_folder(context):
    """256 chars trips the @Size(max = 255) validator on CreateFolderRequest."""
    long_name = "x" * 256
    response = _create_folder(context, long_name)
    context.response = response


@when('I PATCH folder "{name}" with name "{new_name}"')
def step_patch_folder_name(context, name, new_name):
    folder_id = _resolve_folder_id(context, f"{name}.id")
    response = requests.patch(
        f"{FOLDERS_URL}/{folder_id}",
        headers=_json_jwt_headers(context),
        json={"name": new_name},
        timeout=HTTP_TIMEOUT,
    )
    context.response = response
    if response.status_code == 200:
        # Update the stash so later steps can still refer to it by either
        # the old or new name in the same scenario.
        context.folders_by_name[new_name] = folder_id


@when('I PATCH folder "{name}" with parentFolderId = "{parent_ref}"')
def step_patch_folder_parent(context, name, parent_ref):
    folder_id = _resolve_folder_id(context, f"{name}.id")
    parent_id = _resolve_folder_id(context, parent_ref)
    # `reparent: true` is required - the UpdateFolderRequest treats a
    # missing reparent flag as "do not change parent" even when
    # parentFolderId is present. Sending the flag explicitly is what the
    # service contract expects.
    response = requests.patch(
        f"{FOLDERS_URL}/{folder_id}",
        headers=_json_jwt_headers(context),
        json={"reparent": True, "parentFolderId": parent_id},
        timeout=HTTP_TIMEOUT,
    )
    context.response = response


@when('I DELETE folder "{name}"')
def step_delete_folder(context, name):
    folder_id = _resolve_folder_id(context, f"{name}.id")
    response = requests.delete(
        f"{FOLDERS_URL}/{folder_id}",
        headers=_jwt_headers(context),
        timeout=HTTP_TIMEOUT,
    )
    context.response = response


@when("I list folders")
def step_list_folders(context):
    response = requests.get(
        FOLDERS_URL, headers=_jwt_headers(context), timeout=HTTP_TIMEOUT
    )
    context.response = response


# ---------------------------------------------------------------------------
# WHEN - file - folder placement
# ---------------------------------------------------------------------------


@when('I PATCH file "{filename}" with folderId = "{folder_ref}"')
@given('I PATCH file "{filename}" with folderId = "{folder_ref}"')
def step_patch_file_folder(context, filename, folder_ref):
    _ensure_files_dict(context)
    file_id = context.uploaded_files.get(filename)
    assert file_id, (
        f"File {filename!r} not uploaded yet; available: "
        f"{list(context.uploaded_files)}"
    )
    folder_id = _resolve_folder_id(context, folder_ref)
    response = requests.patch(
        f"{FILES_URL}/{file_id}/folder",
        headers=_json_jwt_headers(context),
        json={"folderId": folder_id},
        timeout=HTTP_TIMEOUT,
    )
    context.response = response


@when("I list files")
def step_list_files(context):
    response = requests.get(
        FILES_URL, headers=_jwt_headers(context), timeout=HTTP_TIMEOUT
    )
    context.response = response


# ---------------------------------------------------------------------------
# WHEN - unauthenticated probes
# ---------------------------------------------------------------------------


@when("I GET the folder list with no authentication")
def step_get_folders_no_auth(context):
    response = requests.get(FOLDERS_URL, timeout=HTTP_TIMEOUT)
    context.response = response


@when('I POST a folder named "{name}" with no authentication')
def step_post_folder_no_auth(context, name):
    response = requests.post(
        FOLDERS_URL,
        headers={"Content-Type": "application/json"},
        json={"name": name},
        timeout=HTTP_TIMEOUT,
    )
    context.response = response


# ---------------------------------------------------------------------------
# THEN - JSON shape assertions
# ---------------------------------------------------------------------------


@then('the response JSON folder should have name "{name}"')
def step_response_folder_name(context, name):
    data = context.response.json()
    assert data.get("name") == name, (
        f"Expected name={name!r}, got {data.get('name')!r}. Body: {data}"
    )


@then("the response JSON folder.parentFolderId should be null")
def step_response_folder_parent_null(context):
    data = context.response.json()
    assert data.get("parentFolderId") is None, (
        f"Expected parentFolderId=null, got {data.get('parentFolderId')!r}"
    )


@then('the response JSON folder.parentFolderId should equal "{ref}"')
def step_response_folder_parent_equal(context, ref):
    data = context.response.json()
    expected = _resolve_folder_id(context, ref)
    assert data.get("parentFolderId") == expected, (
        f"Expected parentFolderId={expected!r}, "
        f"got {data.get('parentFolderId')!r}"
    )


@then("the response JSON folder.createdAt should not be empty")
def step_response_folder_createdat_not_empty(context):
    data = context.response.json()
    assert data.get("createdAt"), (
        f"Expected non-empty createdAt; body: {data}"
    )


@then("the response JSON file.folderId should be null")
def step_response_file_folderid_null(context):
    data = context.response.json()
    assert data.get("folderId") is None, (
        f"Expected folderId=null, got {data.get('folderId')!r}"
    )


@then('the response JSON file.folderId should equal "{ref}"')
def step_response_file_folderid_equal(context, ref):
    data = context.response.json()
    expected = _resolve_folder_id(context, ref)
    assert data.get("folderId") == expected, (
        f"Expected folderId={expected!r}, got {data.get('folderId')!r}"
    )


@then('the folder list should contain "{name}"')
def step_folder_list_contains(context, name):
    folders = context.response.json()
    names = [f.get("name") for f in folders]
    assert name in names, f"Folder {name!r} not in list: {names}"


@then('the folder list should not contain "{name}"')
def step_folder_list_not_contains(context, name):
    folders = context.response.json()
    names = [f.get("name") for f in folders]
    assert name not in names, (
        f"Folder {name!r} should not be in list: {names}"
    )


@then('the file list should contain a file named "{filename}" with folderId null')
def step_file_list_contains_root_file(context, filename):
    files = context.response.json()
    matches = [
        f
        for f in files
        if f.get("fileName") == filename and f.get("folderId") is None
    ]
    assert matches, (
        f"No file named {filename!r} with folderId=null in list. "
        f"Files seen: "
        f"{[(f.get('fileName'), f.get('folderId')) for f in files]}"
    )
