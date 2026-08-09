# Deployment seed databases

Pre-populated H2 databases shipped into the CI preview deployments so a
reviewer lands on a system that already has teams, users and policies instead
of a blank first-run wizard.

| File | Used by | Contents |
|---|---|---|
| `pr-preview.mv.db` | PR previews (`PR-Auto-Deploy-V2.yml`) | 3 teams, 6 users across a spread of roles |
| `main-demo.mv.db` | main demo (`Main-Auto-Deploy.yml`) | 6 teams, 16 users, 7 saved policies, per-user settings |

Each `.mv.db` is a build artifact. The reviewable source of truth is the `.sql`
file beside it.

## Logins

| Username | Password | Role | Team |
|---|---|---|---|
| `admin` | `stirling` | ROLE_ADMIN | Default |
| `eng.lead` | `demo1234` | ROLE_ADMIN | Engineering |
| `eng.dev` | `demo1234` | ROLE_USER | Engineering |
| `finance.lead` | `demo1234` | ROLE_USER (ADMIN in main-demo) | Finance |
| `finance.ap` | `demo1234` | ROLE_WEB_ONLY_USER | Finance |
| `legal.counsel` | `demo1234` | ROLE_LIMITED_API_USER | Legal |
| `former.staff` | `demo1234` | disabled - login is refused | Legal |

`GET /api/v1/policies` is team-scoped, so `main-demo` puts two policies in
team 1 (`Default`, where `admin` sits) and spreads the other five across the
demo teams - log in as the relevant team lead to see those.

`main-demo.mv.db` adds `eng.qa`, `finance.audit`, `legal.para`,
`marketing.lead`, `marketing.des`, `ops.lead`, `ops.automation`,
`support.lead`, `support.agent` and `new.starter` (forced password change on
first login), all with `demo1234`.

> **These credentials are public.** A seeded deployment has a known admin
> password, so `SECURITY_INITIALLOGIN_USERNAME` / `_PASSWORD` no longer apply -
> the app only honours those when the user table is empty. Do not seed a
> deployment that is reachable by anyone who should not have admin.

## Regenerating

```bash
./gradlew :stirling-pdf:bootJar -PnoSpotless
scripts/seed-db/build-seed-db.sh --sql testing/seed-databases/pr-preview.sql --out testing/seed-databases/pr-preview.mv.db
scripts/seed-db/build-seed-db.sh --sql testing/seed-databases/main-demo.sql  --out testing/seed-databases/main-demo.mv.db
```

Requires JDK 25 (the built jar's target) on `JAVA_HOME`.

The generator boots the app once against an empty database so Hibernate's
`ddl-auto=update` creates the whole schema plus the bootstrap rows, shuts it
down, then applies the `.sql` on the closed file with H2's `RunScript`.

Driving the REST API instead would be neater in principle but needs a live
enterprise licence to run at all: `TeamController` is `@PremiumEndpoint`, and
`saveUser` refuses past the unlicensed 5-seat grandfathered limit. SQL against
the app's own generated schema needs nothing.

Pass `--dump-schema` to write the post-boot schema next to the output as
`.schema.sql` - useful when adding tables to a seed script.

## Writing a seed script

The first boot has already created:

* `users` 1 = `admin` (`ROLE_ADMIN`), 2 = `STIRLING-PDF-BACKEND-API-USER`
* `teams` 1 = `Default`, 2 = `Internal`
* matching `authorities` and `team_memberships` rows
* the `user_license_settings` singleton

Two things to respect:

* **Leave `user_license_settings` alone.** Its `grandfathered_user_signature`
  is derived from a per-database `integrity_salt`; rewriting the row by hand
  trips `validateSettingsIntegrity()` at boot.
* **Restart the identity counters.** They sit low after bootstrap, so a seed
  that inserts explicit ids must `ALTER TABLE … ALTER COLUMN … RESTART WITH …`
  past them or the first row the app inserts collides on the primary key.

`RunScript` aborts on the first failing statement, so a seed script that has
drifted from the schema fails the build rather than producing a half-populated
fixture.

## Seat limits

Seeded users are inserted directly, so they bypass the seat check that
`saveUser` applies - a seed can hold more users than the licence allows.
Creating further users *through the UI* is still capped by
`calculateMaxAllowedUsers()`, so the preview licence needs a seat count
comfortably above the seed's user count. See
[scripts/deploy/README.md](../../scripts/deploy/README.md).

## CI

`.github/workflows/db-migration-test.yml` boots every `.mv.db` in this
directory alongside the historical release fixtures and asserts
`admin`/`stirling` can still log in. A schema change that breaks a seed fails
there instead of silently breaking the next deployment.
