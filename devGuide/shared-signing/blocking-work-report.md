# Signing blocker closure and Sign entry restoration

24 September 2026 | Evaluated base `910b5d012f` plus this signing patch

**The remaining reproducible blockers in the tested local signing path are closed. The permanent Sign entry and compact request form restore a useful part of the original concept. A controlled internal-user demo is supported; full production release approval remains open.**

All 12 stories have been reassessed at **4.3/5 (52/60)**, up from 3.7/5 after the first repair batch and 2.4/5 initially. This is a reviewer judgment, not a statistical assurance or a substitute for release gates. See the [story scorecard](./user-stories-closure.md).

## What changed

- **Always-accessible Sign menu:** personal drawing/typing/upload, certificate signing, request creation and signing sessions share the permanent navigation entry and its outstanding-request badge. The menu supports focus, arrows and Escape without depending on editor/processor providers.
- **Fast request creation:** one form carries the selected PDF, displays chosen people by name, and keeps due date/appearance/summary optional. The default path no longer traverses four wizard steps or promises sequential signing.
- **Valid creation and participants:** reject empty participant lists, non-PDF/protected documents, duplicate registered users and user/email aliases. Concurrent duplicate additions accept one invitation; validation occurs before storing a new request, and participant-list additions validate together.
- **Certificate-only signing:** visible marks are optional. PKCS12/PFX/JKS/PEM uploads receive pre-validation. Invalid/pending checks disable submission, changed inputs invalidate prior success, and stale asynchronous responses cannot re-enable the action. Errors stay readable in the modal.
- **Correct visual output:** typed marks export without the large empty preview canvas. Final rendering preserves image aspect ratio and handles cropped and rotated pages. Invalid image data, raw text, impossible geometry and missing pages are rejected before accepting the signature.
- **Honest progress:** Submitted—awaiting finalization stays in Active. Completed means finalized; closed views have no Sign/Decline actions. Owned sessions now appear in Mine + Overdue. The template places `userListScope` under `storage.signing`.
- **Earlier repairs preserved:** real certificate signing, minimum-one finalization, named early-closure confirmation, transactional finalization/locking, permission/expiry checks, unlicensed managed-certificate rejection, original/final retrieval and sensitive-metadata cleanup.

The raw wet-mark API contract is now explicit: **all types, including typed text, carry a raster image data URL**. Plain text that previously reached SIGNED and then broke finalization now returns 400 at submission. API clients must rasterize text as the browser does. This is a compatibility correction, not server-side text rendering.

## Fresh validation

| Check | Result and practical limit |
|---|---|
| API/artifact/browser-follow-up/restart ledger | **129/129 passed**, results (retained in the local review evidence). The fresh primary API run contributed 105 checks; browser output and persistence checks added 24. Raw ledgers, synthetic credentials, database files and machine-specific harnesses remain local and are not included in this repository. These are assertions, not 129 independent end-to-end journeys. |
| Backend workflow tests | **302 passed, zero failed/skipped**, across 57 XML reports including nested suites. Four rotation/crop rendering cases inspect pixels; creation/participant validation and real persistence/lifecycle regressions pass. |
| Full backend check | Formatting/compilation completed; **6 existing failures** among 6,158 common/proprietary tests, 147 skipped. Four LibreOffice sandbox-path cases, one LibreOffice retry case and one Windows symlink-identity case. All reproduced on unchanged HEAD in the preceding revalidation. The gate remains red. |
| Full frontend check | Typecheck/lint/format checks pass; **5,803/5,805 tests pass** across 569 files. Only the existing workbenchSession failed-write and notificationActions handoff failures remain; both reproduced on unchanged HEAD. The obsolete translation-key failure introduced while simplifying the wizard was repaired and the full check rerun. |
| Required pre-commit checks | `task pre-commit:fix` passed. The local `.demo-runtime` baseline archive was excluded for that process only, preventing duplicate archived source from entering comment lint. No repository-wide ignore change. |
| Final source whitespace check | `git diff --check` passed. No production frontend build was run. |
| PDF guide | Regenerated and visually inspected all four pages. No clipping/overlap; official documentation links remain the setup references. |

The pre-existing separately run core application suite passed in the previous revalidation (3,732 tests, zero failures, five skipped). This closure did not rerun that entire suite; changed backend logic is in the workflow module and its coverage above is fresh.

Fresh evidence includes two mixed-format, two-signer documents; summary on/off; marks on separate pages; authenticated/token negative cases; repeated/late actions; concurrent finalization; and successful PEM token submission. OpenSSL independently verifies the digital signatures, confirms expected subjects and rejects tampered signed bytes. Stirling's validator agrees on integrity and correctly reports the synthetic certificates as self-signed/untrusted.

Eight final artifacts survived a real stop/start unchanged. The original remained accessible, and a pre-restart pending contribution finalized afterward. A read-only audit before restart found nine finalized signers with zero retained signing payloads, two pending signers with encrypted keystores/passwords, zero plaintext fixture passwords and no missing original references. This is restart persistence, **not a backup restore or cluster test**.

## Browser acceptance ledger

| Journey | Observed result |
|---|---|
| Sign from an existing personal signing tool | Permanent menu opens all four choices; first command receives focus, ArrowDown moves focus, Escape closes and restores focus to Sign. |
| Sign from account settings | The permanent menu remains available; Request signatures returns to the compact creation form with the selected synthetic PDF retained. |
| Request from a selected synthetic PDF | Document carried over; named participant chips; no-document/zero-person send disabled; one-form request sent successfully as Bob to Alice. |
| Zero-mark submission | Complete & Sign enabled; dialog reports zero marks; wrong password gives readable validation feedback and disabled submit. Correction shows Bob's certificate identity and enables successful submission. |
| Submitted versus final | Request remains in Active with Submitted—awaiting finalization. After owner finalization it appears in Completed as Finalised; opening it has retrieval but no Sign/Decline. Final PDF contains one independently valid CMS signature. |
| Owned overdue request | Mine + Overdue shows the prepared request owned by Bob with its past due date. |
| Typed mark | Created DEMO BOB CLOSURE, placed it on the synthetic page, submitted and finalized. Rendered output retains its previewed location/aspect ratio, with a readable cropped image and a valid certificate signature. |

Earlier draw/move/resize/delete, saved-image and multi-page browser exercises are preserved in the previous revalidation (retained in the local review evidence); they were not all repeated after this patch. The new rendering tests, fresh API multi-page output and typed-mark browser round trip cover the rendering changes. Browser screenshots may include unrelated library filenames, so they are internal evidence and are not customer handouts.

## Remaining release gates

| Gate | Current decision | What is still needed |
|---|---|---|
| G1: every accepted contribution reaches the PDF | Passed for tested uploaded-certificate/local-storage path | Customer certificate chains/readers and licensed managed sources; intentionally corrupt persisted key material and broader signing failures. |
| G2: consistent durable finalization | Local locking, rollback, concurrency, cleanup and restart evidence pass | Actual storage-provider failure/restore rehearsals and multi-node/database concurrency where supported. |
| G3: consistent access and edition policy | Tested unlicensed and permission/expiry/revocation paths pass | Legitimate SERVER/ENTERPRISE Personal/Organization, paid storage/encryption and entitlement-change matrix. No bypassed-license test counts as a pass. |
| G4: understandable interface | Named creation, optional marks, validation feedback, status and overdue gaps repaired | Clean separate profiles, supported browser/mobile/touch coverage and broader accessibility. Decline still lacks confirmation/reason/undo; inline recent sessions and unified personal editor remain follow-ups. |
| G5: local acceptance and release evidence | Controlled demo supported; 129/129 ledger | Eight known unrelated broad-suite failures still prevent a completely green repository gate. Resolve or explicitly track them through the repository release process. |
| G6: actual deployment coverage | Self-host requirements and customer/demo material updated | Customer HTTPS/proxy, user scope/capacity, SSO if used, backup restore, retention, trusted readers and any promised guest/email journey. |

No new regression was found in the exercised paths after the fixes. This does not establish all configurations or devices. The environment was Windows/JDK 25, proprietary development frontend, login enabled, local storage, no paid license, mail disabled, existing approved synthetic accounts. No deployment, merge, external email or customer data was involved.

## History and handoff

Your January/March signing work and the later removal/navigation change are documented with hashes and ancestry qualifications in [Sign experience history](./sign-experience-history.md). The immediate implementation restores one menu and low-click requests. The session list opens beside the document; it is not yet an inline popover feed. Personal wet/certificate editors are not yet merged.

Use the refreshed [customer supplement](./customer-guide.md), [self-host requirements](./self-hosted-installation-requirements.md) and [demo runbook](./demo-plan.md). The older baseline and first revalidation remain historical records. Source changes and these review documents are included together in the signing pull request. Test database, storage, keys and baseline checkout are retained under `.demo-runtime`; exclude that directory from any commit or customer material.
