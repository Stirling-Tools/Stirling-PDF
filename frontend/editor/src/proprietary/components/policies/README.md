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
| `components/policies/PoliciesSidebar.tsx` | The three right-rail slots: list section, detail takeover, collapsed-rail icons (+ `usePoliciesEnabled` / `usePolicyDetailActive`). Shadows the core stub. |
| `components/policies/policySelectionStore.ts` | Shared selected-policy / detail-view store the three slots sync through. |
| `components/policies/PolicySetupWizard.tsx` | 3-step setup (operations → sources/types → reviewer/confirm). |
| `components/policies/PolicyDetailPanel.tsx` | Configured "narrative" view (Enforces / Activity / Stats). |
| `components/policies/PolicySettingsForm.tsx` | Edit-settings sub-view. |
| `components/policies/PolicyFieldRow.tsx` | toggle / select / chips / text field renderer. |

The core build gets a no-op stub at `core/components/policies/PoliciesSidebar.tsx`;
`RightSidebar` (core) consumes the seam, so the section appears only in
proprietary builds.

## Faithful to the prototype

5 categories (Ingestion, Security, Compliance, Routing, Retention), their full
field sets, the 3-step wizard (incl. the doc-type step gated behind the
Classification/ingestion policy), the configured narrative view + three-up
stats, settings, the permission model (owner/admin/member + solo), and the
docked right-sidebar placement: a collapsible **Policies** list above Tools, a
detail view that takes over the rail when a policy is open, and a collapsed-rail
of policy icons with active/paused status dots.

## Deviations / follow-ups

- **Billing upgrade flows.** The prototype's free → pay-as-you-go → enterprise
  upgrade/commit/bespoke modals live in the Settings billing tab — a
  billing-integration surface (Stripe/org state that doesn't exist yet),
  deferred. The in-rail surface shows only the spend-limit warning chip, as in
  the prototype's policy section.
- **Backend.** All persistence, enforcement, activity, and stats are mock. To
  go live, replace `services/policyStorage.ts` and feed real activity/stats.

## Tests

`services/policyStorage.test.ts` (seed/update/reset/heal/events) and
`data/policyDefinitions.test.ts` (permission matrix + definition integrity).
