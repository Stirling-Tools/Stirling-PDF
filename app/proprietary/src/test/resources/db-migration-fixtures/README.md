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

There's no automated regenerator script - fixtures are rare to refresh and the
manual steps are short. For each version you want to capture:

```bash
# 1. Download the JAR for that release (requires `gh` authenticated against
#    github.com/Stirling-Tools/Stirling-PDF).
gh release download v2.10.0 \
  --repo Stirling-Tools/Stirling-PDF \
  --pattern 'Stirling-PDF-with-login.jar' \
  --output /tmp/stirling-v2.10.0.jar

# 2. Boot the JAR in a clean working directory. DB_CLOSE_ON_EXIT=TRUE is
#    the only override that matters - it makes the H2 file flush on JVM exit
#    even if you Ctrl-C instead of going through a graceful shutdown.
workdir=$(mktemp -d)
mkdir -p "$workdir/configs"
cd "$workdir"
java -jar /tmp/stirling-v2.10.0.jar \
  --server.port=8089 \
  --spring.datasource.url='jdbc:h2:file:./configs/stirling-pdf-DB-2.3.232;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=TRUE;MODE=PostgreSQL' \
  &

# 3. Wait until http://localhost:8089/login responds, then log in once to
#    materialize whatever rows the app writes on first boot.
curl -sf -X POST -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"stirling"}' \
  http://localhost:8089/api/v1/auth/login

# 4. Shut it down (any kill works - DB_CLOSE_ON_EXIT=TRUE handles the flush).
kill -TERM %1 && wait %1

# 5. Copy the .mv.db here, renamed for the version.
cp "$workdir/configs/stirling-pdf-DB-2.3.232.mv.db" \
   app/proprietary/src/test/resources/db-migration-fixtures/stirling-pdf-v2.10.0.mv.db
```

Requirements: Java 21+ (the historical JARs target Java 17 / 21).

## Adding a new fixture

When a new minor release ships, repeat the steps above for the new tag and
add a row to the table at the top of this file. Keep the historical fixtures -
the test gets stronger with each schema generation it covers.

## Inspecting a fixture by hand

The H2 driver bundled with the build ships an interactive shell:

```bash
h2_jar=$(find ~/.gradle/caches/modules-2 -name 'h2-2.3.232.jar' | head -1)
cd app/proprietary/src/test/resources/db-migration-fixtures
java -cp "$h2_jar" org.h2.tools.Shell \
  -url 'jdbc:h2:file:./stirling-pdf-v2.10.0;ACCESS_MODE_DATA=r;MODE=PostgreSQL' \
  -user sa
```

`ACCESS_MODE_DATA=r` keeps the inspection read-only so you can't accidentally
mutate a committed fixture.
