# Policies (editor)

Automation-backed document-enforcement policies. The editor side is
**enforcement only**: policies are configured in the admin portal
(`src/portal/views/Policies.tsx`); the editor runs enabled policies on
uploaded files, blocks the file's exit points while a run is in flight, and
badges files a policy has produced. It ships behind the `POLICIES_ENABLED`
feature flag (SaaS build = on; proprietary and core builds = off; desktop
additionally requires an active SaaS connection).

## Layout

| Path | Role |
|------|------|
| `types/policies.ts` | Type model (category, fields, state). |
| `data/policyDefinitions.tsx` | Static preset definitions for the catalog. Read through `services/policyCatalog.ts` (`loadPolicyCatalog()`), not directly. |
| `services/policyStorage.ts` | Local persistence (localStorage) of per-policy state + change events. |
| `hooks/usePolicies.ts` | Policy state + permission flag, consumed by the auto-run controller. |
| `hooks/usePolicyFileBadges.ts` | Per-file badge map (which policies produced/are enforcing a file) — drives the shared `PolicyBadges` row and the exit-point blocking. |
| `components/policies/usePoliciesEnabled.ts` | The single build/connection gate for mounting the auto-run controller. Core stub = false; desktop shadow adds the SaaS-connection check. |
| `components/policies/PolicyAutoRunController.tsx` | Headless: enforces enabled policies on every uploaded file. Mounted by `RightSidebar`. |
| `components/policies/usePolicyAutoRun.ts` | The auto-run engine: dispatch, polling, retry, output import, server reconcile. |
| `components/policies/policyRunStore.ts` | `useSyncExternalStore` store of run records (status, progress, outputs), persisted to localStorage. |
| `components/policies/enforcementQueue.ts` | Export-time enforcement queue used by `services/policyExport.ts`. |
| `components/policies/policyStatus.ts` | Category → accent-colour mapping shared by badges and export toasts. |

Enforcement UI lives with the surfaces it gates: `PolicyEnforcementOverlay`
(proprietary viewer), `PolicyEnforcingOverlay` (thumbnails + viewer overlay
body), and the shared `PolicyBadges` row (`core/components/shared/`).

## Tests

`policyRunStore.test.ts`, `usePolicyAutoRun.test.ts` (+ `.retry` / `.import`
variants), `hooks/usePolicyFileBadges.test.ts`,
`services/policyStorage.test.ts`, and `data/policyDefinitions.test.ts`.
