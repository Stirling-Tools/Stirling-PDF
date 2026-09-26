# Shared Signing release-gate implementation plan

24 September 2026 | based on checkout `910b5d012f` and the local assessment

Status: both local repair batches and story revalidation are complete; see the [closure report and gate-by-gate status](./blocking-work-report.md). The local uploaded-certificate path has 129/129 passing evidence checks and 302 passing workflow tests. Broader deployment gates and eight known baseline suite failures remain open. D1 is accepted: partial finalization requires at least one signature. D3 is accepted: due dates remain advisory, with explicit access expiry enforced separately. For D2, local storage and the shared-signing workflow are free, while managed certificates, database/S3 storage and file encryption are paid. Preserve those existing boundaries; no new licensing policy is proposed. See [self-hosted installation requirements](./self-hosted-installation-requirements.md). The detailed work descriptions below preserve the original plan; the closure report is the current status authority.

## Decisions needed first

| Decision | Recommendation | Alternative and impact |
|---|---|---|
| D1: incomplete requests | Allow the owner to finalize with at least one accepted signature. Require confirmation listing included and excluded people. Never finalize with zero signatures. Finalization closes all outstanding contributions. | Require everyone to sign. A declined/pending participant then blocks finalization until the owner explicitly changes the participant list. This removes the current early-completion capability. |
| D2: edition contract | Local storage + uploaded certificates available without a paid license; Personal/Server certificates and database/S3 storage require their licensed entitlements. Enforce consistently in UI and backend. | All Shared Signing requires a paid license. This changes the public uploaded/local promise and requires coordinated documentation and UI updates. |
| D3: due date | Keep due date advisory, fix overdue visibility, and label it clearly. Enforce explicit participant access expiry independently. | Make due date a hard cutoff. Requires a defined timezone/end-of-day rule, boundary tests and clear recovery when an owner extends the deadline. Do not infer those semantics from a date-only field. |

D1 and D3 above are recorded as agreed. D2 matches the existing product boundary; the first patch now rejects unlicensed Personal/Server submissions in the tested signing APIs. Legitimate paid journeys still need a licensed environment.

## Working assumptions that do not need separate decisions

- Preserve the current registered-user workflow and independently submitted signatures. Correct misleading ordering copy rather than add sequential signing.
- Make visible marks optional for certificate-only signing, matching the API/public workflow; improve default mark legibility.
- Use an explicit signing permission: ordinary assigned signers can submit; VIEWER cannot. Check generic COMMENTER handling so a commenting permission does not implicitly authorize signing.
- Keep submitted versus finalized distinct in customer-facing status without gratuitously renaming persisted enum values or breaking API consumers.
- Do not add guest invitation delivery, reminders, qualified-signature claims or new storage providers as part of fixing these gates. Existing token endpoints still receive permission/lifecycle checks and negative tests.
- Do not rewrite or delete historical finalized documents. Previously finalized PDFs with discarded certificate metadata cannot be repaired by this patch; affected requests need an identified replacement/resigning workflow. The known local affected documents are synthetic.
- Start in the already approved isolated local setup with the existing ordinary test users. No new accounts, external messages, deployment or merge are necessary for implementation and local verification.

## G1: every accepted contribution reaches the final PDF

**Work:** repair `SigningFinalizationService` extraction so encrypted scalar/byte material is decoded before typed deserialization. Preserve supported legacy representations deliberately. Missing, unreadable or corrupt certificate data for a SIGNED participant must fail finalization; no skipping to a green result. Apply visible content and summary before digital signatures, then preserve prior signatures while adding subsequent signatures.

**Important test correction:** existing `SigningFinalizationServiceMoreTest` fixtures explicitly use plain Base64 rather than the actual encrypted-at-rest representation. Retain useful unit tests, but add an integration path that submits through `WorkflowSessionService`, flushes/reloads persisted encrypted metadata, finalizes, and parses/verifies the returned PDF.

**Pass evidence:**

1. Real PKCS12, PFX, PEM and JKS fixtures each survive submit -> persist -> reload -> finalize -> download.
2. A two-person mixed-format request has exactly two expected certificate signatures, correct certificate identities and valid cryptographic signatures for their signed revisions. Later legitimate incremental signatures must not be mistaken for tampering of earlier revisions.
3. Altering signed bytes is detected. Self-signed trust warnings remain distinguishable from cryptographic validity.
4. Summary enabled/disabled and visible marks enabled/disabled all preserve signature validity. Summary counts match included contributions.
5. Missing certificate metadata, wrong encryption key, corrupt keystore and PDF/signing failure produce an actionable failure. No final status, published final artifact or destructive metadata cleanup occurs on those failures.

**Dependencies:** none of D1-D3 for the all-participants-signed path. Gate remains failed until actual artifact checks pass; HTTP success and signature-field counts alone are insufficient.

## G2: finalization is a consistent, durable transition

**Work:** put finalization orchestration in a service-owned transaction/lifecycle boundary rather than separate controller calls. Coordinate session changes at the database level so signing, declining, participant edits and competing finalizations cannot modify the same snapshot during completion. Use repository locking/transaction patterns compatible with the project's actual database stack, not an in-process mutex.

Stage generation/storage, publish the final document reference and completed status consistently, and handle storage failure or DB rollback without losing recoverable input. Define sensitive-metadata cleanup as part of the durable completion contract, including observable retry/recovery if physical cleanup cannot finish. A broad controller catch must not hide whether completion actually committed.

**Pass evidence:**

1. D1's full/partial/zero-signature rules hold at the API, not only in the UI.
2. Once finalized, sign, decline, add/remove participants and repeat finalization cannot change the accepted signer snapshot or final PDF bytes. Final retrieval remains allowed to authorized readers.
3. Deterministic concurrent tests cover sign versus finalize, decline versus finalize, participant change versus finalize and finalize versus finalize. One consistent winner/outcome, no double publication or phantom SIGNED status.
4. Controlled PDF-generation, storage-write and persistence failures leave a recoverable state. Restart does not reveal a completed session with a missing output or lose a successfully committed document.
5. Certificate private material/passwords are removed after successful completion and are neither exposed in logs nor erased before a failed attempt can be recovered.

**Dependencies:** G1 and D1. This gate requires lifecycle tests with real persistence; mocked call ordering is not sufficient.

## G3: one consistent access and edition policy

**Work:** enforce assigned identity, signing permission, participant expiry, session state and edition entitlements across authenticated and token-based operations. Distinguish read permissions from mutation permissions so finalization blocks edits without unnecessarily preventing final retrieval. Return meaningful 4xx errors instead of turning normal denials into 500 responses. Do not disclose credentials or tokens in error messages.

**Pass evidence:**

- Owner, assigned signer, viewer, commenter, uninvited user and anonymous callers tested for list/detail/read/sign/decline/manage/finalize routes as applicable.
- Expired and revoked/removed access denied; removal of the only participant record revokes access; duplicate participant insertion rejected consistently, including a concurrent attempt.
- Finalized and already-submitted states reject mutations without changing status or artifact.
- D2's permitted and forbidden certificate/storage combinations agree between effective configuration, UI choices and direct API requests. Tests must not bypass production licensing checks to claim a licensed end-to-end pass.
- D3's deadline behavior is explicit and tested. An advisory due date never silently substitutes for access expiry.

**Dependencies:** D2/D3; G2 for concurrent lifecycle verification. Licensed live paths also require a legitimate licensed test environment.

## G4: the interface explains and preserves the user's work

**Work:** update `SharedSign`, the signing session controller hook, review/finalization panels and certificate modal. Validate on both client and server. Retain placements on recoverable certificate/submission errors. Reject malformed PDFs, empty required participant lists and duplicates before creating an unusable request.

**Pass evidence:**

1. Review names every selected participant and uses accurate non-sequential wording.
2. Certificate-only signing reaches submission without an artificial visible-mark requirement. Type, Draw and Upload all work; move, resize and delete behave correctly on multiple pages and rotated/cropped fixtures. Default marks are legible at normal zoom.
3. Bad/empty password, invalid/expired/not-yet-valid certificate and missing file cannot produce an enabled invalid submission. Recoverable errors have visible feedback and retain the user's work. PEM validation uses the correct inputs rather than a keystore-only request.
4. Pending becomes Viewed on the defined successful document-access event; this is access evidence, not proof a person read every page. Owner overdue filtering includes owned requests.
5. Submitted is distinct from Document finalized. Finalized-but-unsigned participants see a closed request and cannot submit. Owner and participant counts agree with the artifact.
6. D1 confirmation shows included signers, pending/declined exclusions and irreversible consequences; cancel leaves state unchanged. Zero-signature finalization is disabled and rejected server-side.
7. Keyboard focus, labels, dialogs, error announcements and narrow-screen behavior receive a focused accessibility/usability check. Retest the previously inconclusive screenshot-related dialog resets and toolbar navigation without attributing an unproven cause.

**Dependencies:** D1/D3 and API contract from G2/G3. Update only en-US translations; run the repository-required translation formatting command.

## G5: local end-to-end acceptance and release evidence

Run the complete browser journey with ordinary users in separate clean profiles: owner creates, Alice signs, Bob signs on a second page, owner finalizes, both owner and participant retrieve. Validate the actual downloaded PDF using Stirling plus an independent PDF/CMS inspection. Compare signer identities, signature validity, summary and every visible page.

Repeat with summary off, certificate-only mode, a partial request per D1, a declined request, password recovery, expired access, and protected/malformed input. Restart the server between collection and finalization and again after completion; verify pending metadata and completed output survive correctly. Test storage failure/quota feedback in the isolated environment.

Run the relevant repository checks after code changes:

```text
task backend:check
task frontend:check
task pre-commit:fix   # required if en-US translations changed
```

Run targeted regression tests during implementation. Run the area quality gates on the final changes; rerun affected checks if formatting or subsequent edits change code. Do not invoke manual frontend build scripts. Record pre-existing failures separately rather than silently claiming a pass.

**Pass evidence:** dated environment/configuration manifest, automated results, browser scenario ledger, original and final fixture hashes, actual certificate-validation results, rendered-PDF review, known limitations and updated story scores. Refresh the customer guide and demo plan from observed behavior, then rehearse the 15-minute demo with a fresh request. Every must-fix gate must pass independently; an average score cannot override one failed gate.

**Dependencies:** G1-G4. This can establish demo readiness for the tested local registered-user/uploaded-certificate setup.

## G6: finish feature/deployment coverage without overstating readiness

The user asked to cover the feature's full scope. Retain these as required verification work, not implied passes:

| Coverage | Input needed | Evidence required |
|---|---|---|
| Personal and Server certificate UI journeys | Valid test license and intended entitlements | Legitimate UI + API submission, certificate identity/trust behavior and valid final signatures |
| Database and S3 storage | Supported configured test providers | Pending/finalized persistence, restart, retrieval, failure and backup/restore behavior |
| Customer authentication/team picker | Target login/SSO/team configuration, when known | Intended users visible; unrelated users excluded; ordinary-user permissions work |
| Customer PDF reader/trust | Reader/version and intended CA/trust setup | Signature integrity and recipient trust results clearly distinguished |
| Platform usability | Supported browsers/devices available for testing | Desktop browser matrix, narrow-screen/touch and native desktop path where supported |
| Guest/email claims | An explicit supported product contract, if such claims are desired | End-to-end invitation, correct identity/access, completion and notification evidence; otherwise keep these claims out of the demo/manual |

Use the existing local setup for G1-G5 while arranging these inputs. Do not require customer-production access to fix the local defects. Do not label a local demo pass as full-feature or production sign-off while any promised configuration remains unverified.

## Implementation order and completion tracking

| Batch | Scope | Exit condition |
|---|---|---|
| A | G1 encrypted certificate round trip and failure behavior | All uploaded formats and mixed two-signer PDF verification pass |
| B | G2 lifecycle/concurrency and G3 permissions/entitlements | D1-D3 enforced server-side; races and denial cases pass |
| C | G4 UI and validation corrections | Browser behavior matches server contract; actionable recovery and clear completion |
| D | G5 rehearsal, persistence and documentation | Local demo gate passes with saved artifact evidence |
| E | G6 target-edition/deployment coverage | Full scope claimed to the customer has live evidence or an explicit exclusion |

Current ledger after revalidation: G1 all uploaded formats, mixed pairs, signer identity, tamper detection and summary on/off pass; G2 tested lifecycle, rollback, concurrent finalize and restart checks pass; G3 authenticated/token role/expiry and unlicensed submission checks pass, but duplicates remain; G4 confirmation/closed views/Viewed and placement editing pass, while certificate-only, invalid-submit feedback, review wording, overdue filtering and mark size remain open; G5 fresh browser output, independent verification and direct credential-cleanup audit pass, with broader input/platform/failure coverage still pending; G6 remains unverified. The suite's eight failures reproduce on HEAD, but the full gate is still red. See the revalidation report (retained in the local review evidence).
