# fix(security): harden uploads, invite links, and signing workflows

## Description of Changes

This pull request provides comprehensive security hardening for public upload endpoints, mobile scanner sessions, certificate-based signing, invite links, workflow participants, and database management operations.

## What was changed

- Added limits for mobile scanner sessions, upload attempts, files per session, individual file sizes, per-session storage, and total temporary storage.
- Rejected uploads for unknown or expired mobile scanner sessions.
- Added certificate credential validation with a 5 MiB size limit and bounded reads.
- Added validation for workflow upload sizes, certificate credentials, and wet-signature payloads.
- Added request-size validation before multipart request parsing.
- Replaced the previous participant rate-limit interceptor with `ParticipantRequestSecurityFilter`.
- Added per-IP rate limiting for participant and authenticated workflow upload endpoints.
- Added handling for missing `Content-Length` headers and oversized multipart requests.
- Replaced mutable rate-limit counter arrays with immutable request-window records to prevent concurrent access races.
- Improved request URI normalization and protected endpoint matching.
- Added dedicated invite acceptance handling with validation for unknown, expired, and already-used tokens.
- Hardened workflow participant operations by validating session state before modifying participants or signing requests.
- Prevented access to expired participant requests and inactive workflow sessions.
- Added coordinated workflow finalization with session locking, ordered file processing, cleanup, and status updates.
- Updated database backup creation and import operations to use `POST`.
- Updated database backup deletion to use `DELETE`.
- Updated `frontend/editor/src/proprietary/services/databaseManagementService.ts` to use the corresponding HTTP methods for database backup creation, import, and deletion.
- Added and expanded tests across common, core, and proprietary modules.

## Why the change was made

The changes reduce abuse and resource-exhaustion risks, prevent oversized or malformed uploads, improve protection for public and participant-facing endpoints, and ensure that workflow state transitions cannot modify inactive or expired sessions.

The workflow finalization changes also make processing more consistent by locking the session before finalization and coordinating file storage, signing, cleanup, and status updates.

## Detailed security changes

### Mobile scanner protection

Mobile scanner sessions now enforce the following limits:

- Maximum of 100 active sessions.
- Maximum of 20 files per session.
- Maximum of 30 upload attempts per session.
- Maximum individual file size of 25 MiB.
- Maximum storage per session of 100 MiB.
- Maximum total scanner storage of 500 MiB.

Session existence and expiration are checked before uploads are processed. Session operations are synchronized to avoid inconsistent state during concurrent requests, and empty files are excluded from upload-limit calculations.

### Certificate and workflow upload validation

Certificate uploads are validated before their contents are read or processed. Files are limited to 5 MiB, and the actual byte array size is checked after reading as an additional safeguard.

Workflow upload utilities also validate certificate credentials, uploaded file sizes, request sizes, and wet-signature payload lengths before signing, encryption, or persistence occurs.

### Request filtering and rate limiting

`ParticipantRequestSecurityFilter` runs before multipart parsing and protects participant and authenticated workflow upload endpoints. It provides:

- A limit of 20 requests per minute per remote address.
- A 16 MiB maximum multipart request size.
- Required `Content-Length` for protected multipart uploads.
- `429 Too Many Requests` responses with a `Retry-After` header.
- `411 Length Required` responses for missing upload lengths.
- `413 Content Too Large` responses for oversized requests.
- Scheduled cleanup of expired request windows.

Rate-limit counters are stored as immutable `RequestWindow` records. Updates atomically replace the map value through `ConcurrentHashMap.compute`, so request threads and the scheduled cleanup task no longer mutate the same `long[]` instance.

### Invite links and workflow participants

Invite acceptance was moved into a dedicated service with explicit token, expiration, usage, authorization, and session checks. Workflow participant operations now reject inactive sessions and expired participants before changing state, writing audit information, or accessing stored documents.

### Workflow finalization

`WorkflowFinalizationCoordinator` ensures that workflow finalization occurs in a predictable order:

1. Lock the workflow session.
2. Retrieve the original document.
3. Finalize the document through the signing service.
4. Store the processed document.
5. Mark the workflow session as finalized.
6. Clear sensitive signing metadata.
7. Delete the original document only after successful processing.

This reduces the risk of duplicate finalization, inconsistent session state, premature file deletion, and incomplete cleanup.

## Tests added or updated

### Mobile scanner tests

Added coverage for active-session limits, unknown and expired sessions, upload-attempt limits, file-count limits, individual file-size limits, per-session storage quotas, global storage quotas, empty uploads, and cleanup behavior.

### Certificate and upload utility tests

Added coverage for valid, empty, missing, oversized, and inaccurately reported certificate files, including verification that oversized credentials are rejected before `getBytes()` is called.

### Request filter tests

Added coverage for context-path removal, trailing-slash normalization, endpoint matching, multipart request-size validation, missing `Content-Length`, rate-limit enforcement, and expired-window cleanup.

### Invite and controller tests

Added or expanded tests for invite acceptance, invalid and expired tokens, mobile scanner endpoints, certificate signing, certificate validation, signature validation, policy endpoints, signing sessions, and workflow participant operations.

### Workflow service tests

Added coverage for inactive sessions, expired participants, unauthorized document access, state-change prevention after session completion, oversized credentials, oversized wet-signature data, single-read certificate processing, and sensitive metadata cleanup.

### Finalization coordinator tests

Added coverage for successful finalization, operation ordering, session locking, missing files, signing failures, finalization failures, cleanup, and prevention of persistence or deletion after processing errors.

## Test results

The relevant backend quality gate was started with:

```text
task backend:check
```

The backend quality gate exceeded the available execution time before producing a result. The complete backend format check, compilation, and test suite therefore did not finish.

A targeted test run was also attempted with:

```text
gradlew.bat :app:proprietary:test --tests '*ParticipantRequestSecurityFilterTest' --no-daemon
```

This targeted test run also exceeded the available execution time without producing test output. Therefore, no passing or failing test result can be reported from the local environment.

The changed Java code was reviewed and formatted according to the repository's existing Google Java Format style.

The pull request also changes the frontend service at `frontend/editor/src/proprietary/services/databaseManagementService.ts`. No frontend-specific check was completed for this change. The relevant verification should be run with:

```text
task frontend:check
```

The frontend change is limited to the HTTP methods used for existing database management endpoints:

- `GET` to `POST` for database backup creation.
- `GET` to `POST` for database import.
- `GET` to `DELETE` for backup deletion.

The following verification should be run in an environment with a functioning Gradle setup:

```text
task backend:check
```

For full repository verification:

```text
task check
```

## Checklist

### General

- [ ] I have read the [Contribution Guidelines](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/CONTRIBUTING.md)
- [ ] I have read the [Stirling-PDF Developer Guide](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/DeveloperGuide.md) (if applicable)
- [ ] I have read the [How to add new languages to Stirling-PDF](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/HowToAddNewLanguage.md) (if applicable)
- [x] I have performed a self-review of my own code
- [ ] My changes generate no new warnings

### Documentation

- [ ] I have updated relevant docs on the [Stirling-PDF doc repository](https://github.com/Stirling-Tools/Stirling-Tools.github.io/blob/main/docs/) (if functionality has heavily changed)
- [ ] I have read the section [Add New Translation Tags](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/HowToAddNewLanguage.md#add-new-translation-tags) (for new translation tags only)

### UI Changes

- [ ] Screenshots or videos demonstrating UI changes are attached

### Testing

- [ ] I have tested my changes locally. Refer to the [Testing Guide](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/DeveloperGuide.md#6-testing) for more details.

No issue is linked to this pull request.
