# Shared Signing: PR review follow-up

30 September 2026 | PR [#8189](https://github.com/Stirling-Tools/Stirling-PDF/pull/8189)

## Outcome

The PR restores a permanent Sign entry with personal signing, certificate signing, request creation and session access. It simplifies request creation and repairs the registered-user shared-signing path: validated contributions reach the final PDF, finalization is locked and transactional, at least one signature is required, and progress distinguishes submission from final completion. Customer instructions, installation requirements, a demo plan and a scored user-story assessment accompany the implementation.

The review follow-up addresses all five inline findings:

| Finding | Resolution |
|---|---|
| Generated model CI failure | Run `task tool-models` against freshly generated Java OpenAPI. The TypeScript validation request and binary-file metadata now include PEM certificate/key uploads. Python models and both tool-I/O outputs regenerate without semantic changes. |
| Legacy picker scope lost on upgrade | Migrate `storage.encryption.userListScope` before the settings-template merge, preserving explicit `storage.signing.userListScope`. Six real-template restart cases cover legacy values, explicit overrides and defaults. |
| Cancelled sessions cannot be deleted | Lock and authorize deletion independently of active status. Owners can delete cancelled sessions; finalized sessions remain protected. The controller preserves the service's HTTP status and reason. |
| Original PDF retained after finalization | Retention is intentional. Remove the unused deletion helper that contradicted this policy, test original and signed retrieval after commit, and document storage/retention consequences. |
| Stale release ledger and sequential-signing help | Reconcile the ledger with the recorded acceptance run. Update en-US help and fallback strings to explain independent signing, optional marks and finalization requirements. Other locales remain managed by the separate translation process. |

## API and compatibility changes across the PR

No endpoint is added, renamed or removed. No database-schema migration is introduced. Java controllers/DTOs remain the OpenAPI source of truth; `SwaggerDoc.json` is generated rather than committed.

| API surface | Change | Client consequence |
|---|---|---|
| `POST /api/v1/security/cert-sign/validate-certificate` | Optional multipart `privateKeyFile` and `certFile` for `certType=PEM` | PEM clients can validate their key/certificate pair. Existing P12/PFX/JKS fields remain supported. Generated TypeScript request/file-field declarations now match. |
| `POST /api/v1/workflow/participant/validate-certificate` and `/submit-signature` | Matching PEM multipart inputs for the participant-token path | Token-based clients can preflight and submit PEM; access, expiry and entitlement checks still apply. |
| `GET /api/v1/security/cert-sign/sign-requests` and `/{sessionId}` | Summary adds `finalized`; detail adds `finalized` and `canSign` | Clients can distinguish submitted from finalized and hide unavailable actions. These are additive response fields. |
| Visible-signature metadata | All types, including `text`, must provide a valid raster-image data URL; image/page/geometry bounds are enforced | **Behavioral compatibility change:** raw-text payloads that were previously accepted but could fail finalization now fail at submission. Clients must rasterize typed signatures, as the browser does. |
| Creation and participant changes | Reject empty/duplicate participants, user/email aliases and unsuitable PDFs; serialize mutations with finalization | Clients must handle validation and closed-session errors; duplicate or late requests no longer appear successful. |
| Finalization | Requires at least one accepted signature; publication, session closure and credential cleanup share a transaction | Zero-signature or already-closed finalization returns conflict. Failures leave the session open for retry and roll back publication. |
| `DELETE /api/v1/security/cert-sign/sessions/{sessionId}` | Cancelled sessions are deletable by their owner; finalized deletion returns 400 with its reason, unauthorized deletion 403, missing sessions 404 | **Error-status correction:** the controller no longer converts every service rejection into 403. Successful deletion remains 204. |

The OpenAPI generation fixes the missing PEM fields. Some workflow responses still use `ResponseEntity<?>`, and runtime rules such as minimum signatures, locking and image constraints are not fully expressed in generated schemas. The table above and contract tests supplement that limitation; model synchronization is not proof that every workflow invariant is machine-readable.

## Evidence and limits

The [24 September acceptance report](./blocking-work-report.md) records 129/129 local acceptance assertions and independent signature verification. It covers the unlicensed local-storage/uploaded-certificate setup. Those browser/artifact journeys were not all repeated for this review-only follow-up. See the PR's checks for the current commit's CI result.

Fresh review validation: generated-model consistency passes; 252 workflow tests and all six real-template migration/restart cases pass; the engine quality gate passes with 707 tests and five skips. Frontend typecheck/lint/format pass, with 5,803/5,805 tests passing and the same two previously documented local failures. Backend formatting and the focused regressions pass; the broad local suite has the previously documented LibreOffice and Windows symlink failures. Translation formatting, pre-commit checks, staged secret scanning and whitespace checks pass. These local results do not substitute for the current revision's GitHub CI.

Remaining release work:

- Legitimately licensed Personal/Organization certificates, database/S3 storage, encryption-at-rest and entitlement transitions need dedicated acceptance runs.
- Customer CA/reader trust, HTTPS/proxy/SSO, backup restoration, storage outages and multi-node operation need deployment-specific evidence.
- Finalized sessions retain both PDFs with no automatic expiry or owner deletion. A retention/purge policy and implementation are still needed for production requirements that demand deletion.
- Signing-specific mobile/touch, accessibility and browser coverage remains narrower than the repository's general browser suite.
- Invitations/reminders and enforced signing order are not implemented by this patch. Normal shared-signing participants remain registered users; token support alone is not evidence of a complete guest-signing journey.
- Personal wet-signature and certificate editors remain separate. Decline in the normal user interface still lacks confirmation, reason capture and undo.

These limitations leave full production sign-off open. They do not invalidate the tested controlled demo described in the [demo plan](./demo-plan.md).


## Signing workspace revision

The 30 September UI revision removes Shared Signing from the tool registry and picker. Sign now groups personal signing above request creation and recent session shortcuts, with an Expand action for the full session workspace. The same menu is available in the mobile bottom bar.

The workspace has searchable, wrapping document rows, active/completed tabs and status/ownership filters. Owner and signer details use a document-and-controls layout with a 360–480 px controls column on desktop and a stacked layout on narrow screens. Request creation can choose an open PDF or upload one without leaving the form. The existing `/shared-sign` address remains valid. No API schema, storage setting, entitlement or certificate rules change in this revision.

Browser checks on the local instance covered personal signing, current-document carryover, uploading, creating a synthetic request for a local account, owner controls, request review, the certificate dialog, recent-session shortcuts, search, library/editor navigation and the 390 px layout. Automated regressions cover menu destinations, recent-session selection, duplicate historical invitation rows, clearing account-scoped names, upload navigation, unsaved-work prompts and discarded document loads after leaving the workspace. All frontend variants typecheck. The final frontend quality gate passes lint and formatting, with 5,818/5,820 tests passing; the two previously reproduced baseline failures remain. This is UI acceptance; the full certificate/final-artifact matrix remains the separately recorded 24 September acceptance run.

The responsive shell still remounts its workbench when switching between desktop and mobile layouts. Changing across that breakpoint returns the signing workspace to its list; keep a stable viewport during signature placement. A combined personal-signing editor and broader device/accessibility acceptance remain follow-up work.

Workspace navigation follows the library's left-to-right path: **Signing sessions → document name**, or **Signing sessions → Request signatures**. The root action returns to the current search and filters through the unsaved-work guard. Owner and participant panels contain session controls without a separate Back button. Browser checks cover both roles, request creation and long filenames at a 390 px layout width.

Request creation uses the shared library modal for **Choose from library**, limited to one PDF. Open documents are selectable thumbnails using the workbench's preview renderer, cache and styling. Choosing an already-open PDF reuses its file identity; a new import selects its new thumbnail while keeping the request form open. Regression checks cover format/selection limits, resetting restrictions for other callers, duplicate avoidance, import failure and multi-document bundle rejection.

The 1 October form revision gives document previews a larger portrait frame and balances them against selected-person cards and an inline calendar. **Choose participants** opens a searchable card picker with tentative selection and explicit Apply/Cancel behavior, using the existing account/team scope. Signing-order, due-date, appearance and summary-page explanations are available through keyboard/touch-accessible info tooltips. Five new regression tests cover participant search/cancellation/removal, calendar date strings and clearing, tooltip access, settings submission, busy-state locks and the unchanged dropdown used by other callers. Desktop and 390 px browser checks cover the new picker and calendar without horizontal overflow. The guide and demo plan include the new six-action default path; no backend/API rules changed.
