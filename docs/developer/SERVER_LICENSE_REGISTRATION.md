# Server license registration: first increment

Status: development only; disabled by default. This is the tracking foundation for
the Server-to-Team migration plan. It does not migrate a subscription, create an
account, change a license or send customer notifications.

## What is implemented

An enabled self-hosted Java instance with a locally valid Server license reports
its installation ID, application version, protocol capability and observed user
count. Its first request also supplies its license proof and existing machine
fingerprint. The reporter starts after 30 seconds and repeats every 24 hours by
default. It does not depend on a human account link.

The count comes from `UserService.getTotalUsersCount()`: database users excluding
the internal API user. It includes other users regardless of activity. It is an
observation, not a finalized billing quantity. Missing or failed counts are not
converted to zero. The license's `users=0` unlimited sentinel is stored separately
from the observed count.

The cloud accepts a raw license key or a signed, unencrypted
`base64+ed25519` license file. A file must pass signature and time checks, and
both proof types must pass live Keygen validation for the configured account and
an explicitly allowed Server product. Enterprise licenses are rejected. Legacy
metadata must explicitly identify `isEnterprise=false`; ambiguous proof is held
out rather than assumed to be Server.

The local database commits a random registration secret and monotonic report
sequence before sending. The cloud stores only its SHA-256 hash. Retrying a lost
bootstrap response retains the same registration and credential. Subsequent
reports use that tracking credential, which is independent of Team credentials
and creates no authenticated user session. Revoked records cannot re-register
with the same installation ID.

The cloud serializes updates per record. Older reports and changed payloads at the
same sequence are rejected; exact duplicates do not refresh their receipt time.
Only a newer report refreshes freshness. Bootstrap is limited to 30 requests per
minute per source address and sync to 120, through the existing rate-limit store.

Exactly one matching Server purchase in `public.license_keys` supplies the source
subscription ID. Missing, ambiguous or blank mappings remain `UNRESOLVED`.
Re-bootstrap can refresh a repaired mapping. A mapping is not migration
authorization, proof of fleet coverage or a current Stripe eligibility check.

## Storage and API ownership

| Surface | Owner | Purpose |
| --- | --- | --- |
| Local `server_registration_state` | Hibernate, self-hosted Java | Durable installation ID, secret and sequence |
| Cloud `public.server_license_registrations` | Supabase migration; Java writes | Proof identity, purchase mapping and latest observed count |
| `POST /api/v1/server-license/registrations` | SaaS Java | Validate proof and bootstrap tracking |
| `POST /api/v1/server-license/registrations/sync` | SaaS Java | Authenticate tracking secret and accept newer report |

The cloud migration lives in the SaaS repository:
`supabase/migrations/20261016000000_server_license_registrations.sql`.
It denies `anon` and `authenticated` access. No Edge function or Stripe flow is
changed in this increment. Java uses the existing privileged database connection.

Raw license proofs and registration secrets must be excluded from HTTP body
logging, tracing and error reporting. Request records redact their credentials in
`toString`; neither endpoint returns a proof or secret. Protect the local database
and its backups as credentials. Re-registering after license-file renewal retains
the installation identity and secret.

## Staging setup

Apply the Supabase migration before enabling the cloud feature. Use a staging
database and test Keygen licenses, never production customer credentials.

Cloud Spring properties, supplied through deployment configuration:

```properties
stirling.server-registration.enabled=true
stirling.server-registration.server-product-ids=<allowed Server product UUIDs>
stirling.server-registration.license-public-key=<Keygen Ed25519 public key as hex>
stirling.keygen.account-id=<Keygen account UUID, not its slug>
stirling.keygen.api-token=<secret from the deployment secret store>
```

Registration reuses the Keygen connection properties but does not require turning
on enterprise procurement's separate `stirling.keygen.enabled` switch. Missing
credentials or an empty product allowlist prevent startup when registration is
enabled. A missing signing key rejects license-file proofs.

Self-hosted Spring properties:

```properties
stirling.server-registration.enabled=true
stirling.server-registration.sync-interval=PT1M
stirling.billing.account-link.saas-base-url=https://<staging Java API host>
```

Use the one-minute interval only for staging; the default is `PT24H`. HTTPS is
required except for a loopback development server. Registration reuses the
account-link destination and timeout properties, but has its own enable switch.
Keep any existing account-link configuration appropriate for that environment.
Turning registration off stops further reporting without changing the license.

## Verification

The new Java tests cover signed/forged/expired proof, live validation rejection,
unknown/revoked credentials, concurrent bootstrap retries, sequence ordering,
unresolved purchase mappings, validation, rate limiting and the disabled default.
A real H2 transaction test covers local credential persistence when caller work
rolls back. A real PostgreSQL test exercises the cloud's SQL and row locking.

The SaaS Deno/PGlite test applies the actual migration, checks database constraints
and role isolation, re-applies it, and verifies existing license and allowance
rows are unchanged. It is included in the billing-test workflow.

Local checkpoint, 16 October 2026: all 43 registration Java tests passed without
skips, including real H2 and PostgreSQL tests and validation-error redaction.
Both the new migration test and the existing app-schema compatibility test
passed. Formatting and comment lint passed. The full backend gate is not green
on this Windows host: four `LibreOfficeSandboxPolicyTest` cases, one
`ProcessExecutorLibreOfficeRetryTest` case and the symlink case in
`FolderIdentitiesTest` fail in unchanged code. These need a passing supported
CI environment before release; the joint staging runs remain unperformed.

Preview checkpoint, 16 October 2026: 24 additional checks passed against a running
SaaS Java application and the PR's real Supabase branch, with a loopback Keygen
simulator and synthetic license proofs. These exercised the full security filters,
100-to-200 reporting, signed files, concurrent retries, stale reports, revocation,
process restart, rate limiting, public API denial and response/log redaction.
Synthetic registration rows were removed afterwards. Live Keygen verification and
the complete self-hosted reporter process remain release gates; the simulator does
not establish either.

Run the backend quality gate in the `saas` flavor with security enabled. For a
focused Java run, pass a filter to each test task:

```text
./gradlew :proprietary:test --tests '*serverregistration*' :saas:test --tests '*serverregistration*'
task backend:check
```

In the SaaS repository:

```text
deno test --node-modules-dir=auto --allow-env --allow-net --allow-read --allow-write supabase/functions/_shared/serverLicenseRegistration_test.ts
```

## Still required before rollout

- Run the joint staging exercises against a real self-hosted installation, cloud
  service, Supabase branch and Keygen test account. Include a process restart,
  lost response, license replacement and unchanged existing entitlement.
- Verify deployment HTTP body-size limits, proxy source-address handling and
  secret redaction. JSON field validation alone does not bound an HTTP request.
- Test full application security filters and feature-off boot in both deployed
  flavors; controller tests alone do not prove end-to-end isolation.
- Settle the billable-user definition and shared-license / multi-instance fleet
  coverage rules before treating observations as billable seats. Cloned databases
  share installation identity; a rollback can also rewind a sequence. Both need a
  reviewed recovery path and must hold future migration, not invent a new customer.
- Add event-triggered reporting, bounded retry/backoff and operational visibility.
  This increment retries at the configured periodic interval; it does not yet
  refresh immediately after a roster change or rotate registration credentials.
- Add explicit subscription cohorts, paid-service eligibility, jurisdiction and
  contract gates, freshness/coverage checks, Enterprise alert-and-hold, and an
  auditable internal approval endpoint.
- Add notice previews, contact/opt-out handling and delivery evidence. Then add
  account claiming, entitlement handover and acknowledgment before scheduling.
- Implement Stripe-specific scheduling/execution in Edge functions: Team pricing
  at the qualifying renewal, latest acceptable count at the disclosed cutoff,
  idempotent retries and reconciliation. Revalidate license and subscription
  eligibility there; a historical registration does not establish either.

None of the joint release runs is complete just because these automated checks
pass. Keep production registration and all billing migration disabled until the
corresponding release gates are met.
