# Policies (frontend)

Automation-backed document-enforcement policies — conceptually like Watch
Folders but backend-driven, with non-folder triggers (editor save/export,
device sweeps, cloud connectors). **This is the frontend only**: per-policy
state is persisted locally (localStorage) and activity + stats are derived from
your real uploaded files; server persistence + real enforcement land in a
follow-up. It ships behind the `POLICIES_ENABLED` feature flag (proprietary
build = on while in development, core build = off).

## Layout

| Path | Role |
|------|------|
| `types/policies.ts` | Type model (category, fields, state). |
| `data/policyDefinitions.tsx` | Static preset definitions for the catalog: 5 categories (with the `providesClassification` data flag), per-category config fields, sources, doc types, and each category's default tool pipeline. Read it through `policyCatalog`, not directly. |
| `services/policyCatalog.ts` | **The definitions seam.** `loadPolicyCatalog()` returns categories/configs/sources/doc-types. Components reach definitions only through here (via `usePolicyCatalog`) — swap this one function for a backend fetch to go live without touching a component. |
| `hooks/usePolicyCatalog.ts` | Hook over the catalog seam (memoised; where loading/error state lands when it becomes async). |
| `services/policyStorage.ts` | Local persistence (localStorage) of per-policy **state** + change events. Swap this layer for the real API. |
| `hooks/usePolicies.ts` | State + lifecycle actions + permission flag. |
| `services/policyLiveData.ts` | Derives the detail view's activity feed + stats from the user's real uploaded files. |
| `components/policies/PoliciesSidebar.tsx` | The three right-rail slots: list section, detail takeover, collapsed-rail icons (+ `usePoliciesEnabled` / `usePolicyDetailActive`). Shadows the core stub. |
| `components/policies/policySelectionStore.ts` | Shared selected-policy / detail-view store the three slots sync through. |
| `components/policies/PolicySetupWizard.tsx` | 3-step setup (operations → sources/types → reviewer/confirm). |
| `components/policies/PolicyDetailPanel.tsx` | Configured "narrative" view (Enforces / Activity / Stats). |
| `components/policies/PolicySettingsForm.tsx` | Edit-settings sub-view. |
| `components/policies/PolicyFieldRow.tsx` | toggle / select / chips / text field renderer (SUI `SettingsRow` + `ToggleSwitch`/`Select`/`Input`/`Chip`). |

The core build gets a no-op stub at `core/components/policies/PoliciesSidebar.tsx`;
`RightSidebar` (core) consumes the seam, so the section appears only in
proprietary builds.

## Design system (SUI + Mantine)

The surface is composed almost entirely from the shared SUI design system
(`@shared/components`), mixed with Mantine only where SUI has no equivalent.
SUI components used here: `PanelHeader` (+ leading `IconBadge`), `Card`,
`Button`, `Chip`, `ChipFlow`, `StatusBadge`, `Banner`, `EmptyState`,
`MetricCard`, `Input`, `Select`, `ToggleSwitch`, `Checkbox`, `FormField`,
`NavItem` (status `accent`), `ListRow`, `DataRow`, `SectionHeader`,
`StepIndicator`. Several of those (`IconBadge`, `ListRow`, `DataRow`,
`SectionHeader`, `StepIndicator`, `ChipFlow`, `SettingsRow`, plus the `NavItem`
accent / `PanelHeader` icon slot / `Checkbox` leadingIcon / `MetricCard size`)
were **built up in SUI** as part of this work — each has a Storybook story.

Bootstrapping: the editor loads `@shared/tokens/tokens.css` globally via
`ThemeProvider`, which also mirrors the Mantine colour scheme onto
`<html data-theme>` (SUI's dark palette keys on `data-theme`). A global
`@shared` alias in `editor/vite.config.ts` + `vitest.config.ts` resolves the
shared components' own `@shared/*.css` self-imports.

The bespoke `.pol-*` CSS in `Policies.css` is now only thin layout scaffolding
(detail/scroll/footer wrappers, the collapsed rail, row insets that match SUI
`ListRow`); spacing snaps to the SUI `--space-*` scale and colour to the SUI
token set.

**Status-colour convention (locked):** blue = accent/identity (NavItem accent
bar, rail icon, detail Card accent — the prototype's blue); green `success`
StatusBadge = the "Active" pill/dot everywhere (list + detail + rail dot);
amber = paused. Configured rows render as raised cards (surface + border).

## Faithful to the prototype

5 categories (Ingestion, Security, Compliance, Routing, Retention), their full
field sets, the 3-step wizard (incl. the doc-type step gated behind the
Classification/ingestion policy), the configured narrative view (Enforces /
recent-activity feed / three-up stats), settings, the permission model
(owner/admin/member + solo), and the
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
