# SaaS Enterprise

Enterprise access comes from the team's existing procurement deal. A trial enables SaaS
and issues the existing self-hosted Keygen licence with the same expiry. Customers use
the existing trial, quote, agreement and invoice screens. Staff can grant or extend a
trial through the admin API below.

The accepted quote supplies agreed users and annual PDF volume. Usage & Billing shows
actual users and PDFs, including how far they are over those quantities. They do not
block invitations or processing. Enterprise jobs retain normal document and usage
records, consume no free or prepaid credits, and send no PAYG meter events. Coverage is
stored when the job opens, so closing or refunding it after expiry cannot charge it.

## Persistence and deployment

Deploy the companion Stirling-PDF-SaaS migration
`20261012000000_enterprise_team_entitlement.sql` before this backend. It adds three UTC
timestamps to `procurement_deal` and one coverage flag to `payg_shadow_charge`. Quotes,
trial dates, document counters and the staff audit table already exist.

Deploy the companion `accept-procurement-quote` and `stripe-webhook` changes together
with the backend. The callbacks now require dates verified against the actual Stripe
invoice line. Initial unpaid access ends at the invoice due date; paid access ends at
the purchased service period's end. Delayed or duplicate callbacks cannot add a fresh
year from their delivery date. Cancellation affects only the matching subscription.

Existing paid deals need their current invoice period reconciled before they gain SaaS
Enterprise access. Replay the current paid invoice through the updated webhook, or
call `/api/v1/procurement/activate?teamId=…&invoiceId=…` using the verified Stripe
subscription and invoice dates. Replaying an already recorded invoice fills missing
dates. Do not infer a new annual term from the deployment date.

Existing Team/PAYG purchases and credit balances are retained during evaluation. Use
the existing cancellation flow for subscriptions superseded by a paid Enterprise
agreement; this MVP does not silently cancel or refund prior purchases.

## Staff trial grant

`POST /api/v1/procurement/trial/grant`, authenticated as `ROLE_ADMIN`, accepts:

```json
{
  "teamId": 123,
  "endsAt": "2026-11-12T17:00:00",
  "reason": "Evaluation extension agreed with customer"
}
```

`endsAt` is UTC and must be in the future. The operation cannot shorten a trial or
replace a purchased agreement. It preserves quote/signature progress and records the
operator, reason and previous/new dates in `procurement_activity`. Customers cannot
restart an expired trial through repeated start requests. The existing bounded
self-service extension remains available until purchase.

## Other open changes

- Company SSO stays in PR #8401 and its SaaS companion #351. When integrating it,
  replace the temporary eligible-team list with `EnterpriseEntitlementService.isActive`
  for setup eligibility, retaining the global rollout switch and identity protections.
- Capacity cancellation in PR #8365 must skip member deactivation for active Enterprise
  teams. The current atomic invitation/seat queries already permit Enterprise admission.
- The desktop sharing work in PR #8363 can reuse these shared billing components. This
  MVP uses the normal SaaS ledger for the agreement's PDF count; it does not introduce
  a new self-hosted/offline usage reporting protocol.

## Verification

The SaaS tests cover trial replay and expiry, staff extensions, purchased periods,
renewals, foreign-subscription callbacks, admission beyond the quoted users, included
processing/refunds, and agreement document totals against a real database.

The UI tests and `Billing/BillingScreen` stories cover Enterprise trials and use beyond
the agreement. The companion Deno tests exercise invoice-date resolution and the
acceptance migration with PostgreSQL. Before rollout, exercise the existing purchase
journey once in Stripe test mode and verify the actual Keygen expiry; unit tests mock
these external services.

## Local preview development

The companion repository's `npm run dev:prepare` command resolves a disposable
Supabase branch, provisions the empty Stripe mirror schema and writes this
repository's ignored `app/.env.saas.local`. See its
[preview setup guide](https://github.com/Stirling-Tools/Stirling-PDF-SaaS/blob/codex/saas-enterprise-plan/docs/PREVIEW_DEVELOPMENT.md).
Start `task backend:dev:saas` and `task frontend:dev:saas` afterwards. Both use the
same project settings; the database connection uses the IPv4 session pooler with
verified TLS. Java accepts Supabase ES256 and RS256 signing keys.

The first Java dev boot creates inherited tables that are intentionally managed by
Hibernate. SaaS migration-owned tables are excluded, including `file_run_events`.
The subscription mirror is mapped explicitly to `public.billing_subscriptions`.
Stripe function secrets are unnecessary for login, trials and PDF processing; the
empty Stripe schema is necessary for wallet reads. Real purchases and licence
issuance remain separate integration checks.
