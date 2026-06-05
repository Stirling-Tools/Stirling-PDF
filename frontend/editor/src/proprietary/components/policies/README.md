# Policies (frontend, mock-backed)

Automation-backed document-enforcement policies — conceptually like Watch
Folders but backend-driven, with non-folder triggers (editor save/export,
device sweeps, cloud connectors). **This is the frontend only**; everything is
mock/stub-backed (localStorage), with no server. It ships behind the
`POLICIES_ENABLED` feature flag (proprietary build = on while in development,
core build = off).

## Layout

| Path | Role |
|------|------|
| `types/policies.ts` | Type model (category, fields, state, user/billing). |
| `data/policyDefinitions.tsx` | The 5 categories, per-category config fields, sources, doc types, **mock** user + billing, `canConfigurePolicies`. |
| `services/policyStorage.ts` | Mock persistence (localStorage) + change events. Swap this layer for the real API. |
| `hooks/usePolicies.ts` | State + lifecycle actions + derived cost + mock user/billing/permission. |
| `components/policies/PoliciesPanel.tsx` | Orchestrator: category rail + detail pane routing. |
| `components/policies/PolicySetupWizard.tsx` | 3-step setup (operations → sources/types → reviewer/confirm). |
| `components/policies/PolicyDetailPanel.tsx` | Configured "narrative" view (Enforces / Activity / Stats). |
| `components/policies/PolicySettingsForm.tsx` | Edit-settings sub-view. |
| `components/policies/PolicyFieldRow.tsx` | toggle / select / chips / text field renderer. |
| `components/policies/PolicyBillingBar.tsx` | Per-doc cost + spend-limit control. |
| `components/policies/PoliciesRegistration.tsx` | Registers the `custom:policies` workbench view. |

## Faithful to the prototype

5 categories (Ingestion, Security, Compliance, Routing, Retention), their full
field sets, the 3-step wizard (incl. the doc-type step gated behind the
Classification/ingestion policy), the configured narrative view, settings,
the permission model (owner/admin/member + solo), and the per-document cost +
spend-limit billing bar.

## Deviations / follow-ups

- **Placement.** The prototype docks Policies in the **right** sidebar rail.
  Wiring into the shared `RightSidebar` is invasive, so this is mounted as a
  workbench view (reachable via the left-sidebar "Policies" entry + the
  workbench bar). Re-docking into the right rail is the main remaining
  integration task.
- **Billing upgrade flows.** The prototype's free → pay-as-you-go → enterprise
  upgrade/commit/bespoke modals are a billing-integration surface (Stripe/org
  state that doesn't exist yet) — deferred. The cost + spend-limit *display* is
  built.
- **Backend.** All persistence, enforcement, activity, and stats are mock. To
  go live, replace `services/policyStorage.ts` and feed real activity/stats.

## Tests

`services/policyStorage.test.ts` (seed/update/reset/heal/events) and
`data/policyDefinitions.test.ts` (permission matrix + definition integrity).
