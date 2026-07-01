# PAYG settings screen — handover

Branch: `feat/payg-settings-screen`

## What this is

A **design mockup** of the Pay-as-you-go billing & usage settings screen. It
renders and is interactive (inputs accept typing, dirty-state works), but it is
**not wired to any backend** — all data is hard-coded and no action persists.

Files:

- `configSections/Payg.tsx` — the screen. Exports `PaygLeader` / `PaygMember`.
- `configSections/Payg.css` — its styles.

Supporting (already in the diff): config-nav + modal wiring to surface the
section, plus type additions (`paygEnabled`, `"payg"` nav key).

## How to preview locally

The real config flag isn't flowing yet, so there are temporary demo hooks:

- Append `?payg=1` to the URL (sticks in `localStorage` as `paygDemo=1`), or
  run `localStorage.setItem('paygDemo','1')`.
- The proprietary build forces the **LEADER** variant so the cap editor and
  sub-caps render.

## What's mocked (replace with real wiring)

- **Data**: `usePaygMock(role)` in `Payg.tsx` hard-codes spend, cap, members,
  activity feed, account credit, and the Stripe portal URL.
- **Cap preview**: the `previewUnits` math in `CapEditor` is a local
  calculation. Real impl calls `POST /api/v1/payg/cap-preview`
  (translates money → doc-units via the current Stripe price tier).
- **Save / edit actions**: "Update cap", per-member "Set cap"/"Edit", and
  "View all" buttons have no handlers yet.
- **Stripe portal link**: points at a mock URL.

## Known shortcuts to fix before merge

1. **Remove the demo blocks** — flagged inline with `DEMO` / "Remove before
   merging":
   - `proprietary/.../configNavSections.tsx` (import + pushed section)
   - `saas/.../AppConfigModal.tsx` (`paygDemo` / `?payg=1` override)
   PAYG is SaaS-only and must not ship in proprietary builds.
2. **Real config flag**: `paygEnabled` should come from
   `ConfigController.java` / `ApplicationProperties`, not the demo override.
3. **Real team-role lookup**: `isLeader` is currently proxied from
   `appConfig.isAdmin` (tenant admin ≠ team owner). Swap in a proper
   team-role check when team roles land.
4. **Translation keys**: every `payg.*` string exists only as an inline
   English fallback. Add the keys to the translation JSON / locales.

## Backend integration guide (for whoever wires the API)

The screen is **ready to integrate** — the data contract is defined and there's
a single swap point. It is not plug-and-play: the async lifecycle and mutations
below are expected backend-engineer work, not pre-built.

### The contract & swap point

- `PaygSnapshot` (interface in `Payg.tsx`) **is the de-facto API spec** — build
  the read endpoint to return this shape.
- `usePaygMock(role)` is the **single read swap point**. Replace it with a real
  data hook (e.g. `usePayg()`). Note it currently returns data *synchronously*
  via `useMemo`; a real hook is async, so you'll need to introduce
  **loading / error / empty (new-tenant) states** — no component handles those
  today, they all assume `snap` is present.

### Backend touchpoints (all currently stubbed, no handlers)

| UI action | Where | Needs |
|-----------|-------|-------|
| Read snapshot | `usePaygMock` | GET → `PaygSnapshot` |
| Cap preview (live) | `CapEditor.previewUnits` | `POST /api/v1/payg/cap-preview` (debounced; money → doc-units via current Stripe price tier) |
| Save cap | "Update cap" button | commit endpoint (cap_units, cap_source_money, currency, warn/degrade pct) |
| Per-member sub-caps | "Set cap" / "Edit" | sub-cap upsert endpoint |
| Activity pagination | "View all" | paginated activity endpoint |
| Stripe billing | `stripePortalUrl` | **fetch a portal session on click** — the hardcoded URL won't work; real Stripe portal URLs are short-lived |

### Known latent bug — guard before real data flows

`previewUnits`, the hero `pct`, and the hero "spent" money all **divide by
`capUnits` / `capSourceMoney`**. The mock uses non-zero values so it's hidden,
but a brand-new tenant with no cap set = `0` → `NaN` / `$NaN` / broken usage
bar. Add zero-guards when wiring real data.

## Design reference

Header comment in `Payg.tsx` summarises the framework: doc-units as the billing
unit, customer-set cap in their own currency, `wallet_policy` fields, the
FULL → WARNED (80%) → DEGRADED (100%) states, the four gates, and per-member
sub-caps. See the PAYG design review doc for the full spec.
