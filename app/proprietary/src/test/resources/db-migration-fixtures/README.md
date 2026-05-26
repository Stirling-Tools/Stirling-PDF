# DB migration test fixtures

These `.mv.db` files are H2 databases captured from past Stirling-PDF releases.
They feed the CI smoke test that verifies a fresh build can still boot and
authenticate against a database created by an older version.

| File | Source release | Tables | Notes |
|---|---|---|---|
| `stirling-pdf-v2.0.0.mv.db` | [v2.0.0](https://github.com/Stirling-Tools/Stirling-PDF/releases/tag/v2.0.0) | users, authorities, teams, sessions, audit_events, persistent_logins, invite_tokens, user_license_settings, user_settings | Pre-storage/workflow schema. |
| `stirling-pdf-v2.5.0.mv.db` | [v2.5.0](https://github.com/Stirling-Tools/Stirling-PDF/releases/tag/v2.5.0) | same as v2.0.0 | Schema unchanged from v2.0.0; intentionally kept as a separate fixture to exercise the "skip every other minor" upgrade path. |
| `stirling-pdf-v2.10.0.mv.db` | [v2.10.0](https://github.com/Stirling-Tools/Stirling-PDF/releases/tag/v2.10.0) | v2.5.0 tables + file_shares, file_share_accesses, stored_files, stored_file_blobs, storage_cleanup_entries, user_server_certificates, workflow_sessions, workflow_participants, participant_notifications | Adds the file-sharing and workflow signing schema. |

All three were generated against H2 `2.3.232` and use the same on-disk file
format, so the runtime driver can open any of them without conversion.

## What's in each fixture

* `admin` user with the default password `stirling` (BCrypt `$2a$10$...`).
* The internal API user `STIRLING-PDF-BACKEND-API-USER`.
* `ROLE_ADMIN` authority row for the admin user.
* `Default` and `Internal` teams.
* `user_license_settings` row (singleton).

`audit_events`, `sessions`, and `user_settings` are empty in the OSS-flavored
fixtures: those tables are written only on Enterprise builds (audit) or
require an HTTP-session-creating flow (sessions / settings) that the OSS form
login no longer exposes. The migration test only depends on the admin user
existing, so leaving these empty is intentional.

## What the CI test checks

`.github/workflows/db-migration-test.yml` runs `scripts/db-migration/run-migration-test.sh`,
which for each fixture:

1. Copies the fixture into `configs/stirling-pdf-DB-2.3.232.mv.db` of a clean
   working directory.
2. Boots the current `:stirling-pdf:bootJar` against it on a free port.
3. Waits for Spring to start (no `SchemaManagementException` in the log).
4. POSTs `{"username":"admin","password":"stirling"}` to `/api/v1/auth/login`
   and asserts the response is `200 OK`.

A red CI on this job means a schema change in the PR is not backwards
compatible with an existing user database. Common causes:

* Adding a non-nullable column without a default.
* Renaming a column (Hibernate's `update` strategy adds the new column and
  leaves the old one orphaned with the data still in it).
* Changing a column type in an incompatible way.
* Dropping or renaming a foreign-key target.

## Regenerating fixtures

Use `scripts/db-migration/generate-fixtures.ps1` to produce the binaries. It
downloads each `Stirling-PDF-with-login.jar` from the matching GitHub release,
runs it locally on a free port, populates the core tables via the public API,
and copies the resulting `.mv.db` here.

```powershell
$env:JAVA_HOME = "C:\Users\<you>\.gradle\jdks\eclipse_adoptium-25-amd64-windows.2"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/db-migration/generate-fixtures.ps1 `
  -Versions v2.0.0,v2.5.0,v2.10.0
```

Requirements: Java 21+ (the historical JARs target Java 17 / 21), the `gh`
CLI authenticated against `github.com/Stirling-Tools/Stirling-PDF`, and
PowerShell 5.1+ on Windows. The script is idempotent - already-downloaded
JARs in `.alpha-local/migration-fixtures/jars/` are reused.

The bash equivalent for Linux/macOS contributors lives at
`scripts/db-migration/generate-fixtures.sh` (todo: port).

## Adding a new fixture

When a new minor release ships, add another row to the table above and a new
entry to `Versions` in the regenerator script. Keep the historical fixtures -
the test gets stronger with each schema generation it covers.

## Inspecting a fixture by hand

```powershell
$h2 = "$env:USERPROFILE\.gradle\caches\modules-2\files-2.1\com.h2database\h2\2.3.232\*\h2-2.3.232.jar" |
  Get-ChildItem | Select-Object -First 1
java -cp $h2.FullName org.h2.tools.Shell `
  -url 'jdbc:h2:file:./stirling-pdf-v2.10.0;ACCESS_MODE_DATA=r;MODE=PostgreSQL' `
  -user sa
```

(Run from this directory. `ACCESS_MODE_DATA=r` keeps the inspection read-only.)
