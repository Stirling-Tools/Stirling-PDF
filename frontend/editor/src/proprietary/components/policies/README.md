# Policies (editor)

Automation-backed document-enforcement policies. The editor side is
**enforcement only**: policies are configured in the admin portal
(`src/portal/views/Policies.tsx`); the editor runs enabled policies on
uploaded files, blocks the file's exit points while a run is in flight, and
badges files a policy has produced. Always on in the proprietary/SaaS builds;
the core (OSS) build has no implementation (`usePoliciesEnabled` stub = false),
and desktop additionally requires an authenticated SaaS or self-hosted connection.
The connected server executes pipelines and owns their metering. The single gate
is `components/policies/usePoliciesEnabled.ts`.

A required upload-policy failure pauses the entire editor with `PolicyRecoveryGate`.
The modal keeps editor state mounted, makes the background inert, and pauses editor
shortcuts while preserving browser commands. Retry stays blocked until the policy output is imported; closing the affected
files ends the current tool session and retains the originals in the library. Failures
persist separately from the capped activity log, including through cancellation and reload.
Ordinary pipeline failures do not pause the editor.
Required export-policy failures cancel that export without freezing further editing.

The gate includes open derivatives and files retained by Compare outside the workspace.
Operation, download and upload boundaries recheck failures after asynchronous preparation.

## Layout

| Path | Role |
|------|------|
| `types/policies.ts` | Type model (category, fields, state). |
| `data/policyDefinitions.tsx` | Static preset definitions for the catalog. Read through `services/policyCatalog.ts` (`loadPolicyCatalog()`), not directly. |
| `services/policyStorage.ts` | Local persistence (localStorage) of per-policy state + change events. |
| `hooks/usePolicies.ts` | Policy state + permission flag, consumed by the auto-run controller. |
| `hooks/usePolicyFileBadges.ts` | Per-file badge map (which policies produced/are enforcing a file) — drives the shared `PolicyBadges` row and the exit-point blocking. |
| `components/policies/usePoliciesEnabled.ts` | The single build/connection gate for mounting the auto-run controller. Core stub = false; desktop requires a confirmed server connection and authentication. |
| `components/policies/PolicyAutoRunController.tsx` | Runs policies and recovery once per editor. Mounted by `HomePage`, outside the tool sidebar. |
| `components/policies/usePolicyAutoRun.ts` | The auto-run engine: dispatch, polling, retry, output import, server reconcile. |
| `components/policies/policyRunStore.ts` | `useSyncExternalStore` store of run records (status, progress, outputs), persisted to localStorage. |
| `components/policies/enforcementQueue.ts` | Export-time enforcement queue used by `services/policyExport.ts`. |
| `components/policies/policyStatus.ts` | Category → accent-colour mapping shared by badges and export toasts. |

Enforcement UI lives with the surfaces it gates: `PolicyEnforcementOverlay`
(proprietary viewer), `PolicyEnforcingOverlay` (thumbnails + viewer overlay
body), and the shared `PolicyBadges` row (`core/components/shared/`).

## Desktop folders

Desktop processing folders keep their watch configuration and delivery history in
IndexedDB, scoped to the connected server and account. While the app is running,
it scans enabled mounted directories every five seconds and submits each PDF with
its complete pipeline to `/api/v1/policies/run`. Desktop paths are never treated as
paths on the server. Server-storage folders continue to use `/api/v1/processing-folders`.

Outputs are downloaded from the execution server. Same-format single-file outputs
replace their local input after checking for concurrent edits; originals are kept
in `.stirling-originals`. Other outputs receive unique filenames. Recorded output
fingerprints prevent the scanner from processing its own writes.

Known server run IDs resume after reconnecting. An interrupted submission without
a confirmed run ID is parked for manual review before retrying. Cancellation stops
queued desktop work and local delivery; already-submitted server work may finish.

The Downloads demo and the editor's heuristic classification run in the frontend
and report input sizes and page counts to the connected server's automation meter.
That existing meter is best-effort for completed browser work. Server pipelines
meter themselves and must not also invoke the browser meter.

## Tests

`policyRunStore.test.ts`, `usePolicyAutoRun.test.ts` (+ `.retry` / `.import`
variants), `hooks/usePolicyFileBadges.test.ts`,
`services/policyStorage.test.ts`, and `data/policyDefinitions.test.ts`.
