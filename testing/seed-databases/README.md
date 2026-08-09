# Deployment seed data

Pre-populated data for the CI preview deployments, so a reviewer lands on a
system that already has teams, policies and accounts instead of a blank
first-run wizard.

It comes in two halves, split by whether the data contains a secret:

| | What | Where it comes from |
|---|---|---|
| **Teams and policies** | no secrets | a committed H2 database, applied before the container starts |
| **User accounts** | passwords are secrets | created over the API after the container is up |

| Deployment | Seed database | User manifest |
|---|---|---|
| PR previews (`PR-Auto-Deploy-V2.yml`) | `pr-preview.mv.db` - 3 teams | `pr-preview-users.json` - 6 accounts |
| main demo (`Main-Auto-Deploy.yml`) | `main-demo.mv.db` - 6 teams, 7 policies | `main-demo-users.json` - 16 accounts |

Each `.mv.db` is a build artifact; the reviewable source of truth is the `.sql`
file beside it.

## Credentials

Nothing in this repo can log in to a deployment. The repo is public, so a
committed password is a published password.

| Account | Password |
|---|---|
| admin | `SECURITY_INITIALLOGIN_USERNAME` / `_PASSWORD` secrets (the usual preview login) |
| every demo account | the `PREVIEW_DEMO_PASSWORD` secret, shared across them |

The seed databases contain **no users at all**. That is what makes the admin
work: `UserService.hasUsers()` ignores the internal API user, so an empty user
table leaves it false and the container bootstraps its admin from
`SECURITY_INITIALLOGIN_*` exactly as a fresh install would. Ship a single user
row and the app skips that bootstrap entirely, silently keeping whatever
password was baked in.

`PREVIEW_DEMO_PASSWORD` is one shared password across the demo accounts rather
than one each - they are equally throwaway, and per-account passwords would
mean either more secrets to rotate or a derivation nobody can type. If a
deployment needs the accounts unusable instead, just leave the secret unset:
provisioning is skipped and the deployment stays admin-only.

## Demo accounts

Both manifests spread accounts across roles and teams so role gating and team
scoping can be checked from a real login rather than by reading code.
`former.staff` is disabled (covers the deactivated-account rendering and the
login-rejection path); in `main-demo`, `new.starter` has `forceChange` set so
it lands on the change-password flow.

`GET /api/v1/policies` is team-scoped, so `main-demo` puts two policies in team
1 (`Default`, where the admin lands) and spreads the other five across the demo
teams - log in as the relevant team lead to see those.

## Regenerating the databases

```bash
./gradlew :stirling-pdf:bootJar -PnoSpotless
scripts/seed-db/build-seed-db.sh --sql testing/seed-databases/pr-preview.sql --out testing/seed-databases/pr-preview.mv.db
scripts/seed-db/build-seed-db.sh --sql testing/seed-databases/main-demo.sql  --out testing/seed-databases/main-demo.mv.db
```

Requires JDK 25 (the built jar's target) on `JAVA_HOME`.

The generator boots the app once against an empty database so Hibernate's
`ddl-auto=update` creates the whole schema plus the bootstrap rows, shuts it
down, then applies the `.sql` on the closed file with H2's `RunScript`. Each
seed script ends by deleting the bootstrap user rows, so the shipped fixture
has teams and policies but no accounts.

Pass `--dump-schema` to write the post-boot schema next to the output as
`.schema.sql` - useful when adding tables to a seed script.

## Writing a seed script

The first boot has already created `admin`, the internal API user, the
`Default` and `Internal` teams, and the `user_license_settings` singleton.
Three things to respect:

* **Delete the user rows at the end.** See above - a single leftover user row
  disables the admin bootstrap. Child rows (`user_settings`,
  `team_memberships`, `authorities`) go first; they carry a FK to `users`.
* **Leave `user_license_settings` alone.** Its `grandfathered_user_signature`
  is derived from a per-database `integrity_salt`; rewriting the row by hand
  trips `validateSettingsIntegrity()` at boot.
* **Restart the identity counters.** They sit low after bootstrap, so a seed
  that inserts explicit ids must `ALTER TABLE … ALTER COLUMN … RESTART WITH …`
  past them or the first row the app inserts collides on the primary key.

`RunScript` aborts on the first failing statement, so a seed script that has
drifted from the schema fails the build rather than producing a half-populated
fixture.

## Editing the user manifests

Team names must match a team the `.sql` seeds. Roles are the authority strings
from `Role` (`ROLE_ADMIN`, `ROLE_USER`, `ROLE_WEB_ONLY_USER`,
`ROLE_LIMITED_API_USER`, `ROLE_EXTRA_LIMITED_API_USER`). Optional per-account
flags: `leader`, `enabled: false`, `forceChange`.

Provisioning needs the enterprise licence to be live: `TeamController` is
`@PremiumEndpoint`, and without a licence `saveUser` caps out at the
unlicensed grandfathered 5 seats. Both workflows therefore skip provisioning
when no licence is active rather than half-populating the deployment. The
licence's seat count also has to exceed the manifest length - see
[scripts/deploy/README.md](../../scripts/deploy/README.md).

## CI

`.github/workflows/db-migration-test.yml` boots every `.mv.db` in this
directory alongside the historical release fixtures and asserts admin login
still works. With no users in the seed the app bootstraps its default
`admin`/`stirling`, which is exactly what that test signs in as. A schema
change that breaks a seed fails there instead of silently breaking the next
deployment.
